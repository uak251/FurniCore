import { useMemo, useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NativeAnalyticsPanel } from "@/components/NativeAnalyticsPanel";
import { loadAnalyticsPreferences } from "@/lib/analytics-preferences";
import { LineChart, ArrowUpRight } from "lucide-react";

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
const MODULE_HOME_ROUTES = {
  inventory: "/inventory",
  payroll: "/payroll",
  accounting: "/accounting",
  customer: "/customer-portal",
  hr: "/hr",
  supplier: "/supplier-portal",
  production: "/manufacturing",
};

function formatFilters(filters) {
  if (!filters || typeof filters !== "object") return [];
  return Object.entries(filters)
    .filter(([, value]) => value !== null && value !== undefined && String(value) !== "")
    .map(([key, value]) => `${key}: ${value}`);
}

export function ModuleInsightsDrawer({
  moduleName,
  title,
  filters,
  reportId,
  buttonLabel,
  /** Hide the default trigger button (e.g. when opening from a parent “Actions” menu). */
  hideTrigger = false,
  /** Controlled sheet open state (pair with `onOpenChange`). */
  open: openProp,
  onOpenChange: onOpenChangeProp,
}) {
  const [, setLocation] = useLocation();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next) => {
    onOpenChangeProp?.(next);
    if (!isControlled)
      setInternalOpen(next);
  };
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
  const activeFilters = formatFilters(filters);
  const homeRoute = MODULE_HOME_ROUTES[moduleName] ?? "/";
  const firstQuickActionRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      firstQuickActionRef.current?.focus?.();
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  if (!modulePrefs.enabled) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!hideTrigger ? (
        <SheetTrigger asChild>
          <Button
            variant="outline"
            className="touch-target focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`${triggerLabel} for ${moduleName}`}
          >
            <LineChart className="mr-1.5 h-4 w-4" aria-hidden />
            {triggerLabel}
          </Button>
        </SheetTrigger>
      ) : null}
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{panelTitle}</SheetTitle>
          <SheetDescription className="capitalize">
            Module: {moduleName}
            {reportId ? ` • Report: ${reportId}` : ""}
          </SheetDescription>
        </SheetHeader>

        {open ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  setLocation(homeRoute);
                }}
                className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`Open ${moduleName} module page`}
              >
                Open {moduleName} module
                <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-2" role="list" aria-label="Applied analytics filters">
                {activeFilters.map((text) => (
                  <Badge key={text} variant="outline" className="text-xs" role="listitem">
                    {text}
                  </Badge>
                ))}
              </div>
            )}
            {modulePrefs.showActions && quickLinks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Quick actions</p>
                <div className="flex flex-wrap gap-2">
                {quickLinks.map((link, idx) => (
                  <Button
                    key={link.href}
                    size="sm"
                    variant="secondary"
                    ref={idx === 0 ? firstQuickActionRef : null}
                    className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={`${link.label}. Navigate to ${link.href}`}
                    onClick={() => {
                      setOpen(false);
                      setLocation(link.href);
                    }}
                  >
                    {link.label}
                  </Button>
                ))}
                </div>
              </div>
            )}
            {!modulePrefs.showKpis && !modulePrefs.showCharts && (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Analytics content is disabled for this module in Admin Settings.
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
