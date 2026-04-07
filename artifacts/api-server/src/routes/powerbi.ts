/**
 * Power BI integration routes for FurniCore ERP.
 *
 * Provides:
 *  - GET  /powerbi/reports         — list configured reports (Admin/Accounts only)
 *  - POST /powerbi/embed-token     — generate a scoped embed token via Azure AD
 *  - GET  /powerbi/data/*          — optimised PostgreSQL feeds for Power BI REST connector
 *
 * All routes require authentication. The embed-token and data routes additionally
 * enforce the "admin" or "accounts" role via requireRole().
 *
 * Environment variables (add to .env):
 *   POWERBI_TENANT_ID                 — Azure AD tenant ID
 *   POWERBI_CLIENT_ID                 — Azure AD app (service principal) client ID
 *   POWERBI_CLIENT_SECRET             — Azure AD app client secret
 *   POWERBI_WORKSPACE_ID              — Power BI workspace (group) ID
 *   POWERBI_REPORT_SUPPLIER_LEDGER    — report ID for supplier ledger reconciliation
 *   POWERBI_REPORT_EXPENSE_INCOME     — report ID for expense vs income
 *   POWERBI_REPORT_PAYROLL_SUMMARY    — report ID for payroll summaries
 *   POWERBI_REPORT_PROFIT_MARGIN      — report ID for profit margin analysis
 */

import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";

const router: IRouter = Router();

// ─── In-memory token cache ────────────────────────────────────────────────────

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();

function cacheGet(key: string): string | null {
  const e = _cache.get(key);
  if (!e || Date.now() >= e.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return e.value;
}

function cacheSet(key: string, value: string, ttlMs: number): void {
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ─── Azure AD: client-credentials token ──────────────────────────────────────

async function getAzureADToken(): Promise<string> {
  const cached = cacheGet("aad");
  if (cached) return cached;

  const { POWERBI_TENANT_ID, POWERBI_CLIENT_ID, POWERBI_CLIENT_SECRET } = process.env;
  if (!POWERBI_TENANT_ID || !POWERBI_CLIENT_ID || !POWERBI_CLIENT_SECRET) {
    throw new Error(
      "Power BI Azure AD credentials are not configured. " +
        "Set POWERBI_TENANT_ID, POWERBI_CLIENT_ID, and POWERBI_CLIENT_SECRET in .env.",
    );
  }

  const resp = await fetch(
    `https://login.microsoftonline.com/${POWERBI_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: POWERBI_CLIENT_ID,
        client_secret: POWERBI_CLIENT_SECRET,
        scope: "https://analysis.windows.net/powerbi/api/.default",
      }).toString(),
    },
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Azure AD token request failed (${resp.status}): ${body}`);
  }

  const json = (await resp.json()) as { access_token: string; expires_in: number };
  // Cache with a 60-second safety buffer before actual expiry.
  cacheSet("aad", json.access_token, (json.expires_in - 60) * 1_000);
  return json.access_token;
}

// ─── Power BI: generate embed token ──────────────────────────────────────────

interface EmbedResult {
  token: string;
  expiry: string;
  embedUrl: string;
  reportId: string;
  workspaceId: string;
}

async function generateEmbedToken(workspaceId: string, reportId: string): Promise<EmbedResult> {
  const cacheKey = `embed:${workspaceId}:${reportId}`;
  const cached = cacheGet(cacheKey);

  const embedUrl = `https://app.powerbi.com/reportEmbed?reportId=${reportId}&groupId=${workspaceId}&autoAuth=true`;

  if (cached) {
    return { ...JSON.parse(cached), embedUrl };
  }

  const aadToken = await getAzureADToken();

  const resp = await fetch(
    `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/reports/${reportId}/GenerateToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aadToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessLevel: "View" }),
    },
  );

  if (!resp.ok) {
    const err = (await resp.json()) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Power BI GenerateToken failed (${resp.status})`);
  }

  const data = (await resp.json()) as { token: string; expiration: string };
  const ttlMs = Math.max(0, new Date(data.expiration).getTime() - Date.now() - 60_000);
  cacheSet(cacheKey, JSON.stringify({ token: data.token, expiry: data.expiration, reportId, workspaceId }), ttlMs);

  return { token: data.token, expiry: data.expiration, embedUrl, reportId, workspaceId };
}

// ─── Report registry ──────────────────────────────────────────────────────────

const REPORT_IDS = [
  "supplier-ledger",
  "expense-income",
  "trial-balance",
  "payroll-summary",
  "profit-margin",
] as const;

