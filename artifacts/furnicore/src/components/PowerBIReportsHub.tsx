/**
 * PowerBIReportsHub — full-featured Power BI reports interface for the
 * FurniCore Accounting module.
 *
 * Features:
 *  • Report catalog: grid of cards showing title, description, configured status
 *  • Report viewer: embed with live token-expiry countdown and refresh button
 *  • Native data preview: tables + KPI summary cards fetched from /powerbi/data/*
 *    (works even without Power BI configured — useful for data review)
 *  • Access gate: blocks non-admin / non-accounts roles from reaching any report
 *  • Setup guide: step-by-step instructions when a report is unconfigured
 *
 * Access: admin and accounts roles only (enforced here + on the backend).
 */

import { useState, useEffect, useCallback } from "react";
import {
  usePowerBI,
  type EmbedConfig,
  type EmbedState,
  type NativeDataState,
} from "@/hooks/use-powerbi";
import {
  PowerBIEmbed,
  PowerBIEmbedLoading,
  PowerBIUnconfigured,
  PowerBIEmbedError,
} from "@/components/PowerBIEmbed";
import { useGetCurrentUser } from "@workspace/api-client-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Building2, TrendingUp, Scale, Users, DollarSign,
  ArrowLeft, RefreshCw, ExternalLink, ChevronDown, ChevronUp,
  Clock, ShieldAlert, CheckCircle2, AlertCircle, BarChart3,
  Loader2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Access gate ─────────────────────────────────────────────────────────────

const BI_ROLES = ["admin", "accounts"];

// ─── Report definitions ───────────────────────────────────────────────────────

interface ReportDef {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  accentBg: string;
  accentText: string;
  dataDescription: string;
}

const REPORTS: ReportDef[] = [
  {
    id: "supplier-ledger",
    title: "Supplier Ledger",
    subtitle: "Reconciliation",
    description:
      "Track payment history, outstanding balances, and reconciliation status across all suppliers. Links transactions to supplier master data.",
    icon: Building2,
    accentBg: "bg-blue-50 dark:bg-blue-950/30",
    accentText: "text-blue-600 dark:text-blue-400",
    dataDescription: "Transactions joined with supplier records, ordered by date.",
  },
  {
    id: "expense-income",
    title: "Expense vs Income",
    subtitle: "Monthly Breakdown",
    description:
      "Compare revenue against expenses by category. Includes monthly trend, category treemap, and transaction drill-through.",
    icon: TrendingUp,
    accentBg: "bg-green-50 dark:bg-green-950/30",
    accentText: "text-green-600 dark:text-green-400",
    dataDescription: "Monthly aggregates by type and category with count, total, and average.",
  },
  {
    id: "trial-balance",
    title: "Trial Balance",
    subtitle: "Account Summary",
    description:
      "Period-end trial balance showing credits, debits, and net balance per account category. Highlights pending transactions.",
    icon: Scale,
    accentBg: "bg-purple-50 dark:bg-purple-950/30",
    accentText: "text-purple-600 dark:text-purple-400",
    dataDescription: "Account-level credit/debit totals from completed transactions.",
  },
  {
    id: "payroll-summary",
    title: "Payroll Summary",
    subtitle: "Workforce Costs",
    description:
      "Base salary, bonuses, deductions, and net pay per employee with department roll-up. Supports headcount cost analysis.",
    icon: Users,
    accentBg: "bg-orange-50 dark:bg-orange-950/30",
    accentText: "text-orange-600 dark:text-orange-400",
    dataDescription: "Payroll records joined with employee and department data.",
  },
  {
    id: "profit-margin",
    title: "Profit & Loss",
    subtitle: "Margin Analysis",
    description:
      "Monthly revenue, expenses, profit, and margin % trend. Includes inventory asset valuation and waterfall analysis.",
    icon: DollarSign,
    accentBg: "bg-emerald-50 dark:bg-emerald-950/30",
    accentText: "text-emerald-600 dark:text-emerald-400",
    dataDescription: "Monthly P&L aggregates plus inventory asset value by supplier.",
  },
];

// ─── Token expiry countdown ───────────────────────────────────────────────────

