import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useLogout, useGetCurrentUser, useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { removeAuthToken } from "@/lib/auth";
import { disconnectSocket } from "@/lib/socket";
import {
  LayoutDashboard,
  Package,
  Boxes,
  Truck,
  FileText,
  Hammer,
  Users,
  Banknote,
  Receipt,
  Bell,
  Activity,
  Settings,
  LogOut,
  UserCircle,
  Menu,
  ShoppingCart,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/NotificationBell";
import { Separator } from "@/components/ui/separator";
import { ThemeSwitcher } from "@/components/dashboard/ThemeSwitcher";
import { DashboardActivityRail } from "@/components/dashboard/DashboardActivityRail";

interface LayoutProps {
  children: ReactNode;
}

/**
 * roles: if defined, item is only shown to users whose role is in this list.
 *        if undefined, item is visible to all authenticated users.
 *
 * Role access matrix:
 *  admin    — all modules
 *  manager  — all except Users & Settings management
 *  accountant — finance modules (Suppliers, Quotes, Payroll, Accounting)
 *  employee — core ops (Dashboard, Inventory, Products, Manufacturing, Notifications)
 *  supplier — isolated portal only (/supplier-portal); auto-redirected before reaching this layout
 */
type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "lowStock";
  roles?: string[];
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operations",
    items: [
      { href: "/inventory",      label: "Inventory",      icon: Boxes,  badge: "lowStock" },
      { href: "/products",       label: "Products",       icon: Package },
      { href: "/suppliers",      label: "Suppliers",      icon: Truck,  roles: ["admin", "manager", "accountant"] },
      { href: "/quotes",         label: "Quotes",         icon: FileText, roles: ["admin", "manager", "accountant"] },
      { href: "/manufacturing",  label: "Manufacturing",  icon: Hammer },
      { href: "/sales",          label: "Sales",          icon: ShoppingCart, roles: ["admin", "manager", "sales_manager"] },
    ],
  },
  {
    label: "People & finance",
    items: [
      { href: "/hr",         label: "HR",         icon: Users,    roles: ["admin", "manager"] },
      { href: "/payroll",    label: "Payroll",    icon: Banknote, roles: ["admin", "accountant"] },
      { href: "/accounting",         label: "Accounting",         icon: Receipt,   roles: ["admin", "accountant", "manager"] },
      { href: "/chart-of-accounts", label: "Chart of Accounts",  icon: BookOpen,  roles: ["admin", "accountant"] },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/activity",      label: "Activity",      icon: Activity,   roles: ["admin", "manager"] },
      { href: "/users",         label: "Users",         icon: UserCircle, roles: ["admin"] },
      { href: "/settings",      label: "Settings",      icon: Settings,   roles: ["admin"] },
    ],
  },
];

