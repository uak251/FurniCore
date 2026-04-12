import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { usePowerBI, } from "@/hooks/use-powerbi";
import { PowerBIEmbed, PowerBIEmbedLoading, PowerBIUnconfigured, PowerBIEmbedError, } from "@/components/PowerBIEmbed";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, TrendingUp, Scale, Users, DollarSign, ArrowLeft, RefreshCw, ExternalLink, ChevronDown, ChevronUp, Clock, ShieldAlert, CheckCircle2, AlertCircle, BarChart3, Loader2, AlertTriangle, } from "lucide-react";
import { cn } from "@/lib/utils";
// ─── Access gate ─────────────────────────────────────────────────────────────
const BI_ROLES = ["admin", "accountant"];
const REPORTS = [
    {
        id: "supplier-ledger",
        title: "Supplier Ledger",
        subtitle: "Reconciliation",
        description: "Track payment history, outstanding balances, and reconciliation status across all suppliers. Links transactions to supplier master data.",
        icon: Building2,
        accentBg: "bg-blue-50 dark:bg-blue-950/30",
        accentText: "text-blue-600 dark:text-blue-400",
        dataDescription: "Transactions joined with supplier records, ordered by date.",
    },
    {
        id: "expense-income",
        title: "Expense vs Income",
        subtitle: "Monthly Breakdown",
        description: "Compare revenue against expenses by category. Includes monthly trend, category treemap, and transaction drill-through.",
        icon: TrendingUp,
        accentBg: "bg-green-50 dark:bg-green-950/30",
        accentText: "text-green-600 dark:text-green-400",
        dataDescription: "Monthly aggregates by type and category with count, total, and average.",
    },
    {
        id: "trial-balance",
        title: "Trial Balance",
        subtitle: "Account Summary",
        description: "Period-end trial balance showing credits, debits, and net balance per account category. Highlights pending transactions.",
        icon: Scale,
        accentBg: "bg-purple-50 dark:bg-purple-950/30",
        accentText: "text-purple-600 dark:text-purple-400",
        dataDescription: "Account-level credit/debit totals from completed transactions.",
    },
    {
        id: "payroll-summary",
        title: "Payroll Summary",
        subtitle: "Workforce Costs",
        description: "Base salary, bonuses, deductions, and net pay per employee with department roll-up. Supports headcount cost analysis.",
        icon: Users,
        accentBg: "bg-orange-50 dark:bg-orange-950/30",
        accentText: "text-orange-600 dark:text-orange-400",
        dataDescription: "Payroll records joined with employee and department data.",
    },
    {
        id: "profit-margin",
        title: "Profit & Loss",
        subtitle: "Margin Analysis",
        description: "Monthly revenue, expenses, profit, and margin % trend. Includes inventory asset valuation and waterfall analysis.",
        icon: DollarSign,
        accentBg: "bg-emerald-50 dark:bg-emerald-950/30",
        accentText: "text-emerald-600 dark:text-emerald-400",
        dataDescription: "Monthly P&L aggregates plus inventory asset value by supplier.",
    },
];
// ─── Token expiry countdown ───────────────────────────────────────────────────
function TokenExpiryBadge({ expiry, onRefresh, }) {
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
    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs(Badge, { variant: isExpiring ? "destructive" : "secondary", className: "gap-1 font-mono text-[11px]", children: [_jsx(Clock, { className: "h-3 w-3", "aria-hidden": true }), "Token: ", label] }), isExpiring && (_jsxs(Button, { size: "sm", variant: "outline", onClick: onRefresh, className: "h-7 gap-1.5 px-2 text-xs", children: [_jsx(RefreshCw, { className: "h-3 w-3", "aria-hidden": true }), "Refresh"] }))] }));
}
// ─── KPI mini-card ────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, positive, }) {
    return (_jsxs("div", { className: "rounded-lg border bg-card p-4", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: label }), _jsx("p", { className: cn("mt-1 text-lg font-bold tabular-nums", positive === true && "text-green-600", positive === false && "text-destructive"), children: value }), sub && _jsx("p", { className: "mt-0.5 text-[10px] text-muted-foreground", children: sub })] }));
}
const fmt = (n) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n) => `${Number(n).toFixed(1)}%`;
// ─── Native data preview panels ───────────────────────────────────────────────
function SupplierLedgerPreview({ payload }) {
    const rows = (payload?.data ?? []);
    const totalIncome = rows.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);
    const totalExpense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);
    const suppliers = new Set(rows.map((r) => r.supplier_name).filter(Boolean)).size;
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(KpiCard, { label: "Unique Suppliers", value: String(suppliers) }), _jsx(KpiCard, { label: "Total Income", value: fmt(totalIncome), positive: true }), _jsx(KpiCard, { label: "Total Expenses", value: fmt(totalExpense), positive: false })] }), _jsx(NativeTable, { rows: rows.slice(0, 20), columns: [
                    { key: "date", header: "Date", render: (v) => v ? new Date(v).toLocaleDateString() : "—" },
                    { key: "supplier_name", header: "Supplier", render: (v) => v ?? "—" },
                    { key: "description", header: "Description", truncate: true },
                    { key: "category", header: "Category" },
                    { key: "amount", header: "Amount", align: "right",
                        render: (v, row) => (_jsxs("span", { className: row.type === "income" ? "text-green-600" : "text-destructive", children: [row.type === "expense" ? "−" : "+", "$", Number(v).toFixed(2)] })),
                    },
                    { key: "status", header: "Status", render: (v) => _jsx("span", { className: "capitalize", children: v }) },
                ], total: rows.length })] }));
}
function ExpenseIncomePreview({ payload }) {
    const rows = (payload?.data ?? []);
    const incomeRows = rows.filter((r) => r.type === "income");
    const expenseRows = rows.filter((r) => r.type === "expense");
    const totalIncome = incomeRows.reduce((s, r) => s + Number(r.total), 0);
    const totalExpense = expenseRows.reduce((s, r) => s + Number(r.total), 0);
    const net = totalIncome - totalExpense;
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(KpiCard, { label: "Total Income", value: fmt(totalIncome), positive: true }), _jsx(KpiCard, { label: "Total Expenses", value: fmt(totalExpense), positive: false }), _jsx(KpiCard, { label: "Net", value: (net < 0 ? "−" : "+") + fmt(net), positive: net >= 0 })] }), _jsx(NativeTable, { rows: rows.slice(0, 20), columns: [
                    { key: "month", header: "Month", render: (v) => v ? new Date(v).toLocaleDateString("en-US", { year: "numeric", month: "short" }) : "—" },
                    { key: "type", header: "Type", render: (v) => _jsx("span", { className: "capitalize", children: v }) },
                    { key: "category", header: "Category" },
                    { key: "transaction_count", header: "Txns", align: "right" },
                    { key: "total", header: "Total", align: "right", render: (v) => fmt(Number(v)) },
                    { key: "average", header: "Avg", align: "right", render: (v) => fmt(Number(v)) },
                ], total: rows.length })] }));
}
function TrialBalancePreview({ payload }) {
    const totals = payload?.totals ?? {};
    const accounts = (payload?.accounts ?? []);
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-4 gap-3", children: [_jsx(KpiCard, { label: "Accounts", value: String(totals.accountCount ?? 0) }), _jsx(KpiCard, { label: "Total Credits", value: fmt(totals.totalCredits ?? 0), positive: true }), _jsx(KpiCard, { label: "Total Debits", value: fmt(totals.totalDebits ?? 0), positive: false }), _jsx(KpiCard, { label: "Net Balance", value: (totals.netBalance < 0 ? "−" : "") + fmt(totals.netBalance ?? 0), positive: (totals.netBalance ?? 0) >= 0 })] }), _jsx(NativeTable, { rows: accounts, columns: [
                    { key: "account", header: "Account / Category" },
                    { key: "credits", header: "Credits", align: "right", render: (v) => _jsx("span", { className: "text-green-600", children: fmt(Number(v)) }) },
                    { key: "debits", header: "Debits", align: "right", render: (v) => _jsx("span", { className: "text-destructive", children: fmt(Number(v)) }) },
                    { key: "balance", header: "Balance", align: "right",
                        render: (v) => (_jsxs("span", { className: Number(v) >= 0 ? "text-green-600 font-semibold" : "text-destructive font-semibold", children: [Number(v) < 0 ? "−" : "", fmt(Number(v))] })),
                    },
                    { key: "transaction_count", header: "Txns", align: "right" },
                    { key: "pending_amount", header: "Pending", align: "right", render: (v) => Number(v) > 0 ? _jsx("span", { className: "text-amber-600", children: fmt(Number(v)) }) : "—" },
                ], total: accounts.length })] }));
}
function PayrollPreview({ payload }) {
    const rows = (payload?.data ?? []);
    const totalNet = rows.reduce((s, r) => s + Number(r.net_salary ?? 0), 0);
    const totalBonus = rows.reduce((s, r) => s + Number(r.bonus ?? 0), 0);
    const headcount = new Set(rows.map((r) => r.employee_id)).size;
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(KpiCard, { label: "Employees", value: String(headcount) }), _jsx(KpiCard, { label: "Total Net Salary", value: fmt(totalNet) }), _jsx(KpiCard, { label: "Total Bonuses", value: fmt(totalBonus), positive: true })] }), _jsx(NativeTable, { rows: rows.slice(0, 20), columns: [
                    { key: "employee_name", header: "Employee" },
                    { key: "department", header: "Department" },
                    { key: "year", header: "Year", align: "right" },
                    { key: "month", header: "Month", align: "right" },
                    { key: "base_salary", header: "Base", align: "right", render: (v) => fmt(Number(v)) },
                    { key: "bonus", header: "Bonus", align: "right", render: (v) => Number(v) > 0 ? _jsx("span", { className: "text-green-600", children: fmt(Number(v)) }) : "—" },
                    { key: "deductions", header: "Deduct", align: "right", render: (v) => Number(v) > 0 ? _jsxs("span", { className: "text-destructive", children: ["\u2212", fmt(Number(v))] }) : "—" },
                    { key: "net_salary", header: "Net", align: "right", render: (v) => _jsx("span", { className: "font-semibold", children: fmt(Number(v)) }) },
                    { key: "status", header: "Status", render: (v) => _jsx("span", { className: "capitalize", children: v }) },
                ], total: rows.length })] }));
}
function ProfitMarginPreview({ payload }) {
    const monthly = (payload?.monthly ?? []);
    const inventory = (payload?.inventoryValue ?? []);
    const latest = monthly[0];
    const invTotal = inventory.reduce((s, r) => s + Number(r.total_value ?? 0), 0);
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-4 gap-3", children: [_jsx(KpiCard, { label: latest ? `Revenue (${new Date(latest.month).toLocaleDateString("en-US", { month: "short", year: "numeric" })})` : "Revenue", value: latest ? fmt(latest.revenue) : "—", positive: true }), _jsx(KpiCard, { label: "Expenses", value: latest ? fmt(latest.expenses) : "—", positive: false }), _jsx(KpiCard, { label: "Net Profit", value: latest ? (latest.profit < 0 ? "−" : "") + fmt(latest.profit) : "—", positive: latest?.profit >= 0 }), _jsx(KpiCard, { label: "Margin %", value: latest ? pct(latest.margin_pct) : "—", positive: latest?.margin_pct >= 0, sub: "Latest month" })] }), _jsx("p", { className: "text-xs font-medium text-muted-foreground", children: "Monthly P&L" }), _jsx(NativeTable, { rows: monthly.slice(0, 15), columns: [
                    { key: "month", header: "Month", render: (v) => v ? new Date(v).toLocaleDateString("en-US", { year: "numeric", month: "short" }) : "—" },
                    { key: "revenue", header: "Revenue", align: "right", render: (v) => _jsx("span", { className: "text-green-600", children: fmt(Number(v)) }) },
                    { key: "expenses", header: "Expenses", align: "right", render: (v) => _jsx("span", { className: "text-destructive", children: fmt(Number(v)) }) },
                    { key: "profit", header: "Profit", align: "right", render: (v) => _jsxs("span", { className: Number(v) >= 0 ? "font-semibold text-green-600" : "font-semibold text-destructive", children: [Number(v) < 0 ? "−" : "", fmt(Number(v))] }) },
                    { key: "margin_pct", header: "Margin %", align: "right", render: (v) => _jsx("span", { className: Number(v) >= 0 ? "text-green-600" : "text-destructive", children: pct(Number(v)) }) },
                ], total: monthly.length }), inventory.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("p", { className: "text-xs font-medium text-muted-foreground", children: ["Inventory Assets \u2014 Total: ", fmt(invTotal)] }), _jsx(NativeTable, { rows: inventory.slice(0, 10), columns: [
                            { key: "name", header: "Item" },
                            { key: "type", header: "Type" },
                            { key: "supplier_name", header: "Supplier", render: (v) => v ?? "—" },
                            { key: "quantity", header: "Qty", align: "right", render: (v) => Number(v).toLocaleString() },
                            { key: "unit_cost", header: "Unit Cost", align: "right", render: (v) => fmt(Number(v)) },
                            { key: "total_value", header: "Value", align: "right", render: (v) => _jsx("span", { className: "font-semibold", children: fmt(Number(v)) }) },
                        ], total: inventory.length })] }))] }));
}
function NativeTable({ rows, columns, total, }) {
    if (rows.length === 0) {
        return (_jsx("p", { className: "py-6 text-center text-sm text-muted-foreground", children: "No data available." }));
    }
    return (_jsxs("div", { children: [_jsx("div", { className: "overflow-x-auto rounded-lg border", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsx(TableRow, { children: columns.map((c) => (_jsx(TableHead, { scope: "col", className: c.align === "right" ? "text-right" : "", children: c.header }, c.key))) }) }), _jsx(TableBody, { children: rows.map((row, i) => (_jsx(TableRow, { children: columns.map((c) => (_jsx(TableCell, { className: cn("text-sm", c.align === "right" && "text-right font-mono tabular-nums", c.truncate && "max-w-[160px] truncate"), children: c.render ? c.render(row[c.key], row) : (row[c.key] ?? "—") }, c.key))) }, i))) })] }) }), total > rows.length && (_jsxs("p", { className: "mt-1.5 text-center text-xs text-muted-foreground", children: ["Showing first ", rows.length, " of ", total, " rows \u2014 open in Power BI for full data."] }))] }));
}
// ─── Native data wrapper (dispatch to preview by reportId) ────────────────────
function NativeDataSection({ reportId, state, onLoad, }) {
    const [open, setOpen] = useState(false);
    const handleToggle = () => {
        if (!open && state.status === "idle")
            onLoad();
        setOpen((v) => !v);
    };
    return (_jsxs("div", { className: "rounded-lg border", children: [_jsxs("button", { type: "button", onClick: handleToggle, className: "flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40", "aria-expanded": open, children: [_jsxs("span", { className: "flex items-center gap-2", children: [_jsx(BarChart3, { className: "h-4 w-4 text-muted-foreground", "aria-hidden": true }), "Native Data Preview", _jsx(Badge, { variant: "outline", className: "text-[10px]", children: "Live from PostgreSQL" })] }), open ? (_jsx(ChevronUp, { className: "h-4 w-4 text-muted-foreground", "aria-hidden": true })) : (_jsx(ChevronDown, { className: "h-4 w-4 text-muted-foreground", "aria-hidden": true }))] }), open && (_jsx("div", { className: "border-t p-4", children: state.status === "idle" || state.status === "loading" ? (_jsxs("div", { className: "flex items-center justify-center gap-3 py-10 text-muted-foreground", children: [_jsx(Loader2, { className: "h-5 w-5 animate-spin", "aria-hidden": true }), _jsx("span", { className: "text-sm", children: "Loading data\u2026" })] })) : state.status === "error" ? (_jsxs("div", { className: "flex flex-col items-center gap-3 py-8 text-center", children: [_jsx(AlertTriangle, { className: "h-8 w-8 text-destructive/60", "aria-hidden": true }), _jsx("p", { className: "text-sm font-medium", children: "Failed to load data" }), _jsx("p", { className: "max-w-xs text-xs text-muted-foreground", children: state.message }), _jsxs(Button, { size: "sm", variant: "outline", onClick: onLoad, children: [_jsx(RefreshCw, { className: "mr-1.5 h-3.5 w-3.5", "aria-hidden": true }), "Retry"] })] })) : (_jsx(NativeDataRouter, { reportId: reportId, payload: state.payload })) }))] }));
}
function NativeDataRouter({ reportId, payload }) {
    switch (reportId) {
        case "supplier-ledger": return _jsx(SupplierLedgerPreview, { payload: payload });
        case "expense-income": return _jsx(ExpenseIncomePreview, { payload: payload });
        case "trial-balance": return _jsx(TrialBalancePreview, { payload: payload });
        case "payroll-summary": return _jsx(PayrollPreview, { payload: payload });
        case "profit-margin": return _jsx(ProfitMarginPreview, { payload: payload });
        default: return _jsx("p", { className: "text-sm text-muted-foreground", children: "No preview available." });
    }
}
// ─── Report catalog card ──────────────────────────────────────────────────────
function ReportCatalogCard({ report, configured, onView, }) {
    const Icon = report.icon;
    return (_jsx(Card, { className: "group flex flex-col transition-shadow hover:shadow-md", children: _jsxs(CardContent, { className: "flex flex-1 flex-col p-5", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsx("div", { className: cn("rounded-xl p-3", report.accentBg), children: _jsx(Icon, { className: cn("h-6 w-6", report.accentText), "aria-hidden": true }) }), configured ? (_jsxs(Badge, { className: "shrink-0 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", children: [_jsx(CheckCircle2, { className: "mr-1 h-3 w-3", "aria-hidden": true }), "Configured"] })) : (_jsx(Badge, { variant: "secondary", className: "shrink-0", children: "Setup Required" }))] }), _jsxs("div", { className: "mt-4 flex-1", children: [_jsx("p", { className: "font-semibold leading-tight", children: report.title }), _jsx("p", { className: "text-xs text-muted-foreground", children: report.subtitle }), _jsx("p", { className: "mt-2 text-sm text-muted-foreground leading-relaxed", children: report.description })] }), _jsxs(Button, { className: "mt-5 w-full", variant: configured ? "default" : "outline", onClick: onView, children: [configured ? (_jsx(BarChart3, { className: "mr-1.5 h-4 w-4", "aria-hidden": true })) : (_jsx(AlertCircle, { className: "mr-1.5 h-4 w-4", "aria-hidden": true })), configured ? "Open Report" : "View Setup Guide"] })] }) }));
}
// ─── Report viewer ────────────────────────────────────────────────────────────
function ReportViewer({ report, embedState, nativeDataState, onBack, onRefresh, onFetchNativeData, }) {
    const Icon = report.icon;
    const isReady = embedState.status === "ready";
    const config = isReady ? embedState.config : null;
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", children: [_jsxs("div", { children: [_jsxs(Button, { variant: "ghost", size: "sm", className: "mb-1 -ml-2 gap-1.5 text-muted-foreground", onClick: onBack, children: [_jsx(ArrowLeft, { className: "h-3.5 w-3.5", "aria-hidden": true }), "All Reports"] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: cn("rounded-lg p-2", report.accentBg), children: _jsx(Icon, { className: cn("h-5 w-5", report.accentText), "aria-hidden": true }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold leading-tight", children: report.title }), _jsx("p", { className: "text-xs text-muted-foreground", children: report.subtitle })] })] })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [config && (_jsxs(_Fragment, { children: [_jsx(TokenExpiryBadge, { expiry: config.expiry, onRefresh: onRefresh }), _jsxs(Button, { size: "sm", variant: "outline", onClick: onRefresh, className: "h-7 gap-1.5 px-2 text-xs", children: [_jsx(RefreshCw, { className: "h-3 w-3", "aria-hidden": true }), "Refresh Token"] }), _jsx(Button, { size: "sm", variant: "ghost", className: "h-7 gap-1 px-2 text-xs text-muted-foreground", asChild: true, children: _jsxs("a", { href: `https://app.powerbi.com/groups/${config.workspaceId}/reports/${config.reportId}`, target: "_blank", rel: "noreferrer", children: ["Open in Power BI", _jsx(ExternalLink, { className: "h-3 w-3", "aria-hidden": true })] }) })] })), embedState.status === "unconfigured" && (_jsxs(Badge, { variant: "secondary", className: "gap-1", children: [_jsx(AlertCircle, { className: "h-3 w-3", "aria-hidden": true }), "Not Configured"] }))] })] }), (embedState.status === "idle" || embedState.status === "loading") && (_jsx(PowerBIEmbedLoading, { height: 680 })), embedState.status === "unconfigured" && (_jsx(PowerBIUnconfigured, { reportId: report.id, message: embedState.message })), embedState.status === "error" && (_jsx(PowerBIEmbedError, { message: embedState.message, onRetry: onRefresh })), embedState.status === "ready" && config && (_jsx(PowerBIEmbed, { label: report.title, config: config, height: 680 })), _jsx(Separator, {}), _jsx(NativeDataSection, { reportId: report.id, state: nativeDataState, onLoad: onFetchNativeData })] }));
}
// ─── Catalog view ─────────────────────────────────────────────────────────────
function ReportsCatalog({ configuredSet, reportsLoading, onSelect, }) {
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-semibold", children: "Financial Reports" }), _jsx("p", { className: "text-sm text-muted-foreground", children: reportsLoading ? ("Checking configuration…") : (_jsxs(_Fragment, { children: [REPORTS.length, " reports \u00B7", " ", _jsxs("span", { className: "text-green-600 dark:text-green-400", children: [configuredSet.size, " configured"] }), " ", "\u00B7", " ", _jsxs("span", { className: "text-muted-foreground", children: [REPORTS.length - configuredSet.size, " need setup"] })] })) })] }), _jsxs(Badge, { variant: "outline", className: "gap-1 text-xs", children: [_jsx(ShieldAlert, { className: "h-3 w-3", "aria-hidden": true }), "Admin & Accounts only"] })] }), reportsLoading ? (_jsx("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", children: REPORTS.map((r) => (_jsx(Skeleton, { className: "h-52 w-full rounded-lg" }, r.id))) })) : (_jsx("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", children: REPORTS.map((r) => (_jsx(ReportCatalogCard, { report: r, configured: configuredSet.has(r.id), onView: () => onSelect(r.id) }, r.id))) })), _jsxs(Card, { className: "border-dashed bg-muted/20", children: [_jsxs(CardHeader, { className: "pb-3", children: [_jsxs(CardTitle, { className: "flex items-center gap-2 text-sm", children: [_jsx(BarChart3, { className: "h-4 w-4 text-primary", "aria-hidden": true }), "Connecting Power BI to FurniCore"] }), _jsx(CardDescription, { className: "text-xs", children: "Power BI reports connect to FurniCore's PostgreSQL database via these REST data endpoints." })] }), _jsxs(CardContent, { className: "space-y-2", children: [_jsx("div", { className: "grid gap-2 sm:grid-cols-2", children: REPORTS.map((r) => (_jsxs("div", { className: "flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2", children: [_jsx(r.icon, { className: cn("mt-0.5 h-3.5 w-3.5 shrink-0", r.accentText), "aria-hidden": true }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-xs font-medium", children: r.title }), _jsxs("p", { className: "truncate font-mono text-[10px] text-muted-foreground", children: ["GET /api/powerbi/data/", r.id] })] })] }, r.id))) }), _jsx("p", { className: "pt-1 text-[11px] text-muted-foreground", children: "All data endpoints require a valid Bearer token with admin or accounts role. Use Power BI's Web connector or a custom connector to pull data." })] })] })] }));
}
// ─── Main hub component ───────────────────────────────────────────────────────
export function PowerBIReportsHub() {
    const { data: user, isLoading: userLoading } = useGetCurrentUser();
    const canView = BI_ROLES.includes(user?.role ?? "");
    const { reports, reportsLoading, fetchReports, fetchEmbedToken, forceRefreshToken, getEmbedState, fetchNativeData, getNativeData, } = usePowerBI();
    const [selectedId, setSelectedId] = useState(null);
    // Fetch report list on mount (once)
    useEffect(() => {
        if (canView)
            fetchReports();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canView]);
    const handleSelectReport = useCallback((id) => {
        setSelectedId(id);
        fetchEmbedToken(id);
    }, [fetchEmbedToken]);
    const handleRefresh = useCallback((id) => {
        forceRefreshToken(id);
    }, [forceRefreshToken]);
    // ── Access gate ───────────────────────────────────────────────
    if (userLoading) {
        return (_jsx("div", { className: "flex h-64 items-center justify-center", children: _jsx(Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground", "aria-label": "Loading\u2026" }) }));
    }
    if (!canView) {
        return (_jsx(Card, { children: _jsxs(CardContent, { className: "flex flex-col items-center gap-4 py-16 text-center", children: [_jsx(ShieldAlert, { className: "h-12 w-12 text-destructive/60", "aria-hidden": true }), _jsxs("div", { children: [_jsx("p", { className: "text-xl font-semibold", children: "Access restricted" }), _jsxs("p", { className: "mt-2 max-w-sm text-sm text-muted-foreground", children: ["Financial dashboards are only available to users with the", " ", _jsx("strong", { children: "Admin" }), " or ", _jsx("strong", { children: "Accounts" }), " role."] }), _jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: "Contact your system administrator if you require access." })] }), _jsxs(Badge, { variant: "outline", className: "gap-1", children: [_jsx(ShieldAlert, { className: "h-3 w-3", "aria-hidden": true }), user?.role ? `Current role: ${user.role}` : "Not authenticated"] })] }) }));
    }
    // ── Viewer ────────────────────────────────────────────────────
    const selectedReport = REPORTS.find((r) => r.id === selectedId);
    if (selectedId && selectedReport) {
        return (_jsx(ReportViewer, { report: selectedReport, embedState: getEmbedState(selectedId), nativeDataState: getNativeData(selectedId), onBack: () => setSelectedId(null), onRefresh: () => handleRefresh(selectedId), onFetchNativeData: () => fetchNativeData(selectedId) }));
    }
    // Build a Set of configured report IDs from the backend response
    const configuredSet = new Set(reports.filter((r) => r.configured).map((r) => r.id));
    // ── Catalog ───────────────────────────────────────────────────
    return (_jsx(ReportsCatalog, { configuredSet: configuredSet, reportsLoading: reportsLoading, onSelect: handleSelectReport }));
}
