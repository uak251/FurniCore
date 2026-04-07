import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, supplierQuotesTable, suppliersTable, inventoryTable } from "@workspace/db";
import { CreateQuoteBody, ListQuotesQueryParams, GetQuoteParams, LockQuoteParams, ApproveQuoteParams, PayQuoteParams } from "@workspace/api-zod";
import { authenticate, requireRole, AuthRequest } from "../middlewares/authenticate";

// Internal quotes routes are restricted to staff roles only.
// Suppliers use /supplier-portal/quotes instead.
const internalOnly = requireRole("admin", "manager", "accountant", "sales_manager", "employee");
import { logActivity, createNotification } from "../lib/activityLogger";

const router: IRouter = Router();

async function toQuote(q: typeof supplierQuotesTable.$inferSelect) {
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, q.supplierId));
  let itemName = null;
  if (q.inventoryItemId) {
    const [item] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, q.inventoryItemId));
    itemName = item?.name ?? null;
  }
  return {
    ...q,
    supplierName: supplier?.name ?? "",
    itemName,
    quantity: Number(q.quantity),
    unitPrice: Number(q.unitPrice),
    totalPrice: Number(q.totalPrice),
    validUntil: q.validUntil?.toISOString() ?? null,
    lockedAt: q.lockedAt?.toISOString() ?? null,
    approvedAt: q.approvedAt?.toISOString() ?? null,
    paidAt: q.paidAt?.toISOString() ?? null,
  };
}

router.get("/quotes", authenticate, internalOnly, async (req, res): Promise<void> => {
  const params = ListQuotesQueryParams.safeParse(req.query);
  let query = db.select().from(supplierQuotesTable).$dynamic();
  if (params.success && params.data.status) {
    query = query.where(eq(supplierQuotesTable.status, params.data.status));
  }
  const quotes = await query;
  const enriched = await Promise.all(quotes.map(toQuote));
  res.json(enriched);
});

router.post("/quotes", authenticate, internalOnly, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const totalPrice = parsed.data.quantity * parsed.data.unitPrice;
  const [quote] = await db.insert(supplierQuotesTable).values({
    ...parsed.data,
    quantity: String(parsed.data.quantity),
    unitPrice: String(parsed.data.unitPrice),
    totalPrice: String(totalPrice),
    inventoryItemId: parsed.data.inventoryItemId ?? null,
    validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
  }).returning();
  const enriched = await toQuote(quote);
  await logActivity({ userId: req.user?.id, action: "CREATE", module: "quotes", description: `New quote from ${enriched.supplierName}`, newData: enriched });
  res.status(201).json(enriched);
});

router.get("/quotes/:id", authenticate, internalOnly, async (req, res): Promise<void> => {
  const params = GetQuoteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [quote] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, params.data.id));
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  res.json(await toQuote(quote));
});

router.post("/quotes/:id/lock", authenticate, internalOnly, async (req: AuthRequest, res): Promise<void> => {
  const params = LockQuoteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  if (existing.status !== "PENDING") { res.status(400).json({ error: "Quote can only be locked from PENDING status" }); return; }
  const [quote] = await db.update(supplierQuotesTable).set({ status: "LOCKED", lockedAt: new Date() }).where(eq(supplierQuotesTable.id, params.data.id)).returning();
  const enriched = await toQuote(quote);
  await logActivity({ userId: req.user?.id, action: "LOCK", module: "quotes", description: `Locked quote from ${enriched.supplierName}`, newData: enriched });
  res.json(enriched);
});

router.post("/quotes/:id/approve", authenticate, internalOnly, async (req: AuthRequest, res): Promise<void> => {
  const params = ApproveQuoteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  if (existing.status !== "LOCKED") { res.status(400).json({ error: "Quote must be LOCKED before approval" }); return; }
  const [quote] = await db.update(supplierQuotesTable).set({ status: "ADMIN_APPROVED", approvedAt: new Date() }).where(eq(supplierQuotesTable.id, params.data.id)).returning();
  const enriched = await toQuote(quote);
  await logActivity({ userId: req.user?.id, action: "APPROVE", module: "quotes", description: `Approved quote from ${enriched.supplierName}`, newData: enriched });
  res.json(enriched);
});

router.post("/quotes/:id/pay", authenticate, internalOnly, async (req: AuthRequest, res): Promise<void> => {
  const params = PayQuoteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  if (existing.status !== "ADMIN_APPROVED") { res.status(400).json({ error: "Quote must be ADMIN_APPROVED before payment" }); return; }
  const [quote] = await db.update(supplierQuotesTable).set({ status: "PAID", paidAt: new Date() }).where(eq(supplierQuotesTable.id, params.data.id)).returning();
  const enriched = await toQuote(quote);
  await logActivity({ userId: req.user?.id, action: "PAY", module: "quotes", description: `Paid quote from ${enriched.supplierName}`, newData: enriched });
  res.json(enriched);
});

export default router;
