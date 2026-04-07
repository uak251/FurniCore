/**
 * Power BI integration routes for FurniCore ERP.
 *
 * Embedding strategy: App-owns-data (service principal)
 *   1. Backend gets an Azure AD token via client credentials.
 *   2. Backend calls Power BI GenerateToken for a scoped embed token.
 *   3. Frontend embeds the report using powerbi-client SDK.
 *
 * Every route checks the caller's role AND optional extra permissions
 * (stored as JSON in users.permissions) before serving a token.
 *
 * Environment variables (add to root .env):
 *   POWERBI_TENANT_ID
 *   POWERBI_CLIENT_ID
 *   POWERBI_CLIENT_SECRET
 *   POWERBI_WORKSPACE_ID
 *   POWERBI_REPORT_SUPPLIER_LEDGER
 *   POWERBI_REPORT_EXPENSE_INCOME
 *   POWERBI_REPORT_TRIAL_BALANCE
 *   POWERBI_REPORT_PAYROLL_SUMMARY
 *   POWERBI_REPORT_PROFIT_MARGIN
 *   POWERBI_REPORT_INVENTORY_ANALYSIS
 *   POWERBI_REPORT_HR_DASHBOARD
 *   POWERBI_REPORT_SALES_OVERVIEW
 */

import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { authenticate, AuthRequest } from "../middlewares/authenticate";

const router: IRouter = Router();

/* ─── In-memory token cache ─────────────────────────────────────────────────── */

interface CacheEntry { value: string; expiresAt: number; }
const _cache = new Map<string, CacheEntry>();

