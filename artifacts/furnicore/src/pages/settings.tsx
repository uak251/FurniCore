/**
 * Settings Page — FurniCore ERP
 *
 * Tabs:
 *  1. General      — Currency selector, date format
 *  2. Power BI     — Report status + setup guide
 *  3. Access Control — Per-user extra-module permission delegation (admin)
 *  4. About        — Version / env info
 */

import { useState, useEffect, useCallback } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Settings, Globe, BarChart3, ShieldCheck, Info,
  CheckCircle2, AlertCircle, ExternalLink, RefreshCw,
  DollarSign, Users, Loader2, ChevronDown, ChevronUp,
  Eye, EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken() ?? ""}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error((j as any)?.error ?? `HTTP ${res.status}`); }
  return res.json() as Promise<T>;
}

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface PbiReport {
  id: string; label: string; description: string; module: string; configured: boolean;
}
interface UserRow {
  id: number; name: string; email: string; role: string; isActive: boolean;
  permissions?: string[];
}

/* ─── Module permissions list (must match backend REPORT_META modules) ───────── */

const MODULE_PERMISSIONS = [
  { key: "accounting",  label: "Accounting / Finance",   color: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" },
  { key: "payroll",     label: "Payroll",                color: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300" },
  { key: "inventory",   label: "Inventory",              color: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300" },
  { key: "hr",          label: "HR / Employees",         color: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300" },
  { key: "sales",       label: "Sales / CRM",            color: "bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300" },
  { key: "reports",     label: "Reports & Analytics",    color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300" },
  { key: "settings",    label: "Settings",               color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
];

/* ════════════════════════════════════════════════════════════════════════════════
   TAB 1 — GENERAL
   ════════════════════════════════════════════════════════════════════════════════ */

function GeneralTab() {
  const { currency, setCurrency } = useCurrency();
  const { toast } = useToast();

  const handleCurrencyChange = (code: string) => {
    setCurrency(code);
    toast({ title: "Currency updated", description: `ERP now uses ${CURRENCIES.find((c) => c.code === code)?.label ?? code}` });
  };

  return (
    <div className="space-y-6">
      {/* Currency */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Currency</CardTitle>
          </div>
          <CardDescription>
            Applies to all monetary values across every ERP module — inventory costs, payroll, accounting, and invoices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-1.5 min-w-64">
              <Label htmlFor="currency-select">Active currency</Label>
              <Select value={currency.code} onValueChange={handleCurrencyChange}>
                <SelectTrigger id="currency-select" className="w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="font-mono mr-2 text-xs text-muted-foreground">{c.code}</span>
                      {c.symbol} — {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <div className="flex gap-3 text-sm font-mono">
                {[1, 1234.5, 1_000_000].map((n) => {
                  const def = CURRENCIES.find((c) => c.code === currency.code)!;
                  const fmt = new Intl.NumberFormat(def.locale, { style: "currency", currency: def.code, minimumFractionDigits: 2 });
                  return (
                    <span key={n} className="rounded-md border bg-muted/30 px-2 py-1">{fmt.format(n)}</span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p>Currency preference is saved in your browser (localStorage). Each user can set their own preferred currency independently. Exchange rate conversion is <strong>not</strong> applied — all amounts remain in their stored value and are formatted with the selected symbol/locale.</p>
          </div>
        </CardContent>
      </Card>

      {/* Currency grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All supported currencies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                onClick={() => handleCurrencyChange(c.code)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50",
                  currency.code === c.code && "border-primary bg-primary/5 font-medium",
                )}
              >
                <span className="text-base">{c.symbol}</span>
                <div>
                  <p className="font-mono text-xs font-semibold">{c.code}</p>
                  <p className="text-[11px] text-muted-foreground">{c.label}</p>
                </div>
                {currency.code === c.code && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════
   TAB 2 — POWER BI
   ════════════════════════════════════════════════════════════════════════════════ */

function PowerBITab() {
  const [reports, setReports] = useState<PbiReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const json = await apiFetch<{ reports: PbiReport[] }>("/api/powerbi/reports");
      setReports(json.reports);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const configured   = reports.filter((r) => r.configured);
  const unconfigured = reports.filter((r) => !r.configured);

  return (
    <div className="space-y-6">
      {/* Status overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Power BI Integration</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={fetchReports} disabled={loading}>
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
          <CardDescription>
            Per-module embedded reports from Microsoft Power BI. Each report requires an Azure AD service principal and environment variables.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i=><Skeleton key={i} className="h-10 w-full"/>)}</div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary badges */}
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />{configured.length} configured
                </Badge>
                <Badge variant="outline" className="text-muted-foreground">
                  <AlertCircle className="mr-1 h-3.5 w-3.5" />{unconfigured.length} not configured
                </Badge>
              </div>

              {/* Report list */}
              <div className="space-y-2">
                {reports.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{r.label}</p>
                        <Badge variant="outline" className="text-[10px]">{r.module}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.description}</p>
                    </div>
                    <Badge className={r.configured
                      ? "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300 shrink-0"
                      : "bg-muted text-muted-foreground shrink-0"
                    }>
                      {r.configured ? "Active" : "Not set"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup guide */}
      <Card className="border-dashed">
        <CardHeader>
          <button
            onClick={() => setShowGuide((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              Power BI Setup Guide
            </CardTitle>
            {showGuide ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CardHeader>
        {showGuide && (
          <CardContent className="space-y-5">
            <ol className="space-y-4">
              {[
                { step: "1", title: "Register Azure AD app", detail: "Azure Portal → App registrations → New registration. Grant Power BI Service → Report.ReadAll (Application) and admin-consent." },
                { step: "2", title: "Add service principal to workspace", detail: 'Power BI Service → workspace → Settings → Access → add the app as "Member".' },
                { step: "3", title: "Publish reports", detail: "Build in Power BI Desktop (DirectQuery or Import from PostgreSQL). Publish to the workspace. Copy each report ID from the URL." },
                { step: "4", title: "Set .env variables", detail: "Add the variables below to your root .env and restart the API server." },
              ].map((s) => (
                <li key={s.step} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{s.step}</span>
                  <div>
                    <p className="font-medium">{s.title}</p>
                    <p className="text-muted-foreground mt-0.5">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="rounded-md bg-muted p-4 font-mono text-xs leading-6">
              <p className="mb-1 font-semibold text-foreground">.env (root)</p>
              <pre className="whitespace-pre-wrap text-muted-foreground">{`POWERBI_TENANT_ID=<azure-tenant-id>
POWERBI_CLIENT_ID=<app-client-id>
POWERBI_CLIENT_SECRET=<app-client-secret>
POWERBI_WORKSPACE_ID=<workspace-group-id>

# Report IDs (from Power BI URL)
POWERBI_REPORT_SUPPLIER_LEDGER=<report-id>
POWERBI_REPORT_EXPENSE_INCOME=<report-id>
POWERBI_REPORT_TRIAL_BALANCE=<report-id>
POWERBI_REPORT_PAYROLL_SUMMARY=<report-id>
POWERBI_REPORT_PROFIT_MARGIN=<report-id>
POWERBI_REPORT_INVENTORY_ANALYSIS=<report-id>
POWERBI_REPORT_HR_DASHBOARD=<report-id>
POWERBI_REPORT_SALES_OVERVIEW=<report-id>`}</pre>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" size="sm" asChild>
                <a href="https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-service-principal" target="_blank" rel="noreferrer">
                  Docs <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="https://app.powerbi.com" target="_blank" rel="noreferrer">
                  Power BI Service <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════
   TAB 3 — ACCESS CONTROL (role & permission delegation)
   ════════════════════════════════════════════════════════════════════════════════ */

interface UserPerms extends UserRow { permissions: string[]; loading: boolean; }

function AccessControlTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserPerms[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showInactive, setShowInactive] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const all = await apiFetch<UserRow[]>("/api/users");
      const withPerms = await Promise.all(all.map(async (u) => {
        try {
          const p = await apiFetch<{ permissions: string[] }>(`/api/users/${u.id}/permissions`);
          return { ...u, permissions: p.permissions, loading: false };
        } catch { return { ...u, permissions: [], loading: false }; }
      }));
      setUsers(withPerms);
    } catch { /* swallowed */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleModule = async (userId: number, module: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const had = user.permissions.includes(module);
    const next = had ? user.permissions.filter((p) => p !== module) : [...user.permissions, module];
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, permissions: next } : u));
    try {
      await apiFetch(`/api/users/${userId}/permissions`, { method: "PATCH", body: JSON.stringify({ permissions: next }) });
      toast({ title: had ? "Permission removed" : "Permission granted", description: `${user.name} — ${MODULE_PERMISSIONS.find((m) => m.key === module)?.label ?? module}` });
    } catch (e: unknown) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, permissions: user.permissions } : u));
      toast({ variant: "destructive", title: "Error", description: e instanceof Error ? e.message : "Failed to update permissions" });
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const visible = users.filter((u) => {
    if (!showInactive && !u.isActive) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.includes(q);
    }
    return true;
  });

  const ROLE_COLORS: Record<string, string> = {
    admin:            "bg-red-100 text-red-800",
    manager:          "bg-orange-100 text-orange-800",
    accountant:       "bg-yellow-100 text-yellow-800",
    inventory_manager:"bg-blue-100 text-blue-800",
    sales_manager:    "bg-purple-100 text-purple-800",
    worker:           "bg-green-100 text-green-800",
    customer:         "bg-slate-100 text-slate-700",
    supplier:         "bg-teal-100 text-teal-800",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Role & Permission Delegation</CardTitle>
          </div>
          <CardDescription>
            Grant employees access to additional ERP modules beyond their primary role. Changes take effect immediately — no restart required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="h-9 flex-1 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-w-52"
              placeholder="Search by name, email, or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
              <Label htmlFor="show-inactive" className="text-sm">Show inactive</Label>
            </div>
            <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
              Reload
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">{[1,2,3,4].map(i=><Skeleton key={i} className="h-14 w-full"/>)}</div>
          ) : visible.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-2 h-8 w-8" />
              No users match your filter.
            </div>
          ) : (
            <div className="rounded-md border divide-y">
              {visible.map((user) => {
                const isOpen = expanded.has(user.id);
                return (
                  <div key={user.id} className={cn(!user.isActive && "opacity-60")}>
                    {/* User row */}
                    <button
                      onClick={() => toggleExpand(user.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium truncate">{user.name}</p>
                          <Badge className={cn("text-[10px] px-1.5", ROLE_COLORS[user.role] ?? "bg-muted text-muted-foreground")}>
                            {user.role}
                          </Badge>
                          {!user.isActive && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {user.permissions.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            +{user.permissions.length} module{user.permissions.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                        {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {/* Permission matrix */}
                    {isOpen && (
                      <div className="border-t bg-muted/20 px-4 py-4">
                        <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Extra module access</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {MODULE_PERMISSIONS.map((mod) => {
                            const active = user.permissions.includes(mod.key);
                            return (
                              <label
                                key={mod.key}
                                className={cn(
                                  "flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors",
                                  active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                                )}
                              >
                                <Switch
                                  checked={active}
                                  onCheckedChange={() => toggleModule(user.id, mod.key)}
                                  className="shrink-0"
                                />
                                <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", mod.color)}>
                                  {mod.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="mt-3 text-[11px] text-muted-foreground">
                          These are <em>additive</em> permissions — they extend the user's primary role, they do not replace it. Admins retain full access regardless.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════
   TAB 4 — ABOUT
   ════════════════════════════════════════════════════════════════════════════════ */

function AboutTab() {
  return (
    <div className="space-y-4 max-w-xl">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-bold text-lg">FurniCore ERP</p>
              <p className="text-sm text-muted-foreground">Production-ready furniture ERP system</p>
            </div>
          </div>
          <Separator />
          <dl className="space-y-2 text-sm">
            {[
              ["Stack",    "React 18 · Express 5 · Drizzle ORM · PostgreSQL"],
              ["Auth",     "JWT access tokens · Email verification · RBAC"],
              ["Analytics","Power BI embedded (App-owns-data) · Native recharts"],
              ["Bulk ops", "CSV import/export for Inventory, Products, Employees, Payroll"],
              ["Version",  "1.0.0 (monorepo)"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-24 shrink-0 font-medium text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <Separator />
          <p className="text-xs text-muted-foreground">
            Built with ❤️ in a pnpm monorepo. Schema managed by Drizzle Kit + PostgreSQL on Supabase.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════════════ */

export default function SettingsPage() {
  const { data: me } = useGetCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure currency, Power BI reports, and manage team permissions.
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="general"  className="gap-1.5"><Globe    className="h-4 w-4" /> General</TabsTrigger>
          <TabsTrigger value="powerbi"  className="gap-1.5"><BarChart3 className="h-4 w-4" /> Power BI</TabsTrigger>
          {me?.role === "admin" && (
            <TabsTrigger value="access" className="gap-1.5"><ShieldCheck className="h-4 w-4" /> Access Control</TabsTrigger>
          )}
          <TabsTrigger value="about"    className="gap-1.5"><Info     className="h-4 w-4" /> About</TabsTrigger>
        </TabsList>

        <TabsContent value="general"  className="mt-6"><GeneralTab /></TabsContent>
        <TabsContent value="powerbi"  className="mt-6"><PowerBITab /></TabsContent>
        {me?.role === "admin" && (
          <TabsContent value="access" className="mt-6"><AccessControlTab /></TabsContent>
        )}
        <TabsContent value="about"    className="mt-6"><AboutTab /></TabsContent>
      </Tabs>
    </div>
  );
}
