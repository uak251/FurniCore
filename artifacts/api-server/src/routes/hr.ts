import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, employeesTable, attendanceTable } from "@workspace/db";
import { CreateEmployeeBody, UpdateEmployeeBody, GetEmployeeParams, UpdateEmployeeParams, DeleteEmployeeParams, ListEmployeesQueryParams, GetEmployeeAttendanceParams, GetEmployeeAttendanceQueryParams, RecordAttendanceBody } from "@workspace/api-zod";
import { authenticate, AuthRequest } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";

const router: IRouter = Router();

function toEmployee(e: typeof employeesTable.$inferSelect) {
  return { ...e, baseSalary: Number(e.baseSalary), hireDate: e.hireDate.toISOString() };
}

function toAttendance(a: typeof attendanceTable.$inferSelect, employeeName: string) {
  return {
    ...a,
    employeeName,
    date: a.date.toISOString().split("T")[0],
    checkIn: a.checkIn?.toISOString() ?? null,
    checkOut: a.checkOut?.toISOString() ?? null,
    hoursWorked: a.hoursWorked !== null ? Number(a.hoursWorked) : null,
  };
}

router.get("/employees", authenticate, async (req, res): Promise<void> => {
  const params = ListEmployeesQueryParams.safeParse(req.query);
  let query = db.select().from(employeesTable).$dynamic();
  if (params.success && params.data.search) {
    query = query.where(ilike(employeesTable.name, `%${params.data.search}%`));
  }
  const employees = await query;
  res.json(employees.map(toEmployee));
});

router.post("/employees", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [employee] = await db.insert(employeesTable).values({
    ...parsed.data,
    baseSalary: String(parsed.data.baseSalary),
    hireDate: new Date(parsed.data.hireDate),
    userId: parsed.data.userId ?? null,
    phone: parsed.data.phone ?? null,
  }).returning();
  await logActivity({ userId: req.user?.id, action: "CREATE", module: "hr", description: `Created employee ${employee.name}`, newData: toEmployee(employee) });
  res.status(201).json(toEmployee(employee));
});

router.get("/employees/:id", authenticate, async (req, res): Promise<void> => {
  const params = GetEmployeeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, params.data.id));
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(toEmployee(employee));
});

router.patch("/employees/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = UpdateEmployeeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateEmployeeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.baseSalary !== undefined) updateData.baseSalary = String(parsed.data.baseSalary);
  const [old] = await db.select().from(employeesTable).where(eq(employeesTable.id, params.data.id));
  const [employee] = await db.update(employeesTable).set(updateData).where(eq(employeesTable.id, params.data.id)).returning();
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  await logActivity({ userId: req.user?.id, action: "UPDATE", module: "hr", description: `Updated employee ${employee.name}`, oldData: toEmployee(old), newData: toEmployee(employee) });
  res.json(toEmployee(employee));
});

router.delete("/employees/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = DeleteEmployeeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [employee] = await db.delete(employeesTable).where(eq(employeesTable.id, params.data.id)).returning();
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  await logActivity({ userId: req.user?.id, action: "DELETE", module: "hr", description: `Deleted employee ${employee.name}` });
  res.sendStatus(204);
});

router.get("/employees/:id/attendance", authenticate, async (req, res): Promise<void> => {
  const params = GetEmployeeAttendanceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, params.data.id));
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  const records = await db.select().from(attendanceTable).where(eq(attendanceTable.employeeId, params.data.id));
  res.json(records.map(r => toAttendance(r, employee.name)));
});

router.post("/attendance", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = RecordAttendanceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, parsed.data.employeeId));
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  const [record] = await db.insert(attendanceTable).values({
    ...parsed.data,
    date: new Date(parsed.data.date),
    checkIn: parsed.data.checkIn ? new Date(parsed.data.checkIn) : null,
    checkOut: parsed.data.checkOut ? new Date(parsed.data.checkOut) : null,
    notes: parsed.data.notes ?? null,
  }).returning();
  res.status(201).json(toAttendance(record, employee.name));
});

export default router;
