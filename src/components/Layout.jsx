import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useEffect, useMemo, useState } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useLogout, useGetCurrentUser, useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { clearAuthStorage, getAuthToken } from "@/lib/auth";
import { disconnectSocket } from "@/lib/socket";
import { LayoutDashboard, Package, Boxes, Truck, FileText, Hammer, Users, Banknote, Receipt, Bell, Activity, Settings, LogOut, UserCircle, Menu, ShoppingCart, BookOpen, ClipboardList, BadgeCheck, LineChart, Package2, } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileNavButton } from "@/components/ProfileNavButton";
import { profilePathForRole } from "@/lib/profile-path";
import { Separator } from "@/components/ui/separator";
import { ThemeSwitcher } from "@/components/dashboard/ThemeSwitcher";
import { DashboardActivityRail } from "@/components/dashboard/DashboardActivityRail";
import { resolvePublicAssetUrl } from "@/lib/image-url";
import { BrandLogo } from "@/components/branding/BrandLogo";
import { GlobalCommandPalette } from "@/components/navigation/GlobalCommandPalette";
import { preloadRoute } from "@/lib/route-preload";
const NAV_GROUPS = [
    {
        label: "Overview",
        items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
    },
    {
        label: "Operations",
        items: [
            { href: "/inventory", label: "Inventory", icon: Boxes, badge: "lowStock" },
            { href: "/products", label: "Products", icon: Package },
            { href: "/suppliers", label: "Suppliers", icon: Truck, roles: ["admin", "manager", "accountant"] },
            { href: "/quotes", label: "Quotes", icon: FileText, roles: ["admin", "manager", "accountant"] },
            { href: "/procurement", label: "Procurement", icon: ClipboardList, roles: ["admin", "manager", "accountant", "employee", "inventory_manager"] },
            { href: "/price-approvals", label: "Price approvals", icon: BadgeCheck, roles: ["admin", "manager", "accountant", "sales_manager"] },
            { href: "/cogm-reports", label: "COGM & variance", icon: LineChart, roles: ["admin", "manager", "accountant", "employee", "inventory_manager"] },
            { href: "/inventory-usage", label: "Inventory usage", icon: Package2, roles: ["admin", "manager", "accountant", "employee", "inventory_manager"] },
            { href: "/manufacturing", label: "Manufacturing", icon: Hammer },
            { href: "/sales", label: "Sales", icon: ShoppingCart, roles: ["admin", "manager", "sales_manager", "accountant"] },
        ],
    },
    {
        label: "People & finance",
        items: [
            { href: "/hr", label: "HR", icon: Users, roles: ["admin", "manager"] },
            { href: "/payroll", label: "Payroll", icon: Banknote, roles: ["admin", "accountant"] },
            { href: "/accounting", label: "Accounting", icon: Receipt, roles: ["admin", "accountant", "manager"] },
            { href: "/chart-of-accounts", label: "Chart of Accounts", icon: BookOpen, roles: ["admin", "accountant"] },
        ],
    },
    {
        label: "System",
        items: [
            { href: "/notifications", label: "Notifications", icon: Bell },
            { href: "/activity", label: "Activity", icon: Activity, roles: ["admin", "manager"] },
            { href: "/users", label: "Users", icon: UserCircle, roles: ["admin"] },
            { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
        ],
    },
];
const NavLinks = memo(function NavLinks({ onNavigate, lowStockCount, userRole, className, surface = "sidebar", }) {
    const [location] = useLocation();
    const isSidebar = surface === "sidebar";
    return (_jsx("nav", { className: cn("flex flex-col gap-6", className), "aria-label": "Main", children: NAV_GROUPS.map((group) => {
            // Filter items the current role is allowed to see
            const visibleItems = group.items.filter((item) => !item.roles || item.roles.includes(userRole));
            if (visibleItems.length === 0)
                return null;
            return (_jsxs("div", { children: [_jsx("p", { className: cn("mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider", isSidebar ? "text-sidebar-foreground/45" : "text-muted-foreground/80"), children: group.label }), _jsx("div", { className: "space-y-1", children: visibleItems.map((item) => {
                            const isActive = location === item.href ||
                                (item.href !== "/" && location.startsWith(item.href));
                            const showLowBadge = item.badge === "lowStock" && lowStockCount > 0;
                            return (_jsx(Link, { href: item.href, onClick: onNavigate, onMouseEnter: () => preloadRoute(item.href), children: _jsxs("div", { className: cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors", isSidebar &&
                                        (isActive
                                            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_0_0_1px_hsl(var(--sidebar-primary)/0.35)]"
                                            : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"), !isSidebar &&
                                        (isActive
                                            ? "bg-primary text-primary-foreground"
                                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")), children: [_jsx(item.icon, { className: "h-4 w-4 shrink-0", "aria-hidden": true }), _jsx("span", { className: "flex-1 truncate", children: item.label }), showLowBadge && (_jsx("span", { className: cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums", isActive
                                                ? isSidebar
                                                    ? "bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground"
                                                    : "bg-primary-foreground/20 text-primary-foreground"
                                                : "bg-destructive text-destructive-foreground"), title: `${lowStockCount} items at or below reorder level`, children: lowStockCount > 99 ? "99+" : lowStockCount }))] }) }, item.href));
                        }) })] }, group.label));
        }) }));
});
export function Layout({ children }) {
    const [location, setLocation] = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);
    const logout = useLogout();
    const authed = Boolean(getAuthToken());
    const { data: user } = useGetCurrentUser();
    const { data: summary } = useGetDashboardSummary({
        query: { queryKey: getGetDashboardSummaryQueryKey(), enabled: authed },
    });
    const lowStockCount = summary?.lowStockCount ?? 0;
    const userRole = user?.role ?? "";
    const commandItems = useMemo(() => NAV_GROUPS.flatMap((group) => (group.items ?? [])
        .filter((item) => !item.roles || item.roles.includes(userRole))
        .map((item) => ({
        label: item.label,
        href: item.href,
        group: group.label,
        keywords: `${item.label} ${group.label}`,
    }))), [userRole]);
    useEffect(() => {
        setMobileOpen(false);
    }, [location]);
    // Isolated portal roles must not enter the internal ERP layout
    if (user && userRole === "supplier")
        return _jsx(Redirect, { to: "/supplier-portal" });
    if (user && userRole === "worker")
        return _jsx(Redirect, { to: "/worker-portal" });
    if (user && userRole === "customer")
        return _jsx(Redirect, { to: "/customer-portal" });
    const handleLogout = async () => {
        try {
            await logout.mutateAsync();
        }
        catch {
            // Ignore errors on logout
        }
        finally {
            disconnectSocket();
            clearAuthStorage();
            setLocation("/login");
        }
    };
    return (_jsxs("div", { className: "flex h-screen min-h-0 overflow-hidden bg-background", children: [_jsxs("aside", { className: "relative hidden h-full min-h-0 w-[17rem] shrink-0 flex-col border-r border-white/10 bg-gradient-to-b from-[hsl(var(--dashboard-sidebar-from))] to-[hsl(var(--dashboard-sidebar-to))] text-sidebar-foreground shadow-[4px_0_24px_-8px_rgba(0,0,0,0.2)] md:flex", children: [_jsx("div", { className: "flex h-16 shrink-0 items-center border-b border-white/10 px-5", children: _jsx(BrandLogo, { imageClassName: "h-10 w-10 rounded-lg object-contain", showWordmark: true, wordmarkClassName: "text-sidebar-primary-foreground" }) }), _jsx("div", { className: "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 [scrollbar-gutter:stable]", children: _jsx(NavLinks, { lowStockCount: lowStockCount, userRole: userRole, surface: "sidebar" }) }), _jsxs("div", { className: "shrink-0 border-t border-white/10 p-4", children: [_jsxs("div", { className: "mb-4 flex items-center gap-3 px-1", children: [user?.profileImageUrl ? (_jsx("img", { src: resolvePublicAssetUrl(user.profileImageUrl), alt: "", className: "h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-sidebar-primary/40" })) : (_jsx("div", { className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-sidebar-accent-foreground ring-2 ring-sidebar-primary/40", "aria-hidden": true, children: user?.name?.charAt(0).toUpperCase() || "U" })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block truncate text-sm font-medium leading-none text-sidebar-foreground", children: user?.name }), _jsx("span", { className: "mt-1 block truncate text-xs capitalize text-sidebar-foreground/65", children: user?.role })] })] }), _jsxs(Button, { variant: "secondary", className: "w-full justify-start border border-white/15 bg-sidebar-accent/80 text-sidebar-foreground hover:bg-sidebar-accent", onClick: handleLogout, children: [_jsx(LogOut, { className: "mr-2 h-4 w-4", "aria-hidden": true }), "Log out"] })] })] }), _jsx("div", { className: "flex min-h-0 min-w-0 flex-1 overflow-hidden", children: _jsxs("main", { className: "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", children: [_jsxs("header", { className: "flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-[hsl(var(--dashboard-header-blur))]/90 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-[hsl(var(--dashboard-header-blur))]/75 md:h-16 md:px-6", children: [_jsxs("div", { className: "flex min-w-0 items-center gap-3 md:hidden", children: [_jsxs(Sheet, { open: mobileOpen, onOpenChange: setMobileOpen, children: [_jsx(SheetTrigger, { asChild: true, children: _jsx(Button, { type: "button", variant: "outline", size: "icon", className: "shrink-0", "aria-label": "Open main menu", children: _jsx(Menu, { className: "h-4 w-4", "aria-hidden": true }) }) }), _jsxs(SheetContent, { side: "left", className: "flex w-[min(100vw-2rem,20rem)] flex-col p-0", children: [_jsx(SheetHeader, { className: "border-b px-6 py-4 text-left", children: _jsx(SheetTitle, { className: "flex items-center gap-2 text-primary", children: _jsx(BrandLogo, { imageClassName: "h-8 w-8 rounded-md object-contain", showWordmark: true }) }) }), _jsx("div", { className: "flex-1 overflow-y-auto px-3 py-4", children: _jsx(NavLinks, { lowStockCount: lowStockCount, userRole: userRole, surface: "sheet", onNavigate: () => setMobileOpen(false) }) }), _jsx(Separator, {}), _jsxs("div", { className: "p-4", children: [_jsx("p", { className: "mb-2 truncate text-sm font-medium", children: user?.name }), _jsxs(Button, { variant: "outline", className: "w-full", onClick: handleLogout, children: [_jsx(LogOut, { className: "mr-2 h-4 w-4" }), "Log out"] })] })] })] }), _jsx("span", { className: "truncate font-semibold text-primary", children: "FurniCore" })] }), _jsx("div", { className: "hidden min-w-0 flex-1 md:block", children: _jsxs("p", { className: "truncate text-sm text-muted-foreground", children: [_jsx("span", { className: "font-medium text-foreground", children: "Welcome back" }), user?.name ? `, ${user.name.split(" ")[0]}` : ""] }) }), _jsxs("div", { className: "flex items-center gap-1.5 sm:gap-2", children: [_jsx(Button, { variant: "ghost", size: "sm", className: "hidden text-muted-foreground sm:inline-flex", asChild: true, children: _jsx(Link, { href: "/preferences", children: "Appearance" }) }), _jsx(GlobalCommandPalette, { items: commandItems, triggerLabel: "Jump", className: "hidden lg:inline-flex" }), _jsx(ThemeSwitcher, {}), _jsx(ProfileNavButton, { href: profilePathForRole(userRole) }), _jsx(NotificationBell, {})] })] }), _jsxs("div", { className: "flex min-h-0 min-w-0 flex-1 overflow-hidden", children: [_jsx("div", { className: "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-auto p-4 md:p-8", children: _jsx("div", { className: "mx-auto w-full min-w-0 max-w-7xl space-y-6", children: children }) }), _jsx(DashboardActivityRail, {})] })] }) })] }));
}
