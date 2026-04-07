/**
 * Chart of Accounts API
 *
 * GET  /accounts          — list all (admin, accountant, manager)
 * POST /accounts          — create (admin, accountant)
 * PATCH  /accounts/:id    — update (admin, accountant)
 * DELETE /accounts/:id    — deactivate (admin)
 * POST /accounts/seed     — insert standard CoA if empty (admin)
 */

import { Router, type IRouter, type NextFunction } from "express";
import { eq, asc } from "drizzle-orm";
import { db, chartOfAccountsTable } from "@workspace/db";
import { authenticate, requireRole, AuthRequest } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";

const router: IRouter = Router();

/* ── Standard Chart of Accounts seed data ──────────────────────────────────── */
const STANDARD_ACCOUNTS = [
  // Assets
  { code: "1000", name: "Cash & Bank",            type: "asset",     subtype: "current_asset",    normalBalance: "debit" },
  { code: "1100", name: "Accounts Receivable",    type: "asset",     subtype: "current_asset",    normalBalance: "debit" },
  { code: "1200", name: "Inventory",              type: "asset",     subtype: "current_asset",    normalBalance: "debit" },
  { code: "1300", name: "Prepaid Expenses",       type: "asset",     subtype: "current_asset",    normalBalance: "debit" },
  { code: "1500", name: "Fixed Assets",           type: "asset",     subtype: "fixed_asset",      normalBalance: "debit" },
  { code: "1600", name: "Accumulated Depreciation",type: "asset",    subtype: "fixed_asset",      normalBalance: "credit" },
  // Liabilities
  { code: "2000", name: "Accounts Payable",       type: "liability", subtype: "current_liability",normalBalance: "credit" },
  { code: "2100", name: "Accrued Liabilities",    type: "liability", subtype: "current_liability",normalBalance: "credit" },
  { code: "2200", name: "Deferred Revenue",       type: "liability", subtype: "current_liability",normalBalance: "credit" },
  { code: "2300", name: "Salaries Payable",       type: "liability", subtype: "current_liability",normalBalance: "credit" },
  { code: "2500", name: "Notes Payable",          type: "liability", subtype: "long_term_liability",normalBalance: "credit" },
  // Equity
  { code: "3000", name: "Owner's Equity",         type: "equity",    subtype: "equity",           normalBalance: "credit" },
  { code: "3100", name: "Retained Earnings",      type: "equity",    subtype: "equity",           normalBalance: "credit" },
  // Income
  { code: "4000", name: "Sales Revenue",          type: "income",    subtype: "operating",        normalBalance: "credit" },
  { code: "4100", name: "Service Revenue",        type: "income",    subtype: "operating",        normalBalance: "credit" },
  { code: "4200", name: "Other Income",           type: "income",    subtype: "non_operating",    normalBalance: "credit" },
  // COGS
  { code: "5000", name: "Cost of Goods Sold",     type: "expense",   subtype: "cogs",             normalBalance: "debit" },
  // Operating Expenses
  { code: "6000", name: "Salaries Expense",       type: "expense",   subtype: "operating",        normalBalance: "debit" },
  { code: "6100", name: "Rent Expense",           type: "expense",   subtype: "operating",        normalBalance: "debit" },
  { code: "6200", name: "Utilities Expense",      type: "expense",   subtype: "operating",        normalBalance: "debit" },
  { code: "6300", name: "Depreciation Expense",   type: "expense",   subtype: "operating",        normalBalance: "debit" },
  { code: "6400", name: "Marketing Expense",      type: "expense",   subtype: "operating",        normalBalance: "debit" },
  { code: "6500", name: "Office Supplies",        type: "expense",   subtype: "operating",        normalBalance: "debit" },
  { code: "6900", name: "Other Expenses",         type: "expense",   subtype: "operating",        normalBalance: "debit" },
] as const;

/* ── CSV helpers ───────────────────────────────────────────────────────────── */

const CSV_COLUMNS = ["code", "name", "type", "subtype", "normal_balance", "description"] as const;

