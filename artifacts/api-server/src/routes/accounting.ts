import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, transactionsTable, suppliersTable } from "@workspace/db";
import { CreateTransactionBody, ListTransactionsQueryParams, GetTransactionParams } from "@workspace/api-zod";
import { authenticate, AuthRequest } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";

const router: IRouter = Router();

async function toTransaction(t: typeof transactionsTable.$inferSelect) {
  let supplierName = null;
  if (t.supplierId) {
    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, t.supplierId));
    supplierName = supplier?.name ?? null;
  }
  return {
    ...t,
    amount: Number(t.amount),
    supplierName,
    transactionDate: t.transactionDate.toISOString(),
  };
}

router.get("/transactions", authenticate, async (req, res): Promise<void> => {
  const params = ListTransactionsQueryParams.safeParse(req.query);
  let query = db.select().from(transactionsTable).$dynamic();
  if (params.success && params.data.type) {
    query = query.where(eq(transactionsTable.type, params.data.type));
  }
  const transactions = await query;
  const enriched = await Promise.all(transactions.map(toTransaction));
  res.json(enriched);
});

router.post("/transactions", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [transaction] = await db.insert(transactionsTable).values({
    ...parsed.data,
    amount: String(parsed.data.amount),
    transactionDate: new Date(parsed.data.transactionDate),
    supplierId: parsed.data.supplierId ?? null,
    reference: parsed.data.reference ?? null,
  }).returning();
  const enriched = await toTransaction(transaction);
  await logActivity({ userId: req.user?.id, action: "CREATE", module: "accounting", description: `Created transaction: ${transaction.description}`, newData: enriched });
  res.status(201).json(enriched);
});

router.get("/transactions/:id", authenticate, async (req, res): Promise<void> => {
  const params = GetTransactionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [transaction] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, params.data.id));
  if (!transaction) { res.status(404).json({ error: "Transaction not found" }); return; }
  res.json(await toTransaction(transaction));
});

export default router;
