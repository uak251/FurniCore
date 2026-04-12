import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useLocation } from "wouter";
import { useLogout, useGetCurrentUser } from "@workspace/api-client-react";
import { clearAuthStorage } from "@/lib/auth";
import { disconnectSocket } from "@/lib/socket";
import { Hammer, LogOut, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileNavButton } from "@/components/ProfileNavButton";
import { profilePathForRole } from "@/lib/profile-path";
import { ThemeSwitcher } from "@/components/dashboard/ThemeSwitcher";
import { resolvePublicAssetUrl } from "@/lib/image-url";
export function WorkerLayout({ children }) {
    const [, setLocation] = useLocation();
    const logout = useLogout();
    const { data: user } = useGetCurrentUser();
    const handleLogout = async () => {
        try {
            await logout.mutateAsync();
        }
        catch {
            // ignore
        }
        finally {
            disconnectSocket();
            clearAuthStorage();
            setLocation("/login");
        }
    };
    return (_jsxs("div", { className: "flex min-h-screen flex-col bg-muted/30", children: [_jsxs("header", { className: "sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card/95 px-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80 md:px-8", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm", children: _jsx(Hammer, { className: "h-4 w-4", "aria-hidden": true }) }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-bold tracking-tight text-primary", children: "FurniCore" }), _jsx(Badge, { variant: "secondary", className: "hidden text-[10px] sm:inline-flex", children: "Worker Portal" })] })] }), _jsxs("div", { className: "flex items-center gap-2 sm:gap-3", children: [_jsx(Button, { variant: "ghost", size: "sm", className: "hidden text-muted-foreground lg:inline-flex", asChild: true, children: _jsx(Link, { href: "/worker-portal/preferences", children: "Appearance" }) }), _jsx(ThemeSwitcher, {}), _jsx(ProfileNavButton, { href: profilePathForRole(user?.role) }), _jsx(NotificationBell, {}), user && (_jsxs("div", { className: "hidden items-center gap-2 sm:flex", children: [user.profileImageUrl ? (_jsx("img", { src: resolvePublicAssetUrl(user.profileImageUrl), alt: "", className: "h-7 w-7 rounded-full object-cover ring-1 ring-primary/20" })) : (_jsx("div", { className: "flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary", children: user.name?.charAt(0).toUpperCase() ?? "W" })), _jsxs("div", { className: "text-right leading-tight", children: [_jsx("p", { className: "text-xs font-medium", children: user.name }), _jsxs("p", { className: "flex items-center gap-1 text-[10px] text-muted-foreground", children: [_jsx(HardHat, { className: "h-3 w-3", "aria-hidden": true }), "Worker"] })] })] })), _jsxs(Button, { variant: "ghost", size: "sm", className: "text-muted-foreground hover:text-foreground", onClick: handleLogout, children: [_jsx(LogOut, { className: "mr-1.5 h-4 w-4", "aria-hidden": true }), _jsx("span", { className: "hidden sm:inline", children: "Log out" })] })] })] }), _jsx("main", { className: "min-h-0 min-w-0 flex-1 overflow-auto", children: _jsx("div", { className: "mx-auto w-full min-w-0 max-w-4xl px-4 py-8 md:px-8", children: children }) }), _jsx("footer", { className: "border-t bg-card px-8 py-3 text-center text-xs text-muted-foreground", children: "FurniCore ERP \u00B7 Worker Portal \u00B7 Data shown is restricted to your account only" })] }));
}
