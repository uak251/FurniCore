import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, payrollTable, employeesTable } from "@workspace/db";
import { GeneratePayrollBody, ListPayrollQueryParams, GetPayrollRecordParams, UpdatePayrollRecordParams, UpdatePayrollRecordBody, ApprovePayrollParams } from "@workspace/api-zod";
import { authenticate, AuthRequest } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";

const router: IRouter = Router();

async function toPayroll(p: typeof payrollTable.$inferSelect) {
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

router.get("/payroll", authenticate, async (req, res): Promise<void> => {
  const params = ListPayrollQueryParams.safeParse(req.query);
  let query = db.select().from(payrollTable).$dynamic();
  if (params.success && params.data.month) {
    query = query.where(eq(payrollTable.month, params.data.month));
  }
  const records = await query;
  const enriched = await Promise.all(records.map(toPayroll));
  res.json(enriched);
});

router.post("/payroll", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = GeneratePayrollBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const employees = await db.select().from(employeesTable).where(eq(employeesTable.isActive, true));
  const inserted = await Promise.all(
    employees.map(async (emp) => {
      const [existing] = await db.select().from(payrollTable)
        .where(eq(payrollTable.employeeId, emp.id));
      if (existing && existing.month === parsed.data.month && existing.year === parsed.data.year) return existing;
      const baseSalary = Number(emp.baseSalary);
      const netSalary = baseSalary;
      const [record] = await db.insert(payrollTable).values({
        employeeId: emp.id,
        month: parsed.data.month,
        year: parsed.data.year,
        baseSalary: String(baseSalary),
        bonus: "0",
        deductions: "0",
        netSalary: String(netSalary),
      }).returning();
      return record;
    })
  );
  const enriched = await Promise.all(inserted.map(toPayroll));
  await logActivity({ userId: req.user?.id, action: "GENERATE", module: "payroll", description: `Generated payroll for ${parsed.data.month}/${parsed.data.year}` });
  res.status(201).json(enriched);
});

router.get("/payroll/:id", authenticate, async (req, res): Promise<void> => {
  const params = GetPayrollRecordParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [record] = await db.select().from(payrollTable).where(eq(payrollTable.id, params.data.id));
  if (!record) { res.status(404).json({ error: "Payroll record not found" }); return; }
  res.json(await toPayroll(record));
});

router.patch("/payroll/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = UpdatePayrollRecordParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdatePayrollRecordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(payrollTable).where(eq(payrollTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Payroll record not found" }); return; }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.bonus !== undefined) updateData.bonus = String(parsed.data.bonus);
  if (parsed.data.deductions !== undefined) updateData.deductions = String(parsed.data.deductions);
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  // Recalculate net salary
  const bonus = parsed.data.bonus !== undefined ? parsed.data.bonus : Number(existing.bonus);
  const deductions = parsed.data.deductions !== undefined ? parsed.data.deductions : Number(existing.deductions);
  updateData.netSalary = String(Number(existing.baseSalary) + bonus - deductions);
  const [record] = await db.update(payrollTable).set(updateData).where(eq(payrollTable.id, params.data.id)).returning();
  res.json(await toPayroll(record));
});

router.post("/payroll/:id/approve", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = ApprovePayrollParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [record] = await db.update(payrollTable).set({ status: "approved", paidAt: new Date() }).where(eq(payrollTable.id, params.data.id)).returning();
  if (!record) { res.status(404).json({ error: "Payroll record not found" }); return; }
  await logActivity({ userId: req.user?.id, action: "APPROVE", module: "payroll", description: `Approved payroll record #${record.id}` });
  res.json(await toPayroll(record));
});

export default router;