function cacheGet(key: string): string | null {
  const e = _cache.get(key);
  if (!e || Date.now() >= e.expiresAt) { _cache.delete(key); return null; }
  return e.value;
}
function cacheSet(key: string, value: string, ttlMs: number): void {
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/* ─── Azure AD token ────────────────────────────────────────────────────────── */

async function getAzureADToken(): Promise<string> {
  const cached = cacheGet("aad");
  if (cached) return cached;
  const { POWERBI_TENANT_ID, POWERBI_CLIENT_ID, POWERBI_CLIENT_SECRET } = process.env;
  if (!POWERBI_TENANT_ID || !POWERBI_CLIENT_ID || !POWERBI_CLIENT_SECRET)
    throw new Error("Power BI Azure AD credentials not configured (POWERBI_TENANT_ID / CLIENT_ID / CLIENT_SECRET).");
  const resp = await fetch(
    `https://login.microsoftonline.com/${POWERBI_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "client_credentials",
        client_id:     POWERBI_CLIENT_ID,
        client_secret: POWERBI_CLIENT_SECRET,
        scope:         "https://analysis.windows.net/powerbi/api/.default",
      }).toString(),
    },
  );
  if (!resp.ok) throw new Error(`Azure AD token failed (${resp.status}): ${await resp.text()}`);
  const json = (await resp.json()) as { access_token: string; expires_in: number };
  cacheSet("aad", json.access_token, (json.expires_in - 60) * 1_000);
  return json.access_token;
}

/* ─── Power BI embed token ──────────────────────────────────────────────────── */

interface EmbedResult { token: string; expiry: string; embedUrl: string; reportId: string; workspaceId: string; }

async function generateEmbedToken(workspaceId: string, reportId: string): Promise<EmbedResult> {
  const cacheKey = `embed:${workspaceId}:${reportId}`;
  const cached   = cacheGet(cacheKey);
  const embedUrl = `https://app.powerbi.com/reportEmbed?reportId=${reportId}&groupId=${workspaceId}&autoAuth=true`;
  if (cached) return { ...JSON.parse(cached), embedUrl };

  const aadToken = await getAzureADToken();
  const resp = await fetch(
    `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/reports/${reportId}/GenerateToken`,
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${aadToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ accessLevel: "View" }),
    },
  );
  if (!resp.ok) {
    const err = (await resp.json()) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Power BI GenerateToken failed (${resp.status})`);
  }
  const data   = (await resp.json()) as { token: string; expiration: string };
  const ttlMs  = Math.max(0, new Date(data.expiration).getTime() - Date.now() - 60_000);
  cacheSet(cacheKey, JSON.stringify({ token: data.token, expiry: data.expiration, reportId, workspaceId }), ttlMs);
  return { token: data.token, expiry: data.expiration, embedUrl, reportId, workspaceId };
}

/* ─── Report registry ───────────────────────────────────────────────────────── */

const REPORT_IDS = [
  "supplier-ledger",
  "expense-income",
  "trial-balance",
  "payroll-summary",
  "profit-margin",
  "inventory-analysis",
  "hr-dashboard",
  "sales-overview",
] as const;

type ReportId = (typeof REPORT_IDS)[number];

interface ReportMeta {
  label:       string;
  envKey:      string;
  /** Roles (including extra permissions) allowed to fetch this report's embed token */
  allowedRoles: string[];
  /** Module tag used to match against users.permissions JSON array */
  module:      string;
  description: string;
}

const REPORT_META: Record<ReportId, ReportMeta> = {
  "supplier-ledger":    { label: "Supplier Ledger Reconciliation",  envKey: "POWERBI_REPORT_SUPPLIER_LEDGER",    allowedRoles: ["admin","accountant","manager"], module: "accounting",  description: "Payment history, outstanding balances, reconciliation status across all suppliers." },
  "expense-income":     { label: "Expense vs Income",               envKey: "POWERBI_REPORT_EXPENSE_INCOME",     allowedRoles: ["admin","accountant"],           module: "accounting",  description: "Monthly revenue vs expenses with category drill-through and trend lines." },
  "trial-balance":      { label: "Trial Balance",                   envKey: "POWERBI_REPORT_TRIAL_BALANCE",      allowedRoles: ["admin","accountant"],           module: "accounting",  description: "Period-end account-level credits, debits, and net balances." },
  "payroll-summary":    { label: "Payroll Summary",                 envKey: "POWERBI_REPORT_PAYROLL_SUMMARY",    allowedRoles: ["admin","accountant","manager"],  module: "payroll",     description: "Headcount cost, bonus distribution, deduction analysis, and net pay trends." },
  "profit-margin":      { label: "Profit & Loss",                   envKey: "POWERBI_REPORT_PROFIT_MARGIN",      allowedRoles: ["admin","accountant"],           module: "accounting",  description: "Monthly P&L waterfall with inventory asset valuation and margin % trend." },
  "inventory-analysis": { label: "Inventory Analysis",              envKey: "POWERBI_REPORT_INVENTORY_ANALYSIS", allowedRoles: ["admin","inventory_manager","manager"], module: "inventory", description: "Stock levels, reorder alerts, supplier performance, and inventory value." },
  "hr-dashboard":       { label: "HR Dashboard",                    envKey: "POWERBI_REPORT_HR_DASHBOARD",       allowedRoles: ["admin","manager"],              module: "hr",          description: "Headcount by department, attendance rates, and performance review scores." },
  "sales-overview":     { label: "Sales Overview",                  envKey: "POWERBI_REPORT_SALES_OVERVIEW",     allowedRoles: ["admin","manager","sales_manager"], module: "sales",    description: "Revenue by customer, quote conversion, sales pipeline, and period trends." },
};

function getReportEnv(id: ReportId): { workspaceId: string; reportId: string } | null {
  const ws  = process.env.POWERBI_WORKSPACE_ID;
  const rid = process.env[REPORT_META[id].envKey];
  return ws && rid ? { workspaceId: ws, reportId: rid } : null;
}

/** Parse user permissions JSON array (nullable column) */
function parsePermissions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

/** Check if caller is allowed to access the given report */
function canAccess(user: { role: string; permissions?: string | null }, meta: ReportMeta): boolean {
  if (meta.allowedRoles.includes(user.role)) return true;
  const perms = parsePermissions(user.permissions);
  return perms.includes(meta.module) || perms.includes("*");
}

/* ─── 5-minute data cache ───────────────────────────────────────────────────── */

const DATA_CACHE = new Map<string, { data: unknown; ts: number }>();
const DATA_TTL_MS = 5 * 60_000;

async function cachedQuery<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = DATA_CACHE.get(key);
  if (hit && Date.now() - hit.ts < DATA_TTL_MS) return hit.data as T;
  const data = await fn();
  DATA_CACHE.set(key, { data, ts: Date.now() });
  return data;
}

/* ════════════════════════════════════════════════════════════════════════════════
   GET /powerbi/reports
   Returns the list of reports the current user is allowed to see (filtered by role).
   ════════════════════════════════════════════════════════════════════════════════ */

router.get("/powerbi/reports", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthenticated" }); return; }

  // Fetch extra permissions stored in DB
  const [dbUser] = await db
    .select({ permissions: usersTable.permissions })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  const caller = { role: req.user.role, permissions: dbUser?.permissions };
  const reports = REPORT_IDS
    .filter((id) => canAccess(caller, REPORT_META[id]))
    .map((id) => ({
      id,
      label:       REPORT_META[id].label,
      description: REPORT_META[id].description,
      module:      REPORT_META[id].module,
      configured:  getReportEnv(id) !== null,
    }));

  res.json({ reports });
});

/* ════════════════════════════════════════════════════════════════════════════════
   POST /powerbi/embed-token
   Generates an embed token for the requested report (if caller is allowed).
   ════════════════════════════════════════════════════════════════════════════════ */

router.post("/powerbi/embed-token", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { reportId } = req.body as { reportId?: string };
  if (!reportId || !REPORT_IDS.includes(reportId as ReportId)) {
    res.status(400).json({ error: `Unknown reportId. Valid: ${REPORT_IDS.join(", ")}` });
    return;
  }

  const meta = REPORT_META[reportId as ReportId];

  // Load extra permissions from DB
  const [dbUser] = await db
    .select({ permissions: usersTable.permissions })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  if (!canAccess({ role: req.user.role, permissions: dbUser?.permissions }, meta)) {
    res.status(403).json({ error: "You do not have access to this report." });
    return;
  }

  const env = getReportEnv(reportId as ReportId);
  if (!env) {
    res.status(503).json({
      error:      `This report is not configured. Add ${meta.envKey} and POWERBI_WORKSPACE_ID to your .env file.`,
      reportId,
      configured: false,
    });
    return;
  }

  try {
    const result = await generateEmbedToken(env.workspaceId, env.reportId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/* ════════════════════════════════════════════════════════════════════════════════
   Analytics data endpoints — PostgreSQL feeds for native charts (no Azure needed)
   Accessible by role OR extra permissions. 5-minute cache per endpoint.
   ════════════════════════════════════════════════════════════════════════════════ */

async function withModuleAccess(
  req: AuthRequest,
  res: ReturnType<typeof res>,
  module: string,
  handler: () => Promise<void>,
): Promise<void> {
  if (!req.user) { (res as any).status(401).json({ error: "Unauthenticated" }); return; }
  const [dbUser] = await db.select({ permissions: usersTable.permissions }).from(usersTable).where(eq(usersTable.id, req.user.id));
  const meta = Object.values(REPORT_META).find((m) => m.module === module);
  const allowed = meta
    ? canAccess({ role: req.user.role, permissions: dbUser?.permissions }, meta)
    : req.user.role === "admin";
  if (!allowed) { (res as any).status(403).json({ error: "Insufficient permissions" }); return; }
  await handler();
}

/* ── Supplier Ledger ─────────────────────────────────────────────────────────── */
router.get("/powerbi/data/supplier-ledger", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await withModuleAccess(req, res as any, "accounting", async () => {
    const result = await cachedQuery("supplier-ledger", () =>
      db.execute(sql`
        SELECT t.id AS transaction_id, t.transaction_date::date AS date, t.type, t.category,
               t.description, t.amount::float AS amount, t.status, t.reference,
               s.id AS supplier_id, s.name AS supplier_name, s.email AS supplier_email,
               s.contact_person, s.status AS supplier_status, s.rating::float AS supplier_rating
        FROM transactions t LEFT JOIN suppliers s ON s.id = t.supplier_id
        ORDER BY t.transaction_date DESC
      `));
    res.json({ data: (result as any).rows });
  });
});

/* ── Expense vs Income ───────────────────────────────────────────────────────── */
router.get("/powerbi/data/expense-income", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await withModuleAccess(req, res as any, "accounting", async () => {
    const result = await cachedQuery("expense-income", () =>
      db.execute(sql`
        SELECT DATE_TRUNC('month', transaction_date)::date AS month,
               type, category, COUNT(*)::int AS transaction_count,
               SUM(amount)::float AS total, AVG(amount)::float AS average
        FROM transactions
        GROUP BY DATE_TRUNC('month', transaction_date), type, category
        ORDER BY month DESC, type, category
      `));
    res.json({ data: (result as any).rows });
  });
});

/* ── Payroll Summary ─────────────────────────────────────────────────────────── */
router.get("/powerbi/data/payroll-summary", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await withModuleAccess(req, res as any, "payroll", async () => {
    const result = await cachedQuery("payroll-summary", () =>
      db.execute(sql`
        SELECT p.id AS payroll_id, p.year, p.month, p.status,
               p.base_salary::float, p.bonus::float, p.deductions::float, p.net_salary::float, p.paid_at,
               e.id AS employee_id, e.name AS employee_name, e.department, e.position, e.is_active
        FROM payroll p JOIN employees e ON e.id = p.employee_id
        ORDER BY p.year DESC, p.month DESC, e.department, e.name
      `));
    res.json({ data: (result as any).rows });
  });
});

/* ── Profit Margin ───────────────────────────────────────────────────────────── */
router.get("/powerbi/data/profit-margin", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await withModuleAccess(req, res as any, "accounting", async () => {
    const [monthly, inventory] = await Promise.all([
      cachedQuery("profit-margin:monthly", () =>
        db.execute(sql`
          SELECT DATE_TRUNC('month', transaction_date)::date AS month,
                 SUM(CASE WHEN type='income'  THEN amount ELSE 0 END)::float AS revenue,
                 SUM(CASE WHEN type='expense' THEN amount ELSE 0 END)::float AS expenses,
                 (SUM(CASE WHEN type='income' THEN amount ELSE 0 END)
                - SUM(CASE WHEN type='expense' THEN amount ELSE 0 END))::float AS profit,
                 CASE WHEN SUM(CASE WHEN type='income' THEN amount ELSE 0 END)=0 THEN 0
                 ELSE ROUND((SUM(CASE WHEN type='income' THEN amount ELSE 0 END)
                            - SUM(CASE WHEN type='expense' THEN amount ELSE 0 END))
                           / SUM(CASE WHEN type='income' THEN amount ELSE 0 END)*100,2)
                 END AS margin_pct
          FROM transactions GROUP BY 1 ORDER BY 1 DESC
        `)),
      cachedQuery("profit-margin:inventory", () =>
        db.execute(sql`
          SELECT i.id, i.name, i.type, i.unit, i.quantity::float, i.unit_cost::float,
                 (i.quantity * i.unit_cost)::float AS total_value, s.name AS supplier_name
          FROM inventory i LEFT JOIN suppliers s ON s.id = i.supplier_id
          ORDER BY total_value DESC
        `)),
    ]);
    res.json({ monthly: (monthly as any).rows, inventoryValue: (inventory as any).rows });
  });
});

/* ── Trial Balance ───────────────────────────────────────────────────────────── */
router.get("/powerbi/data/trial-balance", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await withModuleAccess(req, res as any, "accounting", async () => {
    const result = await cachedQuery("trial-balance", () =>
      db.execute(sql`
        SELECT COALESCE(category,'Uncategorized') AS account,
               SUM(CASE WHEN type='income'  THEN amount ELSE 0 END)::float AS credits,
               SUM(CASE WHEN type='expense' THEN amount ELSE 0 END)::float AS debits,
               (SUM(CASE WHEN type='income' THEN amount ELSE 0 END)
               -SUM(CASE WHEN type='expense' THEN amount ELSE 0 END))::float AS balance,
               COUNT(*)::int AS transaction_count,
               SUM(CASE WHEN status='pending' THEN amount ELSE 0 END)::float AS pending_amount
        FROM transactions
        GROUP BY COALESCE(category,'Uncategorized')
        ORDER BY ABS(SUM(CASE WHEN type='income' THEN amount ELSE 0 END)
                    +SUM(CASE WHEN type='expense' THEN amount ELSE 0 END)) DESC
      `));
    const rows = (result as any).rows as Array<{ account: string; credits: number; debits: number; balance: number; transaction_count: number; pending_amount: number; }>;
    const totals = { totalCredits: rows.reduce((s,r)=>s+r.credits,0), totalDebits: rows.reduce((s,r)=>s+r.debits,0), netBalance: rows.reduce((s,r)=>s+r.balance,0), accountCount: rows.length };
    res.json({ accounts: rows, totals });
  });
});

/* ── Inventory Analysis ──────────────────────────────────────────────────────── */
router.get("/powerbi/data/inventory-analysis", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await withModuleAccess(req, res as any, "inventory", async () => {
    const result = await cachedQuery("inventory-analysis", () =>
      db.execute(sql`
        SELECT i.id, i.name, i.type, i.unit,
               i.quantity::float AS quantity,
               i.reorder_level::float AS reorder_level,
               i.unit_cost::float AS unit_cost,
               (i.quantity * i.unit_cost)::float AS total_value,
               CASE WHEN i.quantity <= i.reorder_level THEN true ELSE false END AS is_low_stock,
               s.name AS supplier_name
        FROM inventory i LEFT JOIN suppliers s ON s.id = i.supplier_id
        ORDER BY total_value DESC
      `));
    const rows = (result as any).rows as Array<{ id: number; name: string; type: string; quantity: number; reorder_level: number; unit_cost: number; total_value: number; is_low_stock: boolean; supplier_name: string | null; }>;
    const summary = {
      totalItems:    rows.length,
      lowStockCount: rows.filter((r) => r.is_low_stock).length,
      totalValue:    +rows.reduce((s, r) => s + r.total_value, 0).toFixed(2),
      byType:        Object.fromEntries(
        [...new Set(rows.map((r) => r.type))].map((t) => [
          t,
          { count: rows.filter((r) => r.type === t).length, value: +rows.filter((r) => r.type === t).reduce((s, r) => s + r.total_value, 0).toFixed(2) },
        ]),
      ),
    };
    res.json({ items: rows, summary });
  });
});

/* ── HR Dashboard ────────────────────────────────────────────────────────────── */
router.get("/powerbi/data/hr-dashboard", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await withModuleAccess(req, res as any, "hr", async () => {
    const [employees, attendance, reviews] = await Promise.all([
      cachedQuery("hr-dashboard:employees", () =>
        db.execute(sql`
          SELECT id, name, department, position, is_active,
                 base_salary::float AS base_salary, hire_date
          FROM employees ORDER BY department, name
        `)),
      cachedQuery("hr-dashboard:attendance", () =>
        db.execute(sql`
          SELECT e.department,
                 COUNT(*)::int AS total_records,
                 SUM(CASE WHEN a.status='present'  THEN 1 ELSE 0 END)::int AS present,
                 SUM(CASE WHEN a.status='absent'   THEN 1 ELSE 0 END)::int AS absent,
                 SUM(CASE WHEN a.status='late'     THEN 1 ELSE 0 END)::int AS late,
                 SUM(CASE WHEN a.status='half_day' THEN 1 ELSE 0 END)::int AS half_day
          FROM attendance a JOIN employees e ON e.id = a.employee_id
          GROUP BY e.department ORDER BY e.department
        `)),
      cachedQuery("hr-dashboard:reviews", () =>
        db.execute(sql`
          SELECT e.department,
                 COUNT(*)::int AS review_count,
                 AVG(pr.overall_rating)::float AS avg_rating
          FROM performance_reviews pr JOIN employees e ON e.id = pr.employee_id
          GROUP BY e.department ORDER BY e.department
        `)),
    ]);
    const empRows = (employees as any).rows as Array<{ id: number; name: string; department: string; is_active: boolean; base_salary: number; }>;
    const attRows = (attendance as any).rows;
    const revRows = (reviews as any).rows;
    const deptBreakdown = [...new Set(empRows.map((e) => e.department))].map((dept) => {
      const emps     = empRows.filter((e) => e.department === dept);
      const att      = attRows.find((r: any) => r.department === dept) ?? {};
      const rev      = revRows.find((r: any) => r.department === dept) ?? {};
      const totalRecords = Number(att.total_records) || 0;
      const present      = Number(att.present) || 0;
      return {
        department:    dept,
        headcount:     emps.length,
        active:        emps.filter((e) => e.is_active).length,
        avgSalary:     +(emps.reduce((s, e) => s + e.base_salary, 0) / Math.max(emps.length, 1)).toFixed(2),
        attendanceRate: totalRecords > 0 ? +(present / totalRecords * 100).toFixed(1) : null,
        avgReviewRating: rev.avg_rating != null ? +Number(rev.avg_rating).toFixed(2) : null,
      };
    });
    res.json({
      summary: {
        totalEmployees: empRows.length,
        activeEmployees: empRows.filter((e) => e.is_active).length,
        departments: [...new Set(empRows.map((e) => e.department))].length,
        totalPayroll: +empRows.reduce((s, e) => s + e.base_salary, 0).toFixed(2),
      },
      departments: deptBreakdown,
      attendance: attRows,
    });
  });
});

/* ── Sales Overview ──────────────────────────────────────────────────────────── */
router.get("/powerbi/data/sales-overview", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await withModuleAccess(req, res as any, "sales", async () => {
    const result = await cachedQuery("sales-overview", () =>
      db.execute(sql`
        SELECT DATE_TRUNC('month', transaction_date)::date AS month,
               COUNT(*)::int AS transaction_count,
               SUM(CASE WHEN type='income'  THEN amount ELSE 0 END)::float AS revenue,
               SUM(CASE WHEN type='expense' THEN amount ELSE 0 END)::float AS expenses,
               SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)::int AS pending_count
        FROM transactions
        GROUP BY 1 ORDER BY 1 DESC LIMIT 24
      `));
    res.json({ monthly: (result as any).rows });
  });
});

export default router;
