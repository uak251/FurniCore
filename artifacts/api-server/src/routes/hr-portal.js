/**
 * HR Portal extended routes
 *
 * Covers features not in the original hr.ts / payroll.ts:
 *   • Full attendance list + CRUD (PATCH / DELETE)
 *   • Per-employee attendance summary for a month
 *   • Performance reviews CRUD
 *   • Payroll adjustments (manual bonus / penalty) CRUD
 *   • Payroll record regeneration (re-runs calculation after adjustments change)
 *
 * Attendance penalty rules (used in payroll generation too):
 *   absent   → 1× daily rate
 *   late     → 0.25× daily rate
 *   half_day → 0.5× daily rate
 *   (daily rate = monthly base / 22 working days)
 */
import { Router } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";
import { db, employeesTable, attendanceTable, payrollTable, performanceReviewsTable, payrollAdjustmentsTable, } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
const router = Router();
const mgmt = [authenticate, requireRole("admin", "manager")];
/* ─── helpers ──────────────────────────────────────────────────── */
function monthRange(month, year) {
    return {
        from: new Date(year, month - 1, 1),
        to: new Date(year, month, 0, 23, 59, 59, 999),
    };
}
const WORKING_DAYS = 22;
function penaltiesFromAttendance(records, monthlyBase) {
    const dayRate = monthlyBase / WORKING_DAYS;
    const absentDays = records.filter((r) => r.status === "absent").length;
    const lateDays = records.filter((r) => r.status === "late").length;
    const halfDays = records.filter((r) => r.status === "half_day").length;
    return {
        absentDays,
        lateDays,
        halfDays,
        dayRate,
        absentPenalty: absentDays * dayRate,
        latePenalty: lateDays * dayRate * 0.25,
        halfDayPenalty: halfDays * dayRate * 0.5,
        total: absentDays * dayRate + lateDays * dayRate * 0.25 + halfDays * dayRate * 0.5,
    };
}
/* ═══════════════════════════════════════════════════════════════ */
/*  ATTENDANCE                                                     */
/* ═══════════════════════════════════════════════════════════════ */
/* GET /attendance — list all records (optional filters: employeeId, month, year) */
router.get("/attendance", authenticate, async (req, res) => {
    const { employeeId, month, year } = req.query;
    // Build the attendance result with employee names
    const rows = await db
        .select({
        attendance: attendanceTable,
        employeeName: employeesTable.name,
        department: employeesTable.department,
    })
        .from(attendanceTable)
        .leftJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id))
        .orderBy(desc(attendanceTable.date));
    let filtered = rows;
    if (employeeId) {
        filtered = filtered.filter((r) => r.attendance.employeeId === Number(employeeId));
    }
    if (month && year) {
        const { from, to } = monthRange(Number(month), Number(year));
        filtered = filtered.filter((r) => {
            const d = new Date(r.attendance.date);
            return d >= from && d <= to;
        });
    }
    res.json(filtered.map((r) => ({
        ...r.attendance,
        employeeName: r.employeeName ?? "",
        department: r.department ?? "",
        date: new Date(r.attendance.date).toISOString().split("T")[0],
        hoursWorked: r.attendance.hoursWorked !== null ? Number(r.attendance.hoursWorked) : null,
    })));
});
/* PATCH /attendance/:id — update an attendance record */
const PatchAttendanceBody = z.object({
    status: z.enum(["present", "absent", "late", "half_day"]).optional(),
    hoursWorked: z.number().optional(),
    notes: z.string().optional(),
});
router.patch("/attendance/:id", authenticate, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = PatchAttendanceBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const patch = {};
    if (parsed.data.status !== undefined)
        patch.status = parsed.data.status;
    if (parsed.data.hoursWorked !== undefined)
        patch.hoursWorked = String(parsed.data.hoursWorked);
    if (parsed.data.notes !== undefined)
        patch.notes = parsed.data.notes;
    const [record] = await db
        .update(attendanceTable)
        .set(patch)
        .where(eq(attendanceTable.id, id))
        .returning();
    if (!record) {
        res.status(404).json({ error: "Attendance record not found" });
        return;
    }
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, record.employeeId));
    res.json({
        ...record,
        employeeName: emp?.name ?? "",
        date: new Date(record.date).toISOString().split("T")[0],
        hoursWorked: record.hoursWorked !== null ? Number(record.hoursWorked) : null,
    });
});
/* DELETE /attendance/:id */
router.delete("/attendance/:id", ...mgmt, async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    try {
        const [record] = await db.delete(attendanceTable).where(eq(attendanceTable.id, id)).returning();
        if (!record) {
            res.status(404).json({ error: "Attendance record not found" });
            return;
        }
        res.sendStatus(204);
    }
    catch (err) {
        next(err);
    }
});
/* GET /hr/attendance-summary?month&year — aggregate per employee */
router.get("/hr/attendance-summary", authenticate, async (req, res) => {
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const { from, to } = monthRange(month, year);
    const rows = await db
        .select({
        attendance: attendanceTable,
        employeeName: employeesTable.name,
        department: employeesTable.department,
        baseSalary: employeesTable.baseSalary,
    })
        .from(attendanceTable)
        .leftJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id))
        .where(and(gte(attendanceTable.date, from), lte(attendanceTable.date, to)));
    // Group by employee
    const byEmployee = {};
    for (const r of rows) {
        const eid = r.attendance.employeeId;
        if (!byEmployee[eid]) {
            byEmployee[eid] = {
                employeeId: eid,
                employeeName: r.employeeName ?? "",
                department: r.department ?? "",
                baseSalary: Number(r.baseSalary ?? 0),
                records: [],
            };
        }
        byEmployee[eid].records.push({ status: r.attendance.status });
    }
    const summary = Object.values(byEmployee).map((e) => {
        const p = penaltiesFromAttendance(e.records, e.baseSalary / 12);
        return {
            employeeId: e.employeeId,
            employeeName: e.employeeName,
            department: e.department,
            month, year,
            totalRecords: e.records.length,
            present: e.records.filter((r) => r.status === "present").length,
            absent: p.absentDays,
            late: p.lateDays,
            halfDay: p.halfDays,
            absentPenalty: +p.absentPenalty.toFixed(2),
            latePenalty: +p.latePenalty.toFixed(2),
            halfDayPenalty: +p.halfDayPenalty.toFixed(2),
            totalPenalty: +p.total.toFixed(2),
        };
    });
    res.json({ month, year, summary, penaltyRules: {
            absentRate: "1× daily rate",
            lateRate: "0.25× daily rate",
            halfDayRate: "0.5× daily rate",
            dailyRate: `baseSalary / 12 / ${WORKING_DAYS}`,
        } });
});
/* ═══════════════════════════════════════════════════════════════ */
/*  PERFORMANCE REVIEWS                                           */
/* ═══════════════════════════════════════════════════════════════ */
router.get("/performance-reviews", authenticate, async (req, res) => {
    const { employeeId } = req.query;
    let rows = await db
        .select({
        review: performanceReviewsTable,
        employeeName: employeesTable.name,
        department: employeesTable.department,
    })
        .from(performanceReviewsTable)
        .leftJoin(employeesTable, eq(performanceReviewsTable.employeeId, employeesTable.id))
        .orderBy(desc(performanceReviewsTable.createdAt));
    if (employeeId) {
        rows = rows.filter((r) => r.review.employeeId === Number(employeeId));
    }
    res.json(rows.map((r) => ({
        ...r.review,
        employeeName: r.employeeName ?? "",
        department: r.department ?? "",
        overallRating: Number(r.review.overallRating),
        kpiScore: r.review.kpiScore !== null ? Number(r.review.kpiScore) : null,
        attendanceScore: r.review.attendanceScore !== null ? Number(r.review.attendanceScore) : null,
        punctualityScore: r.review.punctualityScore !== null ? Number(r.review.punctualityScore) : null,
        bonusSuggestion: Number(r.review.bonusSuggestion),
    })));
});
const ReviewBody = z.object({
    employeeId: z.number().int().positive(),
    period: z.string().min(1),
    overallRating: z.number().int().min(1).max(5),
    kpiScore: z.number().min(0).max(100).optional(),
    attendanceScore: z.number().min(0).max(100).optional(),
    punctualityScore: z.number().min(0).max(100).optional(),
    summary: z.string().optional(),
    goals: z.string().optional(),
    achievements: z.string().optional(),
    areasForImprovement: z.string().optional(),
    recommendBonus: z.boolean().optional(),
    bonusSuggestion: z.number().min(0).optional(),
});
router.post("/performance-reviews", ...mgmt, async (req, res) => {
    const parsed = ReviewBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [review] = await db
        .insert(performanceReviewsTable)
        .values({
        ...parsed.data,
        reviewerId: req.user?.id ?? null,
        kpiScore: parsed.data.kpiScore !== undefined ? String(parsed.data.kpiScore) : null,
        attendanceScore: parsed.data.attendanceScore !== undefined ? String(parsed.data.attendanceScore) : null,
        punctualityScore: parsed.data.punctualityScore !== undefined ? String(parsed.data.punctualityScore) : null,
        bonusSuggestion: String(parsed.data.bonusSuggestion ?? 0),
        recommendBonus: parsed.data.recommendBonus ?? false,
    })
        .returning();
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, review.employeeId));
    res.status(201).json({ ...review, employeeName: emp?.name ?? "", department: emp?.department ?? "" });
});
const PatchReviewBody = ReviewBody.partial().omit({ employeeId: true });
router.patch("/performance-reviews/:id", ...mgmt, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = PatchReviewBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const patch = {};
    const d = parsed.data;
    if (d.period !== undefined)
        patch.period = d.period;
    if (d.overallRating !== undefined)
        patch.overallRating = d.overallRating;
    if (d.kpiScore !== undefined)
        patch.kpiScore = String(d.kpiScore);
    if (d.attendanceScore !== undefined)
        patch.attendanceScore = String(d.attendanceScore);
    if (d.punctualityScore !== undefined)
        patch.punctualityScore = String(d.punctualityScore);
    if (d.summary !== undefined)
        patch.summary = d.summary;
    if (d.goals !== undefined)
        patch.goals = d.goals;
    if (d.achievements !== undefined)
        patch.achievements = d.achievements;
    if (d.areasForImprovement !== undefined)
        patch.areasForImprovement = d.areasForImprovement;
    if (d.recommendBonus !== undefined)
        patch.recommendBonus = d.recommendBonus;
    if (d.bonusSuggestion !== undefined)
        patch.bonusSuggestion = String(d.bonusSuggestion);
    const [review] = await db
        .update(performanceReviewsTable)
        .set(patch)
        .where(eq(performanceReviewsTable.id, id))
        .returning();
    if (!review) {
        res.status(404).json({ error: "Review not found" });
        return;
    }
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, review.employeeId));
    res.json({ ...review, employeeName: emp?.name ?? "", department: emp?.department ?? "" });
});
router.delete("/performance-reviews/:id", ...mgmt, async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    try {
        const [review] = await db.delete(performanceReviewsTable).where(eq(performanceReviewsTable.id, id)).returning();
        if (!review) {
            res.status(404).json({ error: "Review not found" });
            return;
        }
        res.sendStatus(204);
    }
    catch (err) {
        next(err);
    }
});
/* ═══════════════════════════════════════════════════════════════ */
/*  PAYROLL ADJUSTMENTS                                           */
/* ═══════════════════════════════════════════════════════════════ */
router.get("/payroll-adjustments", authenticate, async (req, res) => {
    const { employeeId, month, year } = req.query;
    let rows = await db
        .select({
        adj: payrollAdjustmentsTable,
        employeeName: employeesTable.name,
    })
        .from(payrollAdjustmentsTable)
        .leftJoin(employeesTable, eq(payrollAdjustmentsTable.employeeId, employeesTable.id))
        .orderBy(desc(payrollAdjustmentsTable.createdAt));
    if (employeeId)
        rows = rows.filter((r) => r.adj.employeeId === Number(employeeId));
    if (month)
        rows = rows.filter((r) => r.adj.month === Number(month));
    if (year)
        rows = rows.filter((r) => r.adj.year === Number(year));
    res.json(rows.map((r) => ({
        ...r.adj,
        amount: Number(r.adj.amount),
        employeeName: r.employeeName ?? "",
    })));
});
const AdjustmentBody = z.object({
    employeeId: z.number().int().positive(),
    type: z.enum(["bonus", "penalty"]),
    reason: z.string().min(1),
    amount: z.number().positive(),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020),
});
router.post("/payroll-adjustments", ...mgmt, async (req, res) => {
    const parsed = AdjustmentBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [adj] = await db
        .insert(payrollAdjustmentsTable)
        .values({
        ...parsed.data,
        amount: String(parsed.data.amount),
        approvedBy: req.user?.id ?? null,
    })
        .returning();
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, adj.employeeId));
    res.status(201).json({ ...adj, amount: Number(adj.amount), employeeName: emp?.name ?? "" });
});
router.delete("/payroll-adjustments/:id", ...mgmt, async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    try {
        const [adj] = await db.delete(payrollAdjustmentsTable).where(eq(payrollAdjustmentsTable.id, id)).returning();
        if (!adj) {
            res.status(404).json({ error: "Adjustment not found" });
            return;
        }
        res.sendStatus(204);
    }
    catch (err) {
        next(err);
    }
});
/* ═══════════════════════════════════════════════════════════════ */
/*  PAYROLL REGENERATION — re-runs calculation for one record     */
/* ═══════════════════════════════════════════════════════════════ */
router.post("/payroll/:id/regenerate", ...mgmt, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [record] = await db.select().from(payrollTable).where(eq(payrollTable.id, id));
    if (!record) {
        res.status(404).json({ error: "Payroll record not found" });
        return;
    }
    if (record.status === "approved") {
        res.status(400).json({ error: "Cannot regenerate an approved payroll record." });
        return;
    }
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, record.employeeId));
    if (!emp) {
        res.status(404).json({ error: "Employee not found" });
        return;
    }
    const monthlyBase = Number(emp.baseSalary) / 12;
    const { from, to } = monthRange(record.month, record.year);
    const attendance = await db
        .select()
        .from(attendanceTable)
        .where(and(eq(attendanceTable.employeeId, emp.id), gte(attendanceTable.date, from), lte(attendanceTable.date, to)));
    const pen = penaltiesFromAttendance(attendance, monthlyBase);
    const adjustments = await db
        .select()
        .from(payrollAdjustmentsTable)
        .where(and(eq(payrollAdjustmentsTable.employeeId, emp.id), eq(payrollAdjustmentsTable.month, record.month), eq(payrollAdjustmentsTable.year, record.year)));
    const bonuses = adjustments.filter((a) => a.type === "bonus");
    const penalties = adjustments.filter((a) => a.type === "penalty");
    const totalBonus = bonuses.reduce((s, a) => s + Number(a.amount), 0);
    const totalManPen = penalties.reduce((s, a) => s + Number(a.amount), 0);
    const totalDeductions = pen.total + totalManPen;
    const netSalary = Math.max(0, monthlyBase + totalBonus - totalDeductions);
    const breakdown = {
        monthlyBase: +monthlyBase.toFixed(2),
        workingDays: WORKING_DAYS,
        dayRate: +pen.dayRate.toFixed(2),
        attendance: {
            totalRecords: attendance.length,
            present: attendance.filter((a) => a.status === "present").length,
            absent: pen.absentDays,
            late: pen.lateDays,
            halfDay: pen.halfDays,
            absentPenalty: +pen.absentPenalty.toFixed(2),
            latePenalty: +pen.latePenalty.toFixed(2),
            halfDayPenalty: +pen.halfDayPenalty.toFixed(2),
            totalAttendancePenalty: +pen.total.toFixed(2),
        },
        bonusAdjustments: bonuses.map((a) => ({ id: a.id, reason: a.reason, amount: +Number(a.amount).toFixed(2) })),
        penaltyAdjustments: penalties.map((a) => ({ id: a.id, reason: a.reason, amount: +Number(a.amount).toFixed(2) })),
        totalBonus: +totalBonus.toFixed(2),
        totalDeductions: +totalDeductions.toFixed(2),
        netSalary: +netSalary.toFixed(2),
    };
    const [updated] = await db
        .update(payrollTable)
        .set({
        bonus: String(totalBonus),
        deductions: String(totalDeductions),
        netSalary: String(netSalary),
        notes: JSON.stringify(breakdown),
    })
        .where(eq(payrollTable.id, id))
        .returning();
    // Mark adjustments as applied
    for (const adj of adjustments) {
        await db
            .update(payrollAdjustmentsTable)
            .set({ appliedToPayrollId: id })
            .where(eq(payrollAdjustmentsTable.id, adj.id));
    }
    res.json({ ...updated, breakdown, employeeName: emp.name });
});
export { penaltiesFromAttendance, WORKING_DAYS };
export default router;
