/**
 * Settings Page — FurniCore ERP
 *
 * Tabs:
 *  1. General      — Currency selector, date format
 *  2. Power BI     — Report status + setup guide
 *  3. Access Control — Per-user extra-module permission delegation (admin)
 *  4. Portal themes — Default dashboard theme per role (admin)
 *  5. About        — Version / env info
 */

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentUser,
  useGetDashboardThemeCatalog,
  useGetDashboardThemeDefaults,
  usePutDashboardThemeDefaults,
  getGetDashboardThemeDefaultsQueryKey,
  type DashboardThemeInfo,
} from "@workspace/api-client-react";
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
  Settings, Globe, BarChart3, ShieldCheck, Info, Palette,
  CheckCircle2, AlertCircle, ExternalLink, RefreshCw,
  DollarSign, Users, Loader2, ChevronDown, ChevronUp,
  Eye, EyeOff, Save, KeyRound,
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
   TAB 2 — POWER BI (with editable credential fields)
   ════════════════════════════════════════════════════════════════════════════════ */

interface StoredSetting {
  key: string; value: string; rawValue: string | null;
  source: "db" | "env" | "unset"; isSecret: boolean; isSet: boolean;
}

const PBI_CREDENTIAL_KEYS = [
  { key: "POWERBI_TENANT_ID",    label: "Tenant ID",       hint: "Azure AD tenant ID (UUID)" },
  { key: "POWERBI_CLIENT_ID",    label: "Client ID",       hint: "Azure AD app client ID (UUID)" },
  { key: "POWERBI_CLIENT_SECRET",label: "Client Secret",   hint: "Azure AD app client secret (sensitive)", secret: true },
  { key: "POWERBI_WORKSPACE_ID", label: "Workspace ID",    hint: "Power BI workspace group ID (UUID)" },
];

const PBI_REPORT_KEYS = [
  { key: "POWERBI_REPORT_SUPPLIER_LEDGER",    label: "Supplier Ledger report ID" },
  { key: "POWERBI_REPORT_EXPENSE_INCOME",     label: "Expense vs Income report ID" },
  { key: "POWERBI_REPORT_TRIAL_BALANCE",      label: "Trial Balance report ID" },
  { key: "POWERBI_REPORT_PAYROLL_SUMMARY",    label: "Payroll Summary report ID" },
  { key: "POWERBI_REPORT_PROFIT_MARGIN",      label: "Profit & Loss report ID" },
  { key: "POWERBI_REPORT_INVENTORY_ANALYSIS", label: "Inventory Analysis report ID" },
  { key: "POWERBI_REPORT_HR_DASHBOARD",       label: "HR Dashboard report ID" },
  { key: "POWERBI_REPORT_SALES_OVERVIEW",     label: "Sales Overview report ID" },
];

interface SettingFieldProps {
  k: string; label: string; hint?: string; secret?: boolean;
  value: string;
  onChange: (key: string, val: string) => void;
  stored: StoredSetting | undefined;
  revealed: boolean;
  onToggleReveal: (key: string) => void;
  onClear: (key: string) => void;
}

