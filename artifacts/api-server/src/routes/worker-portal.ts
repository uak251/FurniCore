/**
 * Worker Portal API routes
 *
 * All endpoints are scoped to the authenticated user (role = "worker").
 * Workers can ONLY access their own tasks / attendance / payroll.
 * Any attempt to read another worker's data is blocked by design — the
 * employee lookup always uses req.user.id, never a query param.
 *
 * Routes:
 *   GET  /worker-portal/me             — profile + linked employee record
 *   GET  /worker-portal/tasks          — manufacturing tasks assigned to this user
 *   PATCH /worker-portal/tasks/:id     — update status / progress / hours (own tasks only)
 *   GET  /worker-portal/attendance     — attendance records for this employee
 *   GET  /worker-portal/payroll        — payroll records for this employee
 */

import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  usersTable,
  employeesTable,
  manufacturingTasksTable,
  attendanceTable,
  payrollTable,
  productsTable,
} from "@workspace/db";
import { authenticate, requireRole, type AuthRequest } from "../middlewares/authenticate";

const router: IRouter = Router();
const workerOnly = [authenticate, requireRole("worker")];

/* ─── helpers ───────────────────────────────────────────────────────────────── */

/** Find the employees row that belongs to the authenticated user. */
async function findEmployeeForUser(userId: number) {
  const [emp] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.userId, userId));
  return emp ?? null;
}

function monthRange(month: number, year: number) {
  return {
    from: new Date(year, month - 1, 1),
    to:   new Date(year, month, 0, 23, 59, 59, 999),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PROFILE                                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

router.get("/worker-portal/me", ...workerOnly, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.user!.id;

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const emp = await findEmployeeForUser(userId);

  res.json({
    user,
    employee: emp
      ? {
          id:           emp.id,
          name:         emp.name,
          department:   emp.department,
          position:     emp.position,
          hireDate:     emp.hireDate?.toISOString() ?? null,
          isActive:     emp.isActive,
          baseSalary:   Number(emp.baseSalary),
          phone:        emp.phone ?? null,
        }
      : null,
  });
});

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TASKS — only tasks where assigneeId = this user                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

router.get("/worker-portal/tasks", ...workerOnly, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.user!.id;

  const tasks = await db
    .select({
      task:        manufacturingTasksTable,
      productName: productsTable.name,
    })
    .from(manufacturingTasksTable)
    .leftJoin(productsTable, eq(manufacturingTasksTable.productId, productsTable.id))
    .where(eq(manufacturingTasksTable.assigneeId, userId))
    .orderBy(desc(manufacturingTasksTable.updatedAt));

  res.json(
    tasks.map((r) => ({
      ...r.task,
      productName:     r.productName ?? null,
      estimatedHours:  r.task.estimatedHours !== null ? Number(r.task.estimatedHours) : null,
      actualHours:     r.task.actualHours    !== null ? Number(r.task.actualHours)    : null,
      dueDate:         r.task.dueDate?.toISOString()       ?? null,
      completedAt:     r.task.completedAt?.toISOString()   ?? null,
    })),
  );
});

/* PATCH /worker-portal/tasks/:id — workers can update progress/status on own tasks */
const PatchTaskBody = z.object({
  status:      z.enum(["in_progress", "completed"]).optional(),
  progress:    z.number().int().min(0).max(100).optional(),
  actualHours: z.number().min(0).optional(),
});

router.patch("/worker-portal/tasks/:id", ...workerOnly, async (req: AuthRequest, res): Promise<void> => {
  const taskId = parseInt(req.params.id, 10);
  const userId = req.user!.id;

  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task id" }); return; }

  // Confirm this task is actually assigned to this worker
  const [existing] = await db
    .select()
    .from(manufacturingTasksTable)
    .where(and(eq(manufacturingTasksTable.id, taskId), eq(manufacturingTasksTable.assigneeId, userId)));

  if (!existing) {
    res.status(404).json({ error: "Task not found or not assigned to you." });
    return;
  }

  const parsed = PatchTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const patch: Record<string, unknown> = {};
  if (parsed.data.status      !== undefined) {
    patch.status = parsed.data.status;
    if (parsed.data.status === "completed") patch.completedAt = new Date();
  }
  if (parsed.data.progress    !== undefined) patch.progress    = parsed.data.progress;
  if (parsed.data.actualHours !== undefined) patch.actualHours = String(parsed.data.actualHours);

  const [updated] = await db
    .update(manufacturingTasksTable)
    .set(patch)
    .where(eq(manufacturingTasksTable.id, taskId))
    .returning();

  const [product] = updated.productId
    ? await db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, updated.productId))
    : [null];

  res.json({
    ...updated,
    productName:    product?.name ?? null,
    estimatedHours: updated.estimatedHours !== null ? Number(updated.estimatedHours) : null,
    actualHours:    updated.actualHours    !== null ? Number(updated.actualHours)    : null,
    dueDate:        updated.dueDate?.toISOString()     ?? null,
    completedAt:    updated.completedAt?.toISOString() ?? null,
  });
});

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ATTENDANCE — read-only, scoped to this employee                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

