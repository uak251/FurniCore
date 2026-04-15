import { useMemo, useState } from "react";
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
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";
import {
  ANALYTICS_MODULE_KEYS,
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
  const res = await fetch(`${apiOriginPrefix}${path}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    const message = payload?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return res.json();
}

export default function SettingsPage() {
  const [analyticsPrefs, setAnalyticsPrefs] = useState(() => loadAnalyticsPreferences());

  const { data, isLoading, isError, error } = useQuery({
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
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Matrix unavailable</AlertTitle>
        <AlertDescription>{error?.message || "Failed to load role dashboard matrix."}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Analytics Visibility Controls</CardTitle>
          <CardDescription>
            Enable analytics per module and choose whether KPIs, charts, and actions are visible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="hidden grid-cols-[minmax(160px,1fr)_repeat(4,120px)] gap-2 px-2 text-xs font-medium text-muted-foreground md:grid">
            <div>Module</div>
            <div className="text-center">Enabled</div>
            <div className="text-center">Show KPIs</div>
            <div className="text-center">Show Charts</div>
            <div className="text-center">Show Actions</div>
          </div>
          {ANALYTICS_MODULE_KEYS.map((moduleKey) => {
            const pref = analyticsPrefs[moduleKey] ?? {};
            return (
              <div
                key={moduleKey}
                className="grid grid-cols-2 gap-3 rounded-md border p-3 md:grid-cols-[minmax(160px,1fr)_repeat(4,120px)] md:items-center"
              >
                <div className="col-span-2 font-medium capitalize md:col-span-1">
                  {moduleLabel(moduleKey)}
                </div>

                <label className="flex items-center justify-between gap-2 text-xs md:justify-center">
                  <span className="md:hidden">Enabled</span>
                  <Switch
                    checked={pref.enabled !== false}
                    onCheckedChange={(checked) => updateAnalyticsPref(moduleKey, "enabled", checked)}
                  />
                </label>

                <label className="flex items-center justify-between gap-2 text-xs md:justify-center">
                  <span className="md:hidden">Show KPIs</span>
                  <Switch
                    checked={pref.showKpis !== false}
                    onCheckedChange={(checked) => updateAnalyticsPref(moduleKey, "showKpis", checked)}
                  />
                </label>

                <label className="flex items-center justify-between gap-2 text-xs md:justify-center">
                  <span className="md:hidden">Show Charts</span>
                  <Switch
                    checked={pref.showCharts !== false}
                    onCheckedChange={(checked) => updateAnalyticsPref(moduleKey, "showCharts", checked)}
                  />
                </label>

                <label className="flex items-center justify-between gap-2 text-xs md:justify-center">
                  <span className="md:hidden">Show Actions</span>
                  <Switch
                    checked={pref.showActions !== false}
                    onCheckedChange={(checked) => updateAnalyticsPref(moduleKey, "showActions", checked)}
                  />
                </label>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5" aria-hidden />
            Role to Dashboard Matrix
          </CardTitle>
          <CardDescription>
            Admin-only RBAC verification grid using live contract and role dashboard definitions.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
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
    </div>
  );
}
