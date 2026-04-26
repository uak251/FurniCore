import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, manufacturingTasksTable, productsTable, usersTable } from "@workspace/db";
import { CreateManufacturingTaskBody, UpdateManufacturingTaskBody, GetManufacturingTaskParams, UpdateManufacturingTaskParams, DeleteManufacturingTaskParams, ListManufacturingTasksQueryParams } from "@workspace/api-zod";
import { authenticate } from "../../../middlewares/authenticate";
import { logActivity } from "../../../lib/activityLogger";
const router = Router();
async function toTask(t) {
    let productName = null;
    let assigneeName = null;
    if (t.productId) {
        const [p] = await db.select().from(productsTable).where(eq(productsTable.id, t.productId));
        productName = p?.name ?? null;
    }
    if (t.assigneeId) {
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, t.assigneeId));
        assigneeName = u?.name ?? null;
    }
    return {
        ...t,
        productName,
        assigneeName,
        estimatedHours: t.estimatedHours !== null ? Number(t.estimatedHours) : null,
        actualHours: t.actualHours !== null ? Number(t.actualHours) : null,
        dueDate: t.dueDate?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
    };
}
router.get("/manufacturing", authenticate, async (req, res) => {
    const params = ListManufacturingTasksQueryParams.safeParse(req.query);
    let query = db.select().from(manufacturingTasksTable).$dynamic();
    if (params.success && params.data.status) {
        query = query.where(eq(manufacturingTasksTable.status, params.data.status));
    }
    const tasks = await query;
    const enriched = await Promise.all(tasks.map(toTask));
    res.json(enriched);
});
router.post("/manufacturing", authenticate, async (req, res) => {
    const parsed = CreateManufacturingTaskBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [task] = await db.insert(manufacturingTasksTable).values({
        ...parsed.data,
        estimatedHours: parsed.data.estimatedHours !== undefined ? String(parsed.data.estimatedHours) : null,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        productId: parsed.data.productId ?? null,
        assigneeId: parsed.data.assigneeId ?? null,
        description: parsed.data.description ?? null,
    }).returning();
    const enriched = await toTask(task);
    await logActivity({ userId: req.user?.id, action: "CREATE", module: "manufacturing", description: `Created task: ${task.title}`, newData: enriched });
    res.status(201).json(enriched);
});
router.get("/manufacturing/:id", authenticate, async (req, res) => {
    const params = GetManufacturingTaskParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [task] = await db.select().from(manufacturingTasksTable).where(eq(manufacturingTasksTable.id, params.data.id));
    if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
    }
    res.json(await toTask(task));
});
router.patch("/manufacturing/:id", authenticate, async (req, res) => {
    const params = UpdateManufacturingTaskParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = UpdateManufacturingTaskBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [old] = await db.select().from(manufacturingTasksTable).where(eq(manufacturingTasksTable.id, params.data.id));
    const updateData = { ...parsed.data };
    if (parsed.data.estimatedHours !== undefined)
        updateData.estimatedHours = String(parsed.data.estimatedHours);
    if (parsed.data.actualHours !== undefined)
        updateData.actualHours = String(parsed.data.actualHours);
    if (parsed.data.dueDate !== undefined)
        updateData.dueDate = new Date(parsed.data.dueDate);
    if (parsed.data.status === "completed" && !old.completedAt)
        updateData.completedAt = new Date();
    const [task] = await db.update(manufacturingTasksTable).set(updateData).where(eq(manufacturingTasksTable.id, params.data.id)).returning();
    if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
    }
    const enriched = await toTask(task);
    await logActivity({ userId: req.user?.id, action: "UPDATE", module: "manufacturing", description: `Updated task: ${task.title}`, oldData: await toTask(old), newData: enriched });
    res.json(enriched);
});
router.delete("/manufacturing/:id", authenticate, async (req, res) => {
    const params = DeleteManufacturingTaskParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [task] = await db.delete(manufacturingTasksTable).where(eq(manufacturingTasksTable.id, params.data.id)).returning();
    if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
    }
    await logActivity({ userId: req.user?.id, action: "DELETE", module: "manufacturing", description: `Deleted task: ${task.title}` });
    res.sendStatus(204);
});
export default router;
