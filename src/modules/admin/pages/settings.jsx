import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  Warehouse,
  ClipboardList,
  Factory,
  Users,
  Wallet,
  User,
  Truck,
  CheckCircle2,
  XCircle,
  Grid3X3,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";
import {
  ANALYTICS_MODULE_KEYS,
  defaultAnalyticsPreferences,
  loadAnalyticsPreferences,
  saveAnalyticsPreferences,
} from "@/lib/analytics-preferences";

const MATRIX_ROLES = [
  { key: "admin", label: "Admin", icon: ShieldCheck },
  { key: "inventory_manager", label: "Inventory Manager", icon: Warehouse },
  { key: "procurement_manager", label: "Procurement Manager", icon: ClipboardList },
  { key: "production_manager", label: "Production Manager", icon: Factory },
  { key: "hr_manager", label: "HR Manager", icon: Users },
  { key: "finance_manager", label: "Finance Manager", icon: Wallet },
  { key: "customer", label: "Customer", icon: User },
  { key: "supplier", label: "Supplier", icon: Truck },
];

const ROLE_FALLBACKS = {
  procurement_manager: "manager",
  hr_manager: "manager",
  finance_manager: "accountant",
};

const ANALYTICS_PRESETS = {
  minimal: { showKpis: true, showCharts: false, showActions: false },
  balanced: { showKpis: true, showCharts: true, showActions: false },
  actionable: { showKpis: true, showCharts: true, showActions: true },
};

function moduleLabel(moduleKey) {
  return (
    {
      inventory: "Inventory",
      procurement: "Procurement",
      production: "Production",
      hr: "HR",
      payroll: "Payroll",
      accounting: "Accounting",
      finance: "Finance",
      customer: "Customer",
      supplier: "Supplier",
      notifications: "Notifications",
      settings: "Settings",
      admin: "Admin",
    }[moduleKey] || moduleKey
  );
}

function formatTs(value) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

