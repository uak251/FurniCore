import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv } from "@/lib/table-helpers";
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
const TABLE_ID = "notifications";
export default function NotificationsPage() {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [readFilter, setReadFilter] = useState("all");
    const [sortKey, setSortKey] = useState("createdAt");
    const [sortDir, setSortDir] = useState("desc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const { data: notifications, isLoading } = useListNotifications();
    const markRead = useMarkNotificationRead();
    const markAll = useMarkAllNotificationsRead();
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    useEffect(() => {
        setPage(1);
    }, [search, readFilter, sortKey, sortDir, pageSize]);
    const rows = useMemo(() => notifications ?? [], [notifications]);
    const sorted = useMemo(() => {
        return filterAndSortRows(rows, {
            search,
            match: (row, q) => {
                const qn = q.toLowerCase();
                const textMatch = !qn ||
                    String(row.title ?? "").toLowerCase().includes(qn) ||
                    String(row.message ?? "").toLowerCase().includes(qn);
                if (!textMatch)
                    return false;
                if (readFilter === "unread")
                    return !row.isRead;
                if (readFilter === "read")
                    return row.isRead;
                return true;
            },
            sortKey,
            sortDir,
            getSortValue: (row, key) => {
                if (key === "createdAt")
                    return new Date(row.createdAt).getTime();
                if (key === "title")
                    return String(row.title ?? "");
                if (key === "type")
                    return String(row.type ?? "");
                return row.isRead ? 1 : 0;
            },
        });
    }, [rows, search, readFilter, sortKey, sortDir]);
    const { pageRows, total, totalPages, page: safePage } = useMemo(() => paginateRows(sorted, page, pageSize), [sorted, page, pageSize]);
    useEffect(() => {
        if (safePage !== page)
            setPage(safePage);
    }, [safePage, page]);
    const unreadCount = rows.filter((n) => !n.isRead).length;
    const handleMarkRead = async (id) => {
        try {
            await markRead.mutateAsync({ id });
            invalidate();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const handleMarkAll = async () => {
        try {
            await markAll.mutateAsync();
            toast({ title: "All notifications marked as read" });
            invalidate();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const openLinkedWorkflow = async (n) => {
        try {
            if (!n.isRead) {
                await markRead.mutateAsync({ id: n.id });
                invalidate();
            }
        }
        catch {
            // ignore mark-read error when navigating to target workflow
        }
        const href = String(n.link || "").trim();
        if (!href)
            return;
        if (href.startsWith("http://") || href.startsWith("https://")) {
            window.open(href, "_blank", "noopener,noreferrer");
            return;
        }
        setLocation(href.startsWith("/") ? href : `/${href}`);
    };
    const exportCsv = () => {
        const headers = ["title", "message", "type", "isRead", "createdAt"];
        const data = sorted.map((n) => ({
            title: n.title,
            message: (n.message || "").replace(/\r?\n/g, " "),
            type: n.type,
            isRead: n.isRead ? "Yes" : "No",
            createdAt: new Date(n.createdAt).toISOString(),
        }));
        exportRowsToCsv(`furnicore-notifications-${new Date().toISOString().slice(0, 10)}`, headers, data);
        toast({ title: "Export started", description: `${data.length} rows exported.` });
    };
    const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const to = Math.min(safePage * pageSize, total);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Notifications" }), _jsx("p", { className: "text-muted-foreground", role: "status", children: unreadCount > 0
                                    ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                                    : "All caught up" })] }), unreadCount > 0 && (_jsxs(Button, { variant: "outline", onClick: handleMarkAll, disabled: markAll.isPending, children: [_jsx(CheckCheck, { className: "mr-2 h-4 w-4", "aria-hidden": true }), "Mark all read"] }))] }), _jsx(TableToolbar, { id: TABLE_ID, entityLabel: "notifications", searchValue: search, onSearchChange: setSearch, searchPlaceholder: "Search title or message\u2026", filterLabel: "Read status", filterValue: readFilter, onFilterChange: setReadFilter, filterOptions: [
                    { value: "all", label: "All" },
                    { value: "unread", label: "Unread only" },
                    { value: "read", label: "Read only" },
                ], sortKey: sortKey, onSortKeyChange: setSortKey, sortOptions: [
                    { value: "createdAt", label: "Date" },
                    { value: "title", label: "Title" },
                    { value: "type", label: "Type" },
                    { value: "isRead", label: "Read status" },
                ], sortDir: sortDir, onSortDirChange: setSortDir, pageSize: pageSize, onPageSizeChange: setPageSize, onExportCsv: exportCsv, exportDisabled: sorted.length === 0, resultsText: total === 0
                    ? "No matching notifications"
                    : `Showing ${from}–${to} of ${total} matching notifications` }), isLoading ? (_jsx("div", { className: "space-y-3", children: [1, 2, 3].map((i) => (_jsx(Skeleton, { className: "h-20 w-full rounded-xl" }, i))) })) : pageRows.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-20 text-muted-foreground", children: [_jsx(Bell, { className: "mb-4 h-12 w-12", "aria-hidden": true }), _jsx("p", { className: "text-lg font-medium", children: "No notifications" }), _jsx("p", { className: "text-sm", children: "You're all caught up." })] })) : (_jsxs(_Fragment, { children: [_jsx("ul", { className: "space-y-2", "aria-label": "Notification list", children: pageRows.map((n) => {
                            const Icon = TYPE_ICONS[n.type] || Info;
                            const color = TYPE_COLORS[n.type] || "text-muted-foreground";
                                    return (_jsx("li", { children: _jsx(Card, { className: cn("transition-colors", !n.isRead && "border-l-4 border-l-primary bg-muted/30"), children: _jsx(CardContent, { className: "p-4", children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("div", { className: cn("mt-0.5 shrink-0", color), "aria-hidden": true, children: _jsx(Icon, { className: "h-5 w-5" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsx("h2", { className: cn("text-sm font-semibold", !n.isRead ? "text-foreground" : "text-muted-foreground"), children: n.title }), !n.isRead && (_jsx(Badge, { className: "shrink-0", variant: "default", children: "New" }))] }), _jsx("p", { className: "mt-0.5 text-sm text-muted-foreground", children: n.message }), _jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-2", children: [_jsx("time", { className: "text-xs text-muted-foreground/80", dateTime: n.createdAt, children: new Date(n.createdAt).toLocaleString() }), n.link && (_jsx(Button, { type: "button", size: "sm", variant: "secondary", className: "h-7 px-2 text-xs", onClick: () => openLinkedWorkflow(n), children: "Open related task" })), !n.isRead && (_jsx(Button, { type: "button", variant: "link", size: "sm", className: "h-auto p-0 text-xs", onClick: () => handleMarkRead(n.id), children: "Mark as read" }))] })] })] }) }) }) }, n.id));
                        }) }), _jsx(TablePaginationBar, { id: TABLE_ID, page: safePage, totalPages: totalPages, onPageChange: setPage })] }))] }));
}
