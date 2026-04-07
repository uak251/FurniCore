import { Link } from "wouter";
import { Activity, ChevronRight, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

/**
 * Right column (xl+) — mirrors doc.track “schedule” rail as a themed activity strip.
 * Full log remains on /activity for admin/manager.
 */
export function DashboardActivityRail({ className }: { className?: string }) {
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canActivity = role === "admin" || role === "manager";

  return (
    <aside
      className={cn(
        "hidden w-[min(100%,18rem)] shrink-0 flex-col border-l border-border/60 bg-card/35 backdrop-blur-md xl:flex",
        className,
      )}
    >
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Quick actions</h2>
          {canActivity && (
            <Button variant="ghost" size="sm" className="h-7 gap-0.5 px-2 text-xs" asChild>
              <Link href="/activity">
                Log
                <ChevronRight className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </Link>
            </Button>
          )}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {canActivity
            ? "Open the full audit trail for approvals and system events."
            : "Notifications keep you updated; activity log is available to managers."}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        <Link href="/notifications" className="block">
          <Card className="border-border/70 p-3 shadow-sm transition-colors hover:bg-muted/40">
            <div className="flex items-start gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Bell className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Notifications</p>
                <p className="text-[11px] text-muted-foreground">Alerts and mentions</p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </div>
          </Card>
        </Link>

        {canActivity ? (
          <Link href="/activity" className="block">
            <Card className="border-primary/25 bg-primary/5 p-3 shadow-sm transition-colors hover:bg-primary/10">
              <div className="flex items-start gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <Activity className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Activity log</p>
                  <p className="text-[11px] text-muted-foreground">Who did what, and when</p>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
            </Card>
          </Link>
        ) : (
          <Card className="border-dashed p-3 text-[11px] text-muted-foreground">
            Your role uses notifications for updates. Managers can open the full activity log.
          </Card>
        )}
      </div>
    </aside>
  );
}
