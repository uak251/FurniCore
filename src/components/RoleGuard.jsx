import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { AccessDenied } from "@/components/AccessDenied";
export function RoleGuard({ allowedRoles, children }) {
    const { data: user, isLoading } = useGetCurrentUser();
    if (isLoading) {
        return (_jsx("div", { className: "flex h-64 items-center justify-center", children: _jsx(Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground", "aria-label": "Loading\u2026" }) }));
    }
    if (!user || !allowedRoles.includes(user.role)) {
        return _jsx(AccessDenied, {});
    }
    return _jsx(_Fragment, { children: children });
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
        isAdmin: role === "admin",
        isManager: role === "manager",
        isAccounts: role === "accounts",
        isEmployee: role === "employee",
        /** true when the user is a supplier — they should be in /supplier-portal */
        isSupplier: role === "supplier",
        can: (...roles) => roles.includes(role),
    };
}
