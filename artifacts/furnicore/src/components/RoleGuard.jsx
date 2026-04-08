import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
export function RoleGuard({ allowedRoles, children }) {
    const { data: user, isLoading } = useGetCurrentUser();
    if (isLoading) {
        return (_jsx("div", { className: "flex h-64 items-center justify-center", children: _jsx(Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground", "aria-label": "Loading\u2026" }) }));
    }
    if (!user || !allowedRoles.includes(user.role)) {
        return (_jsx("div", { className: "flex items-start justify-center pt-16", children: _jsx(Card, { className: "w-full max-w-md", children: _jsxs(CardContent, { className: "flex flex-col items-center gap-4 py-12 text-center", children: [_jsx(ShieldAlert, { className: "h-12 w-12 text-destructive/60", "aria-hidden": true }), _jsxs("div", { children: [_jsx("p", { className: "text-xl font-semibold", children: "Access restricted" }), _jsxs("p", { className: "mt-2 text-sm text-muted-foreground", children: ["Your current role", " ", user?.role ? (_jsxs(_Fragment, { children: ["(", _jsx("span", { className: "font-medium capitalize", children: user.role }), ")"] })) : null, " ", "does not have permission to view this page."] }), _jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: "Contact your administrator if you need access." })] }), _jsx(Button, { variant: "outline", asChild: true, children: _jsx(Link, { href: "/", children: "Go to Dashboard" }) })] }) }) }));
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
