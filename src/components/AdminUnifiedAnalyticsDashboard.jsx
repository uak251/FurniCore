import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeAnalyticsPanel } from "@/components/NativeAnalyticsPanel";

const MODULES = [
  { key: "inventory", title: "Inventory" },
  { key: "procurement", title: "Procurement" },
  { key: "production", title: "Production" },
  { key: "hr", title: "HR / Payroll" },
  { key: "supplier", title: "Suppliers" },
  { key: "customer", title: "Customers" },
  { key: "accounting", title: "Accounting / Finance" },
  { key: "notifications", title: "Notifications / Governance" },
];

export function AdminUnifiedAnalyticsDashboard() {
  return (
    <Card className="rounded-2xl border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Unified Admin Analytics Dashboard</CardTitle>
        <CardDescription>
          Cross-module KPIs and quick actions in one global view.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {MODULES.map((mod) => (
          <NativeAnalyticsPanel
            key={mod.key}
            moduleKey={mod.key}
            title={`${mod.title} · Global Analytics`}
          />
        ))}
      </CardContent>
    </Card>
  );
}