type ReportId = (typeof REPORT_IDS)[number];

const REPORT_META: Record<ReportId, { label: string; envKey: string }> = {
  "supplier-ledger": { label: "Supplier Ledger Reconciliation", envKey: "POWERBI_REPORT_SUPPLIER_LEDGER" },
  "expense-income":  { label: "Expense vs Income",              envKey: "POWERBI_REPORT_EXPENSE_INCOME" },
  "trial-balance":   { label: "Trial Balance",                  envKey: "POWERBI_REPORT_TRIAL_BALANCE" },
  "payroll-summary": { label: "Payroll Summaries",              envKey: "POWERBI_REPORT_PAYROLL_SUMMARY" },
  "profit-margin":   { label: "Profit Margin Analysis",         envKey: "POWERBI_REPORT_PROFIT_MARGIN" },
};

function getReportEnv(id: ReportId): { workspaceId: string; reportId: string } | null {
  const ws = process.env.POWERBI_WORKSPACE_ID;
  const rid = process.env[REPORT_META[id].envKey];
  return ws && rid ? { workspaceId: ws, reportId: rid } : null;
}

// ─── GET /powerbi/reports ─────────────────────────────────────────────────────

router.get(
  "/powerbi/reports",
  authenticate,
  requireRole("admin", "accounts"),
  (_req, res): void => {
    const reports = REPORT_IDS.map((id) => ({
      id,
      label: REPORT_META[id].label,
      configured: getReportEnv(id) !== null,
    }));
    res.json({ reports });
  },
);

// ─── POST /powerbi/embed-token ────────────────────────────────────────────────

