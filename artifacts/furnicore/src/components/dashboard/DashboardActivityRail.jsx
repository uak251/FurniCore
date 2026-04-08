import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
export function DashboardActivityRail({ className }) {
    const { data: user } = useGetCurrentUser();
    const role = user?.role ?? "";
    const canActivity = role === "admin" || role === "manager";
    return (_jsxs("aside", { className: cn("hidden w-[min(100%,18rem)] shrink-0 flex-col border-l border-border/60 bg-card/35 backdrop-blur-md xl:flex", className), children: [_jsxs("div", { className: "border-b border-border/60 px-4 py-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("h2", { className: "text-sm font-semibold tracking-tight", children: "Quick actions" }), canActivity && (_jsx(Button, { variant: "ghost", size: "sm", className: "h-7 gap-0.5 px-2 text-xs", asChild: true, children: _jsxs(Link, { href: "/activity", children: ["Log", _jsx(ChevronRight, { className: "h-3.5 w-3.5 opacity-70", "aria-hidden": true })] }) }))] }), _jsx("p", { className: "mt-1 text-[11px] leading-snug text-muted-foreground", children: canActivity
                            ? "Open the full audit trail for approvals and system events."
                            : "Notifications keep you updated; activity log is available to managers." })] }), _jsxs("div", { className: "flex flex-1 flex-col gap-2 overflow-y-auto p-3", children: [_jsx(Link, { href: "/notifications", className: "block", children: _jsx(Card, { className: "border-border/70 p-3 shadow-sm transition-colors hover:bg-muted/40", children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary", children: _jsx(Bell, { className: "h-4 w-4", "aria-hidden": true }) }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-sm font-medium", children: "Notifications" }), _jsx("p", { className: "text-[11px] text-muted-foreground", children: "Alerts and mentions" })] }), _jsx(ChevronRight, { className: "ml-auto h-4 w-4 shrink-0 text-muted-foreground", "aria-hidden": true })] }) }) }), canActivity ? (_jsx(Link, { href: "/activity", className: "block", children: _jsx(Card, { className: "border-primary/25 bg-primary/5 p-3 shadow-sm transition-colors hover:bg-primary/10", children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm", children: _jsx(Activity, { className: "h-4 w-4", "aria-hidden": true }) }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-sm font-medium", children: "Activity log" }), _jsx("p", { className: "text-[11px] text-muted-foreground", children: "Who did what, and when" })] }), _jsx(ChevronRight, { className: "ml-auto h-4 w-4 shrink-0 text-muted-foreground", "aria-hidden": true })] }) }) })) : (_jsx(Card, { className: "border-dashed p-3 text-[11px] text-muted-foreground", children: "Your role uses notifications for updates. Managers can open the full activity log." }))] })] }));
}
