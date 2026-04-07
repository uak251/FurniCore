/**
 * RoleGuard — wraps a page/section and blocks rendering if the current user's
 * role is not in the `allowedRoles` list.
 *
 * Usage:
 *   <RoleGuard allowedRoles={["admin", "manager"]}>
 *     <SensitivePage />
 *   </RoleGuard>
 *
 * Behaviour:
 *  - While the user profile is loading  → shows a centered spinner
 *  - Role not permitted                 → shows an "Access denied" card
 *  - Role permitted                     → renders children normally
 */

import { type ReactNode } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface RoleGuardProps {
  /** Roles that are allowed to view the wrapped content */
  allowedRoles: string[];
  children: ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { data: user, isLoading } = useGetCurrentUser();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading…" />
      </div>
    );
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex items-start justify-center pt-16">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <ShieldAlert className="h-12 w-12 text-destructive/60" aria-hidden />
            <div>
              <p className="text-xl font-semibold">Access restricted</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Your current role{" "}
                {user?.role ? (
                  <>
                    (<span className="font-medium capitalize">{user.role}</span>)
                  </>
                ) : null}{" "}
                does not have permission to view this page.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Contact your administrator if you need access.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Convenience hook — returns helper flags for the current user's role.
 * Use this for inline conditional rendering (e.g. show/hide a button).
 */
export function useRoleAccess() {
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";

  return {
    role,
    isAdmin:    role === "admin",
    isManager:  role === "manager",
    isAccounts: role === "accounts",
    isEmployee: role === "employee",
    /** true when the user is a supplier — they should be in /supplier-portal */
    isSupplier: role === "supplier",
    can: (...roles: string[]) => roles.includes(role),
  };
}
