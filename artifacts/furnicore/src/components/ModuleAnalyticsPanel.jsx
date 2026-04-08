import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ModuleAnalyticsPanel
 *
 * Reusable analytics section that can be dropped into any module page.
 * Shows:
 *  • Native recharts dashboard (always works — queries PostgreSQL directly)
 *  • Optional Power BI embedded report (if configured + user has access)
 *
 * Usage:
 *   <ModuleAnalyticsPanel module="inventory" reportId="inventory-analysis" />
 *
 * Supported modules: inventory | hr | payroll | sales | accounting
 */
import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { BarChart3, RefreshCw, ExternalLink, AlertCircle, TrendingUp, TrendingDown, } from "lucide-react";
import { usePowerBI } from "@/hooks/use-powerbi";
import { PowerBIEmbed, PowerBIEmbedLoading, PowerBIUnconfigured, PowerBIEmbedError } from "@/components/PowerBIEmbed";
import { useCurrency } from "@/lib/currency";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { apiOriginPrefix } from "@/lib/api-base";
const API_BASE = apiOriginPrefix();
async function fetchNative(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
    });
    if (!res.ok)
        throw new Error(`HTTP ${res.status}`);
    return res.json();
}
/* ─── Colour palette ─────────────────────────────────────────────────────────── */
const PALETTE = [
    "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7", "#14b8a6", "#f97316",
];
/* ─── KPI mini-card ──────────────────────────────────────────────────────────── */
function Kpi({ label, value, sub, trend }) {
    return (_jsxs("div", { className: "rounded-xl border bg-card p-4", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: label }), _jsxs("div", { className: "flex items-baseline gap-1.5 mt-0.5", children: [_jsx("p", { className: "text-2xl font-bold tabular-nums", children: value }), trend === "up" && _jsx(TrendingUp, { className: "h-4 w-4 text-green-500" }), trend === "down" && _jsx(TrendingDown, { className: "h-4 w-4 text-red-500" })] }), sub && _jsx("p", { className: "text-[11px] text-muted-foreground mt-0.5", children: sub })] }));
}
function InventoryCharts() {
    const { format } = useCurrency();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await fetchNative("/api/powerbi/data/inventory-analysis"));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    if (loading)
        return _jsx(ChartSkeleton, {});
    if (error)
        return _jsx(ChartError, { message: error, onRetry: load });
    if (!data)
        return null;
    const { summary, items } = data;
    // Top 15 items by total value for bar chart
    const topItems = [...items].sort((a, b) => b.total_value - a.total_value).slice(0, 15).map((i) => ({
        name: i.name.length > 18 ? i.name.slice(0, 17) + "…" : i.name,
        value: i.total_value,
        quantity: i.quantity,
        reorder: i.reorder_level,
        isLow: i.is_low_stock,
    }));
    // Type breakdown pie
    const typeData = Object.entries(summary.byType).map(([t, v]) => ({
        name: t.replace(/_/g, " "),
        value: v.count,
        val: v.value,
    }));
    // Low stock items
    const lowItems = items.filter((i) => i.is_low_stock).slice(0, 8);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4 sm:grid-cols-4", children: [_jsx(Kpi, { label: "Total items", value: String(summary.totalItems) }), _jsx(Kpi, { label: "Low stock", value: String(summary.lowStockCount), sub: summary.lowStockCount > 0 ? "Reorder needed" : "All OK", trend: summary.lowStockCount > 0 ? "down" : null }), _jsx(Kpi, { label: "Portfolio value", value: format(summary.totalValue, { compact: true }) }), _jsx(Kpi, { label: "Types", value: String(Object.keys(summary.byType).length) })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-3", children: [_jsxs(Card, { className: "lg:col-span-2", children: [_jsx(CardHeader, { className: "pb-2", children: _jsx(CardTitle, { className: "text-sm font-semibold", children: "Top items by stock value" }) }), _jsxs(CardContent, { children: [_jsx(ResponsiveContainer, { width: "100%", height: 260, children: _jsxs(BarChart, { data: topItems, layout: "vertical", margin: { left: 0, right: 16, top: 4, bottom: 4 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", horizontal: false }), _jsx(XAxis, { type: "number", tickFormatter: (v) => format(v, { compact: true }), style: { fontSize: 11 } }), _jsx(YAxis, { type: "category", dataKey: "name", width: 130, style: { fontSize: 11 } }), _jsx(Tooltip, { formatter: (v) => format(v) }), _jsx(Bar, { dataKey: "value", name: "Stock value", radius: [0, 4, 4, 0], children: topItems.map((item, i) => (_jsx(Cell, { fill: item.isLow ? "#ef4444" : "#6366f1" }, i))) })] }) }), _jsx("p", { className: "text-[10px] text-muted-foreground mt-1 text-center", children: "Red = below reorder level" })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-2", children: _jsx(CardTitle, { className: "text-sm font-semibold", children: "By type" }) }), _jsx(CardContent, { children: _jsx(ResponsiveContainer, { width: "100%", height: 200, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: typeData, dataKey: "value", nameKey: "name", cx: "50%", cy: "50%", outerRadius: 70, label: ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`, labelLine: false, style: { fontSize: 10 }, children: typeData.map((_, i) => _jsx(Cell, { fill: PALETTE[i % PALETTE.length] }, i)) }), _jsx(Tooltip, { formatter: (v, name, props) => [v, name] })] }) }) })] })] }), lowItems.length > 0 && (_jsxs(Card, { className: "border-destructive/30", children: [_jsx(CardHeader, { className: "pb-2", children: _jsxs(CardTitle, { className: "text-sm font-semibold text-destructive flex items-center gap-1.5", children: [_jsx(AlertCircle, { className: "h-4 w-4" }), " ", lowItems.length, " items below reorder level"] }) }), _jsx(CardContent, { children: _jsx("div", { className: "space-y-2", children: lowItems.map((item) => (_jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-medium truncate", children: item.name }), _jsxs("p", { className: "text-xs text-muted-foreground", children: ["Supplier: ", item.supplier_name ?? "—"] })] }), _jsxs("div", { className: "text-right shrink-0", children: [_jsxs("p", { className: "text-sm font-mono text-destructive font-semibold", children: [item.quantity, " left"] }), _jsxs("p", { className: "text-[10px] text-muted-foreground", children: ["reorder at ", item.reorder_level] })] }), _jsx("div", { className: "w-24", children: _jsx(Progress, { value: Math.min((item.quantity / Math.max(item.reorder_level, 1)) * 100, 100), className: "h-1.5 [&>div]:bg-destructive" }) })] }, item.id))) }) })] }))] }));
}
function HRCharts() {
    const { format } = useCurrency();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await fetchNative("/api/powerbi/data/hr-dashboard"));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    if (loading)
        return _jsx(ChartSkeleton, {});
    if (error)
        return _jsx(ChartError, { message: error, onRetry: load });
    if (!data)
        return null;
    const { summary, departments } = data;
    const deptBar = departments.map((d) => ({
        name: d.department.length > 16 ? d.department.slice(0, 15) + "…" : d.department,
        active: d.active,
        inactive: d.headcount - d.active,
        avgSalary: d.avgSalary,
        attendance: d.attendanceRate ?? 0,
    }));
    const salaryPie = departments.map((d) => ({
        name: d.department,
        value: +(d.avgSalary * d.headcount).toFixed(0),
    }));
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4 sm:grid-cols-4", children: [_jsx(Kpi, { label: "Total employees", value: String(summary.totalEmployees) }), _jsx(Kpi, { label: "Active", value: String(summary.activeEmployees), sub: `${Math.round(summary.activeEmployees / Math.max(summary.totalEmployees, 1) * 100)}% active` }), _jsx(Kpi, { label: "Departments", value: String(summary.departments) }), _jsx(Kpi, { label: "Annual payroll", value: format(summary.totalPayroll, { compact: true }), sub: "Sum of base salaries" })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-3", children: [_jsxs(Card, { className: "lg:col-span-2", children: [_jsx(CardHeader, { className: "pb-2", children: _jsx(CardTitle, { className: "text-sm font-semibold", children: "Headcount by department" }) }), _jsx(CardContent, { children: _jsx(ResponsiveContainer, { width: "100%", height: 220, children: _jsxs(BarChart, { data: deptBar, margin: { left: 0, right: 8, top: 4, bottom: 4 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", vertical: false }), _jsx(XAxis, { dataKey: "name", style: { fontSize: 11 } }), _jsx(YAxis, { allowDecimals: false, style: { fontSize: 11 } }), _jsx(Tooltip, {}), _jsx(Legend, {}), _jsx(Bar, { dataKey: "active", name: "Active", stackId: "a", fill: "#22c55e", radius: [0, 0, 0, 0] }), _jsx(Bar, { dataKey: "inactive", name: "Inactive", stackId: "a", fill: "#e5e7eb", radius: [4, 4, 0, 0] })] }) }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-2", children: _jsx(CardTitle, { className: "text-sm font-semibold", children: "Payroll by dept" }) }), _jsx(CardContent, { children: _jsx(ResponsiveContainer, { width: "100%", height: 200, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: salaryPie, dataKey: "value", nameKey: "name", cx: "50%", cy: "50%", outerRadius: 70, label: ({ percent }) => `${(percent * 100).toFixed(0)}%`, labelLine: false, style: { fontSize: 10 }, children: salaryPie.map((_, i) => _jsx(Cell, { fill: PALETTE[i % PALETTE.length] }, i)) }), _jsx(Tooltip, { formatter: (v) => format(v) })] }) }) })] })] }), deptBar.some((d) => d.attendance > 0) && (_jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-2", children: _jsx(CardTitle, { className: "text-sm font-semibold", children: "Attendance rate by department" }) }), _jsx(CardContent, { children: _jsx("div", { className: "space-y-3", children: deptBar.map((d) => (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("p", { className: "w-28 shrink-0 text-sm truncate", children: d.name }), _jsx("div", { className: "flex-1", children: _jsx(Progress, { value: d.attendance, className: cn("h-2", d.attendance < 80 && "[&>div]:bg-amber-500", d.attendance < 60 && "[&>div]:bg-destructive") }) }), _jsx("span", { className: "w-12 text-right text-sm font-mono tabular-nums", children: d.attendance > 0 ? `${d.attendance}%` : "—" })] }, d.name))) }) })] }))] }));
}
function PayrollCharts() {
    const { format } = useCurrency();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await fetchNative("/api/powerbi/data/payroll-summary"));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    if (loading)
        return _jsx(ChartSkeleton, {});
    if (error)
        return _jsx(ChartError, { message: error, onRetry: load });
    if (!data || data.data.length === 0)
        return _jsx(EmptyState, { label: "No payroll records yet" });
    const rows = data.data;
    // Monthly totals
    const byPeriod = {};
    for (const r of rows) {
        const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
        if (!byPeriod[key])
            byPeriod[key] = { period: key, base: 0, bonus: 0, deductions: 0, net: 0, count: 0 };
        byPeriod[key].base += r.base_salary;
        byPeriod[key].bonus += r.bonus;
        byPeriod[key].deductions += r.deductions;
        byPeriod[key].net += r.net_salary;
        byPeriod[key].count++;
    }
    const periodData = Object.values(byPeriod).sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
    // By department
    const byDept = {};
    for (const r of rows) {
        if (!byDept[r.department])
            byDept[r.department] = { dept: r.department, net: 0, count: 0 };
        byDept[r.department].net += r.net_salary;
        byDept[r.department].count++;
    }
    const deptData = Object.values(byDept).sort((a, b) => b.net - a.net);
    const totalNet = rows.reduce((s, r) => s + r.net_salary, 0);
    const totalBonus = rows.reduce((s, r) => s + r.bonus, 0);
    const approvedCount = rows.filter((r) => r.status === "approved").length;
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4 sm:grid-cols-4", children: [_jsx(Kpi, { label: "Total records", value: String(rows.length) }), _jsx(Kpi, { label: "Approved", value: String(approvedCount), sub: `${Math.round(approvedCount / rows.length * 100)}% approved` }), _jsx(Kpi, { label: "Total net pay", value: format(totalNet, { compact: true }) }), _jsx(Kpi, { label: "Total bonuses", value: format(totalBonus, { compact: true }), trend: totalBonus > 0 ? "up" : null })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-3", children: [_jsxs(Card, { className: "lg:col-span-2", children: [_jsx(CardHeader, { className: "pb-2", children: _jsx(CardTitle, { className: "text-sm font-semibold", children: "Monthly payroll cost" }) }), _jsx(CardContent, { children: _jsx(ResponsiveContainer, { width: "100%", height: 220, children: _jsxs(AreaChart, { data: periodData, margin: { left: 0, right: 8, top: 4, bottom: 4 }, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "netGrad", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "#6366f1", stopOpacity: 0.3 }), _jsx("stop", { offset: "95%", stopColor: "#6366f1", stopOpacity: 0 })] }) }), _jsx(CartesianGrid, { strokeDasharray: "3 3", vertical: false }), _jsx(XAxis, { dataKey: "period", style: { fontSize: 10 } }), _jsx(YAxis, { tickFormatter: (v) => format(v, { compact: true }), style: { fontSize: 11 } }), _jsx(Tooltip, { formatter: (v) => format(v) }), _jsx(Legend, {}), _jsx(Area, { type: "monotone", dataKey: "net", name: "Net pay", stroke: "#6366f1", fill: "url(#netGrad)", strokeWidth: 2 }), _jsx(Area, { type: "monotone", dataKey: "bonus", name: "Bonus", stroke: "#22c55e", fill: "none", strokeWidth: 1.5, strokeDasharray: "4 2" })] }) }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-2", children: _jsx(CardTitle, { className: "text-sm font-semibold", children: "Net pay by department" }) }), _jsx(CardContent, { className: "space-y-3", children: deptData.map((d, i) => (_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between text-xs mb-1", children: [_jsx("span", { className: "truncate font-medium", children: d.dept }), _jsx("span", { className: "font-mono tabular-nums ml-2 shrink-0", children: format(d.net, { compact: true }) })] }), _jsx(Progress, { value: (d.net / deptData[0].net) * 100, className: "h-1.5", style: { "--progress-color": PALETTE[i % PALETTE.length] } })] }, d.dept))) })] })] })] }));
}
function SalesCharts() {
    const { format } = useCurrency();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await fetchNative("/api/powerbi/data/sales-overview"));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Failed");
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    if (loading)
        return _jsx(ChartSkeleton, {});
    if (error)
        return _jsx(ChartError, { message: error, onRetry: load });
    if (!data || data.monthly.length === 0)
        return _jsx(EmptyState, { label: "No sales data yet" });
    const rows = [...data.monthly].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
    const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
    const totalTx = rows.reduce((s, r) => s + r.transaction_count, 0);
    const avgRev = totalRev / Math.max(rows.length, 1);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4 sm:grid-cols-3", children: [_jsx(Kpi, { label: "Total revenue", value: format(totalRev, { compact: true }), trend: "up" }), _jsx(Kpi, { label: "Transactions", value: String(totalTx) }), _jsx(Kpi, { label: "Avg/month", value: format(avgRev, { compact: true }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-2", children: _jsx(CardTitle, { className: "text-sm font-semibold", children: "Revenue trend (last 12 months)" }) }), _jsx(CardContent, { children: _jsx(ResponsiveContainer, { width: "100%", height: 240, children: _jsxs(AreaChart, { data: rows, margin: { left: 0, right: 8, top: 4, bottom: 4 }, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "revGrad", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "#22c55e", stopOpacity: 0.3 }), _jsx("stop", { offset: "95%", stopColor: "#22c55e", stopOpacity: 0 })] }) }), _jsx(CartesianGrid, { strokeDasharray: "3 3", vertical: false }), _jsx(XAxis, { dataKey: "month", style: { fontSize: 10 } }), _jsx(YAxis, { tickFormatter: (v) => format(v, { compact: true }), style: { fontSize: 11 } }), _jsx(Tooltip, { formatter: (v) => format(v) }), _jsx(Legend, {}), _jsx(Area, { type: "monotone", dataKey: "revenue", name: "Revenue", stroke: "#22c55e", fill: "url(#revGrad)", strokeWidth: 2 }), _jsx(Area, { type: "monotone", dataKey: "expenses", name: "Expenses", stroke: "#ef4444", fill: "none", strokeWidth: 1.5 })] }) }) })] })] }));
}
/* ─── Shared states ──────────────────────────────────────────────────────────── */
function ChartSkeleton() {
    return _jsx("div", { className: "space-y-4 py-2", children: [1, 2, 3].map(i => _jsx(Skeleton, { className: "h-16 w-full rounded-xl" }, i)) });
}
function ChartError({ message, onRetry }) {
    return (_jsxs("div", { className: "flex flex-col items-center gap-3 py-10 text-center", children: [_jsx(AlertCircle, { className: "h-8 w-8 text-destructive" }), _jsx("p", { className: "text-sm text-muted-foreground", children: message }), _jsx(Button, { variant: "outline", size: "sm", onClick: onRetry, children: "Try again" })] }));
}
function EmptyState({ label }) {
    return (_jsxs("div", { className: "flex flex-col items-center gap-2 py-10 text-muted-foreground", children: [_jsx(BarChart3, { className: "h-8 w-8" }), _jsx("p", { className: "text-sm", children: label })] }));
}
const CHART_MAP = {
    inventory: InventoryCharts,
    hr: HRCharts,
    payroll: PayrollCharts,
    sales: SalesCharts,
};
export function ModuleAnalyticsPanel({ module, reportId, title, defaultTab = "charts", }) {
    const [open, setOpen] = useState(false);
    const { fetchEmbedToken, forceRefreshToken, getEmbedState } = usePowerBI();
    const embedState = getEmbedState(reportId);
    const NativeCharts = CHART_MAP[module] ?? null;
    const handlePbiTab = () => {
        if (embedState.status === "idle")
            fetchEmbedToken(reportId);
    };
    return (_jsxs(Card, { className: "border-border/60", children: [_jsx(CardHeader, { className: "cursor-pointer select-none pb-3", onClick: () => setOpen((v) => !v), children: _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(BarChart3, { className: "h-5 w-5 text-muted-foreground", "aria-hidden": true }), _jsx(CardTitle, { className: "text-base", children: title ?? "Analytics Dashboard" }), _jsx(Badge, { variant: "secondary", className: "text-xs capitalize", children: module })] }), _jsx(Button, { variant: "ghost", size: "sm", className: "h-7 w-7 p-0", "aria-label": open ? "Collapse" : "Expand", children: open ? _jsx(TrendingDown, { className: "h-4 w-4" }) : _jsx(TrendingUp, { className: "h-4 w-4" }) })] }) }), open && (_jsx(CardContent, { className: "pt-0", children: _jsxs(Tabs, { defaultValue: defaultTab, children: [_jsxs(TabsList, { className: "mb-4", children: [_jsx(TabsTrigger, { value: "charts", children: "\uD83D\uDCCA Native Charts" }), _jsxs(TabsTrigger, { value: "powerbi", onClick: handlePbiTab, children: [_jsx("span", { className: "mr-1.5", children: "\u26A1" }), "Power BI"] })] }), _jsx(TabsContent, { value: "charts", children: NativeCharts ? _jsx(NativeCharts, {}) : _jsx(EmptyState, { label: "No native charts for this module yet." }) }), _jsx(TabsContent, { value: "powerbi", children: embedState.status === "idle" || embedState.status === "loading" ? (_jsx(PowerBIEmbedLoading, { height: 480 })) : embedState.status === "unconfigured" ? (_jsx(PowerBIUnconfigured, { reportId: reportId, message: embedState.message })) : embedState.status === "error" ? (_jsx(PowerBIEmbedError, { message: embedState.message, onRetry: () => forceRefreshToken(reportId) })) : (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between text-xs text-muted-foreground", children: [_jsxs("span", { children: ["Token expires: ", _jsx("span", { className: "font-mono", children: new Date(embedState.config.expiry).toLocaleString() })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs(Button, { variant: "ghost", size: "sm", className: "h-7 gap-1 text-xs", onClick: () => forceRefreshToken(reportId), children: [_jsx(RefreshCw, { className: "h-3 w-3" }), " Refresh token"] }), _jsx(Button, { variant: "ghost", size: "sm", asChild: true, className: "h-7 gap-1 text-xs", children: _jsxs("a", { href: `https://app.powerbi.com/groups/${embedState.config.workspaceId}/reports/${embedState.config.reportId}`, target: "_blank", rel: "noreferrer", children: ["Open in Power BI ", _jsx(ExternalLink, { className: "h-3 w-3" })] }) })] })] }), _jsx(PowerBIEmbed, { label: title ?? module, config: embedState.config, height: 520 })] })) })] }) }))] }));
}