async function apiFetch(path) {
  const token = getAuthToken();
  const res = await fetch(`${apiOriginPrefix()}${path}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  const raw = await res.text();
  if (!contentType.includes("application/json")) {
    const preview = raw.slice(0, 140).replace(/\s+/g, " ").trim();
    throw new Error(
      `Unexpected non-JSON response from ${path} (status ${res.status}, content-type: ${contentType || "unknown"}). Response preview: ${preview}`,
    );
  }
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      `Invalid JSON response from ${path} (status ${res.status}). Response preview: ${raw.slice(0, 140).replace(/\s+/g, " ").trim()}`,
    );
  }
  if (!res.ok) {
    const message = payload?.error || payload?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload;
}

export default function SettingsPage() {
  const [analyticsPrefs, setAnalyticsPrefs] = useState(() => loadAnalyticsPreferences());
  const [saveMessage, setSaveMessage] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["analytics-dashboard-matrix"],
    queryFn: async () => {
      const contract = await apiFetch("/api/analytics/rbac-contract");
      const rolePayloads = await Promise.all(
        MATRIX_ROLES.map((role, idx) => {
          const queryRole = ROLE_FALLBACKS[role.key] || role.key;
          const auditFlag = idx === 0 ? "&audit=matrix" : "";
          return apiFetch(`/api/analytics/native-dashboard?role=${encodeURIComponent(queryRole)}${auditFlag}`);
        }),
      );
      return { contract, rolePayloads };
    },
  });

  const modules = useMemo(() => {
    const fromContract = Object.keys(data?.contract?.modules ?? {});
    return fromContract.sort((a, b) => moduleLabel(a).localeCompare(moduleLabel(b)));
  }, [data]);
  const filteredModules = useMemo(() => {
    const query = moduleSearch.trim().toLowerCase();
    if (!query) return ANALYTICS_MODULE_KEYS;
    return ANALYTICS_MODULE_KEYS.filter((moduleKey) =>
      moduleLabel(moduleKey).toLowerCase().includes(query) || moduleKey.toLowerCase().includes(query),
    );
  }, [moduleSearch]);

  const matrix = useMemo(() => {
    const byRole = new Map();
    for (let i = 0; i < MATRIX_ROLES.length; i += 1) {
      byRole.set(MATRIX_ROLES[i].key, data?.rolePayloads?.[i]?.access ?? []);
    }
    return byRole;
  }, [data]);

  function updateAnalyticsPref(moduleKey, field, value) {
    const next = {
      ...analyticsPrefs,
      [moduleKey]: {
        ...analyticsPrefs[moduleKey],
        [field]: value,
      },
    };
    const persisted = saveAnalyticsPreferences(next);
    setAnalyticsPrefs(persisted);
    setSaveMessage(`Saved ${moduleLabel(moduleKey)} preferences`);
  }

  function applyBulkPreference(field, value) {
    const next = { ...analyticsPrefs };
    for (const moduleKey of ANALYTICS_MODULE_KEYS) {
      next[moduleKey] = {
        ...next[moduleKey],
        [field]: value,
      };
    }
    const persisted = saveAnalyticsPreferences(next);
    setAnalyticsPrefs(persisted);
    setSaveMessage(`Updated "${field}" for all modules`);
  }

  function resetToDefaults() {
    const persisted = saveAnalyticsPreferences(defaultAnalyticsPreferences);
    setAnalyticsPrefs(persisted);
    setSaveMessage("Analytics preferences reset to defaults");
  }

  function applyPreset(presetKey) {
    const preset = ANALYTICS_PRESETS[presetKey];
    if (!preset) return;
    const next = { ...analyticsPrefs };
    for (const moduleKey of ANALYTICS_MODULE_KEYS) {
      next[moduleKey] = {
        ...next[moduleKey],
        enabled: true,
        ...preset,
      };
    }
    const persisted = saveAnalyticsPreferences(next);
    setAnalyticsPrefs(persisted);
    setSaveMessage(`Applied "${presetKey}" preset`);
  }

  useEffect(() => {
    if (!saveMessage) return undefined;
    const timer = setTimeout(() => setSaveMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [saveMessage]);

  if (isLoading) {
    return (
      <main className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-80 w-full" />
      </main>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>Matrix unavailable</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{error?.message || "Failed to load role dashboard matrix."}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? "Retrying..." : "Retry"}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <main className="space-y-6" aria-label="Analytics settings">
      <section aria-labelledby="analytics-visibility-controls">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle id="analytics-visibility-controls" className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Analytics Visibility Controls
          </CardTitle>
          <CardDescription>
            Changes save automatically. Configure visibility by module, then open analytics only where needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
            <Button size="sm" variant="secondary" onClick={() => applyPreset("minimal")}>
              Minimal preset
            </Button>
            <Button size="sm" variant="secondary" onClick={() => applyPreset("balanced")}>
              Balanced preset
            </Button>
            <Button size="sm" variant="secondary" onClick={() => applyPreset("actionable")}>
              Actionable preset
            </Button>
            <Button size="sm" variant="outline" onClick={() => applyBulkPreference("enabled", true)}>
              Enable all modules
            </Button>
            <Button size="sm" variant="outline" onClick={() => applyBulkPreference("enabled", false)}>
              Disable all modules
            </Button>
            <Button size="sm" variant="outline" onClick={resetToDefaults}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Reset defaults
            </Button>
            <span className="ml-auto text-xs text-muted-foreground" role="status" aria-live="polite">
              {saveMessage || "All changes saved"}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={moduleSearch}
              onChange={(e) => setModuleSearch(e.target.value)}
              placeholder="Search module settings..."
              className="max-w-xs"
              aria-label="Search analytics module settings"
            />
            <p className="text-xs text-muted-foreground">
              Showing {filteredModules.length} of {ANALYTICS_MODULE_KEYS.length} modules
            </p>
          </div>
          <div className="hidden grid-cols-[minmax(160px,1fr)_repeat(4,120px)] gap-2 px-2 text-xs font-medium text-muted-foreground md:grid">
            <div>Module</div>
            <div className="text-center">Enabled</div>
            <div className="text-center">Show KPIs</div>
            <div className="text-center">Show Charts</div>
            <div className="text-center">Show Actions</div>
          </div>
          {filteredModules.map((moduleKey) => {
            const pref = analyticsPrefs[moduleKey] ?? {};
            const enabled = pref.enabled !== false;
            const baseId = `analytics-pref-${moduleKey}`;
            return (
              <div
                key={moduleKey}
                className="grid grid-cols-2 gap-3 rounded-md border p-3 md:grid-cols-[minmax(160px,1fr)_repeat(4,120px)] md:items-center"
              >
                <div className="col-span-2 font-medium capitalize md:col-span-1">
                  {moduleLabel(moduleKey)}
                  {!enabled ? <p className="mt-1 text-[11px] text-muted-foreground">Hidden from users</p> : null}
                </div>

                <label className="flex items-center justify-between gap-2 text-xs md:justify-center">
                  <span className="md:hidden">Enabled</span>
                  <Switch
                    id={`${baseId}-enabled`}
                    aria-label={`${moduleLabel(moduleKey)} analytics enabled`}
                    checked={pref.enabled !== false}
                    onCheckedChange={(checked) => updateAnalyticsPref(moduleKey, "enabled", checked)}
                  />
                </label>

                <label className="flex items-center justify-between gap-2 text-xs md:justify-center">
                  <span className="md:hidden">Show KPIs</span>
                  <Switch
                    id={`${baseId}-kpis`}
                    aria-label={`${moduleLabel(moduleKey)} show key metrics`}
                    aria-describedby={!enabled ? `${baseId}-disabled-note` : undefined}
                    checked={pref.showKpis !== false && enabled}
                    disabled={!enabled}
                    onCheckedChange={(checked) => updateAnalyticsPref(moduleKey, "showKpis", checked)}
                  />
                </label>

                <label className="flex items-center justify-between gap-2 text-xs md:justify-center">
                  <span className="md:hidden">Show Charts</span>
                  <Switch
                    id={`${baseId}-charts`}
                    aria-label={`${moduleLabel(moduleKey)} show charts`}
                    aria-describedby={!enabled ? `${baseId}-disabled-note` : undefined}
                    checked={pref.showCharts !== false && enabled}
                    disabled={!enabled}
                    onCheckedChange={(checked) => updateAnalyticsPref(moduleKey, "showCharts", checked)}
                  />
                </label>

                <label className="flex items-center justify-between gap-2 text-xs md:justify-center">
                  <span className="md:hidden">Show Actions</span>
                  <Switch
                    id={`${baseId}-actions`}
                    aria-label={`${moduleLabel(moduleKey)} show actions`}
                    aria-describedby={!enabled ? `${baseId}-disabled-note` : undefined}
                    checked={pref.showActions !== false && enabled}
                    disabled={!enabled}
                    onCheckedChange={(checked) => updateAnalyticsPref(moduleKey, "showActions", checked)}
                  />
                </label>
                {!enabled ? (
                  <p id={`${baseId}-disabled-note`} className="sr-only">
                    Enable module analytics first to configure KPI, chart, and action visibility.
                  </p>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
      </section>

      <section aria-labelledby="role-dashboard-matrix">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle id="role-dashboard-matrix" className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5" aria-hidden />
            Role to Dashboard Matrix
          </CardTitle>
          <CardDescription>
            Admin-only RBAC verification grid using live contract and role dashboard definitions.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <caption className="sr-only">
              Role-based analytics access matrix with access state and last action timestamp.
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Role</TableHead>
                {modules.map((moduleKey) => (
                  <TableHead key={moduleKey} className="min-w-[130px] text-center">
                    <div className="font-medium">{moduleLabel(moduleKey)}</div>
                    <div className="text-[10px] text-muted-foreground">{moduleKey}</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MATRIX_ROLES.map((role) => {
                const RoleIcon = role.icon;
                const accessRows = matrix.get(role.key) ?? [];
                const accessMap = new Map(accessRows.map((row) => [row.dashboard, row]));
                return (
                  <TableRow key={role.key}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <RoleIcon className="h-4 w-4 text-primary" aria-hidden />
                        <span className="font-medium">{role.label}</span>
                      </div>
                    </TableCell>
                    {modules.map((moduleKey) => {
                      const row = accessMap.get(moduleKey);
                      const allowed = Boolean(row?.access);
                      return (
                        <TableCell key={`${role.key}-${moduleKey}`} className="align-top text-center">
                          <div className="flex flex-col items-center gap-1">
                            {allowed ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                            ) : (
                              <XCircle className="h-4 w-4 text-rose-500" aria-hidden />
                            )}
                            <Badge variant={allowed ? "default" : "secondary"} className="text-[10px]">
                              {allowed ? "Access" : "No access"}
                            </Badge>
                            <span className="text-[10px] font-medium text-foreground">
                              {allowed ? "Allowed" : "Blocked"}
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              {allowed ? formatTs(row?.lastActionTimestamp) : "—"}
                            </div>
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </section>
    </main>
  );
}
