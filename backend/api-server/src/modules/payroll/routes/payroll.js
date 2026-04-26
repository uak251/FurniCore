import { Router } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db, payrollTable, employeesTable, attendanceTable, payrollAdjustmentsTable } from "@workspace/db";
import { GeneratePayrollBody, ListPayrollQueryParams, GetPayrollRecordParams, UpdatePayrollRecordParams, UpdatePayrollRecordBody, ApprovePayrollParams } from "@workspace/api-zod";
import { authenticate } from "../../../middlewares/authenticate";
import { logActivity } from "../../../lib/activityLogger";
import { penaltiesFromAttendance, WORKING_DAYS } from "../../../routes/hr-portal";
const router = Router();
async function toPayroll(p) {
    const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, p.employeeId));
    return {
        ...p,
        employeeName: employee?.name ?? "",
        baseSalary: Number(p.baseSalary),
        bonus: Number(p.bonus),
        deductions: Number(p.deductions),
        netSalary: Number(p.netSalary),
        paidAt: p.paidAt?.toISOString() ?? null,
    };
}
router.get("/payroll", authenticate, async (req, res) => {
    const params = ListPayrollQueryParams.safeParse(req.query);
    let query = db.select().from(payrollTable).$dynamic();
    if (params.success && params.data.month) {
        query = query.where(eq(payrollTable.month, params.data.month));
    }
    const records = await query;
    const enriched = await Promise.all(records.map(toPayroll));
    res.json(enriched);
});
router.post("/payroll", authenticate, async (req, res) => {
    const parsed = GeneratePayrollBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const { month, year } = parsed.data;
    const employees = await db.select().from(employeesTable).where(eq(employeesTable.isActive, true));
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    const inserted = await Promise.all(employees.map(async (emp) => {
        // Skip if record already exists for this period
        const existing = await db.select().from(payrollTable)
            .where(and(eq(payrollTable.employeeId, emp.id), eq(payrollTable.month, month), eq(payrollTable.year, year)));
        if (existing.length > 0)
            return existing[0];
        const monthlyBase = Number(emp.baseSalary) / 12;
        // Attendance-based penalties
        const attendance = await db.select().from(attendanceTable).where(and(eq(attendanceTable.employeeId, emp.id), gte(attendanceTable.date, startDate), lte(attendanceTable.date, endDate)));
        const pen = penaltiesFromAttendance(attendance, monthlyBase);
        // Manual adjustments
        const adjustments = await db.select().from(payrollAdjustmentsTable).where(and(eq(payrollAdjustmentsTable.employeeId, emp.id), eq(payrollAdjustmentsTable.month, month), eq(payrollAdjustmentsTable.year, year)));
        const bonuses = adjustments.filter((a) => a.type === "bonus");
        const penalties = adjustments.filter((a) => a.type === "penalty");
        const totalBonus = bonuses.reduce((s, a) => s + Number(a.amount), 0);
        const totalManPen = penalties.reduce((s, a) => s + Number(a.amount), 0);
        const totalDeductions = pen.total + totalManPen;
        const netSalary = Math.max(0, monthlyBase + totalBonus - totalDeductions);
        // Transparent breakdown stored in notes as JSON
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
        const [record] = await db.insert(payrollTable).values({
            employeeId: emp.id,
            month,
            year,
            baseSalary: String(monthlyBase),
            bonus: String(totalBonus),
            deductions: String(totalDeductions),
            netSalary: String(netSalary),
            notes: JSON.stringify(breakdown),
        }).returning();
        // Mark adjustments as applied
        for (const adj of adjustments) {
            await db.update(payrollAdjustmentsTable)
                .set({ appliedToPayrollId: record.id })
                .where(eq(payrollAdjustmentsTable.id, adj.id));
        }
        return record;
    }));
    const enriched = await Promise.all(inserted.map(toPayroll));
    await logActivity({ userId: req.user?.id, action: "GENERATE", module: "payroll", description: `Generated payroll for ${month}/${year}` });
    res.status(201).json(enriched);
});
router.get("/payroll/:id", authenticate, async (req, res) => {
    const params = GetPayrollRecordParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [record] = await db.select().from(payrollTable).where(eq(payrollTable.id, params.data.id));
    if (!record) {
        res.status(404).json({ error: "Payroll record not found" });
        return;
    }
    res.json(await toPayroll(record));
});
router.patch("/payroll/:id", authenticate, async (req, res) => {
    const params = UpdatePayrollRecordParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = UpdatePayrollRecordBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [existing] = await db.select().from(payrollTable).where(eq(payrollTable.id, params.data.id));
    if (!existing) {
        res.status(404).json({ error: "Payroll record not found" });
        return;
    }
    const updateData = {};
    if (parsed.data.bonus !== undefined)
        updateData.bonus = String(parsed.data.bonus);
    if (parsed.data.deductions !== undefined)
        updateData.deductions = String(parsed.data.deductions);
    if (parsed.data.notes !== undefined)
        updateData.notes = parsed.data.notes;
    // Recalculate net salary
    const bonus = parsed.data.bonus !== undefined ? parsed.data.bonus : Number(existing.bonus);
    const deductions = parsed.data.deductions !== undefined ? parsed.data.deductions : Number(existing.deductions);
    updateData.netSalary = String(Number(existing.baseSalary) + bonus - deductions);
    const [record] = await db.update(payrollTable).set(updateData).where(eq(payrollTable.id, params.data.id)).returning();
    res.json(await toPayroll(record));
});
router.post("/payroll/:id/approve", authenticate, async (req, res) => {
    const params = ApprovePayrollParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [record] = await db.update(payrollTable).set({ status: "approved", paidAt: new Date() }).where(eq(payrollTable.id, params.data.id)).returning();
    if (!record) {
        res.status(404).json({ error: "Payroll record not found" });
        return;
    }
    await logActivity({ userId: req.user?.id, action: "APPROVE", module: "payroll", description: `Approved payroll record #${record.id}` });
    res.json(await toPayroll(record));
});
export default router;