function toCsvRow(fields: string[]): string {
  return fields.map((f) => {
    const s = f ?? "";
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim()); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/* ── GET /accounts ─────────────────────────────────────────────────────────── */
router.get("/accounts", authenticate, async (_req, res, next: NextFunction): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(chartOfAccountsTable)
      .orderBy(asc(chartOfAccountsTable.code));
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── GET /accounts/sample.csv — download sample CSV template ─────────────── */
router.get("/accounts/sample.csv", authenticate, async (_req, res): Promise<void> => {
  const sample = [
    toCsvRow([...CSV_COLUMNS]),
    toCsvRow(["1000", "Cash & Bank",           "asset",     "current_asset",     "debit",  "Cash on hand and in bank accounts"]),
    toCsvRow(["1100", "Accounts Receivable",   "asset",     "current_asset",     "debit",  "Trade receivables from customers"]),
    toCsvRow(["1500", "Fixed Assets",          "asset",     "fixed_asset",       "debit",  "Property plant and equipment"]),
    toCsvRow(["2000", "Accounts Payable",      "liability", "current_liability", "credit", "Amounts owed to suppliers"]),
    toCsvRow(["3000", "Owner's Equity",        "equity",    "equity",            "credit", "Owner investment and retained earnings"]),
    toCsvRow(["4000", "Sales Revenue",         "income",    "operating",         "credit", "Revenue from furniture sales"]),
    toCsvRow(["5000", "Cost of Goods Sold",    "expense",   "cogs",              "debit",  "Direct cost of products sold"]),
    toCsvRow(["6000", "Salaries Expense",      "expense",   "operating",         "debit",  "Employee wages and salaries"]),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="chart-of-accounts-sample.csv"');
  res.send(sample);
});

/* ── GET /accounts/export.csv — export all accounts ─────────────────────── */
router.get("/accounts/export.csv", authenticate, async (_req, res, next: NextFunction): Promise<void> => {
  try {
    const rows = await db.select().from(chartOfAccountsTable).orderBy(asc(chartOfAccountsTable.code));
    const lines = [
      toCsvRow([...CSV_COLUMNS]),
      ...rows.map((r) => toCsvRow([r.code, r.name, r.type, r.subtype ?? "", r.normalBalance, r.description ?? ""])),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="chart-of-accounts.csv"');
    res.send(lines.join("\n"));
  } catch (err) { next(err); }
});

/* ── POST /accounts/import — bulk import from CSV ─────────────────────────── */
router.post(
  "/accounts/import",
  authenticate,
  requireRole("admin", "accountant"),
  async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
    try {
      const { csv } = req.body as { csv?: string };
      if (!csv || typeof csv !== "string") {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "csv body field is required." });
        return;
      }
      const rawLines = csv.split(/\r?\n/).filter((l) => l.trim());
      if (rawLines.length < 2) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "CSV must have a header row and at least one data row." });
        return;
      }

      // Parse header to find column indices flexibly
      const header = parseCsvLine(rawLines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
      const idx = (name: string) => header.indexOf(name);
      const iCode = idx("code"); const iName = idx("name"); const iType = idx("type");
      const iSub  = idx("subtype"); const iNB = idx("normal_balance"); const iDesc = idx("description");

      if (iCode === -1 || iName === -1 || iType === -1 || iNB === -1) {
        res.status(400).json({ error: "INVALID_HEADER", message: "CSV must have columns: code, name, type, normal_balance (plus optional subtype, description)." });
        return;
      }

      const VALID_TYPES   = ["asset","liability","equity","income","expense"];
      const VALID_NB      = ["debit","credit"];

      const created: string[] = []; const updated: string[] = []; const errors: string[] = [];

      for (let i = 1; i < rawLines.length; i++) {
        const cols   = parseCsvLine(rawLines[i]);
        const code   = (cols[iCode] ?? "").trim();
        const name   = (cols[iName] ?? "").trim();
        const type   = (cols[iType] ?? "").trim().toLowerCase();
        const subtype     = iSub  >= 0 ? (cols[iSub]  ?? "").trim() : "";
        const normalBalance = (cols[iNB] ?? "").trim().toLowerCase();
        const description = iDesc >= 0 ? (cols[iDesc] ?? "").trim() : "";

        if (!code || !name) { errors.push(`Row ${i + 1}: code and name are required.`); continue; }
        if (!VALID_TYPES.includes(type))  { errors.push(`Row ${i + 1}: invalid type "${type}".`); continue; }
        if (!VALID_NB.includes(normalBalance)) { errors.push(`Row ${i + 1}: invalid normal_balance "${normalBalance}".`); continue; }

        try {
          const existing = await db.select({ id: chartOfAccountsTable.id }).from(chartOfAccountsTable).where(eq(chartOfAccountsTable.code, code)).limit(1);
          if (existing.length > 0) {
            await db.update(chartOfAccountsTable).set({ name, subtype: subtype || null, normalBalance, description: description || null, isActive: true }).where(eq(chartOfAccountsTable.code, code));
            updated.push(code);
          } else {
            await db.insert(chartOfAccountsTable).values({ code, name, type, subtype: subtype || null, normalBalance, description: description || null, isActive: true });
            created.push(code);
          }
        } catch (rowErr: any) {
          errors.push(`Row ${i + 1} (${code}): ${rowErr?.message ?? "Unknown error"}`);
        }
      }

      await logActivity({ userId: req.user?.id, action: "CREATE", module: "accounts", description: `CSV import: ${created.length} created, ${updated.length} updated, ${errors.length} errors` });
      res.json({ created: created.length, updated: updated.length, errors, total: rawLines.length - 1 });
    } catch (err) { next(err); }
  },
);

