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

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6", "#a855f7"];

function apiFetch(path) {
  const token = getAuthToken() ?? "";
  return fetch(`${apiOriginPrefix()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(async (res) => {
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `HTTP ${res.status}`);
    }
    return res.json();
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
    if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
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
            {chart.data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
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

function QuickActionButton({ moduleKey, action }) {
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function onConfirm() {
    setBusy(true);
    try {
      const result = await apiPost(`/api/analytics/native/${moduleKey}/actions/${action.id}`);
      if (result?.redirectTo) setLocation(result.redirectTo);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`Action failed: ${err?.message || "Unknown error"}`);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={action.tone === "secondary" ? "outline" : "default"}>
          {action.label}
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

export function NativeAnalyticsPanel({ moduleKey, title }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["native-analytics", moduleKey],
    queryFn: () => apiFetch(`/api/analytics/native/${moduleKey}`),
    enabled: Boolean(moduleKey),
    staleTime: 120_000,
  });

  const kpis = useMemo(() => data?.kpis ?? [], [data]);
  const charts = useMemo(() => data?.charts ?? [], [data]);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title ?? "Native Analytics"}</CardTitle>
          <Badge variant="secondary" className="capitalize">{moduleKey}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {isError && (
          <Alert variant="destructive">
            <AlertTitle>Analytics unavailable</AlertTitle>
            <AlertDescription>{error?.message ?? "Could not load analytics data"}</AlertDescription>
          </Alert>
        )}

        {!isLoading && !isError && (
          <>
            {kpis.length > 0 && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {kpis.map((kpi, idx) => (
                  <div key={`${kpi.label}-${idx}`} className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                    <p className="text-lg font-semibold tabular-nums">{String(kpi.value)}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
              {charts.map((chart) => (
                <Card key={chart.id} className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{chart.title}</CardTitle>
                    {semanticHint(chart) && (
                      <p className="text-xs text-muted-foreground">{semanticHint(chart)}</p>
                    )}
                    {Array.isArray(chart.actions) && chart.actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {chart.actions.map((action) => (
                          <QuickActionButton key={action.id} moduleKey={moduleKey} action={action} />
                        ))}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <ChartRenderer chart={chart} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
