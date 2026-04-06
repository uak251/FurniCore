import { Link } from "wouter";
import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Package,
  Boxes,
  Hammer,
  AlertTriangle,
  FileText,
  CheckCircle2,
  ArrowRight,
  FilePlus,
  Factory,
  Truck,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  { href: "/inventory", label: "Add inventory item", icon: Boxes },
  { href: "/quotes", label: "Create quote", icon: FilePlus },
  { href: "/manufacturing", label: "New production task", icon: Factory },
  { href: "/suppliers", label: "Add supplier", icon: Truck },
] as const;

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="mb-2 h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) return null;

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
      title: "Inventory items",
      value: summary.totalInventoryItems,
      hint: "Raw materials & goods",
      icon: Boxes,
    },
    {
      href: "/manufacturing",
      title: "Manufacturing tasks",
      value: summary.activeManufacturingTasks,
      hint: "Active on floor",
      icon: Hammer,
    },
    {
      href: "/quotes",
      title: "Pending quotes",
      value: summary.pendingQuotes,
      hint: "Awaiting approval",
      icon: FileText,
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-muted-foreground">
          Key metrics and shortcuts for day-to-day FurniCore operations.
        </p>
      </div>

      {summary.lowStockCount > 0 && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-destructive sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">Inventory alert</p>
              <p className="text-sm opacity-90">
                {summary.lowStockCount} item{summary.lowStockCount === 1 ? "" : "s"} at or below
                reorder level.
              </p>
            </div>
          </div>
          <Button variant="destructive" size="sm" className="shrink-0 gap-2" asChild>
            <Link href="/inventory">
              Review stock
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((c) => (
          <Link key={c.href} href={c.href} className="block group">
            <Card
              className={cn(
                "h-full transition-colors",
                "hover:border-primary/40 hover:shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{c.title}</CardTitle>
                <c.icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{c.value}</div>
                <p className="text-xs text-muted-foreground">{c.hint}</p>
                <p className="mt-2 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Open module →
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4" aria-label="Recent system activity">
              {summary.recentActivity?.length > 0 ? (
                summary.recentActivity.slice(0, 5).map((log) => (
                  <li key={log.id} className="flex gap-3 text-sm">
                    <div
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted"
                      aria-hidden
                    >
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{log.userName || "System"}</p>
                      <p className="text-muted-foreground">{log.description}</p>
                      <time
                        className="mt-1 block text-xs text-muted-foreground/80"
                        dateTime={log.createdAt}
                      >
                        {new Date(log.createdAt).toLocaleString()}
                      </time>
                    </div>
                  </li>
                ))
              ) : (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  No recent activity
                </li>
              )}
            </ul>
            <Button variant="outline" className="mt-4 w-full" asChild>
              <Link href="/activity">View full audit log</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Button
                  key={a.href}
                  variant="outline"
                  className="h-auto w-full justify-start py-3 font-normal"
                  asChild
                >
                  <Link href={a.href} className="flex items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex-1 text-left">{a.label}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </Button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
