import { Router } from "express";
import { eq, ilike, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, inventoryTable, suppliersTable, appSettingsTable, usersTable, supplierQuotesTable } from "@workspace/db";
import { CreateInventoryItemBody, UpdateInventoryItemBody, GetInventoryItemParams, UpdateInventoryItemParams, DeleteInventoryItemParams, ListInventoryQueryParams } from "@workspace/api-zod";
import { authenticate, requireRole } from "../../../middlewares/authenticate";
import { logActivity, createNotification } from "../../../lib/activityLogger";
import { notifyLowStockStakeholders } from "../../../lib/inventoryAlerts";
const router = Router();
function isSchemaOrRelationError(err) {
    const msg = String(err?.message ?? "");
    return /column .* does not exist|relation .* does not exist|Failed query/i.test(msg);
}
async function enrichItem(item) {
    let supplierName = null;
    if (item.supplierId) {
        try {
            const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, item.supplierId));
            supplierName = supplier?.name ?? null;
        }
        catch {
            // Do not fail the whole inventory list if supplier enrichment fails due to schema drift.
            supplierName = null;
        }
    }
    return {
        ...item,
        quantity: Number(item.quantity),
        reorderLevel: Number(item.reorderLevel),
        unitCost: Number(item.unitCost),
        supplierName,
        isLowStock: Number(item.quantity) <= Number(item.reorderLevel),
    };
}
router.get("/inventory", authenticate, async (req, res) => {
    try {
        const params = ListInventoryQueryParams.safeParse(req.query);
        let query = db.select().from(inventoryTable).$dynamic();
        if (params.success && params.data.search) {
            query = query.where(ilike(inventoryTable.name, `%${params.data.search}%`));
        }
        const items = await query;
        const enriched = await Promise.all(items.map(enrichItem));
        res.json(enriched);
    }
    catch (err) {
        if (isSchemaOrRelationError(err)) {
            res.json([]);
            return;
        }
        throw err;
    }
});
router.get("/inventory/low-stock", authenticate, async (_req, res) => {
    try {
        const items = await db.select().from(inventoryTable);
        const enriched = await Promise.all(items.map(enrichItem));
        res.json(enriched.filter(i => i.isLowStock));
    }
    catch (err) {
        if (isSchemaOrRelationError(err)) {
            res.json([]);
            return;
        }
        throw err;
    }
});
router.get("/inventory/valuation", authenticate, async (_req, res) => {
    try {
        const [setting] = await db
            .select()
            .from(appSettingsTable)
            .where(eq(appSettingsTable.key, "INVENTORY_VALUATION_METHOD"));
        const method = setting?.value ?? "WAC";
        const items = await db.select().from(inventoryTable);
        const rows = items.map((i) => {
            const quantity = Number(i.quantity);
            const unitCost = Number(i.unitCost);
            return {
                id: i.id,
                name: i.name,
                type: i.type,
                unit: i.unit,
                quantity,
                unitCost,
                value: quantity * unitCost,
            };
        });
        const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
        res.json({ method, rows, totalValue });
    }
    catch (err) {
        if (isSchemaOrRelationError(err)) {
            res.json({ method: "WAC", rows: [], totalValue: 0 });
            return;
        }
        throw err;
    }
});
router.post("/inventory", authenticate, async (req, res) => {
    const parsed = CreateInventoryItemBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [item] = await db.insert(inventoryTable).values({
        ...parsed.data,
        quantity: String(parsed.data.quantity),
        reorderLevel: String(parsed.data.reorderLevel),
        unitCost: String(parsed.data.unitCost),
    }).returning();
    const enriched = await enrichItem(item);
    await logActivity({ userId: req.user?.id, action: "CREATE", module: "inventory", description: `Created inventory item ${item.name}`, newData: enriched });
    if (enriched.isLowStock) {
        await notifyLowStockStakeholders({
            id: enriched.id,
            name: enriched.name,
            quantity: enriched.quantity,
            reorderLevel: enriched.reorderLevel,
        });
    }
    res.status(201).json(enriched);
});
router.get("/inventory/:id", authenticate, async (req, res) => {
    const params = GetInventoryItemParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [item] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, params.data.id));
    if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
    }
    res.json(await enrichItem(item));
});
router.patch("/inventory/:id", authenticate, async (req, res) => {
    const params = UpdateInventoryItemParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = UpdateInventoryItemBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const updateData = { ...parsed.data };
    if (parsed.data.quantity !== undefined)
        updateData.quantity = String(parsed.data.quantity);
    if (parsed.data.reorderLevel !== undefined)
        updateData.reorderLevel = String(parsed.data.reorderLevel);
    if (parsed.data.unitCost !== undefined)
        updateData.unitCost = String(parsed.data.unitCost);
    const [old] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, params.data.id));
    const [item] = await db.update(inventoryTable).set(updateData).where(eq(inventoryTable.id, params.data.id)).returning();
    if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
    }
    const enriched = await enrichItem(item);
    await logActivity({ userId: req.user?.id, action: "UPDATE", module: "inventory", description: `Updated inventory item ${item.name}`, oldData: await enrichItem(old), newData: enriched });
    if (enriched.isLowStock) {
        await notifyLowStockStakeholders({
            id: enriched.id,
            name: enriched.name,
            quantity: enriched.quantity,
            reorderLevel: enriched.reorderLevel,
        });
    }
    res.json(enriched);
});
/** Deck 05 — "create demand": notify procurement that an item should be reordered (manual demand signal). */
router.post("/inventory/procurement-demand", authenticate, requireRole("admin", "manager", "inventory_manager", "sales_manager", "accountant"), async (req, res) => {
    const body = z.object({
        inventoryItemId: z.number().int().positive(),
        quantityRequested: z.number().positive().optional(),
        supplierId: z.number().int().positive().optional(),
        notes: z.string().max(2000).optional(),
    }).safeParse(req.body);
    if (!body.success) {
        res.status(400).json({ error: body.error.message });
        return;
    }
    const [item] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, body.data.inventoryItemId));
    if (!item) {
        res.status(404).json({ error: "Inventory item not found" });
        return;
    }
    const qty = (body.data.quantityRequested ?? Number(item.reorderLevel)) || 1;
    let supplierId = body.data.supplierId ?? item.supplierId ?? null;
    if (supplierId) {
        const [supplier] = await db.select({ id: suppliersTable.id }).from(suppliersTable).where(eq(suppliersTable.id, supplierId));
        if (!supplier) {
            res.status(400).json({ error: "Supplier not found for this demand." });
            return;
        }
    }
    if (!supplierId) {
        const [anySupplier] = await db.select({ id: suppliersTable.id }).from(suppliersTable).limit(1);
        supplierId = anySupplier?.id ?? null;
    }
    if (!supplierId) {
        res.status(400).json({ error: "No supplier on file — add at least one supplier (or link this item to a supplier) before creating procurement demand." });
        return;
    }
    const unitCost = Math.max(0, Number(item.unitCost ?? 0));
    const totalPrice = unitCost * qty;
    const demandNote = (body.data.notes?.trim() || "").slice(0, 1500);
    const desc = `[Inventory demand] ${item.name} · qty ${qty} ${item.unit}${demandNote ? ` · ${demandNote}` : ""}`;
    const [quote] = await db.insert(supplierQuotesTable).values({
        supplierId,
        inventoryItemId: item.id,
        quantity: String(qty),
        unitPrice: String(unitCost.toFixed(2)),
        totalPrice: String(totalPrice.toFixed(2)),
        validUntil: null,
        status: "PENDING",
        workflowStage: "draft",
        description: desc,
        notes: demandNote || null,
    }).returning();
    const recipients = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.isActive, true), inArray(usersTable.role, ["admin", "manager", "inventory_manager"])));
    const title = "Procurement demand";
    const message = `${item.name}: draft quote #${quote.id} for ~${qty} ${item.unit}. Review under Procurement.`;
    await Promise.all(recipients.map((u) => createNotification({
        userId: u.id,
        title,
        message,
        type: "info",
        link: "/procurement",
    })));
    await logActivity({
        userId: req.user?.id,
        action: "CREATE",
        module: "inventory",
        description: `Procurement demand → supplier quote #${quote.id} for ${item.name} (qty ${qty})`,
    });
    res.status(201).json({ ok: true, inventoryItemId: item.id, quantityRequested: qty, supplierQuoteId: quote.id });
});
router.post("/inventory/procurement-demand/bulk", authenticate, requireRole("admin", "manager", "inventory_manager", "sales_manager", "accountant"), async (req, res) => {
    const body = z.object({
        items: z.array(z.object({
            inventoryItemId: z.number().int().positive(),
            quantityRequested: z.number().positive().optional(),
            supplierId: z.number().int().positive().optional(),
            notes: z.string().max(2000).optional(),
        })).min(1),
    }).safeParse(req.body);
    if (!body.success) {
        res.status(400).json({ error: body.error.message });
        return;
    }
    const created = [];
    for (const row of body.data.items) {
        const [item] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, row.inventoryItemId));
        if (!item)
            continue;
        const qty = (row.quantityRequested ?? Number(item.reorderLevel)) || 1;
        let supplierId = row.supplierId ?? item.supplierId ?? null;
        if (supplierId) {
            const [supplier] = await db.select({ id: suppliersTable.id }).from(suppliersTable).where(eq(suppliersTable.id, supplierId));
            if (!supplier)
                supplierId = null;
        }
        if (!supplierId) {
            const [anySupplier] = await db.select({ id: suppliersTable.id }).from(suppliersTable).limit(1);
            supplierId = anySupplier?.id ?? null;
        }
        if (!supplierId)
            continue;
        const unitCost = Math.max(0, Number(item.unitCost ?? 0));
        const totalPrice = unitCost * qty;
        const demandNote = (row.notes?.trim() || "").slice(0, 1500);
        const desc = `[Inventory demand] ${item.name} · qty ${qty} ${item.unit}${demandNote ? ` · ${demandNote}` : ""}`;
        const [quote] = await db.insert(supplierQuotesTable).values({
            supplierId,
            inventoryItemId: item.id,
            quantity: String(qty),
            unitPrice: String(unitCost.toFixed(2)),
            totalPrice: String(totalPrice.toFixed(2)),
            validUntil: null,
            status: "PENDING",
            workflowStage: "draft",
            description: desc,
            notes: demandNote || null,
        }).returning();
        created.push({ inventoryItemId: item.id, supplierQuoteId: quote.id, quantityRequested: qty, supplierId });
    }
    const recipients = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.isActive, true), inArray(usersTable.role, ["admin", "manager", "inventory_manager"])));
    await Promise.all(recipients.map((u) => createNotification({
        userId: u.id,
        title: "Bulk procurement demand",
        message: `${created.length} demand item(s) were created and queued for review.`,
        type: "info",
        link: "/procurement",
    })));
    await logActivity({
        userId: req.user?.id,
        action: "CREATE",
        module: "inventory",
        description: `Bulk procurement demand created for ${created.length} items`,
    });
    res.status(201).json({ ok: true, created });
});
router.delete("/inventory/:id", authenticate, async (req, res) => {
    const params = DeleteInventoryItemParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [item] = await db.delete(inventoryTable).where(eq(inventoryTable.id, params.data.id)).returning();
    if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
    }
    await logActivity({ userId: req.user?.id, action: "DELETE", module: "inventory", description: `Deleted inventory item ${item.name}` });
    res.sendStatus(204);
});
export default router;
