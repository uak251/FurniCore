import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Package,
  Boxes,
  Hammer,
  AlertTriangle,
  FileText,
  ArrowRight,
  FilePlus,
  Factory,
  Truck,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Bell,
  Users,
  Building2,
  Sparkles,
  CircleDot,
  Wallet,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import { AdminUnifiedAnalyticsDashboard } from "@/components/AdminUnifiedAnalyticsDashboard";
import { RoleAnalyticsDashboard } from "@/components/RoleAnalyticsDashboard";

const QUICK_ACTIONS = [
  { href: "/inventory", label: "Add inventory item", icon: Boxes, accent: "from-violet-500/15 to-violet-600/5 border-violet-500/20 text-violet-700 dark:text-violet-300" },
  { href: "/quotes", label: "Create quote", icon: FilePlus, accent: "from-sky-500/15 to-sky-600/5 border-sky-500/20 text-sky-700 dark:text-sky-300" },
  { href: "/manufacturing", label: "New production task", icon: Factory, accent: "from-amber-500/15 to-amber-600/5 border-amber-500/20 text-amber-800 dark:text-amber-200" },
  { href: "/suppliers", label: "Add supplier", icon: Truck, accent: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-200" },
];

const statAccent = [
  "border-l-[3px] border-l-chart-1 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]",
  "border-l-[3px] border-l-chart-2 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]",
  "border-l-[3px] border-l-chart-3 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]",
  "border-l-[3px] border-l-chart-4 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]",
];

function formatWhen(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
}

export default function Dashboard() {
  const { format: fmtMoney } = useCurrency();
  const { data: user } = useGetCurrentUser();
  const {
    data: summary,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-10 w-2/3 max-w-md rounded-lg" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-48 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    const detail =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "The dashboard could not load summary data from the API.";
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Alert variant="destructive">
          <AlertTitle>Dashboard unavailable</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{detail}</p>
            <p className="text-sm opacity-90">
              Confirm the API is running. On Vercel, set <code className="rounded bg-muted px-1 py-0.5 text-xs">VITE_API_URL</code> to your backend.
            </p>
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Retry
        </Button>
      </div>
    );
  }

  if (!summary) {
    return (
      <Alert>
        <AlertTitle>No overview data</AlertTitle>
        <AlertDescription>
          The server returned an empty response. Try refreshing or check the API logs.
        </AlertDescription>
      </Alert>
    );
  }

  const revenue = Number(summary.monthlyRevenue ?? 0);
  const expenses = Number(summary.monthlyExpenses ?? 0);
  const totalFlow = revenue + expenses;
  const revenuePct = totalFlow > 0 ? Math.round((revenue / totalFlow) * 100) : 50;

  const statCards = [
    {
      href: "/products",
      title: "Products",
      value: summary.totalProducts,
      hint: "Active in catalog",
      icon: Package,
    },
    {
      href: "/inventory",
      title: "Inventory",
      value: summary.totalInventoryItems,
      hint: "SKUs on hand",
      icon: Boxes,
    },
    {
      href: "/manufacturing",
      title: "Manufacturing",
      value: summary.activeManufacturingTasks,
      hint: "Tasks in progress",
      icon: Hammer,
    },
    {
      href: "/quotes",
      title: "Pending quotes",
      value: summary.pendingQuotes,
      hint: "Awaiting approval",
      icon: FileText,
    },
  ];

  const firstName = user?.name?.split(/\s+/)[0] ?? "there";

  return (
    <div className="space-y-10 pb-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-primary/[0.07] via-card to-card p-6 shadow-sm md:p-8"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-chart-2/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1 font-normal">
                <Sparkles className="h-3 w-3" aria-hidden />
                Today
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Hello, {firstName}
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
              Your operations snapshot — inventory, production, quotes, and cash movement this month.
            </p>
          </div>
          <Button variant="secondary" className="shrink-0 gap-2 shadow-sm" asChild>
            <Link href="/notifications">
              <Bell className="h-4 w-4" />
              {summary.unreadNotifications > 0 ? (
                <>
                  {summary.unreadNotifications} unread
                  <Badge className="ml-1 h-5 min-w-[1.25rem] px-1">{summary.unreadNotifications > 99 ? "99+" : summary.unreadNotifications}</Badge>
                </>
              ) : (
                "Notifications"
              )}
            </Link>
          </Button>
        </div>
      </motion.div>

      {/* Stock alert */}
      {summary.lowStockCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 rounded-2xl border border-destructive/30 bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent px-5 py-4 text-destructive sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-destructive/15">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="font-semibold text-destructive">Low stock alert</p>
              <p className="text-sm opacity-90">
                {summary.lowStockCount} item{summary.lowStockCount === 1 ? "" : "s"} at or below reorder level.
              </p>
            </div>
          </div>
          <Button variant="destructive" size="sm" className="shrink-0 gap-2 shadow-sm" asChild>
            <Link href="/inventory">
              Review inventory
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </motion.div>
      )}

      {user?.role === "admin" && <AdminUnifiedAnalyticsDashboard />}
      {["manager", "inventory_manager", "accountant"].includes(user?.role || "") && (
        <RoleAnalyticsDashboard role={user.role} />
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((c, i) => (
          <motion.div
            key={c.href}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          >
            <Link href={c.href} className="group block h-full outline-none">
              <Card
                className={cn(
                  "h-full overflow-hidden rounded-2xl transition-all duration-200",
                  "hover:-translate-y-0.5 hover:shadow-md",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  statAccent[i % statAccent.length],
                )}
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
                  <div className="rounded-lg bg-muted/80 p-2 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <c.icon className="h-4 w-4" aria-hidden />
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-3xl font-bold tabular-nums tracking-tight">{c.value}</p>
                  <p className="text-xs text-muted-foreground">{c.hint}</p>
                  <p className="pt-2 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Open module →
                  </p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Pulse row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { icon: Users, label: "Active employees", value: summary.totalEmployees, sub: "HR records" },
          { icon: Building2, label: "Active suppliers", value: summary.activeSuppliers, sub: `of ${summary.totalSuppliers} total` },
          { icon: CircleDot, label: "Operations", value: summary.pendingQuotes, sub: "quotes pending" },
        ].map((row, i) => (
          <motion.div
            key={row.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.04 }}
            className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card/80 px-4 py-3 shadow-sm backdrop-blur-sm"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/90">
              <row.icon className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{row.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{row.value}</p>
              <p className="truncate text-xs text-muted-foreground">{row.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Financial + side column */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4 xl:col-span-2"
        >
          <Card className="overflow-hidden rounded-2xl border-border/80 shadow-sm">
            <CardHeader className="border-b border-border/60 bg-muted/30 pb-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">Cash pulse · This month</CardTitle>
                  <CardDescription>Revenue vs expenses (same period)</CardDescription>
                </div>
                <Wallet className="h-5 w-5 text-muted-foreground" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    <TrendingUp className="h-4 w-4" />
                    Revenue
                  </div>
                  <p className="text-2xl font-bold tabular-nums">{fmtMoney(revenue)}</p>
                </div>
                <div className="space-y-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-rose-800 dark:text-rose-300">
                    <TrendingDown className="h-4 w-4" />
                    Expenses
                  </div>
                  <p className="text-2xl font-bold tabular-nums">{fmtMoney(expenses)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Share of recorded flow</span>
                  <span className="tabular-nums">{revenuePct}% revenue</span>
                </div>
                <Progress value={revenuePct} className="h-2.5 bg-muted" />
                <p className="text-xs text-muted-foreground">
                  Net position this month:{" "}
                  <span className={cn("font-semibold", revenue - expenses >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                    {fmtMoney(revenue - expenses)}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-lg">Recent activity</CardTitle>
                <CardDescription>Latest changes across modules</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-primary" asChild>
                <Link href="/activity">View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <ul className="space-y-0 divide-y divide-border/60" aria-label="Recent system activity">
                {summary.recentActivity?.length > 0 ? (
                  summary.recentActivity.slice(0, 6).map((log, idx) => (
                    <li key={log.id ?? idx} className="flex gap-4 py-4 first:pt-0">
                      <div className="flex shrink-0 flex-col items-center">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {(log.userName || "S").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1 border-l border-border/60 pl-4">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">{log.userName || "System"}</span>
                          <Badge variant="outline" className="text-[10px] font-normal uppercase tracking-wide">
                            {log.module}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground leading-snug">{log.description}</p>
                        <time className="text-xs text-muted-foreground/80" dateTime={log.createdAt}>
                          {formatWhen(log.createdAt)}
                        </time>
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="py-12 text-center text-sm text-muted-foreground">No recent activity yet.</li>
                )}
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-4"
        >
          <Card className="rounded-2xl border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Quick actions</CardTitle>
              <CardDescription>Jump into common tasks</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {QUICK_ACTIONS.map((a) => {
                const QIcon = a.icon;
                return (
                  <Link
                    key={a.href}
                    href={a.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl border bg-gradient-to-br p-4 transition-all",
                      "hover:-translate-y-0.5 hover:shadow-md",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      a.accent,
                    )}
                  >
                    <QIcon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
                    <span className="flex-1 text-left text-sm font-medium leading-snug">{a.label}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
