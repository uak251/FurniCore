import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";
import { toast } from "@/hooks/use-toast";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6", "#a855f7"];

export function fetchNativeAnalytics(moduleKey) {
  const token = getAuthToken() ?? "";
  return fetch(`${apiOriginPrefix()}/api/analytics/native/${moduleKey}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(async (res) => {
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    const raw = await res.text().catch(() => "");
    if (!contentType.includes("application/json")) {
      throw new Error(
        `Analytics API returned non-JSON (status ${res.status}, content-type: ${contentType || "unknown"}). Response preview: ${raw.slice(0, 140).replace(/\s+/g, " ").trim()}`,
      );
    }
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(
        `Analytics API returned invalid JSON (status ${res.status}). Response preview: ${raw.slice(0, 140).replace(/\s+/g, " ").trim()}`,
      );
    }
    if (!res.ok) {
      throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
    }
    return payload;
  });
}

function apiPost(path) {
  const token = getAuthToken() ?? "";
  return fetch(`${apiOriginPrefix()}${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
  }).then(async (res) => {
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(payload?.error || `HTTP ${res.status}`);
      error.payload = payload;
      throw error;
    }
    return payload;
  });
}

function ChartRenderer({ chart }) {
  if (!chart?.data?.length) {
    return <p className="text-xs text-muted-foreground">No data yet.</p>;
  }

  if (chart.type === "line") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chart.data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={chart.xKey} fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend />
          {(chart.yKeys || []).map((y, i) => (
            <Line key={y} type="monotone" dataKey={y} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "pie") {
    const y = chart.yKeys?.[0] || "value";
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={chart.data} dataKey={y} nameKey={chart.xKey} outerRadius={90} label>
            {chart.data.map((row, i) => {
              const rowKey = row?.[chart.xKey] ?? row?.name ?? row?.label ?? i;
              return <Cell key={`${chart.id}-slice-${String(rowKey)}`} fill={COLORS[i % COLORS.length]} />;
            })}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chart.data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={chart.xKey} fontSize={11} />
        <YAxis fontSize={11} />
        <Tooltip />
        <Legend />
        {(chart.yKeys || []).map((y, i) => (
          <Bar key={y} dataKey={y} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function semanticHint(chart) {
  if (chart?.semantic) return chart.semantic;
  if (chart?.data?.some((row) => typeof row?.remark === "string")) {
    return "Variance remarks: increased / same / decreased.";
  }
  return null;
}

const ACTION_ICONS = {
  "contact-supplier": "📞",
  "create-demand": "📊",
  "reorder-now": "📊",
  "approve-quote": "✅",
  "assign-worker": "👷",
  "adjust-payroll": "💰",
  "allocate-bonus-penalty": "💰",
  "track-product": "🚚",
  "generate-report": "📄",
  "approve-transaction": "✅",
  "resolve-alert": "✅",
  "view-audit-log": "📘",
  "log-qc-check": "🧪",
  "compare-rates": "📈",
  "lock-price": "🔒",
  "view-satisfaction-survey": "📝",
};

function feedbackMessage(actionId, fallback = "Action logged") {
  const map = {
    "create-demand": "Demand created",
    "approve-quote": "Queue opened",
    "approve-transaction": "Queue opened",
    "contact-supplier": "Supplier contact opened",
    "track-product": "Tracking opened",
    "assign-worker": "Worker assignment opened",
    "adjust-payroll": "Payroll adjustment opened",
  };
  return map[actionId] || fallback;
}

function formatActionTime(iso) {
  if (!iso) return "No recent action";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No recent action";
  return d.toLocaleString();
}

function QuickActionButton({ moduleKey, chartId, action, onActionComplete }) {
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function onConfirm() {
    setBusy(true);
    try {
      const result = await apiPost(`/api/analytics/native/${moduleKey}/actions/${action.id}`);
      const icon = ACTION_ICONS[action.id] || "✅";
      toast({
        title: `${icon} ${feedbackMessage(action.id, result?.message || "Action logged")}`,
        description: `Logged at ${formatActionTime(result?.executedAt)}`,
        duration: 4000,
      });
      onActionComplete?.(chartId, action.id, result?.executedAt);
      if (result?.redirectTo) setLocation(result.redirectTo);
    } catch (err) {
      const payload = err?.payload;
      toast({
        variant: "destructive",
        title: "Action failed",
        description: payload?.error || err?.message || "Unknown error",
        duration: 5000,
      });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant={action.tone === "secondary" ? "outline" : "default"}
          className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Quick action: ${action.label}`}
        >
          {(ACTION_ICONS[action.id] || "•")} {action.label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Action</AlertDialogTitle>
          <AlertDialogDescription>{action.confirm || `Run ${action.label}?`}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={busy}>
            {busy ? "Running..." : "Continue"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function NativeAnalyticsPanel({
  moduleKey,
  title,
  dataOverride,
  isLoadingOverride,
  errorOverride,
  visibleConfig,
}) {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["native-analytics", moduleKey],
    queryFn: () => fetchNativeAnalytics(moduleKey),
    enabled: Boolean(moduleKey),
    staleTime: 120_000,
  });
  const resolvedData = dataOverride ?? data;
  const resolvedIsLoading = typeof isLoadingOverride === "boolean" ? isLoadingOverride : isLoading;
  const resolvedError = errorOverride ?? (isError ? error : null);
  const resolvedIsError = Boolean(resolvedError);
  const showKpis = visibleConfig?.showKpis !== false;
  const showCharts = visibleConfig?.showCharts !== false;
  const showActions = visibleConfig?.showActions !== false;
  const allSectionsHidden = !showKpis && !showCharts;

  const kpis = useMemo(() => resolvedData?.kpis ?? [], [resolvedData]);
  const charts = useMemo(() => resolvedData?.charts ?? [], [resolvedData]);
  const updatedAt = resolvedData?.updatedAt;
  const [actionMeta, setActionMeta] = useState({});

  function handleActionComplete(chartId, actionId, executedAt) {
    setActionMeta((prev) => ({
      ...prev,
      [chartId]: { actionId, executedAt },
    }));
  }

  return (
    <section aria-label={`${moduleKey} analytics panel`}>
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{title ?? "Native Analytics"}</CardTitle>
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {updatedAt ? `Updated ${new Date(updatedAt).toLocaleString()}` : "Live analytics"}
            </p>
          </div>
          <Badge variant="secondary" className="capitalize">{moduleKey}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {resolvedIsLoading && (
          <div className="space-y-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {resolvedIsError && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Analytics unavailable</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{resolvedError?.message ?? "Could not load analytics data"}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
                className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`Retry loading ${moduleKey} analytics`}
              >
                {isFetching ? "Retrying..." : "Try again"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!resolvedIsLoading && !resolvedIsError && (
          <>
            {allSectionsHidden && (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                KPIs and charts are hidden for this module. Update visibility controls in Admin Settings to show data.
              </div>
            )}
            {showKpis && kpis.length > 0 && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {kpis.map((kpi, idx) => (
                  <div key={`${kpi.label}-${idx}`} className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                    <p className="text-lg font-semibold tabular-nums">{String(kpi.value)}</p>
                  </div>
                ))}
              </div>
            )}

            {showCharts && (
              <div className="grid gap-4 xl:grid-cols-2">
                {charts.map((chart) => (
                  <Card key={chart.id} className="border-border/60" role="region" aria-label={`Chart: ${chart.title}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{chart.title}</CardTitle>
                      {semanticHint(chart) && (
                        <p className="text-xs text-muted-foreground">{semanticHint(chart)}</p>
                      )}
                      {showActions && Array.isArray(chart.actions) && chart.actions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {chart.actions.map((action) => (
                            <QuickActionButton
                              key={action.id}
                              moduleKey={moduleKey}
                              chartId={chart.id}
                              action={action}
                              onActionComplete={handleActionComplete}
                            />
                          ))}
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div tabIndex={0} className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        <ChartRenderer chart={chart} />
                      </div>
                      <p className="sr-only">
                        {chart.title} chart with {Array.isArray(chart.data) ? chart.data.length : 0} data points.
                      </p>
                      {showActions && (
                        <div className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                          {actionMeta[chart.id]
                            ? `${ACTION_ICONS[actionMeta[chart.id].actionId] || "✅"} Last action: ${formatActionTime(actionMeta[chart.id].executedAt)}`
                            : "No recent action"}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {showCharts && charts.length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No chart data available for this module yet.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
    </section>
  );
}
