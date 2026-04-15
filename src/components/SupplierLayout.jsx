import { Link, useLocation } from "wouter";
import { useLogout, useGetCurrentUser } from "@workspace/api-client-react";
import { clearAuthStorage } from "@/lib/auth";
import { disconnectSocket } from "@/lib/socket";
import { Hammer, LogOut, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileNavButton } from "@/components/ProfileNavButton";
import { profilePathForRole } from "@/lib/profile-path";
import { ThemeSwitcher } from "@/components/dashboard/ThemeSwitcher";
import { resolvePublicAssetUrl } from "@/lib/image-url";
import { GlobalCommandPalette } from "@/components/navigation/GlobalCommandPalette";

export function SupplierLayout({ children }) {
  const [, setLocation] = useLocation();
  const logout = useLogout();
  const { data: user } = useGetCurrentUser();
  const supplierCommandItems = [
    { href: "/supplier-portal", label: "Supplier Dashboard", group: "Supplier Portal", keywords: "supplier dashboard" },
    { href: "/supplier-portal/profile", label: "Profile", group: "Supplier Portal", keywords: "profile account" },
    { href: "/supplier-portal/preferences", label: "Preferences", group: "Supplier Portal", keywords: "theme appearance" },
  ];

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      // ignore
    } finally {
      disconnectSocket();
      clearAuthStorage();
      setLocation("/login");
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card/95 px-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Hammer className="h-4 w-4" aria-hidden />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-tight text-primary">FurniCore</span>
            <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">Supplier Portal</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="sm" className="hidden text-muted-foreground lg:inline-flex" asChild>
            <Link href="/supplier-portal/preferences">Appearance</Link>
          </Button>
          <GlobalCommandPalette
            items={supplierCommandItems}
            triggerLabel="Jump"
            className="hidden lg:inline-flex"
          />
          <ThemeSwitcher />
          <ProfileNavButton href={profilePathForRole(user?.role)} />
          <NotificationBell />
          {user && (
            <div className="hidden items-center gap-2 sm:flex">
              {user.profileImageUrl ? (
                <img src={resolvePublicAssetUrl(user.profileImageUrl)} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-primary/20" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {user.name?.charAt(0).toUpperCase() ?? "S"}
                </div>
              )}
              <div className="text-right leading-tight">
                <p className="text-xs font-medium">{user.name}</p>
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Building2 className="h-3 w-3" aria-hidden />
                  Supplier
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
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6 px-4 py-8 md:px-8">
          {children}
        </div>
      </main>
      <footer className="border-t bg-card px-8 py-3 text-center text-xs text-muted-foreground">
        FurniCore ERP · Supplier Portal · All data is scoped to your account
      </footer>
    </div>
  );
}
