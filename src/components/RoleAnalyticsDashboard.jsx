import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NativeAnalyticsPanel, fetchNativeAnalytics } from "@/components/NativeAnalyticsPanel";
import { Badge } from "@/components/ui/badge";

const ROLE_MODULE_MAP = {
  manager: ["inventory", "procurement", "production", "hr", "accounting", "notifications"],
  inventory_manager: ["inventory", "procurement", "supplier", "production"],
  accountant: ["accounting", "finance", "procurement", "notifications"],
  sales_manager: ["customer", "procurement", "notifications"],
  hr_manager: ["hr", "payroll", "notifications"],
};

function titleFor(moduleKey) {
  const labels = {
    inventory: "Inventory",
    procurement: "Procurement",
    production: "Production",
    hr: "HR / Payroll",
    accounting: "Accounting / Finance",
    finance: "Finance",
    notifications: "Notifications / Governance",
    supplier: "Suppliers",
    customer: "Customers",
  };
  return labels[moduleKey] || moduleKey;
}

const ROLE_TITLES = {
  manager: "Operations Dashboard",
  inventory_manager: "Inventory Dashboard",
  accountant: "Finance Dashboard",
  sales_manager: "Sales Dashboard",
  hr_manager: "HR Dashboard",
};

export function RoleAnalyticsDashboard({ role }) {
  const modules = ROLE_MODULE_MAP[role] || [];
  const queries = useQueries({
    queries: modules.map((moduleKey) => ({
      queryKey: ["native-analytics", moduleKey],
      queryFn: () => fetchNativeAnalytics(moduleKey),
      staleTime: 120_000,
    })),
  });
  const totalKpis = useMemo(
    () =>
      queries.reduce((sum, q) => {
        const count = Array.isArray(q.data?.kpis) ? q.data.kpis.length : 0;
        return sum + count;
      }, 0),
    [queries],
  );
  const isAnyLoading = queries.some((q) => q.isLoading);
  const errors = queries
    .filter((q) => q.error)
    .map((q) => q.error?.message)
    .filter(Boolean);
  if (modules.length === 0) return null;

  return (
    <Card className="rounded-2xl border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">{ROLE_TITLES[role] || "Role Analytics Dashboard"}</CardTitle>
        <CardDescription>
          Role-scoped operational analytics with direct actions, alerts, and module-level visibility.
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge variant="secondary">Modules: {modules.length}</Badge>
          <Badge variant="secondary">KPIs: {totalKpis}</Badge>
          <Badge variant={errors.length ? "destructive" : "secondary"}>
            Alerts: {errors.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>Operational alerts</AlertTitle>
            <AlertDescription>
              {errors.slice(0, 2).join(" | ")}
            </AlertDescription>
          </Alert>
        )}
        {modules.map((moduleKey, idx) => (
          <NativeAnalyticsPanel
            key={`${role}-${moduleKey}`}
            moduleKey={moduleKey}
            title={`${titleFor(moduleKey)} · Role View`}
            dataOverride={queries[idx]?.data}
            isLoadingOverride={isAnyLoading && !queries[idx]?.data}
            errorOverride={queries[idx]?.error}
          />
        ))}
      </CardContent>
    </Card>
  );
}