function TokenExpiryBadge({
  expiry,
  onRefresh,
}: {
  expiry: string;
  onRefresh: () => void;
}) {
  const [label, setLabel] = useState("");
  const [isExpiring, setIsExpiring] = useState(false);

  useEffect(() => {
    const update = () => {
      const ms = new Date(expiry).getTime() - Date.now();
      if (ms <= 0) {
        setLabel("Expired");
        setIsExpiring(true);
        return;
      }
      const mins = Math.floor(ms / 60_000);
      const secs = Math.floor((ms % 60_000) / 1_000);
      setLabel(`${mins}m ${secs.toString().padStart(2, "0")}s`);
      setIsExpiring(ms < 5 * 60_000);
    };
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [expiry]);

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={isExpiring ? "destructive" : "secondary"}
        className="gap-1 font-mono text-[11px]"
      >
        <Clock className="h-3 w-3" aria-hidden />
        Token: {label}
      </Badge>
      {isExpiring && (
        <Button size="sm" variant="outline" onClick={onRefresh} className="h-7 gap-1.5 px-2 text-xs">
          <RefreshCw className="h-3 w-3" aria-hidden />
          Refresh
        </Button>
      )}
    </div>
  );
}

// ─── KPI mini-card ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-bold tabular-nums",
          positive === true && "text-green-600",
          positive === false && "text-destructive",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

const fmt = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (n: number) => `${Number(n).toFixed(1)}%`;

// ─── Native data preview panels ───────────────────────────────────────────────

function SupplierLedgerPreview({ payload }: { payload: unknown }) {
  const rows = ((payload as any)?.data ?? []) as any[];
  const totalIncome  = rows.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);
  const totalExpense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);
  const suppliers    = new Set(rows.map((r) => r.supplier_name).filter(Boolean)).size;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Unique Suppliers" value={String(suppliers)} />
        <KpiCard label="Total Income" value={fmt(totalIncome)} positive />
        <KpiCard label="Total Expenses" value={fmt(totalExpense)} positive={false} />
      </div>
      <NativeTable
        rows={rows.slice(0, 20)}
        columns={[
          { key: "date",           header: "Date",     render: (v) => v ? new Date(v).toLocaleDateString() : "—" },
          { key: "supplier_name",  header: "Supplier", render: (v) => v ?? "—" },
          { key: "description",    header: "Description", truncate: true },
          { key: "category",       header: "Category" },
          { key: "amount",         header: "Amount",   align: "right",
            render: (v, row) => (
              <span className={row.type === "income" ? "text-green-600" : "text-destructive"}>
                {row.type === "expense" ? "−" : "+"}${Number(v).toFixed(2)}
              </span>
            ),
          },
          { key: "status",         header: "Status",   render: (v) => <span className="capitalize">{v}</span> },
        ]}
        total={rows.length}
      />
    </div>
  );
}

function ExpenseIncomePreview({ payload }: { payload: unknown }) {
  const rows = ((payload as any)?.data ?? []) as any[];
  const incomeRows  = rows.filter((r) => r.type === "income");
  const expenseRows = rows.filter((r) => r.type === "expense");
  const totalIncome  = incomeRows.reduce((s, r) => s + Number(r.total), 0);
  const totalExpense = expenseRows.reduce((s, r) => s + Number(r.total), 0);
  const net = totalIncome - totalExpense;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total Income" value={fmt(totalIncome)} positive />
        <KpiCard label="Total Expenses" value={fmt(totalExpense)} positive={false} />
        <KpiCard label="Net" value={(net < 0 ? "−" : "+") + fmt(net)} positive={net >= 0} />
      </div>
      <NativeTable
        rows={rows.slice(0, 20)}
        columns={[
          { key: "month",             header: "Month",    render: (v) => v ? new Date(v).toLocaleDateString("en-US", { year: "numeric", month: "short" }) : "—" },
          { key: "type",              header: "Type",     render: (v) => <span className="capitalize">{v}</span> },
          { key: "category",          header: "Category" },
          { key: "transaction_count", header: "Txns",     align: "right" },
          { key: "total",             header: "Total",    align: "right", render: (v) => fmt(Number(v)) },
          { key: "average",           header: "Avg",      align: "right", render: (v) => fmt(Number(v)) },
        ]}
        total={rows.length}
      />
    </div>
  );
}

