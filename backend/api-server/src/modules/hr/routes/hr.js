import { Router } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, employeesTable, attendanceTable } from "@workspace/db";
import { CreateEmployeeBody, UpdateEmployeeBody, GetEmployeeParams, UpdateEmployeeParams, DeleteEmployeeParams, ListEmployeesQueryParams, GetEmployeeAttendanceParams, RecordAttendanceBody } from "@workspace/api-zod";
import { authenticate } from "../../../middlewares/authenticate";
import { logActivity } from "../../../lib/activityLogger";
const router = Router();
function toEmployee(e) {
    return { ...e, baseSalary: Number(e.baseSalary), hireDate: e.hireDate.toISOString() };
}
function toAttendance(a, employeeName) {
    return {
        ...a,
        employeeName,
        date: a.date.toISOString().split("T")[0],
        checkIn: a.checkIn?.toISOString() ?? null,
        checkOut: a.checkOut?.toISOString() ?? null,
        hoursWorked: a.hoursWorked !== null ? Number(a.hoursWorked) : null,
    };
}
router.get("/employees", authenticate, async (req, res) => {
    const params = ListEmployeesQueryParams.safeParse(req.query);
    let query = db.select().from(employeesTable).$dynamic();
    if (params.success && params.data.search) {
        query = query.where(ilike(employeesTable.name, `%${params.data.search}%`));
    }
    const employees = await query;
    res.json(employees.map(toEmployee));
});
router.post("/employees", authenticate, async (req, res, next) => {
    const parsed = CreateEmployeeBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    try {
        const [employee] = await db.insert(employeesTable).values({
            ...parsed.data,
            baseSalary: String(parsed.data.baseSalary),
            hireDate: new Date(parsed.data.hireDate),
            userId: parsed.data.userId ?? null,
            phone: parsed.data.phone ?? null,
        }).returning();
        await logActivity({ userId: req.user?.id, action: "CREATE", module: "hr", description: `Created employee ${employee.name}`, newData: toEmployee(employee) });
        res.status(201).json(toEmployee(employee));
    }
    catch (err) {
        next(err);
    }
});
router.get("/employees/:id", authenticate, async (req, res) => {
    const params = GetEmployeeParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, params.data.id));
    if (!employee) {
        res.status(404).json({ error: "Employee not found" });
        return;
    }
    res.json(toEmployee(employee));
});
router.patch("/employees/:id", authenticate, async (req, res, next) => {
    const params = UpdateEmployeeParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = UpdateEmployeeBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    try {
        const updateData = { ...parsed.data };
        if (parsed.data.baseSalary !== undefined)
            updateData.baseSalary = String(parsed.data.baseSalary);
        const [old] = await db.select().from(employeesTable).where(eq(employeesTable.id, params.data.id));
        const [employee] = await db.update(employeesTable).set(updateData).where(eq(employeesTable.id, params.data.id)).returning();
        if (!employee) {
            res.status(404).json({ error: "Employee not found" });
            return;
        }
        await logActivity({ userId: req.user?.id, action: "UPDATE", module: "hr", description: `Updated employee ${employee.name}`, oldData: toEmployee(old), newData: toEmployee(employee) });
        res.json(toEmployee(employee));
    }
    catch (err) {
        next(err);
    }
});
/**
 * Soft-delete: sets isActive=false.
 * Hard-deleting breaks FK constraints from attendance, payroll, and performance tables.
 * Use PATCH /employees/:id with { isActive: true } to reactivate.
 */
router.delete("/employees/:id", authenticate, async (req, res, next) => {
    const params = DeleteEmployeeParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    try {
        const [employee] = await db
            .update(employeesTable)
            .set({ isActive: false })
            .where(eq(employeesTable.id, params.data.id))
            .returning();
        if (!employee) {
            res.status(404).json({ error: "Employee not found" });
            return;
        }
        await logActivity({ userId: req.user?.id, action: "DEACTIVATE", module: "hr", description: `Deactivated employee ${employee.name}` });
        res.sendStatus(204);
    }
    catch (err) {
        next(err);
    }
});
router.get("/employees/:id/attendance", authenticate, async (req, res) => {
    const params = GetEmployeeAttendanceParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, params.data.id));
    if (!employee) {
        res.status(404).json({ error: "Employee not found" });
        return;
    }
    const records = await db.select().from(attendanceTable).where(eq(attendanceTable.employeeId, params.data.id));
    res.json(records.map(r => toAttendance(r, employee.name)));
});
router.post("/attendance", authenticate, async (req, res) => {
    const parsed = RecordAttendanceBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, parsed.data.employeeId));
    if (!employee) {
        res.status(404).json({ error: "Employee not found" });
        return;
    }
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
