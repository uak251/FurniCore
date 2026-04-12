import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "wouter";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Boxes, Hammer, AlertTriangle, FileText, CheckCircle2, ArrowRight, FilePlus, Factory, Truck, } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
const QUICK_ACTIONS = [
    { href: "/inventory", label: "Add inventory item", icon: Boxes },
    { href: "/quotes", label: "Create quote", icon: FilePlus },
    { href: "/manufacturing", label: "New production task", icon: Factory },
    { href: "/suppliers", label: "Add supplier", icon: Truck },
];
export default function Dashboard() {
    const { data: summary, isLoading } = useGetDashboardSummary({
        query: { queryKey: getGetDashboardSummaryQueryKey() },
    });
    if (isLoading) {
        return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx(Skeleton, { className: "mb-2 h-8 w-48" }), _jsx(Skeleton, { className: "h-4 w-64" })] }), _jsx("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4", children: [1, 2, 3, 4].map((i) => (_jsx(Skeleton, { className: "h-32 rounded-xl" }, i))) })] }));
    }
    if (!summary)
        return null;
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
    ];
    return (_jsxs("div", { className: "space-y-8", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Overview" }), _jsx("p", { className: "mt-1 text-muted-foreground", children: "Key metrics and shortcuts for day-to-day FurniCore operations." })] }), summary.lowStockCount > 0 && (_jsxs("div", { className: "flex flex-col gap-3 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-destructive sm:flex-row sm:items-center sm:justify-between", role: "status", children: [_jsxs("div", { className: "flex items-start gap-3 min-w-0", children: [_jsx(AlertTriangle, { className: "h-5 w-5 shrink-0 mt-0.5", "aria-hidden": true }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "font-medium", children: "Inventory alert" }), _jsxs("p", { className: "text-sm opacity-90", children: [summary.lowStockCount, " item", summary.lowStockCount === 1 ? "" : "s", " at or below reorder level."] })] })] }), _jsx(Button, { variant: "destructive", size: "sm", className: "shrink-0 gap-2", asChild: true, children: _jsxs(Link, { href: "/inventory", children: ["Review stock", _jsx(ArrowRight, { className: "h-4 w-4", "aria-hidden": true })] }) })] })), _jsx("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", children: statCards.map((c) => (_jsx(Link, { href: c.href, className: "block group", children: _jsxs(Card, { className: cn("h-full transition-colors", "hover:border-primary/40 hover:shadow-sm", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"), children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium", children: c.title }), _jsx(c.icon, { className: "h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" })] }), _jsxs(CardContent, { children: [_jsx("div", { className: "text-2xl font-bold tabular-nums", children: c.value }), _jsx("p", { className: "text-xs text-muted-foreground", children: c.hint }), _jsx("p", { className: "mt-2 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100", children: "Open module \u2192" })] })] }) }, c.href))) }), _jsxs("div", { className: "grid grid-cols-1 gap-6 lg:grid-cols-2", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Recent activity" }) }), _jsxs(CardContent, { children: [_jsx("ul", { className: "space-y-4", "aria-label": "Recent system activity", children: summary.recentActivity?.length > 0 ? (summary.recentActivity.slice(0, 5).map((log) => (_jsxs("li", { className: "flex gap-3 text-sm", children: [_jsx("div", { className: "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted", "aria-hidden": true, children: _jsx(CheckCircle2, { className: "h-4 w-4 text-muted-foreground" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "font-medium text-foreground", children: log.userName || "System" }), _jsx("p", { className: "text-muted-foreground", children: log.description }), _jsx("time", { className: "mt-1 block text-xs text-muted-foreground/80", dateTime: log.createdAt, children: new Date(log.createdAt).toLocaleString() })] })] }, log.id)))) : (_jsx("li", { className: "py-6 text-center text-sm text-muted-foreground", children: "No recent activity" })) }), _jsx(Button, { variant: "outline", className: "mt-4 w-full", asChild: true, children: _jsx(Link, { href: "/activity", children: "View full audit log" }) })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Quick actions" }) }), _jsx(CardContent, { className: "space-y-2", children: QUICK_ACTIONS.map((a) => {
                                    const Icon = a.icon;
                                    return (_jsx(Button, { variant: "outline", className: "h-auto w-full justify-start py-3 font-normal", asChild: true, children: _jsxs(Link, { href: a.href, className: "flex items-center gap-3", children: [_jsx(Icon, { className: "h-4 w-4 shrink-0 text-muted-foreground", "aria-hidden": true }), _jsx("span", { className: "flex-1 text-left", children: a.label }), _jsx(ArrowRight, { className: "h-4 w-4 shrink-0 text-muted-foreground", "aria-hidden": true })] }) }, a.href));
                                }) })] })] })] }));
}