function TrialBalancePreview({ payload }: { payload: unknown }) {
  const totals  = (payload as any)?.totals ?? {};
  const accounts = ((payload as any)?.accounts ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Accounts" value={String(totals.accountCount ?? 0)} />
        <KpiCard label="Total Credits" value={fmt(totals.totalCredits ?? 0)} positive />
        <KpiCard label="Total Debits" value={fmt(totals.totalDebits ?? 0)} positive={false} />
        <KpiCard
          label="Net Balance"
          value={(totals.netBalance < 0 ? "−" : "") + fmt(totals.netBalance ?? 0)}
          positive={(totals.netBalance ?? 0) >= 0}
        />
      </div>
      <NativeTable
        rows={accounts}
        columns={[
          { key: "account",          header: "Account / Category" },
          { key: "credits",          header: "Credits",    align: "right", render: (v) => <span className="text-green-600">{fmt(Number(v))}</span> },
          { key: "debits",           header: "Debits",     align: "right", render: (v) => <span className="text-destructive">{fmt(Number(v))}</span> },
          { key: "balance",          header: "Balance",    align: "right",
            render: (v) => (
              <span className={Number(v) >= 0 ? "text-green-600 font-semibold" : "text-destructive font-semibold"}>
                {Number(v) < 0 ? "−" : ""}{fmt(Number(v))}
              </span>
            ),
          },
          { key: "transaction_count", header: "Txns",     align: "right" },
          { key: "pending_amount",   header: "Pending",   align: "right", render: (v) => Number(v) > 0 ? <span className="text-amber-600">{fmt(Number(v))}</span> : "—" },
        ]}
        total={accounts.length}
      />
    </div>
  );
}

function PayrollPreview({ payload }: { payload: unknown }) {
  const rows = ((payload as any)?.data ?? []) as any[];
  const totalNet   = rows.reduce((s, r) => s + Number(r.net_salary ?? 0), 0);
  const totalBonus = rows.reduce((s, r) => s + Number(r.bonus ?? 0), 0);
  const headcount  = new Set(rows.map((r) => r.employee_id)).size;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Employees" value={String(headcount)} />
        <KpiCard label="Total Net Salary" value={fmt(totalNet)} />
        <KpiCard label="Total Bonuses" value={fmt(totalBonus)} positive />
      </div>
      <NativeTable
        rows={rows.slice(0, 20)}
        columns={[
          { key: "employee_name", header: "Employee" },
          { key: "department",    header: "Department" },
          { key: "year",          header: "Year",   align: "right" },
          { key: "month",         header: "Month",  align: "right" },
          { key: "base_salary",   header: "Base",   align: "right", render: (v) => fmt(Number(v)) },
          { key: "bonus",         header: "Bonus",  align: "right", render: (v) => Number(v) > 0 ? <span className="text-green-600">{fmt(Number(v))}</span> : "—" },
          { key: "deductions",    header: "Deduct", align: "right", render: (v) => Number(v) > 0 ? <span className="text-destructive">−{fmt(Number(v))}</span> : "—" },
          { key: "net_salary",    header: "Net",    align: "right", render: (v) => <span className="font-semibold">{fmt(Number(v))}</span> },
          { key: "status",        header: "Status", render: (v) => <span className="capitalize">{v}</span> },
        ]}
        total={rows.length}
      />
    </div>
  );
}

