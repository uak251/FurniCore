/**
 * CustomerLayout — isolated shell for the Customer Portal.
 * No internal ERP navigation. Customers only see their own data.
 */
import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useLogout, useGetCurrentUser } from "@workspace/api-client-react";
import { removeAuthToken } from "@/lib/auth";
import { Hammer, LogOut, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeSwitcher } from "@/components/dashboard/ThemeSwitcher";

export function CustomerLayout({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const logout = useLogout();
  const { data: user } = useGetCurrentUser();

  const handleLogout = async () => {
    try { await logout.mutateAsync(); } catch { /* ignore */ }
    finally { removeAuthToken(); setLocation("/login"); }
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card/95 px-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Hammer className="h-4 w-4" aria-hidden />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-tight text-primary">FurniCore</span>
            <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">Customer Portal</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="sm" className="hidden text-muted-foreground lg:inline-flex" asChild>
            <Link href="/customer-portal/preferences">Appearance</Link>
          </Button>
          <ThemeSwitcher />
          <NotificationBell />
          {user && (
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {user.name?.charAt(0).toUpperCase() ?? "C"}
              </div>
              <div className="text-right leading-tight">
                <p className="text-xs font-medium">{user.name}</p>
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <ShoppingBag className="h-3 w-3" aria-hidden /> Customer
                </p>
              </div>
            </div>
          )}
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={handleLogout}>
            <LogOut className="mr-1.5 h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</div>
      </main>
      <footer className="border-t bg-card px-8 py-3 text-center text-xs text-muted-foreground">
        FurniCore ERP · Customer Portal · Your orders and data are private to your account
      </footer>
    </div>
  );
}