router.get("/worker-portal/attendance", ...workerOnly, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.user!.id;
  const emp    = await findEmployeeForUser(userId);

  if (!emp) {
    res.json({ records: [], summary: null, message: "No employee record linked to this account. Contact HR." });
    return;
  }

  const { month, year } = req.query;
  const m = Number(month) || new Date().getMonth() + 1;
  const y = Number(year)  || new Date().getFullYear();
  const { from, to } = monthRange(m, y);

  const records = await db
    .select()
    .from(attendanceTable)
    .where(and(
      eq(attendanceTable.employeeId, emp.id),
      gte(attendanceTable.date, from),
      lte(attendanceTable.date, to),
    ))
    .orderBy(desc(attendanceTable.date));

  const present  = records.filter((r) => r.status === "present").length;
  const absent   = records.filter((r) => r.status === "absent").length;
  const late     = records.filter((r) => r.status === "late").length;
  const halfDay  = records.filter((r) => r.status === "half_day").length;
  const totalHrs = records.reduce((s, r) => s + (r.hoursWorked ? Number(r.hoursWorked) : 0), 0);
  const attRate  = records.length > 0
    ? Math.round(((present + halfDay * 0.5) / records.length) * 100)
    : null;

  // Attendance-based penalty preview (informational only)
  const WORKING_DAYS = 22;
  const dayRate      = Number(emp.baseSalary) / 12 / WORKING_DAYS;
  const penaltyPreview = {
    absentPenalty:  +(absent  * dayRate).toFixed(2),
    latePenalty:    +(late    * dayRate * 0.25).toFixed(2),
    halfDayPenalty: +(halfDay * dayRate * 0.5).toFixed(2),
    total:          +(absent * dayRate + late * dayRate * 0.25 + halfDay * dayRate * 0.5).toFixed(2),
  };

  res.json({
    month: m, year: y,
    employeeName: emp.name,
    summary: { present, absent, late, halfDay, totalRecords: records.length, totalHours: +totalHrs.toFixed(2), attendanceRate: attRate },
    penaltyPreview,
    records: records.map((r) => ({
      ...r,
      date:        new Date(r.date).toISOString().split("T")[0],
      hoursWorked: r.hoursWorked !== null ? Number(r.hoursWorked) : null,
    })),
  });
});

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PAYROLL — read-only, scoped to this employee                               */
/* ═══════════════════════════════════════════════════════════════════════════ */

router.get("/worker-portal/payroll", ...workerOnly, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.user!.id;
  const emp    = await findEmployeeForUser(userId);

  if (!emp) {
    res.json({ records: [], message: "No employee record linked to this account. Contact HR." });
    return;
  }

  const records = await db
    .select()
    .from(payrollTable)
    .where(eq(payrollTable.employeeId, emp.id))
    .orderBy(desc(payrollTable.year), desc(payrollTable.month));

  res.json({
    employeeName: emp.name,
    annualSalary: Number(emp.baseSalary),
    records: records.map((p) => {
      let breakdown = null;
      try { if (p.notes) breakdown = JSON.parse(p.notes); } catch { /* no-op */ }
      return {
        id:         p.id,
        month:      p.month,
        year:       p.year,
        baseSalary: Number(p.baseSalary),
        bonus:      Number(p.bonus),
        deductions: Number(p.deductions),
        netSalary:  Number(p.netSalary),
        status:     p.status,
        paidAt:     p.paidAt?.toISOString() ?? null,
        breakdown,
      };
    }),
  });
});

export default router;
