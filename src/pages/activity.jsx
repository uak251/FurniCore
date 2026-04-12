import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { useListActivityLogs } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Package, Users, Truck, FileText, Hammer, Banknote, Receipt, Settings, } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv } from "@/lib/table-helpers";
import { useToast } from "@/hooks/use-toast";
const MODULE_ICONS = {
    products: Package,
    inventory: Package,
    suppliers: Truck,
    quotes: FileText,
    manufacturing: Hammer,
    hr: Users,
    employees: Users,
    payroll: Banknote,
    accounting: Receipt,
    users: Users,
    settings: Settings,
};
const ACTION_COLORS = {
    CREATE: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-100",
    UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100",
    DELETE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100",
    LOCK: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100",
    APPROVE: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-100",
    PAY: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-100",
    LOGIN: "bg-gray-100 text-gray-800 dark:bg-muted dark:text-foreground",
    LOGOUT: "bg-gray-100 text-gray-800 dark:bg-muted dark:text-foreground",
};
const TABLE_ID = "activity";
const MODULE_OPTIONS = [
    { value: "all", label: "All modules" },
    { value: "products", label: "Products" },
    { value: "inventory", label: "Inventory" },
    { value: "suppliers", label: "Suppliers" },
    { value: "quotes", label: "Quotes" },
    { value: "manufacturing", label: "Manufacturing" },
    { value: "hr", label: "HR" },
    { value: "payroll", label: "Payroll" },
    { value: "accounting", label: "Accounting" },
    { value: "users", label: "Users" },
];
export default function ActivityPage() {
    const { toast } = useToast();
    const [search, setSearch] = useState("");
    const [moduleFilter, setModuleFilter] = useState("all");
    const [sortKey, setSortKey] = useState("createdAt");
    const [sortDir, setSortDir] = useState("desc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);
    const { data: logs, isLoading } = useListActivityLogs();
    useEffect(() => {
        setPage(1);
    }, [search, moduleFilter, sortKey, sortDir, pageSize]);
    const rows = logs ?? [];
    const sorted = useMemo(() => {
        return filterAndSortRows(rows, {
            search,
            match: (row, q) => {
                const qn = q.toLowerCase();
                const textMatch = !qn ||
                    String(row.description ?? "").toLowerCase().includes(qn) ||
                    String(row.userName ?? "").toLowerCase().includes(qn) ||
                    String(row.action ?? "").toLowerCase().includes(qn);
                if (!textMatch)
                    return false;
                if (moduleFilter === "all")
                    return true;
                return String(row.module ?? "").toLowerCase() === moduleFilter;
            },
            sortKey,
            sortDir,
            getSortValue: (row, key) => {
                if (key === "createdAt")
                    return new Date(row.createdAt).getTime();
                if (key === "module")
                    return String(row.module ?? "");
                if (key === "action")
                    return String(row.action ?? "");
                if (key === "userName")
                    return String(row.userName ?? "");
                return String(row.description ?? "");
            },
        });
    }, [rows, search, moduleFilter, sortKey, sortDir]);
    const { pageRows, total, totalPages, page: safePage } = useMemo(() => paginateRows(sorted, page, pageSize), [sorted, page, pageSize]);
    useEffect(() => {
        if (safePage !== page)
            setPage(safePage);
    }, [safePage, page]);
    const exportCsv = () => {
        const headers = ["createdAt", "userName", "action", "module", "description"];
        const data = sorted.map((log) => ({
            createdAt: new Date(log.createdAt).toISOString(),
            userName: log.userName || "System",
            action: log.action,
            module: log.module,
            description: (log.description || "").replace(/\r?\n/g, " "),
        }));
        exportRowsToCsv(`furnicore-activity-${new Date().toISOString().slice(0, 10)}`, headers, data);
        toast({ title: "Export started", description: `${data.length} rows exported.` });
    };
    const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const to = Math.min(safePage * pageSize, total);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Activity log" }), _jsx("p", { className: "text-muted-foreground", children: "Audit trail of system actions (filter, sort, export)" })] }), _jsx(TableToolbar, { id: TABLE_ID, entityLabel: "activity log", searchValue: search, onSearchChange: setSearch, searchPlaceholder: "Search description, user, or action\u2026", filterLabel: "Module", filterValue: moduleFilter, onFilterChange: setModuleFilter, filterOptions: MODULE_OPTIONS, sortKey: sortKey, onSortKeyChange: setSortKey, sortOptions: [
                    { value: "createdAt", label: "Time" },
                    { value: "module", label: "Module" },
                    { value: "action", label: "Action" },
                    { value: "userName", label: "User" },
                    { value: "description", label: "Description" },
                ], sortDir: sortDir, onSortDirChange: setSortDir, pageSize: pageSize, onPageSizeChange: setPageSize, onExportCsv: exportCsv, exportDisabled: sorted.length === 0, resultsText: total === 0 ? "No matching entries" : `Showing ${from}–${to} of ${total} matching entries` }), isLoading ? (_jsx("div", { className: "space-y-3", children: [1, 2, 3, 4, 5].map((i) => (_jsx(Skeleton, { className: "h-16 w-full rounded-xl" }, i))) })) : pageRows.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-20 text-muted-foreground", children: [_jsx(Activity, { className: "mb-4 h-12 w-12", "aria-hidden": true }), _jsx("p", { className: "text-lg font-medium", children: "No activity recorded" })] })) : (_jsxs(_Fragment, { children: [_jsx("ul", { className: "space-y-2", "aria-label": "Activity entries", "aria-busy": isLoading, children: pageRows.map((log) => {
                            const Icon = MODULE_ICONS[log.module?.toLowerCase()] || Activity;
                            const actionColor = ACTION_COLORS[log.action?.toUpperCase()] ||
                                "bg-muted text-foreground";
                            return (_jsx("li", { children: _jsx(Card, { children: _jsx(CardContent, { className: "p-4", children: _jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4", children: [_jsx("div", { className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted", "aria-hidden": true, children: _jsx(Icon, { className: "h-4 w-4 text-muted-foreground" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(Badge, { className: cn("text-xs font-medium", actionColor), children: log.action }), _jsx(Badge, { variant: "outline", className: "text-xs capitalize", children: log.module }), _jsx("span", { className: "text-sm font-medium", children: log.userName || "System" })] }), _jsx("p", { className: "mt-1 break-words text-sm text-muted-foreground", children: log.description })] }), _jsx("time", { className: "shrink-0 text-xs text-muted-foreground sm:text-right", dateTime: log.createdAt, children: new Date(log.createdAt).toLocaleString() })] }) }) }) }, log.id));
                        }) }), _jsx(TablePaginationBar, { id: TABLE_ID, page: safePage, totalPages: totalPages, onPageChange: setPage })] }))] }));
}
