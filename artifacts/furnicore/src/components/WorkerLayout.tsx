/**
 * WorkerLayout — isolated shell for the Worker Portal.
 *
 * Intentionally has NO internal ERP navigation. Workers only see the
 * top header (branding + their name/role badge + logout) and their own
 * portal content. They cannot navigate to any internal ERP module.
 */

import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { useLogout, useGetCurrentUser } from "@workspace/api-client-react";
import { removeAuthToken } from "@/lib/auth";
import { Hammer, LogOut, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface WorkerLayoutProps {
  children: ReactNode;
}

export function WorkerLayout({ children }: WorkerLayoutProps) {
  const [, setLocation] = useLocation();
  const logout = useLogout();
  const { data: user } = useGetCurrentUser();

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      // ignore
    } finally {
      removeAuthToken();
      setLocation("/login");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* ── Top header ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card/95 px-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80 md:px-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Hammer className="h-4 w-4" aria-hidden />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-tight text-primary">FurniCore</span>
            <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">
              Worker Portal
            </Badge>
          </div>
        </div>

        {/* User identity + logout */}
        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {user.name?.charAt(0).toUpperCase() ?? "W"}
              </div>
              <div className="text-right leading-tight">
                <p className="text-xs font-medium">{user.name}</p>
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <HardHat className="h-3 w-3" aria-hidden />
                  Worker
                </p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="mr-1.5 h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </div>
      </header>

      {/* ── Page content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">{children}</div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t bg-card px-8 py-3 text-center text-xs text-muted-foreground">
        FurniCore ERP · Worker Portal · Data shown is restricted to your account only
      </footer>
    </div>
  );
}
