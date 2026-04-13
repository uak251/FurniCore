import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Settings Page — FurniCore ERP
 *
 * Tabs:
 *  1. General      — Session duration (admin), currency, valuation
 *  2. Power BI     — Report status + setup guide
 *  3. Access Control — Per-user extra-module permission delegation (admin)
 *  4. Portal themes — Default dashboard theme per role (admin)
 *  5. About        — Version / env info
 */
import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser, useGetDashboardThemeCatalog, useGetDashboardThemeDefaults, usePutDashboardThemeDefaults, getGetDashboardThemeDefaultsQueryKey, } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import { Settings, Globe, BarChart3, ShieldCheck, Info, Palette, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, DollarSign, Users, Loader2, ChevronDown, ChevronUp, Eye, EyeOff, Save, KeyRound, UserCircle, } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { SessionDurationSettings } from "@/components/settings/SessionDurationSettings";
import { RoleDashboardMatrixCard } from "@/components/settings/RoleDashboardMatrixCard";
import { apiOriginPrefix } from "@/lib/api-base";
const API_BASE = apiOriginPrefix();
async function apiFetch(path, init) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken() ?? ""}`, ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
    }
    return res.json();
}
/* ─── Module permissions list (must match backend REPORT_META modules) ───────── */
const MODULE_PERMISSIONS = [
    { key: "accounting", label: "Accounting / Finance", color: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" },
    { key: "payroll", label: "Payroll", color: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300" },
    { key: "inventory", label: "Inventory", color: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300" },
    { key: "hr", label: "HR / Employees", color: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300" },
    { key: "sales", label: "Sales / CRM", color: "bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300" },
    { key: "reports", label: "Reports & Analytics", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300" },
    { key: "settings", label: "Settings", color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
];
/* ════════════════════════════════════════════════════════════════════════════════
   TAB 1 — GENERAL
   ════════════════════════════════════════════════════════════════════════════════ */
/** Exported for regression tests (General tab inventory valuation options). */
export const VALUATION_METHODS = [
    { value: "FIFO", label: "FIFO — First In, First Out" },
    { value: "LIFO", label: "LIFO — Last In, First Out" },
    { value: "WAC", label: "WAC — Weighted Average Cost" },
];
function GeneralTab() {
    const { currency, setCurrency } = useCurrency();
    const { toast } = useToast();
    const [valuationMethod, setValuationMethod] = useState("WAC");
    const [valuationLoading, setValuationLoading] = useState(false);
    // Load current valuation method from API
    useEffect(() => {
        apiFetch("/api/settings/INVENTORY_VALUATION_METHOD")
            .then((s) => { if (s.value)
            setValuationMethod(s.value); })
            .catch(() => { });
    }, []);
    const saveValuationMethod = async (method) => {
        setValuationLoading(true);
        try {
            await apiFetch("/api/settings/INVENTORY_VALUATION_METHOD", {
                method: "PUT",
                body: JSON.stringify({ value: method }),
            });
            setValuationMethod(method);
            toast({ title: "Valuation method saved", description: `Inventory will now use ${VALUATION_METHODS.find((m) => m.value === method)?.label ?? method}.` });
        }
        catch (err) {
            toast({ variant: "destructive", title: "Failed to save", description: err?.message ?? "Unknown error" });
        }
        finally {
            setValuationLoading(false);
        }
    };
    const handleCurrencyChange = (code) => {
        setCurrency(code);
        toast({ title: "Currency updated", description: `ERP now uses ${CURRENCIES.find((c) => c.code === code)?.label ?? code}` });
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(SessionDurationSettings, {}), _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(DollarSign, { className: "h-5 w-5 text-muted-foreground" }), _jsx(CardTitle, { className: "text-base", children: "Currency" })] }), _jsx(CardDescription, { children: "Applies to all monetary values across every ERP module \u2014 inventory costs, payroll, accounting, and invoices." })] }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-4", children: [_jsxs("div", { className: "space-y-1.5 min-w-64", children: [_jsx(Label, { htmlFor: "currency-select", children: "Active currency" }), _jsxs(Select, { value: currency.code, onValueChange: handleCurrencyChange, children: [_jsx(SelectTrigger, { id: "currency-select", className: "w-72", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: CURRENCIES.map((c) => (_jsxs(SelectItem, { value: c.code, children: [_jsx("span", { className: "font-mono mr-2 text-xs text-muted-foreground", children: c.code }), c.symbol, " \u2014 ", c.label] }, c.code))) })] })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx(Label, { className: "text-xs text-muted-foreground", children: "Preview" }), _jsx("div", { className: "flex gap-3 text-sm font-mono", children: [1, 1234.5, 1_000_000].map((n) => {
                                                    const def = CURRENCIES.find((c) => c.code === currency.code);
                                                    const fmt = new Intl.NumberFormat(def.locale, { style: "currency", currency: def.code, minimumFractionDigits: 2 });
                                                    return (_jsx("span", { className: "rounded-md border bg-muted/30 px-2 py-1", children: fmt.format(n) }, n));
                                                }) })] })] }), _jsx("div", { className: "rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground", children: _jsxs("p", { children: ["Currency preference is saved in your browser (localStorage). Each user can set their own preferred currency independently. Exchange rate conversion is ", _jsx("strong", { children: "not" }), " applied \u2014 all amounts remain in their stored value and are formatted with the selected symbol/locale."] }) })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-sm", children: "All supported currencies" }) }), _jsx(CardContent, { children: _jsx("div", { className: "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4", children: CURRENCIES.map((c) => (_jsxs("button", { onClick: () => handleCurrencyChange(c.code), className: cn("flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50", currency.code === c.code && "border-primary bg-primary/5 font-medium"), children: [_jsx("span", { className: "text-base", children: c.symbol }), _jsxs("div", { children: [_jsx("p", { className: "font-mono text-xs font-semibold", children: c.code }), _jsx("p", { className: "text-[11px] text-muted-foreground", children: c.label })] }), currency.code === c.code && _jsx(CheckCircle2, { className: "ml-auto h-4 w-4 text-primary" })] }, c.code))) }) })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Settings, { className: "h-5 w-5 text-muted-foreground" }), _jsx(CardTitle, { className: "text-base", children: "Inventory Valuation Method" })] }), _jsx(CardDescription, { children: "Controls how inventory value is calculated in valuation reports. Full FIFO / LIFO accuracy requires purchase-lot tracking." })] }), _jsxs(CardContent, { className: "space-y-3", children: [_jsxs("div", { className: "flex flex-wrap items-end gap-4", children: [_jsxs("div", { className: "space-y-1.5 min-w-64", children: [_jsx(Label, { htmlFor: "valuation-method-select", children: "Method" }), _jsxs(Select, { value: valuationMethod, onValueChange: saveValuationMethod, disabled: valuationLoading, children: [_jsx(SelectTrigger, { id: "valuation-method-select", className: "w-72", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: VALUATION_METHODS.map((m) => (_jsx(SelectItem, { value: m.value, children: m.label }, m.value))) })] })] }), valuationLoading && _jsx(Loader2, { className: "h-4 w-4 animate-spin text-muted-foreground" })] }), _jsxs("div", { className: "rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1", children: [_jsxs("p", { children: [_jsx("strong", { children: "FIFO" }), " \u2014 oldest stock consumed first. Inventory value reflects most recent purchase prices."] }), _jsxs("p", { children: [_jsx("strong", { children: "LIFO" }), " \u2014 newest stock consumed first. COGS reflects current market prices. Not permitted under IFRS."] }), _jsxs("p", { children: [_jsx("strong", { children: "WAC" }), " \u2014 running average cost per unit. Smooths out price fluctuations. Recommended for most use cases."] })] })] })] })] }));
}
const PBI_CREDENTIAL_KEYS = [
    { key: "POWERBI_TENANT_ID", label: "Tenant ID", hint: "Azure AD tenant ID (UUID)" },
    { key: "POWERBI_CLIENT_ID", label: "Client ID", hint: "Azure AD app client ID (UUID)" },
    { key: "POWERBI_CLIENT_SECRET", label: "Client Secret", hint: "Azure AD app client secret (sensitive)", secret: true },
    { key: "POWERBI_WORKSPACE_ID", label: "Workspace ID", hint: "Power BI workspace group ID (UUID)" },
];
const PBI_REPORT_KEYS = [
    { key: "POWERBI_REPORT_SUPPLIER_LEDGER", label: "Supplier Ledger report ID" },
    { key: "POWERBI_REPORT_EXPENSE_INCOME", label: "Expense vs Income report ID" },
    { key: "POWERBI_REPORT_TRIAL_BALANCE", label: "Trial Balance report ID" },
    { key: "POWERBI_REPORT_PAYROLL_SUMMARY", label: "Payroll Summary report ID" },
    { key: "POWERBI_REPORT_PROFIT_MARGIN", label: "Profit & Loss report ID" },
    { key: "POWERBI_REPORT_INVENTORY_ANALYSIS", label: "Inventory Analysis report ID" },
    { key: "POWERBI_REPORT_HR_DASHBOARD", label: "HR Dashboard report ID" },
    { key: "POWERBI_REPORT_SALES_OVERVIEW", label: "Sales Overview report ID" },
];
function SettingField({ k, label, hint, secret, value, onChange, stored, revealed, onToggleReveal, onClear }) {
    const isSet = stored?.isSet ?? false;
    const source = stored?.source ?? "unset";
    return (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx(Label, { htmlFor: k, className: "text-sm font-medium", children: label }), _jsxs("div", { className: "flex items-center gap-1.5", children: [source === "db" && _jsx(Badge, { className: "text-[10px] bg-green-100 text-green-800", children: "DB" }), source === "env" && _jsx(Badge, { variant: "outline", className: "text-[10px]", children: "ENV" }), source === "unset" && _jsx(Badge, { variant: "outline", className: "text-[10px] text-muted-foreground", children: "Not set" }), isSet && source === "db" && (_jsx("button", { onClick: () => onClear(k), className: "text-[10px] text-destructive hover:underline", children: "clear" }))] })] }), _jsxs("div", { className: "relative", children: [_jsx("input", { id: k, type: secret && !revealed ? "password" : "text", className: "w-full rounded-md border bg-background px-3 py-2 text-sm font-mono pr-9 focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground", placeholder: isSet ? (secret ? "•••• (saved — enter new value to update)" : "Saved in DB") : hint, value: value, onChange: (e) => onChange(k, e.target.value) }), secret && (_jsx("button", { type: "button", onClick: () => onToggleReveal(k), className: "absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground", children: revealed ? _jsx(EyeOff, { className: "h-4 w-4" }) : _jsx(Eye, { className: "h-4 w-4" }) }))] }), hint && !secret && _jsx("p", { className: "text-[11px] text-muted-foreground", children: hint })] }));
}
function PowerBITab() {
    const { toast } = useToast();
    const [reports, setReports] = useState([]);
    const [settings, setSettings] = useState([]);
    const [values, setValues] = useState({});
    const [revealed, setRevealed] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [rJson, sJson] = await Promise.all([
                apiFetch("/api/powerbi/reports").catch(() => ({ reports: [] })),
                apiFetch("/api/settings"),
            ]);
            setReports(rJson.reports);
            setSettings(sJson.settings);
            // Pre-fill non-secret fields with their raw values
            const prefill = {};
            for (const s of sJson.settings) {
                prefill[s.key] = s.isSecret ? "" : (s.rawValue ?? "");
            }
            setValues(prefill);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Failed to load settings", description: e instanceof Error ? e.message : String(e) });
        }
        finally {
            setLoading(false);
        }
    }, [toast]);
    useEffect(() => { loadAll(); }, [loadAll]);
    const toggleReveal = (key) => setRevealed((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const handleSave = async () => {
        setSaving(true);
        try {
            // Only send keys that have a value
            const toSave = {};
            for (const [k, v] of Object.entries(values)) {
                if (v.trim())
                    toSave[k] = v.trim();
            }
            if (Object.keys(toSave).length === 0) {
                toast({ title: "Nothing to save", description: "Fill in at least one field." });
                setSaving(false);
                return;
            }
            await apiFetch("/api/settings/bulk", { method: "POST", body: JSON.stringify({ settings: toSave }) });
            toast({ title: "Settings saved", description: `${Object.keys(toSave).length} Power BI setting(s) updated. Tokens will refresh automatically.` });
            await loadAll();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Save failed", description: e instanceof Error ? e.message : String(e) });
        }
        finally {
            setSaving(false);
        }
    };
    const clearSetting = async (key) => {
        try {
            await apiFetch(`/api/settings/${key}`, { method: "DELETE" });
            toast({ title: "Setting cleared", description: `${key} removed from DB (env var fallback active if set).` });
            setValues((v) => ({ ...v, [key]: "" }));
            await loadAll();
        }
        catch { /* swallowed */ }
    };
    const configured = reports.filter((r) => r.configured).length;
    const unconfigured = reports.filter((r) => !r.configured).length;
    function SettingField({ k, label, hint, secret }) {
        const stored = settings.find((s) => s.key === k);
        const isSet = stored?.isSet ?? false;
        const source = stored?.source ?? "unset";
        const isRev = revealed.has(k);
        return (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx(Label, { htmlFor: k, className: "text-sm font-medium", children: label }), _jsxs("div", { className: "flex items-center gap-1.5", children: [source === "db" && _jsx(Badge, { className: "text-[10px] bg-green-100 text-green-800", children: "DB" }), source === "env" && _jsx(Badge, { variant: "outline", className: "text-[10px]", children: "ENV" }), source === "unset" && _jsx(Badge, { variant: "outline", className: "text-[10px] text-muted-foreground", children: "Not set" }), isSet && source === "db" && (_jsx("button", { onClick: () => clearSetting(k), className: "text-[10px] text-destructive hover:underline", children: "clear" }))] })] }), _jsxs("div", { className: "relative", children: [_jsx("input", { id: k, type: secret && !isRev ? "password" : "text", className: "w-full rounded-md border bg-background px-3 py-2 text-sm font-mono pr-9 focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground", placeholder: isSet ? (secret ? "•••• (saved — enter new value to update)" : "Saved in DB") : hint, value: values[k] ?? "", onChange: (e) => setValues((v) => ({ ...v, [k]: e.target.value })) }), secret && (_jsx("button", { type: "button", onClick: () => toggleReveal(k), className: "absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground", children: isRev ? _jsx(EyeOff, { className: "h-4 w-4" }) : _jsx(Eye, { className: "h-4 w-4" }) }))] }), hint && !secret && _jsx("p", { className: "text-[11px] text-muted-foreground", children: hint })] }));
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(BarChart3, { className: "h-5 w-5 text-muted-foreground" }), _jsx(CardTitle, { className: "text-base", children: "Power BI Integration" })] }), _jsxs(Button, { variant: "outline", size: "sm", onClick: loadAll, disabled: loading, children: [_jsx(RefreshCw, { className: cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin") }), "Refresh"] })] }) }), _jsx(CardContent, { children: loading ? (_jsx("div", { className: "space-y-2", children: [1, 2, 3].map(i => _jsx(Skeleton, { className: "h-10 w-full" }, i)) })) : (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs(Badge, { className: "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300", children: [_jsx(CheckCircle2, { className: "mr-1 h-3.5 w-3.5" }), configured, " report", configured !== 1 ? "s" : "", " configured"] }), _jsxs(Badge, { variant: "outline", className: "text-muted-foreground", children: [_jsx(AlertCircle, { className: "mr-1 h-3.5 w-3.5" }), unconfigured, " not configured"] })] }), _jsx("div", { className: "grid gap-2 sm:grid-cols-2", children: reports.map((r) => (_jsxs("div", { className: "flex items-center justify-between rounded-lg border px-3 py-2 text-sm", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium", children: r.label }), _jsx("p", { className: "text-[10px] text-muted-foreground capitalize", children: r.module })] }), _jsx(Badge, { className: r.configured
                                                    ? "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300"
                                                    : "bg-muted text-muted-foreground", children: r.configured ? "Active" : "Not set" })] }, r.id))) })] })) })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(KeyRound, { className: "h-5 w-5 text-muted-foreground" }), _jsx(CardTitle, { className: "text-base", children: "Azure AD Credentials" })] }), _jsx(CardDescription, { children: "Stored securely in the database. Values entered here override .env variables. Leave blank to keep the existing saved value or use the .env fallback." })] }), _jsxs(CardContent, { className: "space-y-4", children: [_jsx("div", { className: "grid gap-4 sm:grid-cols-2", children: PBI_CREDENTIAL_KEYS.map(({ key: k, label, hint, secret }) => (_jsx(SettingField, { k: k, label: label, hint: hint, secret: !!secret, value: values[k] ?? "", onChange: (key, val) => setValues((v) => ({ ...v, [key]: val })), stored: settings.find((s) => s.key === k), revealed: revealed.has(k), onToggleReveal: toggleReveal, onClear: clearSetting }, k))) }), _jsx(Separator, {}), _jsx("p", { className: "text-xs font-medium text-muted-foreground uppercase tracking-wider", children: "Report IDs" }), _jsx("div", { className: "grid gap-3 sm:grid-cols-2", children: PBI_REPORT_KEYS.map(({ key: k, label }) => (_jsx(SettingField, { k: k, label: label, hint: "UUID from Power BI report URL", secret: false, value: values[k] ?? "", onChange: (key, val) => setValues((v) => ({ ...v, [key]: val })), stored: settings.find((s) => s.key === k), revealed: revealed.has(k), onToggleReveal: toggleReveal, onClear: clearSetting }, k))) }), _jsxs("div", { className: "flex items-center justify-between pt-2 border-t", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: "Changes are applied immediately \u2014 no server restart required." }), _jsxs(Button, { onClick: handleSave, disabled: saving, className: "gap-2", children: [saving ? _jsx(Loader2, { className: "h-4 w-4 animate-spin" }) : _jsx(Save, { className: "h-4 w-4" }), "Save settings"] })] })] })] }), _jsxs(Card, { className: "border-dashed", children: [_jsx(CardHeader, { children: _jsxs("button", { onClick: () => setShowGuide((v) => !v), className: "flex w-full items-center justify-between text-left", children: [_jsxs(CardTitle, { className: "text-sm font-medium flex items-center gap-2", children: [_jsx(Settings, { className: "h-4 w-4 text-muted-foreground" }), " Power BI Setup Guide"] }), showGuide ? _jsx(ChevronUp, { className: "h-4 w-4" }) : _jsx(ChevronDown, { className: "h-4 w-4" })] }) }), showGuide && (_jsxs(CardContent, { className: "space-y-4", children: [_jsx("ol", { className: "space-y-4", children: [
                                    { step: "1", title: "Register Azure AD app", detail: "Azure Portal → App registrations → New registration. Grant Power BI Service → Report.ReadAll (Application) and admin-consent." },
                                    { step: "2", title: "Add service principal to workspace", detail: 'Power BI Service → workspace → Settings → Access → add the app as "Member".' },
                                    { step: "3", title: "Build & publish reports", detail: "Build in Power BI Desktop connecting to your PostgreSQL (DirectQuery or import). Publish to the workspace. Copy the report ID from the URL (the GUID after /reports/)." },
                                    { step: "4", title: "Enter credentials above", detail: 'Fill in the Azure AD credentials and report IDs in the form above, then click "Save settings". No restart required.' },
                                ].map((s) => (_jsxs("li", { className: "flex gap-3 text-sm", children: [_jsx("span", { className: "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary", children: s.step }), _jsxs("div", { children: [_jsx("p", { className: "font-medium", children: s.title }), _jsx("p", { className: "text-muted-foreground mt-0.5", children: s.detail })] })] }, s.step))) }), _jsxs("div", { className: "flex gap-3", children: [_jsx(Button, { variant: "outline", size: "sm", asChild: true, children: _jsxs("a", { href: "https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-service-principal", target: "_blank", rel: "noreferrer", children: ["Docs ", _jsx(ExternalLink, { className: "ml-1 h-3 w-3" })] }) }), _jsx(Button, { variant: "outline", size: "sm", asChild: true, children: _jsxs("a", { href: "https://app.powerbi.com", target: "_blank", rel: "noreferrer", children: ["Power BI Service ", _jsx(ExternalLink, { className: "ml-1 h-3 w-3" })] }) })] })] }))] })] }));
}
function AccessControlTab() {
    const { toast } = useToast();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState(new Set());
    const [showInactive, setShowInactive] = useState(false);
    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const all = await apiFetch("/api/users");
            const withPerms = await Promise.all(all.map(async (u) => {
                try {
                    const p = await apiFetch(`/api/users/${u.id}/permissions`);
                    return { ...u, permissions: p.permissions, loading: false };
                }
                catch {
                    return { ...u, permissions: [], loading: false };
                }
            }));
            setUsers(withPerms);
        }
        catch { /* swallowed */ }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { fetchUsers(); }, [fetchUsers]);
    const toggleModule = async (userId, module) => {
        const user = users.find((u) => u.id === userId);
        if (!user)
            return;
        const had = user.permissions.includes(module);
        const next = had ? user.permissions.filter((p) => p !== module) : [...user.permissions, module];
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, permissions: next } : u));
        try {
            await apiFetch(`/api/users/${userId}/permissions`, { method: "PATCH", body: JSON.stringify({ permissions: next }) });
            toast({ title: had ? "Permission removed" : "Permission granted", description: `${user.name} — ${MODULE_PERMISSIONS.find((m) => m.key === module)?.label ?? module}` });
        }
        catch (e) {
            setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, permissions: user.permissions } : u));
            toast({ variant: "destructive", title: "Error", description: e instanceof Error ? e.message : "Failed to update permissions" });
        }
    };
    const toggleExpand = (id) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    };
    const visible = users.filter((u) => {
        if (!showInactive && !u.isActive)
            return false;
        if (search) {
            const q = search.toLowerCase();
            return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.includes(q);
        }
        return true;
    });
    const ROLE_COLORS = {
        admin: "bg-red-100 text-red-800",
        manager: "bg-orange-100 text-orange-800",
        accountant: "bg-yellow-100 text-yellow-800",
        inventory_manager: "bg-blue-100 text-blue-800",
        sales_manager: "bg-purple-100 text-purple-800",
        worker: "bg-green-100 text-green-800",
        customer: "bg-slate-100 text-slate-700",
        supplier: "bg-teal-100 text-teal-800",
    };
    return (_jsx("div", { className: "space-y-4", children: _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(ShieldCheck, { className: "h-5 w-5 text-muted-foreground" }), _jsx(CardTitle, { className: "text-base", children: "Role & Permission Delegation" })] }), _jsx(CardDescription, { children: "Grant employees access to additional ERP modules beyond their primary role. Changes take effect immediately \u2014 no restart required." })] }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx("input", { className: "h-9 flex-1 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-w-52", placeholder: "Search by name, email, or role\u2026", value: search, onChange: (e) => setSearch(e.target.value) }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Switch, { id: "show-inactive", checked: showInactive, onCheckedChange: setShowInactive }), _jsx(Label, { htmlFor: "show-inactive", className: "text-sm", children: "Show inactive" })] }), _jsxs(Button, { variant: "outline", size: "sm", onClick: fetchUsers, disabled: loading, children: [_jsx(RefreshCw, { className: cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin") }), "Reload"] })] }), loading ? (_jsx("div", { className: "space-y-2", children: [1, 2, 3, 4].map(i => _jsx(Skeleton, { className: "h-14 w-full" }, i)) })) : visible.length === 0 ? (_jsxs("div", { className: "py-10 text-center text-sm text-muted-foreground", children: [_jsx(Users, { className: "mx-auto mb-2 h-8 w-8" }), "No users match your filter."] })) : (_jsx("div", { className: "rounded-md border divide-y", children: visible.map((user) => {
                                const isOpen = expanded.has(user.id);
                                return (_jsxs("div", { className: cn(!user.isActive && "opacity-60"), children: [_jsxs("button", { onClick: () => toggleExpand(user.id), className: "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("p", { className: "text-sm font-medium truncate", children: user.name }), _jsx(Badge, { className: cn("text-[10px] px-1.5", ROLE_COLORS[user.role] ?? "bg-muted text-muted-foreground"), children: user.role }), !user.isActive && _jsx(Badge, { variant: "outline", className: "text-[10px]", children: "Inactive" })] }), _jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: user.email })] }), _jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [user.permissions.length > 0 && (_jsxs(Badge, { variant: "secondary", className: "text-xs", children: ["+", user.permissions.length, " module", user.permissions.length > 1 ? "s" : ""] })), isOpen ? _jsx(ChevronUp, { className: "h-4 w-4 text-muted-foreground" }) : _jsx(ChevronDown, { className: "h-4 w-4 text-muted-foreground" })] })] }), isOpen && (_jsxs("div", { className: "border-t bg-muted/20 px-4 py-4", children: [_jsx("p", { className: "mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider", children: "Extra module access" }), _jsx("div", { className: "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3", children: MODULE_PERMISSIONS.map((mod) => {
                                                        const active = user.permissions.includes(mod.key);
                                                        return (_jsxs("label", { className: cn("flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors", active ? "border-primary bg-primary/5" : "hover:bg-muted/50"), children: [_jsx(Switch, { checked: active, onCheckedChange: () => toggleModule(user.id, mod.key), className: "shrink-0" }), _jsx("span", { className: cn("rounded-md px-2 py-0.5 text-xs font-medium", mod.color), children: mod.label })] }, mod.key));
                                                    }) }), _jsxs("p", { className: "mt-3 text-[11px] text-muted-foreground", children: ["These are ", _jsx("em", { children: "additive" }), " permissions \u2014 they extend the user's primary role, they do not replace it. Admins retain full access regardless."] })] }))] }, user.id));
                            }) }))] })] }) }));
}
/* ════════════════════════════════════════════════════════════════════════════════
   TAB 4 — ABOUT
   ════════════════════════════════════════════════════════════════════════════════ */
function AboutTab() {
    return (_jsx("div", { className: "space-y-4 max-w-xl", children: _jsx(Card, { children: _jsxs(CardContent, { className: "pt-6 space-y-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10", children: _jsx(Settings, { className: "h-6 w-6 text-primary" }) }), _jsxs("div", { children: [_jsx("p", { className: "font-bold text-lg", children: "FurniCore ERP" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Production-ready furniture ERP system" })] })] }), _jsx(Separator, {}), _jsx("dl", { className: "space-y-2 text-sm", children: [
                            ["Stack", "React 18 · Express 5 · Drizzle ORM · PostgreSQL"],
                            ["Auth", "JWT access tokens · Email verification · RBAC"],
                            ["Analytics", "Power BI embedded (App-owns-data) · Native recharts"],
                            ["Bulk ops", "CSV import/export for Inventory, Products, Employees, Payroll"],
                            ["Version", "1.0.0 (monorepo)"],
                        ].map(([k, v]) => (_jsxs("div", { className: "flex gap-3", children: [_jsx("dt", { className: "w-24 shrink-0 font-medium text-muted-foreground", children: k }), _jsx("dd", { children: v })] }, k))) }), _jsx(Separator, {}), _jsx("p", { className: "text-xs text-muted-foreground", children: "Built with \u2764\uFE0F in a pnpm monorepo. Schema managed by Drizzle Kit + PostgreSQL on Supabase." })] }) }) }));
}
/* ════════════════════════════════════════════════════════════════════════════════
   TAB — PORTAL THEME DEFAULTS (admin only, RBAC on API)
   ════════════════════════════════════════════════════════════════════════════════ */
const PORTAL_THEME_ROLES = [
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
    const [local, setLocal] = useState({});
    useEffect(() => {
        if (defRes?.defaults)
            setLocal({ ...defRes.defaults });
    }, [defRes?.defaults]);
    const handleSave = async () => {
        try {
            await putDefaults.mutateAsync({ data: { defaults: local } });
            await qc.invalidateQueries({ queryKey: getGetDashboardThemeDefaultsQueryKey() });
            toast({ title: "Portal themes updated", description: "Defaults apply when users clear personal overrides." });
        }
        catch (e) {
            toast({
                title: "Could not save",
                description: e instanceof Error ? e.message : "Unknown error",
                variant: "destructive",
            });
        }
    };
    const baseline = defRes?.defaults;
    const dirty = !!baseline &&
        PORTAL_THEME_ROLES.some((r) => (local[r.key] ?? baseline[r.key]) !== baseline[r.key]);
    return (_jsx("div", { className: "space-y-6", children: _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Palette, { className: "h-5 w-5 text-muted-foreground" }), _jsx(CardTitle, { className: "text-base", children: "Default dashboard theme per portal" })] }), _jsx(CardDescription, { children: "When a user has not set a personal theme, these defaults apply by role. Individual users can still override from the header palette or Appearance page." })] }), _jsxs(CardContent, { className: "space-y-4", children: [(catLoading || defLoading) && (_jsx("div", { className: "flex justify-center py-8 text-muted-foreground", children: _jsx(Loader2, { className: "h-8 w-8 animate-spin" }) })), _jsx("div", { className: "space-y-3", children: PORTAL_THEME_ROLES.map((row) => (_jsxs("div", { className: "flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4", children: [_jsx(Label, { className: "text-sm sm:min-w-[14rem]", children: row.label }), _jsxs(Select, { value: local[row.key] ?? defaults[row.key] ?? "", onValueChange: (v) => setLocal((s) => ({ ...s, [row.key]: v })), disabled: catLoading || defLoading, children: [_jsx(SelectTrigger, { className: "w-full sm:max-w-md", children: _jsx(SelectValue, { placeholder: "Theme" }) }), _jsx(SelectContent, { children: themes
                                                    .filter((t) => Boolean(t.id))
                                                    .map((t) => (_jsx(SelectItem, { value: t.id, children: t.label }, t.id))) })] })] }, row.key))) }), _jsx("div", { className: "flex flex-wrap gap-2 pt-2", children: _jsxs(Button, { onClick: handleSave, disabled: putDefaults.isPending || !dirty, children: [putDefaults.isPending ? _jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }) : _jsx(Save, { className: "mr-2 h-4 w-4" }), "Save defaults"] }) })] })] }) }));
}
/* ════════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════════════ */
export default function SettingsPage() {
    const { data: me } = useGetCurrentUser();
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs(Card, { className: "border-primary/20 bg-primary/5", children: [_jsxs(CardHeader, { className: "flex flex-row flex-wrap items-center gap-3 gap-y-2 space-y-0 pb-2", children: [_jsx(UserCircle, { className: "h-9 w-9 text-primary", "aria-hidden": true }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx(CardTitle, { className: "text-base", children: "Your profile" }), _jsx(CardDescription, { children: "Update your display name, phone number, and profile photo." })] }), _jsx(Button, { variant: "secondary", asChild: true, children: _jsx(Link, { href: "/profile", children: "Edit profile" }) })] })] }), _jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Settings" }), _jsx("p", { className: "text-muted-foreground", children: "Configure currency, Power BI reports, permissions, and dashboard access matrix." })] }), _jsxs(Tabs, { defaultValue: "general", children: [_jsxs(TabsList, { className: "w-full sm:w-auto", children: [_jsxs(TabsTrigger, { value: "general", className: "gap-1.5", children: [_jsx(Globe, { className: "h-4 w-4" }), " General"] }), _jsxs(TabsTrigger, { value: "powerbi", className: "gap-1.5", children: [_jsx(BarChart3, { className: "h-4 w-4" }), " Power BI"] }), me?.role === "admin" && (_jsxs(TabsTrigger, { value: "access", className: "gap-1.5", children: [_jsx(ShieldCheck, { className: "h-4 w-4" }), " Access Control"] })), me?.role === "admin" && (_jsxs(TabsTrigger, { value: "themes", className: "gap-1.5", children: [_jsx(Palette, { className: "h-4 w-4" }), " Portal themes"] })), me?.role === "admin" && (_jsxs(TabsTrigger, { value: "matrix", className: "gap-1.5", children: [_jsx(ShieldCheck, { className: "h-4 w-4" }), " Dashboard matrix"] })), _jsxs(TabsTrigger, { value: "about", className: "gap-1.5", children: [_jsx(Info, { className: "h-4 w-4" }), " About"] })] }), _jsx(TabsContent, { value: "general", className: "mt-6", children: _jsx(GeneralTab, {}) }), _jsx(TabsContent, { value: "powerbi", className: "mt-6", children: _jsx(PowerBITab, {}) }), me?.role === "admin" && (_jsx(TabsContent, { value: "access", className: "mt-6", children: _jsx(AccessControlTab, {}) })), me?.role === "admin" && (_jsx(TabsContent, { value: "themes", className: "mt-6", children: _jsx(PortalThemesTab, {}) })), me?.role === "admin" && (_jsx(TabsContent, { value: "matrix", className: "mt-6", children: _jsx(RoleDashboardMatrixCard, {}) })), _jsx(TabsContent, { value: "about", className: "mt-6", children: _jsx(AboutTab, {}) })] })] }));
}
