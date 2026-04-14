import { useMemo } from "react";
import { Link } from "wouter";
import { useQueries } from "@tanstack/react-query";
import { Bell, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchNativeAnalytics } from "@/components/NativeAnalyticsPanel";
import { modulesForRole, normalizeRole } from "@/utils/roleModules";
import { cn } from "@/lib/utils";

function readKpiValue(data, label) {
  const kpi = Array.isArray(data?.kpis)
    ? data.kpis.find((x) => String(x?.label || "").toLowerCase() === label.toLowerCase())
    : null;
  return kpi?.value;
}

function pendingAlertsFromNotifications(data) {
  const explicitPending = readKpiValue(data, "Pending Alerts");
  if (typeof explicitPending === "number") return explicitPending;
  const chart = Array.isArray(data?.charts)
    ? data.charts.find((c) => c?.id === "resolved-pending")
    : null;
  const pending = Array.isArray(chart?.data)
    ? chart.data.find((d) => String(d?.state || "").toLowerCase() === "pending")
    : null;
  return Number(pending?.value || 0);
}

function miniKpiForModule(moduleKey, data) {
  if (!data) return null;
  if (moduleKey === "inventory") {
    const value = readKpiValue(data, "Low Stock");
    return value != null ? `Low Stock: ${value}` : null;
  }
  if (moduleKey === "accounting" || moduleKey === "reports") {
    const value = readKpiValue(data, "Current Valuation");
    return value != null ? `Valuation: ${value}` : null;
  }
  if (moduleKey === "hr") {
    const value = readKpiValue(data, "Attendance Records");
    return value != null ? `Attendance: ${value}` : null;
  }
  if (moduleKey === "sales" || moduleKey === "orders" || moduleKey === "customers") {
    const value = readKpiValue(data, "Customer Orders");
    return value != null ? `Orders: ${value}` : null;
  }
  return null;
}

export function RoleLandingStrip({ role }) {
  const modules = modulesForRole(role);
  const normalizedRole = normalizeRole(role);
  const analyticsModules = useMemo(
    () => Array.from(new Set(modules.map((m) => m.analyticsModule).filter(Boolean))),
    [modules],
  );
  const includesNotifications = analyticsModules.includes("notifications");
  const fetchModules = useMemo(
    () => (includesNotifications ? analyticsModules : [...analyticsModules, "notifications"]),
    [analyticsModules, includesNotifications],
  );
  const queries = useQueries({
    queries: fetchModules.map((moduleKey) => ({
      queryKey: ["native-analytics", "landing-strip", moduleKey],
      queryFn: () => fetchNativeAnalytics(moduleKey),
      staleTime: 120_000,
    })),
  });
  const byModule = useMemo(
    () =>
      Object.fromEntries(
        fetchModules.map((moduleKey, idx) => [moduleKey, queries[idx]?.data]),
      ),
    [fetchModules, queries],
  );
  const isLoading = queries.some((q) => q.isLoading);
  const errorCount = queries.filter((q) => q.error).length;
  const pendingAlerts = pendingAlertsFromNotifications(byModule.notifications);
  const hasCriticalAlerts = pendingAlerts >= 5;

  if (!normalizedRole || modules.length === 0) return null;

  return (
    <Card className="rounded-2xl border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Role Landing Strip</CardTitle>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <Badge
                variant={hasCriticalAlerts ? "destructive" : "secondary"}
                className="gap-1"
              >
                <Bell className="h-3 w-3" />
                Alerts: {pendingAlerts}
              </Badge>
            )}
            {errorCount > 0 ? <Badge variant="outline">Issues: {errorCount}</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {errorCount > 0 && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Some module data unavailable</AlertTitle>
            <AlertDescription>
              Navigation is available, but a few analytics calls failed.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex gap-3 overflow-x-auto pb-1 lg:grid lg:grid-cols-3 lg:overflow-visible">
          {modules.map((mod) => {
            const Icon = mod.icon;
            const miniKpi = miniKpiForModule(mod.key, byModule[mod.analyticsModule]);
            return (
              <Link key={`${normalizedRole}-${mod.key}`} href={mod.href}>
                <div
                  className={cn(
                    "min-w-[210px] rounded-xl border bg-card/70 p-3 transition-all",
                    "hover:-translate-y-0.5 hover:shadow-md",
                    "lg:min-w-0",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-primary/10 p-1.5 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <p className="text-sm font-semibold">{mod.label}</p>
                    </div>
                    {mod.analyticsModule === "notifications" && pendingAlerts > 0 ? (
                      <Badge variant={hasCriticalAlerts ? "destructive" : "secondary"}>{pendingAlerts}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {miniKpi || "Open module"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