function ProfitMarginPreview({ payload }: { payload: unknown }) {
  const monthly   = ((payload as any)?.monthly ?? []) as any[];
  const inventory = ((payload as any)?.inventoryValue ?? []) as any[];
  const latest    = monthly[0];
  const invTotal  = inventory.reduce((s, r) => s + Number(r.total_value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label={latest ? `Revenue (${new Date(latest.month).toLocaleDateString("en-US", { month: "short", year: "numeric" })})` : "Revenue"}
          value={latest ? fmt(latest.revenue) : "—"}
          positive
        />
        <KpiCard label="Expenses" value={latest ? fmt(latest.expenses) : "—"} positive={false} />
        <KpiCard label="Net Profit" value={latest ? (latest.profit < 0 ? "−" : "") + fmt(latest.profit) : "—"} positive={latest?.profit >= 0} />
        <KpiCard label="Margin %" value={latest ? pct(latest.margin_pct) : "—"} positive={latest?.margin_pct >= 0} sub="Latest month" />
      </div>

      <p className="text-xs font-medium text-muted-foreground">Monthly P&L</p>
      <NativeTable
        rows={monthly.slice(0, 15)}
        columns={[
          { key: "month",      header: "Month",     render: (v) => v ? new Date(v).toLocaleDateString("en-US", { year: "numeric", month: "short" }) : "—" },
          { key: "revenue",    header: "Revenue",   align: "right", render: (v) => <span className="text-green-600">{fmt(Number(v))}</span> },
          { key: "expenses",   header: "Expenses",  align: "right", render: (v) => <span className="text-destructive">{fmt(Number(v))}</span> },
          { key: "profit",     header: "Profit",    align: "right", render: (v) => <span className={Number(v) >= 0 ? "font-semibold text-green-600" : "font-semibold text-destructive"}>{Number(v) < 0 ? "−" : ""}{fmt(Number(v))}</span> },
          { key: "margin_pct", header: "Margin %",  align: "right", render: (v) => <span className={Number(v) >= 0 ? "text-green-600" : "text-destructive"}>{pct(Number(v))}</span> },
        ]}
        total={monthly.length}
      />

      {inventory.length > 0 && (
        <>
          <p className="text-xs font-medium text-muted-foreground">
            Inventory Assets — Total: {fmt(invTotal)}
          </p>
          <NativeTable
            rows={inventory.slice(0, 10)}
            columns={[
              { key: "name",          header: "Item" },
              { key: "type",          header: "Type" },
              { key: "supplier_name", header: "Supplier", render: (v) => v ?? "—" },
              { key: "quantity",      header: "Qty",       align: "right", render: (v) => Number(v).toLocaleString() },
              { key: "unit_cost",     header: "Unit Cost", align: "right", render: (v) => fmt(Number(v)) },
              { key: "total_value",   header: "Value",     align: "right", render: (v) => <span className="font-semibold">{fmt(Number(v))}</span> },
            ]}
            total={inventory.length}
          />
        </>
      )}
    </div>
  );
}

// ─── Generic native data table ────────────────────────────────────────────────

interface ColDef {
  key: string;
  header: string;
  align?: "left" | "right";
  truncate?: boolean;
  render?: (value: any, row: any) => React.ReactNode;
}

function NativeTable({
  rows,
  columns,
  total,
}: {
  rows: any[];
  columns: ColDef[];
  total: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">No data available.</p>
    );
  }
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  scope="col"
                  className={c.align === "right" ? "text-right" : ""}
                >
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      "text-sm",
                      c.align === "right" && "text-right font-mono tabular-nums",
                      c.truncate && "max-w-[160px] truncate",
                    )}
                  >
                    {c.render ? c.render(row[c.key], row) : (row[c.key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {total > rows.length && (
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          Showing first {rows.length} of {total} rows — open in Power BI for full data.
        </p>
      )}
    </div>
  );
}

// ─── Native data wrapper (dispatch to preview by reportId) ────────────────────

function NativeDataSection({
  reportId,
  state,
  onLoad,
}: {
  reportId: string;
  state: NativeDataState;
  onLoad: () => void;
}) {
  const [open, setOpen] = useState(false);

  const handleToggle = () => {
    if (!open && state.status === "idle") onLoad();
    setOpen((v) => !v);
  };

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden />
          Native Data Preview
          <Badge variant="outline" className="text-[10px]">
            Live from PostgreSQL
          </Badge>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
        )}
      </button>

      {open && (
        <div className="border-t p-4">
          {state.status === "idle" || state.status === "loading" ? (
            <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              <span className="text-sm">Loading data…</span>
            </div>
          ) : state.status === "error" ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive/60" aria-hidden />
              <p className="text-sm font-medium">Failed to load data</p>
              <p className="max-w-xs text-xs text-muted-foreground">{state.message}</p>
              <Button size="sm" variant="outline" onClick={onLoad}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Retry
              </Button>
            </div>
          ) : (
            <NativeDataRouter reportId={reportId} payload={state.payload} />
          )}
        </div>
      )}
    </div>
  );
}

