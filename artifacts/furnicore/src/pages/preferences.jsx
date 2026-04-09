import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "wouter";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { ArrowLeft, Palette, Loader2, Check, UserCircle } from "lucide-react";
import { profilePathForRole } from "@/lib/profile-path";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useGetDashboardThemeCatalog, getGetDashboardThemeCatalogQueryKey, } from "@workspace/api-client-react";
import { useDashboardTheme } from "@/context/DashboardThemeProvider";
import { cn } from "@/lib/utils";
/**
 * Personal appearance — same data as the header theme picker, full-page for discoverability.
 */
export default function PreferencesPage() {
    const { data: me } = useGetCurrentUser();
    const { effectiveThemeId, userOverride, setTheme, isSaving } = useDashboardTheme();
    const { data: catalog, isLoading } = useGetDashboardThemeCatalog({
        query: { queryKey: getGetDashboardThemeCatalogQueryKey() },
    });
    const themes = catalog?.themes ?? [];
    const backHref = me?.role === "supplier"
        ? "/supplier-portal"
        : me?.role === "worker"
            ? "/worker-portal"
            : me?.role === "customer"
                ? "/customer-portal"
                : "/";
    const backLabel = me?.role === "supplier" || me?.role === "worker" || me?.role === "customer"
        ? "Back to portal"
        : "Back to dashboard";
    return (_jsxs("div", { className: "space-y-8", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx(Button, { variant: "ghost", size: "sm", className: "-ml-2 gap-1", asChild: true, children: _jsxs(Link, { href: backHref, children: [_jsx(ArrowLeft, { className: "h-4 w-4", "aria-hidden": true }), backLabel] }) }), _jsx(Button, { variant: "outline", size: "sm", className: "gap-1.5", asChild: true, children: _jsxs(Link, { href: profilePathForRole(me?.role), children: [_jsx(UserCircle, { className: "h-4 w-4", "aria-hidden": true }), "Profile"] }) })] }), _jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Palette, { className: "h-8 w-8 text-primary", "aria-hidden": true }), _jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Appearance" })] }), _jsx("p", { className: "mt-1 text-muted-foreground max-w-2xl", children: "Choose a dashboard shell theme for FurniCore. Your selection is saved to your account and follows you across sessions. Clear the override to use your portal's default theme set by an administrator." })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { className: "text-base", children: "Dashboard theme" }), _jsxs(CardDescription, { children: ["Preview updates the UI immediately. ", isSaving && "Saving…"] })] }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("button", { type: "button", disabled: isSaving, onClick: () => setTheme(null), className: cn("flex w-full max-w-xl items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60", userOverride == null && "border-primary/50 bg-primary/5 ring-1 ring-primary/20"), children: [_jsxs("span", { children: [_jsx("span", { className: "font-medium", children: "Use portal default" }), _jsxs("span", { className: "mt-0.5 block text-[11px] text-muted-foreground", children: ["Use the default theme for your portal role (currently ", effectiveThemeId, ")."] })] }), userOverride == null && _jsx(Check, { className: "h-5 w-5 shrink-0 text-primary" })] }), _jsx(Separator, {}), isLoading && (_jsx("div", { className: "flex justify-center py-12 text-muted-foreground", children: _jsx(Loader2, { className: "h-8 w-8 animate-spin" }) })), _jsx("ul", { className: "grid gap-2 sm:grid-cols-2", children: themes.map((t) => {
                                    const active = userOverride === t.id;
                                    return (_jsx("li", { children: _jsxs("button", { type: "button", disabled: isSaving, onClick: () => (t.id ? setTheme(t.id) : undefined), className: cn("flex h-full w-full flex-col gap-1 rounded-xl border p-4 text-left text-sm transition-colors hover:bg-muted/50", active && "border-primary/50 bg-primary/5 ring-1 ring-primary/20"), children: [_jsxs("span", { className: "flex items-start justify-between gap-2", children: [_jsx("span", { className: "font-semibold", children: t.label }), active && _jsx(Check, { className: "h-4 w-4 shrink-0 text-primary" })] }), _jsx("span", { className: "text-[11px] leading-snug text-muted-foreground", children: t.description })] }) }, t.id));
                                }) })] })] })] }));
}
