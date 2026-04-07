/**
 * Accruals API — accrual-basis adjusting entries
 *
 * GET    /accruals                     — list (admin, accountant, manager)
 * POST   /accruals                     — create + generate initial JE (admin, accountant)
 * GET    /accruals/:id
 * PATCH  /accruals/:id                 — update pending accrual
 * POST   /accruals/:id/recognize       — recognize; creates reversal JE, sets status=recognized
 * POST   /accruals/:id/reverse         — manual reversal
 *
 * Customer / supplier filtered endpoints:
 * GET    /sales-manager/receivables-accruals      — accrued income for customers
 * GET    /suppliers/:id/accruals                  — payable accruals for a supplier
 *
 * Accrual type → initial JE mapping:
 *   accrued_income    : Dr. Accounts Receivable (1100) / Cr. Sales Revenue (4000)
 *   accrued_expense   : Dr. Expense account     / Cr. Accrued Liabilities (2100)
 *   deferred_income   : Dr. Cash (1000)          / Cr. Deferred Revenue (2200)
 *   deferred_expense  : Dr. Prepaid Expenses (1300) / Cr. Cash (1000)
 */

import { Router, type IRouter, type NextFunction } from "express";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { db, accrualsTable, chartOfAccountsTable, journalEntriesTable, journalEntryLinesTable } from "@workspace/db";
import { authenticate, requireRole, AuthRequest } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";

const router: IRouter = Router();

/* ── Well-known account code lookups ─────────────────────────────────────────*/
const WELL_KNOWN = {
  CASH:                 "1000",
  ACCOUNTS_RECEIVABLE:  "1100",
  PREPAID_EXPENSES:     "1300",
  ACCOUNTS_PAYABLE:     "2000",
  ACCRUED_LIABILITIES:  "2100",
  DEFERRED_REVENUE:     "2200",
  SALES_REVENUE:        "4000",
  OTHER_EXPENSES:       "6900",
} as const;

async function getAccountId(code: string): Promise<number | null> {
  const [row] = await db
    .select({ id: chartOfAccountsTable.id })
    .from(chartOfAccountsTable)
    .where(and(eq(chartOfAccountsTable.code, code), eq(chartOfAccountsTable.isActive, true)));
  return row?.id ?? null;
}