/* ── POST /accounts/seed ─────────────────────────────────────────────────────*/
router.post("/accounts/seed", authenticate, requireRole("admin"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  try {
    const existing = await db.select({ id: chartOfAccountsTable.id }).from(chartOfAccountsTable).limit(1);
    if (existing.length > 0) {
      res.json({ seeded: false, message: "Chart of Accounts already has entries. No seed performed." });
      return;
    }
    const inserted = await db.insert(chartOfAccountsTable).values(
      STANDARD_ACCOUNTS.map((a) => ({ ...a, isActive: true }))
    ).returning({ id: chartOfAccountsTable.id });

    await logActivity({ userId: req.user?.id, action: "CREATE", module: "accounts", description: `Seeded ${inserted.length} standard Chart of Accounts entries` });
    res.status(201).json({ seeded: true, count: inserted.length });
  } catch (err) { next(err); }
});

/* ── POST /accounts ──────────────────────────────────────────────────────────*/
router.post("/accounts", authenticate, requireRole("admin", "accountant"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const { code, name, type, subtype, normalBalance, parentId, description } = req.body as any;
  if (!code || !name || !type || !normalBalance) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "code, name, type, and normalBalance are required." });
    return;
  }
  if (!["asset","liability","equity","income","expense"].includes(type)) {
    res.status(400).json({ error: "INVALID_TYPE", message: "type must be asset | liability | equity | income | expense" });
    return;
  }
  if (!["debit","credit"].includes(normalBalance)) {
    res.status(400).json({ error: "INVALID_NORMAL_BALANCE", message: "normalBalance must be debit | credit" });
    return;
  }
  try {
    const [row] = await db.insert(chartOfAccountsTable).values({ code, name, type, subtype, normalBalance, parentId, description, isActive: true }).returning();
    await logActivity({ userId: req.user?.id, action: "CREATE", module: "accounts", description: `Created account ${code} ${name}` });
    res.status(201).json(row);
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: "DUPLICATE_CODE", message: `Account code ${code} already exists.` }); return; }
    next(err);
  }
});

/* ── PATCH /accounts/:id ─────────────────────────────────────────────────────*/
router.patch("/accounts/:id", authenticate, requireRole("admin", "accountant"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
  const { name, subtype, description, isActive } = req.body as any;
  try {
    const updates: any = {};
    if (name       !== undefined) updates.name        = name;
    if (subtype    !== undefined) updates.subtype      = subtype;
    if (description!== undefined) updates.description = description;
    if (isActive   !== undefined) updates.isActive     = isActive;
    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "NOTHING_TO_UPDATE" }); return; }
    const [row] = await db.update(chartOfAccountsTable).set(updates).where(eq(chartOfAccountsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    await logActivity({ userId: req.user?.id, action: "UPDATE", module: "accounts", description: `Updated account ${row.code} ${row.name}` });
    res.json(row);
  } catch (err) { next(err); }
});

/* ── DELETE /accounts/:id — soft-deactivate ──────────────────────────────────*/
router.delete("/accounts/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
  try {
    const [row] = await db.update(chartOfAccountsTable).set({ isActive: false }).where(eq(chartOfAccountsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    await logActivity({ userId: req.user?.id, action: "DELETE", module: "accounts", description: `Deactivated account ${row.code} ${row.name}` });
    res.json({ deactivated: true, id: row.id });
  } catch (err) { next(err); }
});

export default router;
