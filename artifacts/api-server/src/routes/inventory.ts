import { Router, type IRouter } from "express";
import { eq, lte, ilike } from "drizzle-orm";
import { db, inventoryTable, suppliersTable, appSettingsTable } from "@workspace/db";
import { CreateInventoryItemBody, UpdateInventoryItemBody, GetInventoryItemParams, UpdateInventoryItemParams, DeleteInventoryItemParams, ListInventoryQueryParams } from "@workspace/api-zod";
import { authenticate, AuthRequest } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";
import { notifyLowStockStakeholders } from "../lib/inventoryAlerts";

const router: IRouter = Router();

async function enrichItem(item: typeof inventoryTable.$inferSelect) {
  let supplierName = null;
  if (item.supplierId) {
    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, item.supplierId));
    supplierName = supplier?.name ?? null;
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

router.get("/inventory", authenticate, async (req, res): Promise<void> => {
  const params = ListInventoryQueryParams.safeParse(req.query);
  let query = db.select().from(inventoryTable).$dynamic();
  if (params.success && params.data.search) {
    query = query.where(ilike(inventoryTable.name, `%${params.data.search}%`));
  }
  const items = await query;
  const enriched = await Promise.all(items.map(enrichItem));
  res.json(enriched);
});

router.get("/inventory/low-stock", authenticate, async (_req, res): Promise<void> => {
  const items = await db.select().from(inventoryTable);
  const enriched = await Promise.all(items.map(enrichItem));
  res.json(enriched.filter(i => i.isLowStock));
});

router.get("/inventory/valuation", authenticate, async (_req, res): Promise<void> => {
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
      id:         i.id,
      name:       i.name,
      type:       i.type,
      unit:       i.unit,
      quantity,
      unitCost,
      value:      quantity * unitCost,
    };
  });

  const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
  res.json({ method, rows, totalValue });
});

router.post("/inventory", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
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

router.get("/inventory/:id", authenticate, async (req, res): Promise<void> => {
  const params = GetInventoryItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [item] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, params.data.id));
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  res.json(await enrichItem(item));
});

router.patch("/inventory/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = UpdateInventoryItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.quantity !== undefined) updateData.quantity = String(parsed.data.quantity);
  if (parsed.data.reorderLevel !== undefined) updateData.reorderLevel = String(parsed.data.reorderLevel);
  if (parsed.data.unitCost !== undefined) updateData.unitCost = String(parsed.data.unitCost);
  const [old] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, params.data.id));
  const [item] = await db.update(inventoryTable).set(updateData).where(eq(inventoryTable.id, params.data.id)).returning();
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
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

router.delete("/inventory/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = DeleteInventoryItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [item] = await db.delete(inventoryTable).where(eq(inventoryTable.id, params.data.id)).returning();
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  await logActivity({ userId: req.user?.id, action: "DELETE", module: "inventory", description: `Deleted inventory item ${item.name}` });
  res.sendStatus(204);
});

export default router;