function NativeDataRouter({ reportId, payload }: { reportId: string; payload: unknown }) {
  switch (reportId) {
    case "supplier-ledger": return <SupplierLedgerPreview payload={payload} />;
    case "expense-income":  return <ExpenseIncomePreview  payload={payload} />;
    case "trial-balance":   return <TrialBalancePreview   payload={payload} />;
    case "payroll-summary": return <PayrollPreview        payload={payload} />;
    case "profit-margin":   return <ProfitMarginPreview   payload={payload} />;
    default: return <p className="text-sm text-muted-foreground">No preview available.</p>;
  }
}

// ─── Report catalog card ──────────────────────────────────────────────────────

function ReportCatalogCard({
  report,
  configured,
  onView,
}: {
  report: ReportDef;
  configured: boolean;
  onView: () => void;
}) {
  const Icon = report.icon;
  return (
    <Card className="group flex flex-col transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("rounded-xl p-3", report.accentBg)}>
            <Icon className={cn("h-6 w-6", report.accentText)} aria-hidden />
          </div>
          {configured ? (
            <Badge className="shrink-0 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
              Configured
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0">
              Setup Required
            </Badge>
          )}
        </div>

        <div className="mt-4 flex-1">
          <p className="font-semibold leading-tight">{report.title}</p>
          <p className="text-xs text-muted-foreground">{report.subtitle}</p>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {report.description}
          </p>
        </div>

        <Button
          className="mt-5 w-full"
          variant={configured ? "default" : "outline"}
          onClick={onView}
        >
          {configured ? (
            <BarChart3 className="mr-1.5 h-4 w-4" aria-hidden />
          ) : (
            <AlertCircle className="mr-1.5 h-4 w-4" aria-hidden />
          )}
          {configured ? "Open Report" : "View Setup Guide"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Report viewer ────────────────────────────────────────────────────────────

function ReportViewer({
  report,
  embedState,
  nativeDataState,
  onBack,
  onRefresh,
  onFetchNativeData,
}: {
  report: ReportDef;
  embedState: EmbedState;
  nativeDataState: NativeDataState;
  onBack: () => void;
  onRefresh: () => void;
  onFetchNativeData: () => void;
}) {
  const Icon = report.icon;
  const isReady = embedState.status === "ready";
  const config  = isReady ? (embedState as { status: "ready"; config: EmbedConfig }).config : null;

  return (
    <div className="space-y-4">
      {/* ── Viewer header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-1 -ml-2 gap-1.5 text-muted-foreground" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            All Reports
          </Button>
          <div className="flex items-center gap-3">
            <div className={cn("rounded-lg p-2", report.accentBg)}>
              <Icon className={cn("h-5 w-5", report.accentText)} aria-hidden />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-tight">{report.title}</h2>
              <p className="text-xs text-muted-foreground">{report.subtitle}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {config && (
            <>
              <TokenExpiryBadge expiry={config.expiry} onRefresh={onRefresh} />
              <Button size="sm" variant="outline" onClick={onRefresh} className="h-7 gap-1.5 px-2 text-xs">
                <RefreshCw className="h-3 w-3" aria-hidden />
                Refresh Token
              </Button>
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground" asChild>
                <a
                  href={`https://app.powerbi.com/groups/${config.workspaceId}/reports/${config.reportId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Power BI
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </Button>
            </>
          )}
          {embedState.status === "unconfigured" && (
            <Badge variant="secondary" className="gap-1">
              <AlertCircle className="h-3 w-3" aria-hidden />
              Not Configured
            </Badge>
          )}
        </div>
      </div>

      {/* ── Embed panel ── */}
      {(embedState.status === "idle" || embedState.status === "loading") && (
        <PowerBIEmbedLoading height={680} />
      )}
      {embedState.status === "unconfigured" && (
        <PowerBIUnconfigured
          reportId={report.id}
          message={embedState.message}
        />
      )}
      {embedState.status === "error" && (
        <PowerBIEmbedError message={embedState.message} onRetry={onRefresh} />
      )}
      {embedState.status === "ready" && config && (
        <PowerBIEmbed label={report.title} config={config} height={680} />
      )}

      {/* ── Native data preview ── */}
      <Separator />
      <NativeDataSection
        reportId={report.id}
        state={nativeDataState}
        onLoad={onFetchNativeData}
      />
    </div>
  );
}

// ─── Catalog view ─────────────────────────────────────────────────────────────

function ReportsCatalog({
  configuredSet,
  reportsLoading,
  onSelect,
}: {
  configuredSet: Set<string>;
  reportsLoading: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Financial Reports</h2>
          <p className="text-sm text-muted-foreground">
            {reportsLoading ? (
              "Checking configuration…"
            ) : (
              <>
                {REPORTS.length} reports ·{" "}
                <span className="text-green-600 dark:text-green-400">
                  {configuredSet.size} configured
                </span>{" "}
                ·{" "}
                <span className="text-muted-foreground">
                  {REPORTS.length - configuredSet.size} need setup
                </span>
              </>
            )}
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-xs">
          <ShieldAlert className="h-3 w-3" aria-hidden />
          Admin &amp; Accounts only
        </Badge>
      </div>

      {reportsLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => (
            <Skeleton key={r.id} className="h-52 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => (
            <ReportCatalogCard
              key={r.id}
              report={r}
              configured={configuredSet.has(r.id)}
              onView={() => onSelect(r.id)}
            />
          ))}
        </div>
      )}

      {/* Connection guide */}
      <Card className="border-dashed bg-muted/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
            Connecting Power BI to FurniCore
          </CardTitle>
          <CardDescription className="text-xs">
            Power BI reports connect to FurniCore's PostgreSQL database via these REST data endpoints.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {REPORTS.map((r) => (
              <div key={r.id} className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2">
                <r.icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", r.accentText)} aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-medium">{r.title}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    GET /api/powerbi/data/{r.id}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="pt-1 text-[11px] text-muted-foreground">
            All data endpoints require a valid Bearer token with admin or accounts role. Use
            Power BI's Web connector or a custom connector to pull data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main hub component ───────────────────────────────────────────────────────

export function PowerBIReportsHub() {
  const { data: user, isLoading: userLoading } = useGetCurrentUser();
  const canView = BI_ROLES.includes(user?.role ?? "");

  const {
    reports,
    reportsLoading,
    fetchReports,
    fetchEmbedToken,
    forceRefreshToken,
    getEmbedState,
    fetchNativeData,
    getNativeData,
  } = usePowerBI();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch report list on mount (once)
  useEffect(() => {
    if (canView) fetchReports();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const handleSelectReport = useCallback(
    (id: string) => {
      setSelectedId(id);
      fetchEmbedToken(id);
    },
    [fetchEmbedToken],
  );

  const handleRefresh = useCallback(
    (id: string) => {
      forceRefreshToken(id);
    },
    [forceRefreshToken],
  );

  // ── Access gate ───────────────────────────────────────────────
  if (userLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading…" />
      </div>
    );
  }

  if (!canView) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <ShieldAlert className="h-12 w-12 text-destructive/60" aria-hidden />
          <div>
            <p className="text-xl font-semibold">Access restricted</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Financial dashboards are only available to users with the{" "}
              <strong>Admin</strong> or <strong>Accounts</strong> role.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Contact your system administrator if you require access.
            </p>
          </div>
          <Badge variant="outline" className="gap-1">
            <ShieldAlert className="h-3 w-3" aria-hidden />
            {user?.role ? `Current role: ${user.role}` : "Not authenticated"}
          </Badge>
        </CardContent>
      </Card>
    );
  }

  // ── Viewer ────────────────────────────────────────────────────
  const selectedReport = REPORTS.find((r) => r.id === selectedId);
  if (selectedId && selectedReport) {
    return (
      <ReportViewer
        report={selectedReport}
        embedState={getEmbedState(selectedId)}
        nativeDataState={getNativeData(selectedId)}
        onBack={() => setSelectedId(null)}
        onRefresh={() => handleRefresh(selectedId)}
        onFetchNativeData={() => fetchNativeData(selectedId)}
      />
    );
  }

  // Build a Set of configured report IDs from the backend response
  const configuredSet = new Set(reports.filter((r) => r.configured).map((r) => r.id));

  // ── Catalog ───────────────────────────────────────────────────
  return (
    <ReportsCatalog
      configuredSet={configuredSet}
      reportsLoading={reportsLoading}
      onSelect={handleSelectReport}
    />
  );
}
