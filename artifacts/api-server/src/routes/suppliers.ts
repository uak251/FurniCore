import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, suppliersTable, supplierQuotesTable } from "@workspace/db";
import { CreateSupplierBody, UpdateSupplierBody, GetSupplierParams, UpdateSupplierParams, DeleteSupplierParams, ListSuppliersQueryParams, GetSupplierQuotesParams } from "@workspace/api-zod";
import { authenticate, AuthRequest } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";

const router: IRouter = Router();

function toSupplier(s: typeof suppliersTable.$inferSelect) {
  return { ...s, rating: s.rating !== null ? Number(s.rating) : null };
}

function toQuote(q: typeof supplierQuotesTable.$inferSelect, supplierName: string) {
  return {
    ...q,
    supplierName,
    quantity: Number(q.quantity),
    unitPrice: Number(q.unitPrice),
    totalPrice: Number(q.totalPrice),
    itemName: null,
    validUntil: q.validUntil?.toISOString() ?? null,
    lockedAt: q.lockedAt?.toISOString() ?? null,
    approvedAt: q.approvedAt?.toISOString() ?? null,
    paidAt: q.paidAt?.toISOString() ?? null,
  };
}

router.get("/suppliers", authenticate, async (req, res): Promise<void> => {
  const params = ListSuppliersQueryParams.safeParse(req.query);
  let query = db.select().from(suppliersTable).$dynamic();
  if (params.success && params.data.search) {
    query = query.where(ilike(suppliersTable.name, `%${params.data.search}%`));
  }
  const suppliers = await query;
  res.json(suppliers.map(toSupplier));
});

router.post("/suppliers", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [supplier] = await db.insert(suppliersTable).values(parsed.data).returning();
  await logActivity({ userId: req.user?.id, action: "CREATE", module: "suppliers", description: `Created supplier ${supplier.name}`, newData: toSupplier(supplier) });
  res.status(201).json(toSupplier(supplier));
});

router.get("/suppliers/:id", authenticate, async (req, res): Promise<void> => {
  const params = GetSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(toSupplier(supplier));
});

router.get("/suppliers/:id/quotes", authenticate, async (req, res): Promise<void> => {
  const params = GetSupplierQuotesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  const quotes = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.supplierId, params.data.id));
  res.json(quotes.map(q => toQuote(q, supplier.name)));
});

router.patch("/suppliers/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = UpdateSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateSupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.rating !== undefined) updateData.rating = String(parsed.data.rating);
  const [old] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
  const [supplier] = await db.update(suppliersTable).set(updateData).where(eq(suppliersTable.id, params.data.id)).returning();
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  await logActivity({ userId: req.user?.id, action: "UPDATE", module: "suppliers", description: `Updated supplier ${supplier.name}`, oldData: toSupplier(old), newData: toSupplier(supplier) });
  res.json(toSupplier(supplier));
});

router.delete("/suppliers/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = DeleteSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [supplier] = await db.delete(suppliersTable).where(eq(suppliersTable.id, params.data.id)).returning();
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  await logActivity({ userId: req.user?.id, action: "DELETE", module: "suppliers", description: `Deleted supplier ${supplier.name}` });
  res.sendStatus(204);
});

export default router;
