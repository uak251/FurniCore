import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useListNotifications, useMarkNotificationRead } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { socket, connectSocket } from "@/lib/socket";
const TYPE_ICONS = {
    warning: AlertTriangle,
    info: Info,
    success: CheckCircle,
    error: AlertTriangle,
};
const TYPE_COLORS = {
    warning: "text-amber-500",
    info: "text-blue-500",
    success: "text-green-600",
    error: "text-destructive",
};
const MAX_PREVIEW = 8;
export function NotificationBell() {
    const [open, setOpen] = useState(false);
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { data: notifications, isLoading } = useListNotifications();
    const markRead = useMarkNotificationRead();
    // Real-time low-stock alerts via Socket.io
    useEffect(() => {
        connectSocket();
        const handleLowStock = (item) => {
            toast({
                variant: "destructive",
                title: "Low Stock Alert",
                description: `${item.name} — only ${item.quantity} ${item.quantity === 1 ? "unit" : "units"} remaining (reorder at ${item.reorderLevel}).`,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        };
        socket.on("low-stock", handleLowStock);
        return () => {
            socket.off("low-stock", handleLowStock);
        };
    }, [queryClient, toast]);
    const list = notifications ?? [];
    const unreadCount = list.filter((n) => !n.isRead).length;
    const preview = list.slice(0, MAX_PREVIEW);
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    const handleMarkOne = async (id, e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await markRead.mutateAsync({ id });
            invalidate();
        }
        catch {
            /* toast optional */
        }
    };
    const label = unreadCount === 0
        ? "Notifications, no unread messages"
        : `Notifications, ${unreadCount} unread`;
    return (_jsxs(Popover, { open: open, onOpenChange: setOpen, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsxs(Button, { type: "button", variant: "outline", size: "icon", className: "relative shrink-0", "aria-label": label, "aria-expanded": open, "aria-haspopup": "dialog", children: [_jsx(Bell, { className: "h-4 w-4", "aria-hidden": true }), unreadCount > 0 && (_jsx("span", { className: "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground", "aria-hidden": true, children: unreadCount > 99 ? "99+" : unreadCount }))] }) }), _jsxs(PopoverContent, { className: "w-[min(100vw-2rem,22rem)] p-0", align: "end", sideOffset: 8, id: "notifications-popover", children: [_jsxs("div", { className: "border-b px-3 py-2", children: [_jsx("h2", { className: "text-sm font-semibold leading-none", children: "Notifications" }), _jsx("p", { className: "text-xs text-muted-foreground mt-1", children: isLoading
                                    ? "Loading…"
                                    : unreadCount === 0
                                        ? "You're all caught up"
                                        : `${unreadCount} unread` })] }), _jsx(ScrollArea, { className: "h-[min(320px,50vh)]", children: isLoading ? (_jsx("p", { className: "p-4 text-sm text-muted-foreground", children: "Loading notifications\u2026" })) : preview.length === 0 ? (_jsx("p", { className: "p-4 text-sm text-muted-foreground", children: "No notifications yet." })) : (_jsx("ul", { className: "divide-y", role: "list", children: preview.map((n) => {
                                const Icon = TYPE_ICONS[n.type] || Info;
                                const color = TYPE_COLORS[n.type] || "text-muted-foreground";
                                return (_jsx("li", { children: _jsxs("div", { className: cn("flex gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60", !n.isRead && "bg-muted/40"), children: [_jsx("div", { className: cn("mt-0.5 shrink-0", color), "aria-hidden": true, children: _jsx(Icon, { className: "h-4 w-4" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "font-medium leading-snug line-clamp-2", children: n.title }), _jsx("p", { className: "text-xs text-muted-foreground line-clamp-2 mt-0.5", children: n.message }), _jsxs("div", { className: "mt-1.5 flex flex-wrap items-center gap-2", children: [_jsx("time", { className: "text-[10px] text-muted-foreground", dateTime: n.createdAt, children: new Date(n.createdAt).toLocaleString() }), !n.isRead && (_jsx("button", { type: "button", className: "text-[10px] font-medium text-primary underline-offset-2 hover:underline", onClick: (e) => handleMarkOne(n.id, e), children: "Mark read" }))] })] })] }) }, n.id));
                            }) })) }), _jsx("div", { className: "border-t p-2", children: _jsx(Button, { variant: "ghost", className: "w-full justify-center text-sm", asChild: true, children: _jsx(Link, { href: "/notifications", onClick: () => setOpen(false), children: "View all notifications" }) }) })] })] }));
}
