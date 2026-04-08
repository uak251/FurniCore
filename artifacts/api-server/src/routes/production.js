/**
 * Production Manager API routes.
 *
 * Routes:
 *   GET    /production-orders            list all orders  (authenticated)
 *   POST   /production-orders            create order     (admin | manager)
 *   PATCH  /production-orders/:id        update order     (admin | manager)
 *   DELETE /production-orders/:id        delete order     (admin)
 *
 *   GET    /qc-remarks                   all remarks      (admin | manager)
 *   GET    /qc-remarks/public            customer-visible (no auth — for customer portal)
 *   POST   /qc-remarks                   add remark       (admin | manager)
 *   PATCH  /qc-remarks/:id               edit remark      (admin | manager)
 *   DELETE /qc-remarks/:id               delete remark    (admin)
 *
 *   GET    /material-usage               usage log        (authenticated)
 *   POST   /material-usage               log usage        (authenticated)
 *   DELETE /material-usage/:id           delete entry     (admin | manager)
 */
import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db, productionOrdersTable, qcRemarksTable, materialUsageTable, manufacturingTasksTable, productsTable, usersTable, } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";
const router = Router();
// ─── Order-number generator ───────────────────────────────────────────────────
function genOrderNumber() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return `PO-${ymd}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}
// ─── Row enrichers ────────────────────────────────────────────────────────────
async function enrichOrder(o) {
    const [[product], [task], [creator]] = await Promise.all([
        o.productId
            ? db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, o.productId))
            : Promise.resolve([null]),
        o.taskId
            ? db.select({ title: manufacturingTasksTable.title }).from(manufacturingTasksTable).where(eq(manufacturingTasksTable.id, o.taskId))
            : Promise.resolve([null]),
        o.createdBy
            ? db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, o.createdBy))
            : Promise.resolve([null]),
    ]);
    return {
        ...o,
        productName: product?.name ?? null,
        taskTitle: task?.title ?? null,
        createdByName: creator?.name ?? null,
        targetDate: o.targetDate?.toISOString() ?? null,
    };
}
async function enrichQcRemark(r) {
    const [[task], [inspector]] = await Promise.all([
        db.select({ title: manufacturingTasksTable.title }).from(manufacturingTasksTable).where(eq(manufacturingTasksTable.id, r.taskId)),
        r.inspectorId
            ? db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, r.inspectorId))
            : Promise.resolve([null]),
    ]);
    return {
        ...r,
        taskTitle: task?.title ?? null,
        inspectorName: inspector?.name ?? null,
    };
}
async function enrichMaterial(m) {
    const [[task], [logger]] = await Promise.all([
        db.select({ title: manufacturingTasksTable.title }).from(manufacturingTasksTable).where(eq(manufacturingTasksTable.id, m.taskId)),
        m.loggedBy
            ? db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, m.loggedBy))
            : Promise.resolve([null]),
    ]);
    return {
        ...m,
        taskTitle: task?.title ?? null,
        loggedByName: logger?.name ?? null,
        quantityUsed: Number(m.quantityUsed),
    };
}
// ─── Zod schemas ─────────────────────────────────────────────────────────────
const OrderStatuses = ["planned", "in_production", "quality_check", "completed", "cancelled"];
const CreateOrderBody = z.object({
    productId: z.number().int().positive(),
    taskId: z.number().int().positive().optional(),
    quantity: z.number().int().positive().default(1),
    targetDate: z.string().optional(),
    status: z.enum(OrderStatuses).default("planned"),
    notes: z.string().optional(),
});
const UpdateOrderBody = z.object({
    taskId: z.number().int().positive().nullable().optional(),
    quantity: z.number().int().positive().optional(),
    targetDate: z.string().nullable().optional(),
    status: z.enum(OrderStatuses).optional(),
    notes: z.string().nullable().optional(),
});
const QcResults = ["pass", "fail", "hold"];
const CreateQcBody = z.object({
    taskId: z.number().int().positive(),
    result: z.enum(QcResults),
    remarks: z.string().min(1),
    visibleToCustomer: z.boolean().default(false),
});
const UpdateQcBody = z.object({
    result: z.enum(QcResults).optional(),
    remarks: z.string().min(1).optional(),
    visibleToCustomer: z.boolean().optional(),
});
const CreateMaterialBody = z.object({
    taskId: z.number().int().positive(),
    inventoryItemId: z.number().int().positive().optional(),
    materialName: z.string().min(1),
    quantityUsed: z.number().positive(),
    unit: z.string().min(1),
    notes: z.string().optional(),
});
// ─── Production Orders ────────────────────────────────────────────────────────
router.get("/production-orders", authenticate, async (_req, res) => {
    const rows = await db
        .select()
        .from(productionOrdersTable)
        .orderBy(desc(productionOrdersTable.createdAt));
    res.json(await Promise.all(rows.map(enrichOrder)));
});
router.post("/production-orders", authenticate, requireRole("admin", "manager"), async (req, res) => {
    const parsed = CreateOrderBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    // Ensure unique order number (retry up to 5 times)
    let orderNumber = genOrderNumber();
    for (let i = 0; i < 5; i++) {
        const existing = await db
            .select({ id: productionOrdersTable.id })
            .from(productionOrdersTable)
            .where(eq(productionOrdersTable.orderNumber, orderNumber));
        if (existing.length === 0)
            break;
        orderNumber = genOrderNumber();
    }
    const [order] = await db
        .insert(productionOrdersTable)
        .values({
        ...parsed.data,
        orderNumber,
        taskId: parsed.data.taskId ?? null,
        targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null,
        notes: parsed.data.notes ?? null,
        createdBy: req.user?.id ?? null,
    })
        .returning();
    const enriched = await enrichOrder(order);
    await logActivity({
        userId: req.user?.id,
        action: "CREATE",
        module: "manufacturing",
        description: `Created production order ${order.orderNumber}`,
        newData: enriched,
    });
    res.status(201).json(enriched);
});
router.patch("/production-orders/:id", authenticate, requireRole("admin", "manager"), async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = UpdateOrderBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const updates = { ...parsed.data };
    if (parsed.data.targetDate !== undefined) {
        updates.targetDate = parsed.data.targetDate ? new Date(parsed.data.targetDate) : null;
    }
    const [order] = await db
        .update(productionOrdersTable)
        .set(updates)
        .where(eq(productionOrdersTable.id, id))
        .returning();
    if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
    }
    const enriched = await enrichOrder(order);
    await logActivity({
        userId: req.user?.id,
        action: "UPDATE",
        module: "manufacturing",
        description: `Updated production order ${order.orderNumber} → ${order.status}`,
        newData: enriched,
    });
    res.json(enriched);
});
router.delete("/production-orders/:id", authenticate, requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [order] = await db
        .delete(productionOrdersTable)
        .where(eq(productionOrdersTable.id, id))
        .returning();
    if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
    }
    await logActivity({
        userId: req.user?.id,
        action: "DELETE",
        module: "manufacturing",
        description: `Deleted production order ${order.orderNumber}`,
    });
    res.sendStatus(204);
});
// ─── QC Remarks ───────────────────────────────────────────────────────────────
// Admin/Manager — see all remarks; optional ?taskId filter
router.get("/qc-remarks", authenticate, requireRole("admin", "manager"), async (req, res) => {
    const taskId = req.query.taskId ? Number(req.query.taskId) : null;
    const rows = taskId
        ? await db
            .select()
            .from(qcRemarksTable)
            .where(eq(qcRemarksTable.taskId, taskId))
            .orderBy(desc(qcRemarksTable.createdAt))
        : await db.select().from(qcRemarksTable).orderBy(desc(qcRemarksTable.createdAt));
    res.json(await Promise.all(rows.map(enrichQcRemark)));
});
/**
 * Public endpoint — no authentication required.
 * Returns only remarks where visibleToCustomer = true.
 * Intended for embedding in a customer-facing portal or sharing via link.
 * Optionally filter by ?taskId=
 */
router.get("/qc-remarks/public", async (req, res) => {
    const taskId = req.query.taskId ? Number(req.query.taskId) : null;
    const rows = taskId
        ? await db
            .select()
            .from(qcRemarksTable)
            .where(and(eq(qcRemarksTable.visibleToCustomer, true), eq(qcRemarksTable.taskId, taskId)))
            .orderBy(desc(qcRemarksTable.createdAt))
        : await db
            .select()
            .from(qcRemarksTable)
            .where(eq(qcRemarksTable.visibleToCustomer, true))
            .orderBy(desc(qcRemarksTable.createdAt));
    res.json(await Promise.all(rows.map(enrichQcRemark)));
});
router.post("/qc-remarks", authenticate, requireRole("admin", "manager"), async (req, res) => {
    const parsed = CreateQcBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [remark] = await db
        .insert(qcRemarksTable)
        .values({ ...parsed.data, inspectorId: req.user?.id ?? null })
        .returning();
    const enriched = await enrichQcRemark(remark);
    await logActivity({
        userId: req.user?.id,
        action: "CREATE",
        module: "manufacturing",
        description: `QC ${parsed.data.result.toUpperCase()} for task #${parsed.data.taskId}: ${parsed.data.remarks.slice(0, 80)}`,
        newData: enriched,
    });
    res.status(201).json(enriched);
});
router.patch("/qc-remarks/:id", authenticate, requireRole("admin", "manager"), async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = UpdateQcBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [remark] = await db
        .update(qcRemarksTable)
        .set(parsed.data)
        .where(eq(qcRemarksTable.id, id))
        .returning();
    if (!remark) {
        res.status(404).json({ error: "QC remark not found" });
        return;
    }
    res.json(await enrichQcRemark(remark));
});
router.delete("/qc-remarks/:id", authenticate, requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [remark] = await db
        .delete(qcRemarksTable)
        .where(eq(qcRemarksTable.id, id))
        .returning();
    if (!remark) {
        res.status(404).json({ error: "QC remark not found" });
        return;
    }
    res.sendStatus(204);
});
// ─── Material Usage ───────────────────────────────────────────────────────────
router.get("/material-usage", authenticate, async (req, res) => {
    const taskId = req.query.taskId ? Number(req.query.taskId) : null;
    const rows = taskId
        ? await db
            .select()
            .from(materialUsageTable)
            .where(eq(materialUsageTable.taskId, taskId))
            .orderBy(desc(materialUsageTable.createdAt))
        : await db
            .select()
            .from(materialUsageTable)
            .orderBy(desc(materialUsageTable.createdAt));
    res.json(await Promise.all(rows.map(enrichMaterial)));
});
router.post("/material-usage", authenticate, async (req, res) => {
    const parsed = CreateMaterialBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [usage] = await db
        .insert(materialUsageTable)
        .values({
        ...parsed.data,
        quantityUsed: String(parsed.data.quantityUsed),
        inventoryItemId: parsed.data.inventoryItemId ?? null,
        notes: parsed.data.notes ?? null,
        loggedBy: req.user?.id ?? null,
    })
        .returning();
    const enriched = await enrichMaterial(usage);
    await logActivity({
        userId: req.user?.id,
        action: "CREATE",
        module: "manufacturing",
        description: `Material logged: ${parsed.data.materialName} ×${parsed.data.quantityUsed} ${parsed.data.unit} (task #${parsed.data.taskId})`,
        newData: enriched,
    });
    res.status(201).json(enriched);
});
router.delete("/material-usage/:id", authenticate, requireRole("admin", "manager"), async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [usage] = await db
        .delete(materialUsageTable)
        .where(eq(materialUsageTable.id, id))
        .returning();
    if (!usage) {
        res.status(404).json({ error: "Material usage record not found" });
        return;
    }
    res.sendStatus(204);
});
export default router;
