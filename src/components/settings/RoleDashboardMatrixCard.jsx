import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";

const MATRIX_ROLES = [
  { key: "admin", label: "Admin", icon: ShieldCheck },
  { key: "sales_manager", label: "Sales Manager", icon: BarChart3 },
  { key: "inventory_manager", label: "Inventory Manager", icon: Warehouse },
  { key: "procurement_manager", label: "Procurement Manager", icon: ClipboardList },
  { key: "production_manager", label: "Production Manager", icon: Factory },
  { key: "hr_manager", label: "HR Manager", icon: Users },
  { key: "finance_manager", label: "Finance Manager", icon: Wallet },
  { key: "customer", label: "Customer", icon: User },
  { key: "supplier", label: "Supplier", icon: Truck },
];

/** Matrix row → role key stored in `allowedRoles` arrays / JWT `role` claim. */
const ROLE_FALLBACKS = {
  procurement_manager: "manager",
  hr_manager: "manager",
  finance_manager: "accountant",
  production_manager: "manager",
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
      "customer-profile": "Customer profile",
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

async function apiPatch(path, body) {
  const token = getAuthToken();
  const res = await fetch(`${apiOriginPrefix()}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

function rbacRoleForMatrixRow(roleKey) {
  return ROLE_FALLBACKS[roleKey] || roleKey;
}

function effectiveRolesForModule(contract, moduleKey) {
  const direct = contract?.effectiveAllowedRolesByModule?.[moduleKey];
  if (Array.isArray(direct)) return direct;
  const mod = contract?.modules?.[moduleKey];
  if (mod && Array.isArray(mod.allowedRoles)) return mod.allowedRoles;
  return [];
}

export function RoleDashboardMatrixCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["analytics-dashboard-matrix"],
    queryFn: async () => {
      const contract = await apiFetch("/api/analytics/rbac-contract");
      const rolePayloads = await Promise.all(
        MATRIX_ROLES.map((role, idx) => {
          const queryRole = rbacRoleForMatrixRow(role.key);
          const auditFlag = idx === 0 ? "&audit=matrix" : "";
          return apiFetch(`/api/analytics/native-dashboard?role=${encodeURIComponent(queryRole)}${auditFlag}`);
        }),
      );
      return { contract, rolePayloads };
    },
  });

  const patchAccess = useMutation({
    mutationFn: async ({ moduleKey, role, allow }) =>
      apiPatch("/api/analytics/admin/module-access", { moduleKey, role, allow }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics-dashboard-matrix"] });
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

  const contract = data?.contract;

  return (
    <Card className="border-border/70 max-w-full min-w-0">
      <CardHeader className="min-w-0">
        <CardTitle className="flex items-center gap-2">
          <Grid3X3 className="h-5 w-5 shrink-0" aria-hidden />
          Role to Dashboard Matrix
        </CardTitle>
        <CardDescription className="text-pretty">
          Master Admin: toggle role access per analytics module. Changes persist in{" "}
          <span className="font-mono text-xs">app_settings.ANALYTICS_RBAC_MODULE_RULES</span> and apply immediately
          to API checks. Row labels map to contract roles (e.g. Procurement Manager → manager).
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-6 p-4 pt-0 sm:p-6">
        {/* Desktop / tablet: wide matrix with horizontal scroll */}
        <div className="hidden md:block">
          <div className="max-w-full overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-20 min-w-[10rem] bg-card shadow-[2px_0_8px_-4px_rgba(0,0,0,0.15)]">
                    Role
                  </TableHead>
                  {modules.map((moduleKey) => (
                    <TableHead key={moduleKey} className="min-w-[7.5rem] whitespace-normal text-center align-bottom">
                      <div className="font-medium leading-tight">{moduleLabel(moduleKey)}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">{moduleKey}</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MATRIX_ROLES.map((role) => {
                  const RoleIcon = role.icon;
                  const accessRows = matrix.get(role.key) ?? [];
                  const accessMap = new Map(accessRows.map((row) => [row.dashboard, row]));
                  const rbacTarget = rbacRoleForMatrixRow(role.key);
                  const adminRow = role.key === "admin";

                  return (
                    <TableRow key={role.key}>
                      <TableCell className="sticky left-0 z-10 bg-card font-medium shadow-[2px_0_8px_-4px_rgba(0,0,0,0.12)]">
                        <div className="flex items-center gap-2">
                          <RoleIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                          <span>{role.label}</span>
                        </div>
                      </TableCell>
                      {modules.map((moduleKey) => {
                        const row = accessMap.get(moduleKey);
                        const liveAccess = Boolean(row?.access);
                        const effective = effectiveRolesForModule(contract, moduleKey);
                        const rbacAllowed = effective.includes(rbacTarget);
                        const switchDisabled =
                          adminRow || patchAccess.isPending || !contract?.modules?.[moduleKey];

                        return (
                          <TableCell key={`${role.key}-${moduleKey}`} className="align-top text-center">
                            <div className="flex flex-col items-center gap-1.5 py-1">
                              {liveAccess ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                              ) : (
                                <XCircle className="h-4 w-4 text-rose-500" aria-hidden />
                              )}
                              <Switch
                                checked={rbacAllowed}
                                disabled={switchDisabled}
                                aria-label={`${role.label} access to ${moduleLabel(moduleKey)}`}
                                onCheckedChange={(checked) => {
                                  patchAccess.mutate({
                                    moduleKey,
                                    role: rbacTarget,
                                    allow: checked,
                                  });
                                }}
                              />
                              <Badge variant={rbacAllowed ? "default" : "secondary"} className="text-[10px]">
                                {rbacAllowed ? "Allowed" : "Blocked"}
                              </Badge>
                              <div className="text-[10px] text-muted-foreground">
                                {liveAccess ? formatTs(row?.lastActionTimestamp) : "—"}
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
          </div>
        </div>

        {/* Mobile: one card per role — no horizontal clipping */}
        <div className="flex flex-col gap-4 md:hidden">
          {MATRIX_ROLES.map((role) => {
            const RoleIcon = role.icon;
            const accessRows = matrix.get(role.key) ?? [];
            const accessMap = new Map(accessRows.map((row) => [row.dashboard, row]));
            const rbacTarget = rbacRoleForMatrixRow(role.key);
            const adminRow = role.key === "admin";

            return (
              <Card key={role.key} className="border-border/60 shadow-sm">
                <CardHeader className="space-y-1 pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <RoleIcon className="h-4 w-4 text-primary" aria-hidden />
                    {role.label}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Contract role: <span className="font-mono">{rbacTarget}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {modules.map((moduleKey) => {
                    const row = accessMap.get(moduleKey);
                    const liveAccess = Boolean(row?.access);
                    const effective = effectiveRolesForModule(contract, moduleKey);
                    const rbacAllowed = effective.includes(rbacTarget);
                    const switchDisabled =
                      adminRow || patchAccess.isPending || !contract?.modules?.[moduleKey];

                    return (
                      <div
                        key={`${role.key}-${moduleKey}-m`}
                        className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{moduleLabel(moduleKey)}</p>
                          <p className="truncate font-mono text-[10px] text-muted-foreground">{moduleKey}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Last action: {liveAccess ? formatTs(row?.lastActionTimestamp) : "—"}
                          </p>
                        </div>
                        <Switch
                          checked={rbacAllowed}
                          disabled={switchDisabled}
                          aria-label={`${role.label} access to ${moduleLabel(moduleKey)}`}
                          onCheckedChange={(checked) => {
                            patchAccess.mutate({
                              moduleKey,
                              role: rbacTarget,
                              allow: checked,
                            });
                          }}
                        />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {patchAccess.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not save access</AlertTitle>
            <AlertDescription>{patchAccess.error?.message || "Update failed."}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
