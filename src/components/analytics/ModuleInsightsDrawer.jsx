import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NativeAnalyticsPanel } from "@/components/NativeAnalyticsPanel";
import { loadAnalyticsPreferences } from "@/lib/analytics-preferences";

const QUICK_LINKS = {
  inventory: [{ label: "Low stock items", href: "/inventory?filter=low-stock" }],
  payroll: [{ label: "Pending payroll approvals", href: "/payroll?status=pending" }],
  accounting: [
    { label: "Pending accounting items", href: "/accounting?status=pending" },
    { label: "Income cashbook view", href: "/accounting?type=income" },
    { label: "Expense cashbook view", href: "/accounting?type=expense" },
  ],
  customer: [{ label: "Pending customer orders", href: "/customer-portal/orders?status=pending" }],
};

export function ModuleInsightsDrawer({
  moduleName,
  title,
  filters,
  reportId,
  buttonLabel,
}) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const prefs = loadAnalyticsPreferences();
  const modulePrefs = prefs?.[moduleName] ?? {
    enabled: true,
    showKpis: true,
    showCharts: true,
    showActions: true,
  };
  const quickLinks = useMemo(() => QUICK_LINKS[moduleName] ?? [], [moduleName]);
  const panelTitle = title ?? "Analytics";
  const triggerLabel = buttonLabel ?? "View Analytics";

  if (!modulePrefs.enabled) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">{triggerLabel}</Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{panelTitle}</SheetTitle>
          <SheetDescription className="capitalize">
            Module: {moduleName}
            {reportId ? ` • Report: ${reportId}` : ""}
            {filters ? ` • Filters: ${JSON.stringify(filters)}` : ""}
          </SheetDescription>
        </SheetHeader>

        {open ? (
          <div className="mt-4 space-y-4">
            {modulePrefs.showActions && quickLinks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {quickLinks.map((link) => (
                  <Button
                    key={link.href}
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setOpen(false);
                      setLocation(link.href);
                    }}
                  >
                    {link.label}
                  </Button>
                ))}
              </div>
            )}

            <NativeAnalyticsPanel
              moduleKey={moduleName}
              title={panelTitle}
              visibleConfig={{
                showKpis: modulePrefs.showKpis,
                showCharts: modulePrefs.showCharts,
                showActions: modulePrefs.showActions,
              }}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