async function nextJENumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JE-${year}-`;
  const [row] = await db
    .select({ n: sql<string>`MAX(entry_number)` })
    .from(journalEntriesTable)
    .where(sql`entry_number LIKE ${prefix + "%"}`);
  const last = row?.n ? parseInt(row.n.split("-")[2] ?? "0", 10) : 0;
  return `${prefix}${String(last + 1).padStart(4, "0")}`;
}

async function createPostedJE(opts: {
  date: string; description: string; referenceType: string; referenceId: number;
  debitAccountId: number; creditAccountId: number; amount: number; createdBy?: number;
}): Promise<number> {
  const entryNumber = await nextJENumber();
  const [entry] = await db.insert(journalEntriesTable).values({
    entryNumber, date: opts.date, description: opts.description,
    referenceType: opts.referenceType, referenceId: opts.referenceId,
    status: "posted", postedAt: new Date(), createdBy: opts.createdBy,
  }).returning();
  await db.insert(journalEntryLinesTable).values([
    { journalEntryId: entry.id, accountId: opts.debitAccountId,  debit: String(opts.amount), credit: "0" },
    { journalEntryId: entry.id, accountId: opts.creditAccountId, debit: "0", credit: String(opts.amount) },
  ]);
  return entry.id;
}

/** Determine debit/credit account IDs for the initial accrual entry */
async function getAccrualAccounts(type: string, overrideAccountId?: number | null): Promise<{ debitId: number; creditId: number } | null> {
  const get = getAccountId;
  switch (type) {
    case "accrued_income": {
      const dr = await get(WELL_KNOWN.ACCOUNTS_RECEIVABLE);
      const cr = overrideAccountId ?? await get(WELL_KNOWN.SALES_REVENUE);
      if (!dr || !cr) return null;
      return { debitId: dr, creditId: cr };
    }
    case "accrued_expense": {
      const dr = overrideAccountId ?? await get(WELL_KNOWN.OTHER_EXPENSES);
      const cr = await get(WELL_KNOWN.ACCRUED_LIABILITIES);
      if (!dr || !cr) return null;
      return { debitId: dr, creditId: cr };
    }
    case "deferred_income": {
      const dr = await get(WELL_KNOWN.CASH);
      const cr = overrideAccountId ?? await get(WELL_KNOWN.DEFERRED_REVENUE);
      if (!dr || !cr) return null;
      return { debitId: dr, creditId: cr };
    }
    case "deferred_expense": {
      const dr = await get(WELL_KNOWN.PREPAID_EXPENSES);
      const cr = overrideAccountId ?? await get(WELL_KNOWN.CASH);
      if (!dr || !cr) return null;
      return { debitId: dr, creditId: cr };
    }
    default: return null;
  }
}

/* ── GET /accruals ───────────────────────────────────────────────────────────*/
router.get("/accruals", authenticate, async (req, res, next: NextFunction): Promise<void> => {
  const { status, type, relatedEntityType, relatedEntityId } = req.query as Record<string, string>;
  try {
    let query = db
      .select({
        id:                accrualsTable.id,
        type:              accrualsTable.type,
        description:       accrualsTable.description,
        amount:            accrualsTable.amount,
        status:            accrualsTable.status,
        accrualDate:       accrualsTable.accrualDate,
        recognitionDate:   accrualsTable.recognitionDate,
        relatedEntityType: accrualsTable.relatedEntityType,
        relatedEntityId:   accrualsTable.relatedEntityId,
        accountId:         accrualsTable.accountId,
        counterAccountId:  accrualsTable.counterAccountId,
        accountCode:       chartOfAccountsTable.code,
        accountName:       chartOfAccountsTable.name,
        journalEntryId:    accrualsTable.journalEntryId,
        reversalJeId:      accrualsTable.reversalJeId,
        notes:             accrualsTable.notes,
        createdAt:         accrualsTable.createdAt,
      })
      .from(accrualsTable)
      .leftJoin(chartOfAccountsTable, eq(accrualsTable.accountId, chartOfAccountsTable.id))
      .$dynamic();

    if (status)            query = query.where(eq(accrualsTable.status, status)) as typeof query;
    if (type)              query = query.where(eq(accrualsTable.type, type)) as typeof query;
    if (relatedEntityType) query = query.where(eq(accrualsTable.relatedEntityType, relatedEntityType)) as typeof query;
    if (relatedEntityId)   query = query.where(eq(accrualsTable.relatedEntityId, parseInt(relatedEntityId, 10))) as typeof query;

    const rows = await query.orderBy(desc(accrualsTable.accrualDate));
    res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  } catch (err) { next(err); }
});

/* ── POST /accruals ─────────────────────────────────────────────────────────*/
router.post("/accruals", authenticate, requireRole("admin", "accountant"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const { type, description, amount, accrualDate, accountId, counterAccountId, relatedEntityType, relatedEntityId, notes, recognitionDate } = req.body as any;
  if (!type || !description || !amount || !accrualDate) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "type, description, amount, and accrualDate are required." });
    return;
  }
  const validTypes = ["accrued_income","accrued_expense","deferred_income","deferred_expense"];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: "INVALID_TYPE", message: `type must be one of: ${validTypes.join(", ")}` });
    return;
  }

  try {
    const accounts = await getAccrualAccounts(type, accountId ?? counterAccountId ?? null);
    if (!accounts) {
      res.status(422).json({ error: "ACCOUNTS_NOT_FOUND", message: "Required Chart of Accounts entries not found. Please seed the Chart of Accounts first." });
      return;
    }

    // Create the initial JE
    const jeId = await createPostedJE({
      date:           accrualDate,
      description:    `Accrual: ${description}`,
      referenceType:  "accrual",
      referenceId:    0, // placeholder; updated after insert
      debitAccountId:  accounts.debitId,
      creditAccountId: accounts.creditId,
      amount:          Number(amount),
      createdBy:       req.user?.id,
    });

    const [accrual] = await db.insert(accrualsTable).values({
      type, description, amount: String(amount), accrualDate, recognitionDate,
      accountId:        accounts.debitId,
      counterAccountId: accounts.creditId,
      status:           "pending",
      relatedEntityType,
      relatedEntityId,
      journalEntryId:   jeId,
      createdBy:        req.user?.id,
      notes,
    }).returning();

    // Update JE referenceId
    await db.update(journalEntriesTable).set({ referenceId: accrual.id }).where(eq(journalEntriesTable.id, jeId));

    await logActivity({ userId: req.user?.id, action: "CREATE", module: "accruals", description: `Created ${type} accrual: ${description} (${amount})` });
    res.status(201).json({ ...accrual, amount: Number(accrual.amount) });
  } catch (err) { next(err); }
});

/* ── GET /accruals/:id ───────────────────────────────────────────────────────*/
router.get("/accruals/:id", authenticate, async (req, res, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
  try {
    const [row] = await db.select().from(accrualsTable).where(eq(accrualsTable.id, id));
    if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    res.json({ ...row, amount: Number(row.amount) });
  } catch (err) { next(err); }
});

/* ── PATCH /accruals/:id ─────────────────────────────────────────────────────*/
router.patch("/accruals/:id", authenticate, requireRole("admin", "accountant"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
  try {
    const [existing] = await db.select({ status: accrualsTable.status }).from(accrualsTable).where(eq(accrualsTable.id, id));
    if (!existing) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    if (existing.status !== "pending") {
      res.status(400).json({ error: "NOT_PENDING", message: "Only pending accruals can be edited." });
      return;
    }
    const { description, notes, recognitionDate } = req.body as any;
    const updates: any = {};
    if (description    !== undefined) updates.description    = description;
    if (notes          !== undefined) updates.notes          = notes;
    if (recognitionDate!== undefined) updates.recognitionDate = recognitionDate;
    const [row] = await db.update(accrualsTable).set(updates).where(eq(accrualsTable.id, id)).returning();
    res.json({ ...row, amount: Number(row.amount) });
  } catch (err) { next(err); }
});

/* ── POST /accruals/:id/recognize ────────────────────────────────────────────
   Reverses the initial JE and marks the accrual as recognized.              */
router.post("/accruals/:id/recognize", authenticate, requireRole("admin", "accountant"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
  try {
    const [accrual] = await db.select().from(accrualsTable).where(eq(accrualsTable.id, id));
    if (!accrual) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    if (accrual.status !== "pending") {
      res.status(400).json({ error: "ALREADY_PROCESSED", message: "Accrual is not in pending status." });
      return;
    }
    if (!accrual.accountId || !accrual.counterAccountId) {
      res.status(422).json({ error: "MISSING_ACCOUNTS" }); return;
    }

    const recognitionDate = (req.body as any).date ?? new Date().toISOString().split("T")[0];

    // Reversal JE swaps debit/credit
    const reversalId = await createPostedJE({
      date:            recognitionDate,
      description:     `Recognition of accrual #${id}: ${accrual.description}`,
      referenceType:   "accrual_recognition",
      referenceId:     id,
      debitAccountId:  accrual.counterAccountId,
      creditAccountId: accrual.accountId,
      amount:          Number(accrual.amount),
      createdBy:       req.user?.id,
    });

    const [updated] = await db.update(accrualsTable).set({
      status:          "recognized",
      recognitionDate: recognitionDate,
      reversalJeId:    reversalId,
    }).where(eq(accrualsTable.id, id)).returning();

    await logActivity({ userId: req.user?.id, action: "UPDATE", module: "accruals", description: `Recognized accrual #${id}: ${accrual.description}` });
    res.json({ ...updated, amount: Number(updated.amount), reversalJournalEntryId: reversalId });
  } catch (err) { next(err); }
});

