import { useMemo } from "react";
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
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";

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

export function RoleDashboardMatrixCard() {
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
  );
}