function NavLinks({
  onNavigate,
  lowStockCount,
  userRole,
  className,
  surface = "sidebar",
}: {
  onNavigate?: () => void;
  lowStockCount: number;
  userRole: string;
  className?: string;
  /** Gradient sidebar (doc.track) vs light mobile sheet */
  surface?: "sidebar" | "sheet";
}) {
  const [location] = useLocation();
  const isSidebar = surface === "sidebar";

  return (
    <nav className={cn("flex flex-col gap-6", className)} aria-label="Main">
      {NAV_GROUPS.map((group) => {
        // Filter items the current role is allowed to see
        const visibleItems = group.items.filter(
          (item) => !item.roles || item.roles.includes(userRole),
        );
        if (visibleItems.length === 0) return null;

        return (
          <div key={group.label}>
            <p
              className={cn(
                "mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider",
                isSidebar ? "text-sidebar-foreground/45" : "text-muted-foreground/80",
              )}
            >
              {group.label}
            </p>
            <div className="space-y-1">
              {visibleItems.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));
                const showLowBadge = item.badge === "lowStock" && lowStockCount > 0;
                return (
                  <Link key={item.href} href={item.href} onClick={onNavigate}>
                    <div
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                        isSidebar &&
                          (isActive
                            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_0_0_1px_hsl(var(--sidebar-primary)/0.35)]"
                            : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"),
                        !isSidebar &&
                          (isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"),
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{item.label}</span>
                      {showLowBadge && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums",
                            isActive
                              ? isSidebar
                                ? "bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground"
                                : "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-destructive text-destructive-foreground",
                          )}
                          title={`${lowStockCount} items at or below reorder level`}
                        >
                          {lowStockCount > 99 ? "99+" : lowStockCount}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const logout = useLogout();
  const { data: user } = useGetCurrentUser();
  const { data: summary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  const lowStockCount = summary?.lowStockCount ?? 0;
  const userRole = user?.role ?? "";

  // Isolated portal roles must not enter the internal ERP layout
  if (user && userRole === "supplier") return <Redirect to="/supplier-portal" />;
  if (user && userRole === "worker")   return <Redirect to="/worker-portal" />;
  if (user && userRole === "customer") return <Redirect to="/customer-portal" />;

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      // Ignore errors on logout
    } finally {
      disconnectSocket();
      removeAuthToken();
      setLocation("/login");
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="relative hidden w-[17rem] shrink-0 flex-col border-r border-white/10 bg-gradient-to-b from-[hsl(var(--dashboard-sidebar-from))] to-[hsl(var(--dashboard-sidebar-to))] text-sidebar-foreground shadow-[4px_0_24px_-8px_rgba(0,0,0,0.2)] md:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <div className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-sidebar-primary-foreground">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary/90 text-sidebar-primary-foreground shadow-md">
              <Hammer className="h-5 w-5" aria-hidden />
            </div>
            <span>FurniCore</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks lowStockCount={lowStockCount} userRole={userRole} surface="sidebar" />
        </div>

        <div className="border-t border-white/10 p-4">
          <div className="mb-4 flex items-center gap-3 px-1">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-sidebar-accent-foreground ring-2 ring-sidebar-primary/40"
              aria-hidden
            >
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium leading-none text-sidebar-foreground">
                {user?.name}
              </span>
              <span className="mt-1 block truncate text-xs capitalize text-sidebar-foreground/65">
                {user?.role}
              </span>
            </div>
          </div>
          <Button
            variant="secondary"
            className="w-full justify-start border border-white/15 bg-sidebar-accent/80 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" aria-hidden />
            Log out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-[hsl(var(--dashboard-header-blur))]/90 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-[hsl(var(--dashboard-header-blur))]/75 md:h-16 md:px-6">
            <div className="flex min-w-0 items-center gap-3 md:hidden">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    aria-label="Open main menu"
                  >
                    <Menu className="h-4 w-4" aria-hidden />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex w-[min(100vw-2rem,20rem)] flex-col p-0">
                  <SheetHeader className="border-b px-6 py-4 text-left">
                    <SheetTitle className="flex items-center gap-2 text-primary">
                      <Hammer className="h-5 w-5" aria-hidden />
                      FurniCore
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto px-3 py-4">
                    <NavLinks
                      lowStockCount={lowStockCount}
                      userRole={userRole}
                      surface="sheet"
                      onNavigate={() => setMobileOpen(false)}
                    />
                  </div>
                  <Separator />
                  <div className="p-4">
                    <p className="mb-2 truncate text-sm font-medium">{user?.name}</p>
                    <Button variant="outline" className="w-full" onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Log out
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
              <span className="truncate font-semibold text-primary">FurniCore</span>
            </div>

            <div className="hidden min-w-0 flex-1 md:block">
              <p className="truncate text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Welcome back</span>
                {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <Button variant="ghost" size="sm" className="hidden text-muted-foreground sm:inline-flex" asChild>
                <Link href="/preferences">Appearance</Link>
              </Button>
              <ThemeSwitcher />
              <NotificationBell />
            </div>
          </header>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
              <div className="mx-auto max-w-7xl">{children}</div>
            </div>
            <DashboardActivityRail />
          </div>
        </main>
      </div>
    </div>
  );
}
