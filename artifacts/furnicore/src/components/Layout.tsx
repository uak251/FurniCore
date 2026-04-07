import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useLogout, useGetCurrentUser, useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { removeAuthToken } from "@/lib/auth";
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
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/NotificationBell";
import { Separator } from "@/components/ui/separator";

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
 *  accounts — finance modules (Suppliers, Quotes, Payroll, Accounting)
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
      { href: "/suppliers",      label: "Suppliers",      icon: Truck,  roles: ["admin", "manager", "accounts"] },
      { href: "/quotes",         label: "Quotes",         icon: FileText, roles: ["admin", "manager", "accounts"] },
      { href: "/manufacturing",  label: "Manufacturing",  icon: Hammer },
    ],
  },
  {
    label: "People & finance",
    items: [
      { href: "/hr",         label: "HR",         icon: Users,    roles: ["admin", "manager"] },
      { href: "/payroll",    label: "Payroll",    icon: Banknote, roles: ["admin", "accounts"] },
      { href: "/accounting", label: "Accounting", icon: Receipt,  roles: ["admin", "accounts", "manager"] },
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
}: {
  onNavigate?: () => void;
  lowStockCount: number;
  userRole: string;
  className?: string;
}) {
  const [location] = useLocation();

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
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));
                const showLowBadge = item.badge === "lowStock" && lowStockCount > 0;
                return (
                  <Link key={item.href} href={item.href} onClick={onNavigate}>
                    <div
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{item.label}</span>
                      {showLowBadge && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums",
                            isActive
                              ? "bg-primary-foreground/20 text-primary-foreground"
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

  // Suppliers and workers must use their isolated portals, not the internal ERP layout
  if (user && userRole === "supplier") return <Redirect to="/supplier-portal" />;
  if (user && userRole === "worker")   return <Redirect to="/worker-portal" />;

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      // Ignore errors on logout
    } finally {
      removeAuthToken();
      setLocation("/login");
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center border-b px-6">
          <div className="flex items-center gap-2 text-xl font-bold tracking-tight text-primary">
            <Hammer className="h-6 w-6 shrink-0" aria-hidden />
            <span>FurniCore</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks lowStockCount={lowStockCount} userRole={userRole} />
        </div>

        <div className="border-t p-4">
          <div className="mb-4 flex items-center gap-3 px-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary"
              aria-hidden
            >
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium leading-none">{user?.name}</span>
              <span className="mt-1 block truncate text-xs capitalize text-muted-foreground">
                {user?.role}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" aria-hidden />
            Log out
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:px-6">
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

          <div className="hidden flex-1 md:block" aria-hidden />

          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
