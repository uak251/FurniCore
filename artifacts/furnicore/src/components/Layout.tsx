import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useLogout, useGetCurrentUser } from "@workspace/api-client-react";
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
  UserCircle
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/products", label: "Products", icon: Package },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/manufacturing", label: "Manufacturing", icon: Hammer },
  { href: "/hr", label: "HR", icon: Users },
  { href: "/payroll", label: "Payroll", icon: Banknote },
  { href: "/accounting", label: "Accounting", icon: Receipt },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/users", label: "Users", icon: UserCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const { data: user } = useGetCurrentUser();

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch (e) {
      // Ignore errors on logout
    } finally {
      removeAuthToken();
      setLocation("/login");
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-primary">
            <Hammer className="h-6 w-6" />
            <span>FurniCore</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-none">{user?.name}</span>
              <span className="text-xs text-muted-foreground">{user?.role}</span>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b bg-card flex items-center justify-between px-6 md:hidden">
           <div className="flex items-center gap-2 font-bold tracking-tight text-primary">
            <Hammer className="h-5 w-5" />
            <span>FurniCore</span>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