router.post(
  "/powerbi/embed-token",
  authenticate,
  requireRole("admin", "accounts"),
  async (req, res): Promise<void> => {
    const { reportId } = req.body as { reportId?: string };

    if (!reportId || !REPORT_IDS.includes(reportId as ReportId)) {
      res.status(400).json({ error: `Unknown reportId. Valid values: ${REPORT_IDS.join(", ")}` });
      return;
    }

    const env = getReportEnv(reportId as ReportId);
    if (!env) {
      res.status(503).json({
        error:
          "This report is not configured. " +
          `Add ${REPORT_META[reportId as ReportId].envKey} and POWERBI_WORKSPACE_ID to your .env file.`,
        reportId,
        configured: false,
      });
      return;
    }

    try {
      const result = await generateEmbedToken(env.workspaceId, env.reportId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ─── Analytics data endpoints (PostgreSQL → Power BI REST connector) ──────────
// Power BI can pull these endpoints via its Web/JSON data connector.
// 5-minute in-memory cache reduces DB load during dashboard refreshes.

const DATA_CACHE = new Map<string, { data: unknown; ts: number }>();
const DATA_TTL_MS = 5 * 60 * 1_000;

async function cachedQuery<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = DATA_CACHE.get(key);
  if (hit && Date.now() - hit.ts < DATA_TTL_MS) return hit.data as T;
  const data = await fn();
  DATA_CACHE.set(key, { data, ts: Date.now() });
  return data;
}

/**
 * Supplier Ledger Reconciliation
 * Joins transactions → suppliers for full ledger view.
 *
 * Power BI dataset tables: transactions, suppliers (via REST connector)
 * Reports: payment history, outstanding balances, reconciliation status
 */
router.get(
  "/powerbi/data/supplier-ledger",
  authenticate,
  requireRole("admin", "accounts"),
  async (_req, res): Promise<void> => {
    const result = await cachedQuery("supplier-ledger", () =>
      db.execute(sql`
        SELECT
          t.id                              AS transaction_id,
          t.transaction_date::date          AS date,
          t.type,
          t.category,
          t.description,
          t.amount::float                   AS amount,
          t.status,
          t.reference,
          s.id                              AS supplier_id,
          s.name                            AS supplier_name,
          s.email                           AS supplier_email,
          s.contact_person,
          s.status                          AS supplier_status,
          s.rating::float                   AS supplier_rating
        FROM transactions t
        LEFT JOIN suppliers s ON s.id = t.supplier_id
        ORDER BY t.transaction_date DESC
      `),
    );
    res.json({ data: (result as any).rows });
  },
);

/**
 * Expense vs Income — monthly breakdown with category drill-down.
 *
 * Power BI reports: bar/column chart by month, category treemap, trend line
 */
router.get(
  "/powerbi/data/expense-income",
  authenticate,
  requireRole("admin", "accounts"),
  async (_req, res): Promise<void> => {
    const result = await cachedQuery("expense-income", () =>
      db.execute(sql`
        SELECT
          DATE_TRUNC('month', transaction_date)::date  AS month,
          type,
          category,
          COUNT(*)::int                                AS transaction_count,
          SUM(amount)::float                           AS total,
          AVG(amount)::float                           AS average
        FROM transactions
        GROUP BY DATE_TRUNC('month', transaction_date), type, category
        ORDER BY month DESC, type, category
      `),
    );
    res.json({ data: (result as any).rows });
  },
);

/**
 * Payroll Summaries — per employee, per month, with department roll-up.
 *
 * Power BI reports: headcount cost, bonus distribution, deduction analysis
 */
router.get(
  "/powerbi/data/payroll-summary",
  authenticate,
  requireRole("admin", "accounts"),
  async (_req, res): Promise<void> => {
    const result = await cachedQuery("payroll-summary", () =>
      db.execute(sql`
        SELECT
          p.id                  AS payroll_id,
          p.year,
          p.month,
          p.status,
          p.base_salary::float,
          p.bonus::float,
          p.deductions::float,
          p.net_salary::float,
          p.paid_at,
          e.id                  AS employee_id,
          e.name                AS employee_name,
          e.department,
          e.position,
          e.is_active
        FROM payroll p
        JOIN employees e ON e.id = p.employee_id
        ORDER BY p.year DESC, p.month DESC, e.department, e.name
      `),
    );
    res.json({ data: (result as any).rows });
  },
);

/**
 * Profit Margin Analysis — monthly P&L with inventory asset value.
 *
 * Power BI reports: margin % trend, waterfall chart, inventory vs revenue
 */
router.get(
  "/powerbi/data/profit-margin",
  authenticate,
  requireRole("admin", "accounts"),
  async (_req, res): Promise<void> => {
    const [monthly, inventory] = await Promise.all([
      cachedQuery("profit-margin:monthly", () =>
        db.execute(sql`
          SELECT
            DATE_TRUNC('month', transaction_date)::date                               AS month,
            SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END)::float            AS revenue,
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)::float            AS expenses,
            (SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END)
           - SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END))::float          AS profit,
            CASE
              WHEN SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) = 0 THEN 0
              ELSE ROUND(
                (SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END)
               - SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END))
                / SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) * 100,
                2
              )
            END                                                                       AS margin_pct
          FROM transactions
          GROUP BY DATE_TRUNC('month', transaction_date)
          ORDER BY month DESC
        `),
      ),
      cachedQuery("profit-margin:inventory", () =>
        db.execute(sql`
          SELECT
            i.id,
            i.name,
            i.type,
            i.unit,
            i.quantity::float,
            i.unit_cost::float,
            (i.quantity * i.unit_cost)::float  AS total_value,
            s.name                             AS supplier_name
          FROM inventory i
          LEFT JOIN suppliers s ON s.id = i.supplier_id
          ORDER BY total_value DESC
        `),
      ),
    ]);

    res.json({
      monthly: (monthly as any).rows,
      inventoryValue: (inventory as any).rows,
    });
  },
);

/**
 * Trial Balance — account-level debit/credit summary.
 *
 * Groups completed transactions by category to produce a period-end
 * trial balance showing credits (income), debits (expenses), and net balance.
 *
 * Power BI reports: account balance table, variance highlights
 */
router.get(
  "/powerbi/data/trial-balance",
  authenticate,
  requireRole("admin", "accounts"),
  async (_req, res): Promise<void> => {
    const result = await cachedQuery("trial-balance", () =>
      db.execute(sql`
        SELECT
          COALESCE(category, 'Uncategorized')                                         AS account,
          SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END)::float              AS credits,
          SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)::float              AS debits,
          (SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END)
         - SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END))::float            AS balance,
          COUNT(*)::int                                                               AS transaction_count,
          SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END)::float            AS pending_amount
        FROM transactions
        GROUP BY COALESCE(category, 'Uncategorized')
        ORDER BY ABS(
          SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END)
        + SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)
        ) DESC
      `),
    );
    const rows = (result as any).rows as Array<{
      account: string; credits: number; debits: number;
      balance: number; transaction_count: number; pending_amount: number;
    }>;
    const totals = {
      totalCredits:  rows.reduce((s, r) => s + r.credits, 0),
      totalDebits:   rows.reduce((s, r) => s + r.debits,  0),
      netBalance:    rows.reduce((s, r) => s + r.balance,  0),
      accountCount:  rows.length,
    };
    res.json({ accounts: rows, totals });
  },
);

export default router;