/* ── POST /accruals/:id/reverse ──────────────────────────────────────────────*/
router.post("/accruals/:id/reverse", authenticate, requireRole("admin"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
  try {
    const [accrual] = await db.select().from(accrualsTable).where(eq(accrualsTable.id, id));
    if (!accrual) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    if (accrual.status === "reversed") {
      res.status(400).json({ error: "ALREADY_REVERSED" }); return;
    }
    if (!accrual.accountId || !accrual.counterAccountId) {
      res.status(422).json({ error: "MISSING_ACCOUNTS" }); return;
    }

    const reversalDate = (req.body as any).date ?? new Date().toISOString().split("T")[0];
    const reversalId = await createPostedJE({
      date:            reversalDate,
      description:     `Reversal of accrual #${id}: ${accrual.description}`,
      referenceType:   "accrual_reversal",
      referenceId:     id,
      debitAccountId:  accrual.counterAccountId,
      creditAccountId: accrual.accountId,
      amount:          Number(accrual.amount),
      createdBy:       req.user?.id,
    });

    const [updated] = await db.update(accrualsTable).set({ status: "reversed", reversalJeId: reversalId }).where(eq(accrualsTable.id, id)).returning();
    await logActivity({ userId: req.user?.id, action: "UPDATE", module: "accruals", description: `Reversed accrual #${id}` });
    res.json({ ...updated, amount: Number(updated.amount) });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════════════════════════════
   Customer/Supplier accrual views
   ══════════════════════════════════════════════════════════════════════════════ */

/** GET /sales-manager/receivables-accruals — accrued income tied to customers */
router.get("/sales-manager/receivables-accruals", authenticate, requireRole("admin", "accountant", "manager", "sales_manager"), async (req, res, next: NextFunction): Promise<void> => {
  const { customerId } = req.query as { customerId?: string };
  try {
    let q = db.select().from(accrualsTable).where(
      and(eq(accrualsTable.relatedEntityType, "customer"), eq(accrualsTable.type, "accrued_income"))
    ).$dynamic();
    if (customerId) q = q.where(eq(accrualsTable.relatedEntityId, parseInt(customerId, 10))) as typeof q;
    const rows = await q.orderBy(desc(accrualsTable.accrualDate));
    res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  } catch (err) { next(err); }
});

/** GET /suppliers/:id/accruals — payable accruals for a supplier */
router.get("/suppliers/:id/accruals", authenticate, requireRole("admin", "accountant", "manager"), async (req, res, next: NextFunction): Promise<void> => {
  const supplierId = parseInt(req.params.id as string, 10);
  if (isNaN(supplierId)) { res.status(400).json({ error: "INVALID_ID" }); return; }
  try {
    const rows = await db.select().from(accrualsTable).where(
      and(
        eq(accrualsTable.relatedEntityType, "supplier"),
        eq(accrualsTable.relatedEntityId, supplierId),
      )
    ).orderBy(desc(accrualsTable.accrualDate));
    res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  } catch (err) { next(err); }
});

export default router;
