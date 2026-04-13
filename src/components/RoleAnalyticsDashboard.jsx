import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeAnalyticsPanel } from "@/components/NativeAnalyticsPanel";

const ROLE_MODULE_MAP = {
  manager: ["inventory", "procurement", "production", "hr", "accounting", "notifications"],
  inventory_manager: ["inventory", "procurement", "supplier", "production"],
  accountant: ["accounting", "finance", "procurement", "notifications"],
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

export function RoleAnalyticsDashboard({ role }) {
  const modules = ROLE_MODULE_MAP[role] || [];
  if (modules.length === 0) return null;

  return (
    <Card className="rounded-2xl border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Manager Analytics Dashboard</CardTitle>
        <CardDescription>
          Role-scoped operational analytics with direct actions and audit logging.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {modules.map((moduleKey) => (
          <NativeAnalyticsPanel
            key={`${role}-${moduleKey}`}
            moduleKey={moduleKey}
            title={`${titleFor(moduleKey)} · Role View`}
          />
        ))}
      </CardContent>
    </Card>
  );
}