function SettingField({ k, label, hint, secret, value, onChange, stored, revealed, onToggleReveal, onClear }: SettingFieldProps) {
  const isSet  = stored?.isSet ?? false;
  const source = stored?.source ?? "unset";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={k} className="text-sm font-medium">{label}</Label>
        <div className="flex items-center gap-1.5">
          {source === "db"    && <Badge className="text-[10px] bg-green-100 text-green-800">DB</Badge>}
          {source === "env"   && <Badge variant="outline" className="text-[10px]">ENV</Badge>}
          {source === "unset" && <Badge variant="outline" className="text-[10px] text-muted-foreground">Not set</Badge>}
          {isSet && source === "db" && (
            <button onClick={() => onClear(k)} className="text-[10px] text-destructive hover:underline">clear</button>
          )}
        </div>
      </div>
      <div className="relative">
        <input
          id={k}
          type={secret && !revealed ? "password" : "text"}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono pr-9 focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          placeholder={isSet ? (secret ? "•••• (saved — enter new value to update)" : "Saved in DB") : hint}
          value={value}
          onChange={(e) => onChange(k, e.target.value)}
        />
        {secret && (
          <button type="button" onClick={() => onToggleReveal(k)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && !secret && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PowerBITab() {
  const { toast } = useToast();
  const [reports,  setReports]  = useState<PbiReport[]>([]);
  const [settings, setSettings] = useState<StoredSetting[]>([]);
  const [values,   setValues]   = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rJson, sJson] = await Promise.all([
        apiFetch<{ reports: PbiReport[] }>("/api/powerbi/reports").catch(() => ({ reports: [] as PbiReport[] })),
        apiFetch<{ settings: StoredSetting[] }>("/api/settings"),
      ]);
      setReports(rJson.reports);
      setSettings(sJson.settings);
      // Pre-fill non-secret fields with their raw values
      const prefill: Record<string, string> = {};
      for (const s of sJson.settings) {
        prefill[s.key] = s.isSecret ? "" : (s.rawValue ?? "");
      }
      setValues(prefill);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Failed to load settings", description: e instanceof Error ? e.message : String(e) });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleReveal = (key: string) =>
    setRevealed((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const handleSave = async () => {
    setSaving(true);
    try {
      // Only send keys that have a value
      const toSave: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v.trim()) toSave[k] = v.trim();
      }
      if (Object.keys(toSave).length === 0) {
        toast({ title: "Nothing to save", description: "Fill in at least one field." });
        setSaving(false);
        return;
      }
      await apiFetch("/api/settings/bulk", { method: "POST", body: JSON.stringify({ settings: toSave }) });
      toast({ title: "Settings saved", description: `${Object.keys(toSave).length} Power BI setting(s) updated. Tokens will refresh automatically.` });
      await loadAll();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Save failed", description: e instanceof Error ? e.message : String(e) });
    } finally { setSaving(false); }
  };

  const clearSetting = async (key: string) => {
    try {
      await apiFetch(`/api/settings/${key}`, { method: "DELETE" });
      toast({ title: "Setting cleared", description: `${key} removed from DB (env var fallback active if set).` });
      setValues((v) => ({ ...v, [key]: "" }));
      await loadAll();
    } catch { /* swallowed */ }
  };

  const configured   = reports.filter((r) => r.configured).length;
  const unconfigured = reports.filter((r) => !r.configured).length;

  function SettingField({ k, label, hint, secret }: { k: string; label: string; hint?: string; secret?: boolean }) {
    const stored   = settings.find((s) => s.key === k);
    const isSet    = stored?.isSet ?? false;
    const source   = stored?.source ?? "unset";
    const isRev    = revealed.has(k);

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={k} className="text-sm font-medium">{label}</Label>
          <div className="flex items-center gap-1.5">
            {source === "db"  && <Badge className="text-[10px] bg-green-100 text-green-800">DB</Badge>}
            {source === "env" && <Badge variant="outline" className="text-[10px]">ENV</Badge>}
            {source === "unset" && <Badge variant="outline" className="text-[10px] text-muted-foreground">Not set</Badge>}
            {isSet && source === "db" && (
              <button onClick={() => clearSetting(k)} className="text-[10px] text-destructive hover:underline">clear</button>
            )}
          </div>
        </div>
        <div className="relative">
          <input
            id={k}
            type={secret && !isRev ? "password" : "text"}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono pr-9 focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            placeholder={isSet ? (secret ? "•••• (saved — enter new value to update)" : "Saved in DB") : hint}
            value={values[k] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
          />
          {secret && (
            <button type="button" onClick={() => toggleReveal(k)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {isRev ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {hint && !secret && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Report status banner */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Power BI Integration</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i=><Skeleton key={i} className="h-10 w-full"/>)}</div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />{configured} report{configured !== 1 ? "s" : ""} configured
                </Badge>
                <Badge variant="outline" className="text-muted-foreground">
                  <AlertCircle className="mr-1 h-3.5 w-3.5" />{unconfigured} not configured
                </Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {reports.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{r.label}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{r.module}</p>
                    </div>
                    <Badge className={r.configured
                      ? "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300"
                      : "bg-muted text-muted-foreground"
                    }>{r.configured ? "Active" : "Not set"}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credential editor */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Azure AD Credentials</CardTitle>
          </div>
          <CardDescription>
            Stored securely in the database. Values entered here override .env variables. Leave blank to keep the existing saved value or use the .env fallback.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {PBI_CREDENTIAL_KEYS.map(({ key: k, label, hint, secret }) => (
              <SettingField
                key={k} k={k} label={label} hint={hint} secret={!!secret}
                value={values[k] ?? ""}
                onChange={(key, val) => setValues((v) => ({ ...v, [key]: val }))}
                stored={settings.find((s) => s.key === k)}
                revealed={revealed.has(k)}
                onToggleReveal={toggleReveal}
                onClear={clearSetting}
              />
            ))}
          </div>
          <Separator />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Report IDs</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PBI_REPORT_KEYS.map(({ key: k, label }) => (
              <SettingField
                key={k} k={k} label={label} hint="UUID from Power BI report URL" secret={false}
                value={values[k] ?? ""}
                onChange={(key, val) => setValues((v) => ({ ...v, [key]: val }))}
                stored={settings.find((s) => s.key === k)}
                revealed={revealed.has(k)}
                onToggleReveal={toggleReveal}
                onClear={clearSetting}
              />
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-xs text-muted-foreground">Changes are applied immediately — no server restart required.</p>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Setup guide */}
      <Card className="border-dashed">
        <CardHeader>
          <button onClick={() => setShowGuide((v) => !v)} className="flex w-full items-center justify-between text-left">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" /> Power BI Setup Guide
            </CardTitle>
            {showGuide ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CardHeader>
        {showGuide && (
          <CardContent className="space-y-4">
            <ol className="space-y-4">
              {[
                { step: "1", title: "Register Azure AD app", detail: "Azure Portal → App registrations → New registration. Grant Power BI Service → Report.ReadAll (Application) and admin-consent." },
                { step: "2", title: "Add service principal to workspace", detail: 'Power BI Service → workspace → Settings → Access → add the app as "Member".' },
                { step: "3", title: "Build & publish reports", detail: "Build in Power BI Desktop connecting to your PostgreSQL (DirectQuery or import). Publish to the workspace. Copy the report ID from the URL (the GUID after /reports/)." },
                { step: "4", title: "Enter credentials above", detail: 'Fill in the Azure AD credentials and report IDs in the form above, then click "Save settings". No restart required.' },
              ].map((s) => (
                <li key={s.step} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{s.step}</span>
                  <div><p className="font-medium">{s.title}</p><p className="text-muted-foreground mt-0.5">{s.detail}</p></div>
                </li>
              ))}
            </ol>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" asChild>
                <a href="https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-service-principal" target="_blank" rel="noreferrer">Docs <ExternalLink className="ml-1 h-3 w-3" /></a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="https://app.powerbi.com" target="_blank" rel="noreferrer">Power BI Service <ExternalLink className="ml-1 h-3 w-3" /></a>
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
   TAB — PORTAL THEME DEFAULTS (admin only, RBAC on API)
   ════════════════════════════════════════════════════════════════════════════════ */

const PORTAL_THEME_ROLES: { key: string; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "manager", label: "Production / operations (manager)" },
  { key: "accountant", label: "Accountant" },
  { key: "employee", label: "Inventory & staff (employee)" },
  { key: "sales_manager", label: "Sales manager" },
  { key: "supplier", label: "Supplier portal" },
  { key: "worker", label: "Worker portal" },
  { key: "customer", label: "Customer portal" },
];

function PortalThemesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: catalog, isLoading: catLoading } = useGetDashboardThemeCatalog();
  const { data: defRes, isLoading: defLoading } = useGetDashboardThemeDefaults();
  const putDefaults = usePutDashboardThemeDefaults();
  const themes = catalog?.themes ?? [];
  const defaults = defRes?.defaults ?? {};

  const [local, setLocal] = useState<Record<string, string>>({});

  useEffect(() => {
    if (defRes?.defaults) setLocal({ ...defRes.defaults });
  }, [defRes?.defaults]);

  const handleSave = async () => {
    try {
      await putDefaults.mutateAsync({ data: { defaults: local } });
      await qc.invalidateQueries({ queryKey: getGetDashboardThemeDefaultsQueryKey() });
      toast({ title: "Portal themes updated", description: "Defaults apply when users clear personal overrides." });
    } catch (e: unknown) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const baseline = defRes?.defaults as Record<string, string> | undefined;
  const dirty =
    !!baseline &&
    PORTAL_THEME_ROLES.some((r) => (local[r.key] ?? baseline[r.key]) !== baseline[r.key]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Default dashboard theme per portal</CardTitle>
          </div>
          <CardDescription>
            When a user has not set a personal theme, these defaults apply by role. Individual users can still
            override from the header palette or Appearance page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(catLoading || defLoading) && (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          <div className="space-y-3">
            {PORTAL_THEME_ROLES.map((row) => (
              <div
                key={row.key}
                className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <Label className="text-sm sm:min-w-[14rem]">{row.label}</Label>
                <Select
                  value={local[row.key] ?? defaults[row.key] ?? ""}
                  onValueChange={(v) => setLocal((s) => ({ ...s, [row.key]: v }))}
                  disabled={catLoading || defLoading}
                >
                  <SelectTrigger className="w-full sm:max-w-md">
                    <SelectValue placeholder="Theme" />
                  </SelectTrigger>
                  <SelectContent>
                    {themes
                      .filter((t: DashboardThemeInfo): t is DashboardThemeInfo & { id: string } => Boolean(t.id))
                      .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={handleSave} disabled={putDefaults.isPending || !dirty}>
              {putDefaults.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save defaults
            </Button>
          </div>
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
          {me?.role === "admin" && (
            <TabsTrigger value="themes" className="gap-1.5"><Palette className="h-4 w-4" /> Portal themes</TabsTrigger>
          )}
          <TabsTrigger value="about"    className="gap-1.5"><Info     className="h-4 w-4" /> About</TabsTrigger>
        </TabsList>

        <TabsContent value="general"  className="mt-6"><GeneralTab /></TabsContent>
        <TabsContent value="powerbi"  className="mt-6"><PowerBITab /></TabsContent>
        {me?.role === "admin" && (
          <TabsContent value="access" className="mt-6"><AccessControlTab /></TabsContent>
        )}
        {me?.role === "admin" && (
          <TabsContent value="themes" className="mt-6"><PortalThemesTab /></TabsContent>
        )}
        <TabsContent value="about"    className="mt-6"><AboutTab /></TabsContent>
      </Tabs>
    </div>
  );
}
