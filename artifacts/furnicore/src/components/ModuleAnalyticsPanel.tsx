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
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, RefreshCw, ExternalLink, AlertCircle,
  TrendingUp, TrendingDown, Loader2, Settings,
} from "lucide-react";
import { usePowerBI } from "@/hooks/use-powerbi";
import { PowerBIEmbed, PowerBIEmbedLoading, PowerBIUnconfigured, PowerBIEmbedError } from "@/components/PowerBIEmbed";
import { useCurrency } from "@/lib/currency";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

async function fetchNative<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/* ─── Colour palette ─────────────────────────────────────────────────────────── */

const PALETTE = [
  "#6366f1","#22c55e","#f59e0b","#ef4444","#3b82f6","#a855f7","#14b8a6","#f97316",
];

/* ─── KPI mini-card ──────────────────────────────────────────────────────────── */

function Kpi({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: "up" | "down" | null }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {trend === "up"   && <TrendingUp   className="h-4 w-4 text-green-500" />}
        {trend === "down" && <TrendingDown className="h-4 w-4 text-red-500" />}
      </div>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   INVENTORY CHARTS
   ═══════════════════════════════════════════════════════════════════════════════ */

interface InvData {
  items: Array<{ id: number; name: string; type: string; quantity: number; reorder_level: number; unit_cost: number; total_value: number; is_low_stock: boolean; supplier_name: string | null; }>;
  summary: { totalItems: number; lowStockCount: number; totalValue: number; byType: Record<string, { count: number; value: number }>; };
}

function InventoryCharts() {
  const { format } = useCurrency();
  const [data, setData] = useState<InvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchNative<InvData>("/api/powerbi/data/inventory-analysis")); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ChartSkeleton />;
  if (error)   return <ChartError message={error} onRetry={load} />;
  if (!data)   return null;

  const { summary, items } = data;

  // Top 15 items by total value for bar chart
  const topItems = [...items].sort((a, b) => b.total_value - a.total_value).slice(0, 15).map((i) => ({
    name:        i.name.length > 18 ? i.name.slice(0, 17) + "…" : i.name,
    value:       i.total_value,
    quantity:    i.quantity,
    reorder:     i.reorder_level,
    isLow:       i.is_low_stock,
  }));

  // Type breakdown pie
  const typeData = Object.entries(summary.byType).map(([t, v]) => ({
    name:  t.replace(/_/g, " "),
    value: v.count,
    val:   v.value,
  }));

  // Low stock items
  const lowItems = items.filter((i) => i.is_low_stock).slice(0, 8);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Total items"     value={String(summary.totalItems)} />
        <Kpi label="Low stock"       value={String(summary.lowStockCount)} sub={summary.lowStockCount > 0 ? "Reorder needed" : "All OK"} trend={summary.lowStockCount > 0 ? "down" : null} />
        <Kpi label="Portfolio value" value={format(summary.totalValue, { compact: true })} />
        <Kpi label="Types"           value={String(Object.keys(summary.byType).length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stock value bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top items by stock value</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topItems} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => format(v, { compact: true })} style={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={130} style={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => format(v)} />
                <Bar dataKey="value" name="Stock value" radius={[0, 4, 4, 0]}>
                  {topItems.map((item, i) => (
                    <Cell key={i} fill={item.isLow ? "#ef4444" : "#6366f1"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground mt-1 text-center">Red = below reorder level</p>
          </CardContent>
        </Card>

        {/* Type pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">By type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                  {typeData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number, name: string, props: any) => [v, name]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Low stock table */}
      {lowItems.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" /> {lowItems.length} items below reorder level
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Supplier: {item.supplier_name ?? "—"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono text-destructive font-semibold">{item.quantity} left</p>
                    <p className="text-[10px] text-muted-foreground">reorder at {item.reorder_level}</p>
                  </div>
                  <div className="w-24">
                    <Progress value={Math.min((item.quantity / Math.max(item.reorder_level, 1)) * 100, 100)} className="h-1.5 [&>div]:bg-destructive" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   HR CHARTS
   ═══════════════════════════════════════════════════════════════════════════════ */

interface HRData {
  summary: { totalEmployees: number; activeEmployees: number; departments: number; totalPayroll: number };
  departments: Array<{ department: string; headcount: number; active: number; avgSalary: number; attendanceRate: number | null; avgReviewRating: number | null }>;
  attendance: Array<{ department: string; total_records: number; present: number; absent: number; late: number; half_day: number }>;
}

function HRCharts() {
  const { format } = useCurrency();
  const [data, setData] = useState<HRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchNative<HRData>("/api/powerbi/data/hr-dashboard")); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ChartSkeleton />;
  if (error)   return <ChartError message={error} onRetry={load} />;
  if (!data)   return null;

  const { summary, departments } = data;

  const deptBar = departments.map((d) => ({
    name:        d.department.length > 16 ? d.department.slice(0, 15) + "…" : d.department,
    active:      d.active,
    inactive:    d.headcount - d.active,
    avgSalary:   d.avgSalary,
    attendance:  d.attendanceRate ?? 0,
  }));

  const salaryPie = departments.map((d) => ({
    name:  d.department,
    value: +(d.avgSalary * d.headcount).toFixed(0),
  }));

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Total employees" value={String(summary.totalEmployees)} />
        <Kpi label="Active"          value={String(summary.activeEmployees)} sub={`${Math.round(summary.activeEmployees/Math.max(summary.totalEmployees,1)*100)}% active`} />
        <Kpi label="Departments"     value={String(summary.departments)} />
        <Kpi label="Annual payroll"  value={format(summary.totalPayroll, { compact: true })} sub="Sum of base salaries" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Headcount bar */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Headcount by department</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={deptBar} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" style={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} style={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="active"   name="Active"   stackId="a" fill="#22c55e" radius={[0,0,0,0]} />
                <Bar dataKey="inactive" name="Inactive" stackId="a" fill="#e5e7eb" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payroll pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Payroll by dept</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={salaryPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ percent }) => `${(percent*100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                  {salaryPie.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => format(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Attendance rate */}
      {deptBar.some((d) => d.attendance > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Attendance rate by department</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {deptBar.map((d) => (
                <div key={d.name} className="flex items-center gap-3">
                  <p className="w-28 shrink-0 text-sm truncate">{d.name}</p>
                  <div className="flex-1">
                    <Progress value={d.attendance} className={cn("h-2", d.attendance < 80 && "[&>div]:bg-amber-500", d.attendance < 60 && "[&>div]:bg-destructive")} />
                  </div>
                  <span className="w-12 text-right text-sm font-mono tabular-nums">{d.attendance > 0 ? `${d.attendance}%` : "—"}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PAYROLL CHARTS
   ═══════════════════════════════════════════════════════════════════════════════ */

interface PayrollData {
  data: Array<{ payroll_id: number; year: number; month: number; status: string; base_salary: number; bonus: number; deductions: number; net_salary: number; employee_name: string; department: string }>;
}

function PayrollCharts() {
  const { format } = useCurrency();
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchNative<PayrollData>("/api/powerbi/data/payroll-summary")); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ChartSkeleton />;
  if (error)   return <ChartError message={error} onRetry={load} />;
  if (!data || data.data.length === 0) return <EmptyState label="No payroll records yet" />;

  const rows = data.data;

  // Monthly totals
  const byPeriod: Record<string, { period: string; base: number; bonus: number; deductions: number; net: number; count: number }> = {};
  for (const r of rows) {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    if (!byPeriod[key]) byPeriod[key] = { period: key, base: 0, bonus: 0, deductions: 0, net: 0, count: 0 };
    byPeriod[key].base       += r.base_salary;
    byPeriod[key].bonus      += r.bonus;
    byPeriod[key].deductions += r.deductions;
    byPeriod[key].net        += r.net_salary;
    byPeriod[key].count++;
  }
  const periodData = Object.values(byPeriod).sort((a, b) => a.period.localeCompare(b.period)).slice(-12);

  // By department
  const byDept: Record<string, { dept: string; net: number; count: number }> = {};
  for (const r of rows) {
    if (!byDept[r.department]) byDept[r.department] = { dept: r.department, net: 0, count: 0 };
    byDept[r.department].net   += r.net_salary;
    byDept[r.department].count++;
  }
  const deptData = Object.values(byDept).sort((a, b) => b.net - a.net);

  const totalNet     = rows.reduce((s, r) => s + r.net_salary, 0);
  const totalBonus   = rows.reduce((s, r) => s + r.bonus, 0);
  const approvedCount = rows.filter((r) => r.status === "approved").length;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Total records" value={String(rows.length)} />
        <Kpi label="Approved"      value={String(approvedCount)} sub={`${Math.round(approvedCount/rows.length*100)}% approved`} />
        <Kpi label="Total net pay" value={format(totalNet, { compact: true })} />
        <Kpi label="Total bonuses" value={format(totalBonus, { compact: true })} trend={totalBonus > 0 ? "up" : null} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly area chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Monthly payroll cost</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={periodData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" style={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => format(v, { compact: true })} style={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => format(v)} />
                <Legend />
                <Area type="monotone" dataKey="net"  name="Net pay"    stroke="#6366f1" fill="url(#netGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="bonus" name="Bonus"     stroke="#22c55e" fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By dept */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Net pay by department</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {deptData.map((d, i) => (
              <div key={d.dept}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="truncate font-medium">{d.dept}</span>
                  <span className="font-mono tabular-nums ml-2 shrink-0">{format(d.net, { compact: true })}</span>
                </div>
                <Progress value={(d.net / deptData[0].net) * 100} className="h-1.5" style={{ "--progress-color": PALETTE[i % PALETTE.length] } as React.CSSProperties} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SALES CHARTS
   ═══════════════════════════════════════════════════════════════════════════════ */

interface SalesData { monthly: Array<{ month: string; transaction_count: number; revenue: number; expenses: number; pending_count: number }> }

function SalesCharts() {
  const { format } = useCurrency();
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchNative<SalesData>("/api/powerbi/data/sales-overview")); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ChartSkeleton />;
  if (error)   return <ChartError message={error} onRetry={load} />;
  if (!data || data.monthly.length === 0) return <EmptyState label="No sales data yet" />;

  const rows = [...data.monthly].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  const totalTx  = rows.reduce((s, r) => s + r.transaction_count, 0);
  const avgRev   = totalRev / Math.max(rows.length, 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi label="Total revenue"   value={format(totalRev, { compact: true })} trend="up" />
        <Kpi label="Transactions"    value={String(totalTx)} />
        <Kpi label="Avg/month"       value={format(avgRev, { compact: true })} />
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Revenue trend (last 12 months)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={rows} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" style={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => format(v, { compact: true })} style={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => format(v)} />
              <Legend />
              <Area type="monotone" dataKey="revenue"  name="Revenue"  stroke="#22c55e" fill="url(#revGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fill="none" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Shared states ──────────────────────────────────────────────────────────── */

function ChartSkeleton() {
  return <div className="space-y-4 py-2">{[1,2,3].map(i=><Skeleton key={i} className="h-16 w-full rounded-xl"/>)}</div>;
}
function ChartError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>
    </div>
  );
}
function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
      <BarChart3 className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════ */

type SupportedModule = "inventory" | "hr" | "payroll" | "sales";

const CHART_MAP: Record<SupportedModule, React.ComponentType> = {
  inventory: InventoryCharts,
  hr:        HRCharts,
  payroll:   PayrollCharts,
  sales:     SalesCharts,
};

interface ModuleAnalyticsPanelProps {
  module:    SupportedModule;
  reportId:  string;
  title?:    string;
  /** Initial tab ("charts" | "powerbi"), default: "charts" */
  defaultTab?: "charts" | "powerbi";
}

export function ModuleAnalyticsPanel({
  module,
  reportId,
  title,
  defaultTab = "charts",
}: ModuleAnalyticsPanelProps) {
  const [open, setOpen] = useState(false);
  const { fetchEmbedToken, forceRefreshToken, getEmbedState } = usePowerBI();
  const embedState = getEmbedState(reportId);

  const NativeCharts = CHART_MAP[module] ?? null;

  const handlePbiTab = () => {
    if (embedState.status === "idle") fetchEmbedToken(reportId);
  };

  return (
    <Card className="border-border/60">
      <CardHeader
        className="cursor-pointer select-none pb-3"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">{title ?? "Analytics Dashboard"}</CardTitle>
            <Badge variant="secondary" className="text-xs capitalize">{module}</Badge>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={open ? "Collapse" : "Expand"}>
            {open ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="pt-0">
          <Tabs defaultValue={defaultTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="charts">📊 Native Charts</TabsTrigger>
              <TabsTrigger value="powerbi" onClick={handlePbiTab}>
                <span className="mr-1.5">⚡</span>Power BI
              </TabsTrigger>
            </TabsList>

            <TabsContent value="charts">
              {NativeCharts ? <NativeCharts /> : <EmptyState label="No native charts for this module yet." />}
            </TabsContent>

            <TabsContent value="powerbi">
              {embedState.status === "idle" || embedState.status === "loading" ? (
                <PowerBIEmbedLoading height={480} />
              ) : embedState.status === "unconfigured" ? (
                <PowerBIUnconfigured reportId={reportId} message={embedState.message} />
              ) : embedState.status === "error" ? (
                <PowerBIEmbedError message={embedState.message} onRetry={() => forceRefreshToken(reportId)} />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Token expires: <span className="font-mono">{new Date(embedState.config.expiry).toLocaleString()}</span></span>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => forceRefreshToken(reportId)}>
                        <RefreshCw className="h-3 w-3" /> Refresh token
                      </Button>
                      <Button variant="ghost" size="sm" asChild className="h-7 gap-1 text-xs">
                        <a href={`https://app.powerbi.com/groups/${embedState.config.workspaceId}/reports/${embedState.config.reportId}`} target="_blank" rel="noreferrer">
                          Open in Power BI <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </div>
                  <PowerBIEmbed label={title ?? module} config={embedState.config} height={520} />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
