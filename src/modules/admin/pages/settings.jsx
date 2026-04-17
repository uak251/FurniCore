import { useMemo, useState, useEffect } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoleDashboardMatrixCard } from "@/components/settings/RoleDashboardMatrixCard";
import {
  ANALYTICS_MODULE_KEYS,
  defaultAnalyticsPreferences,
  loadAnalyticsPreferences,
  saveAnalyticsPreferences,
} from "@/lib/analytics-preferences";

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
      "customer-profile": "Customer profile",
    }[moduleKey] || moduleKey
  );
}

export default function SettingsPage() {
  const [analyticsPrefs, setAnalyticsPrefs] = useState(() => loadAnalyticsPreferences());
  const [saveMessage, setSaveMessage] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");

  const filteredModules = useMemo(() => {
    const query = moduleSearch.trim().toLowerCase();
    if (!query) return ANALYTICS_MODULE_KEYS;
    return ANALYTICS_MODULE_KEYS.filter((moduleKey) =>
      moduleLabel(moduleKey).toLowerCase().includes(query) || moduleKey.toLowerCase().includes(query),
    );
  }, [moduleSearch]);

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

      <section aria-labelledby="role-dashboard-matrix" className="min-w-0">
        <div id="role-dashboard-matrix" className="sr-only">
          Role to dashboard matrix
        </div>
        <RoleDashboardMatrixCard />
      </section>
    </main>
  );
}
