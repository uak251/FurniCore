import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { useListQuotes, useCreateQuote, useLockQuote, useApproveQuote, usePayQuote, useListSuppliers, } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, Lock, CheckCircle, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv } from "@/lib/table-helpers";
const STATUS_COLORS = {
    PENDING: "secondary",
    LOCKED: "outline",
    ADMIN_APPROVED: "default",
    PAID: "default",
};
const STATUS_LABEL = {
    PENDING: "Pending",
    LOCKED: "Locked",
    ADMIN_APPROVED: "Approved",
    PAID: "Paid",
};
const TABLE_ID = "quotes";
export default function QuotesPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [sortKey, setSortKey] = useState("id");
    const [sortDir, setSortDir] = useState("desc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [showDialog, setShowDialog] = useState(false);
    const { data: quotes, isLoading } = useListQuotes();
    const { data: suppliers } = useListSuppliers();
    const createQuote = useCreateQuote();
    const lockQuote = useLockQuote();
    const approveQuote = useApproveQuote();
    const payQuote = usePayQuote();
    const { register, handleSubmit, control, reset } = useForm({
        defaultValues: { quantity: 1, unitPrice: 0 },
    });
    useEffect(() => {
        setPage(1);
    }, [search, statusFilter, sortKey, sortDir, pageSize]);
    const listPayload = quotes;
    const rows = Array.isArray(listPayload)
        ? listPayload
        : (listPayload?.data ?? listPayload?.rows ?? []);
    const sorted = useMemo(() => {
        return filterAndSortRows(rows, {
            search,
            match: (row, q) => {
                const qn = q.toLowerCase();
                const desc = (row.description || "").toLowerCase();
                const sup = (row.supplierName || "").toLowerCase();
                const textMatch = !qn || desc.includes(qn) || sup.includes(qn);
                if (!textMatch)
                    return false;
                if (statusFilter === "all")
                    return true;
                return row.status === statusFilter;
            },
            sortKey,
            sortDir,
            getSortValue: (row, key) => {
                switch (key) {
                    case "supplierName":
                        return String(row.supplierName ?? "");
                    case "totalPrice":
                        return Number(row.totalPrice);
                    case "quantity":
                        return Number(row.quantity);
                    case "status":
                        return String(row.status ?? "");
                    case "id":
                        return Number(row.id);
                    default:
                        return String(row.description ?? "");
                }
            },
        });
    }, [rows, search, statusFilter, sortKey, sortDir]);
    const { pageRows, total, totalPages, page: safePage } = useMemo(() => paginateRows(sorted, page, pageSize), [sorted, page, pageSize]);
    useEffect(() => {
        if (safePage !== page)
            setPage(safePage);
    }, [safePage, page]);
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listQuotes"] });
    const handleAction = async (action, msg) => {
        try {
            await action();
            toast({ title: msg });
            invalidate();
        }
        catch (e) {
            // Extract the server-side message from ApiError (e.g. "Quote can only be locked from PENDING status")
            const serverMsg = e?.data?.message ?? e?.data?.error ?? e?.message ?? "Something went wrong.";
            toast({ variant: "destructive", title: "Action failed", description: serverMsg });
        }
    };
    const exportCsv = () => {
        const headers = [
            "id",
            "supplierName",
            "description",
            "quantity",
            "unitPrice",
            "totalPrice",
            "status",
        ];
        const data = sorted.map((q) => ({
            id: q.id,
            supplierName: q.supplierName || `Supplier #${q.supplierId}`,
            description: q.description ?? "",
            quantity: Number(q.quantity),
            unitPrice: Number(q.unitPrice),
            totalPrice: Number(q.totalPrice),
            status: STATUS_LABEL[q.status] || q.status,
        }));
        exportRowsToCsv(`furnicore-quotes-${new Date().toISOString().slice(0, 10)}`, headers, data);
        toast({ title: "Export started", description: `${data.length} rows exported.` });
    };
    const onSubmit = async (data) => {
        if (!data.supplierId) {
            toast({ variant: "destructive", title: "Validation error", description: "Please select a supplier." });
            return;
        }
        const total = Number(data.quantity) * Number(data.unitPrice);
        try {
            await createQuote.mutateAsync({ data: { ...data, totalPrice: total } });
            toast({ title: "Quote created" });
            invalidate();
            setShowDialog(false);
            reset();
        }
        catch (e) {
            const serverMsg = e?.data?.message ?? e?.data?.error ?? e?.message ?? "Something went wrong.";
            toast({ variant: "destructive", title: "Failed to create quote", description: serverMsg });
        }
    };
    const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const to = Math.min(safePage * pageSize, total);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Supplier quotes" }), _jsx("p", { className: "text-muted-foreground", children: "Price-locked workflow: Pending \u2192 Locked \u2192 Approved \u2192 Paid" })] }), _jsxs(Button, { onClick: () => {
                            reset();
                            setShowDialog(true);
                        }, children: [_jsx(Plus, { className: "mr-2 h-4 w-4", "aria-hidden": true }), "New quote"] })] }), _jsx(TableToolbar, { id: TABLE_ID, entityLabel: "quotes", searchValue: search, onSearchChange: setSearch, searchPlaceholder: "Search by supplier or description\u2026", filterLabel: "Status", filterValue: statusFilter, onFilterChange: setStatusFilter, filterOptions: [
                    { value: "all", label: "All statuses" },
                    { value: "PENDING", label: "Pending" },
                    { value: "LOCKED", label: "Locked" },
                    { value: "ADMIN_APPROVED", label: "Approved" },
                    { value: "PAID", label: "Paid" },
                ], sortKey: sortKey, onSortKeyChange: setSortKey, sortOptions: [
                    { value: "id", label: "Quote #" },
                    { value: "supplierName", label: "Supplier" },
                    { value: "description", label: "Description" },
                    { value: "totalPrice", label: "Total" },
                    { value: "status", label: "Status" },
                ], sortDir: sortDir, onSortDirChange: setSortDir, pageSize: pageSize, onPageSizeChange: setPageSize, onExportCsv: exportCsv, exportDisabled: sorted.length === 0, resultsText: total === 0 ? "No matching quotes" : `Showing ${from}–${to} of ${total} matching quotes` }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: isLoading ? (_jsx("div", { className: "space-y-3 p-6", children: [1, 2, 3, 4].map((i) => (_jsx(Skeleton, { className: "h-14 w-full" }, i))) })) : pageRows.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(FileText, { className: "mb-3 h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No quotes match your filters" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { scope: "col", children: "Supplier" }), _jsx(TableHead, { scope: "col", children: "Description" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Qty" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Unit price" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Total" }), _jsx(TableHead, { scope: "col", children: "Status" }), _jsx(TableHead, { scope: "col", children: "Actions" })] }) }), _jsx(TableBody, { children: pageRows.map((q) => (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "font-medium", children: q.supplierName || `Supplier #${q.supplierId}` }), _jsx(TableCell, { className: "max-w-[220px] truncate text-muted-foreground", children: q.description }), _jsx(TableCell, { className: "text-right font-mono tabular-nums", children: Number(q.quantity) }), _jsxs(TableCell, { className: "text-right font-mono", children: ["$", Number(q.unitPrice).toFixed(2)] }), _jsxs(TableCell, { className: "text-right font-mono font-semibold", children: ["$", Number(q.totalPrice).toFixed(2)] }), _jsx(TableCell, { children: _jsx(Badge, { variant: STATUS_COLORS[q.status], className: q.status === "PAID" ? "bg-green-100 text-green-800" : "", children: STATUS_LABEL[q.status] || q.status }) }), _jsx(TableCell, { children: _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [q.status === "PENDING" && (_jsxs(Button, { size: "sm", variant: "outline", onClick: () => handleAction(() => lockQuote.mutateAsync({ id: q.id }), "Quote locked"), children: [_jsx(Lock, { className: "mr-1.5 h-3.5 w-3.5", "aria-hidden": true }), "Lock"] })), q.status === "LOCKED" && (_jsxs(Button, { size: "sm", variant: "outline", onClick: () => handleAction(() => approveQuote.mutateAsync({ id: q.id }), "Quote approved"), children: [_jsx(CheckCircle, { className: "mr-1.5 h-3.5 w-3.5", "aria-hidden": true }), "Approve"] })), q.status === "ADMIN_APPROVED" && (_jsxs(Button, { size: "sm", onClick: () => handleAction(() => payQuote.mutateAsync({ id: q.id }), "Quote paid"), children: [_jsx(CreditCard, { className: "mr-1.5 h-3.5 w-3.5", "aria-hidden": true }), "Mark paid"] })), q.status === "PAID" && (_jsx("span", { className: "text-xs font-medium text-green-600", children: "Complete" }))] }) })] }, q.id))) })] }) }), _jsx(TablePaginationBar, { id: TABLE_ID, page: safePage, totalPages: totalPages, onPageChange: setPage })] })) }) }), _jsx(Dialog, { open: showDialog, onOpenChange: setShowDialog, children: _jsxs(DialogContent, { className: "max-w-lg", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "New supplier quote" }) }), _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { children: "Supplier" }), _jsx(Controller, { name: "supplierId", control: control, rules: { required: true }, render: ({ field }) => (_jsxs(Select, { value: field.value ? String(field.value) : "", onValueChange: (v) => field.onChange(v ? Number(v) : undefined), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Select supplier\u2026" }) }), _jsx(SelectContent, { children: (suppliers ?? []).map((s) => (_jsx(SelectItem, { value: s.id.toString(), children: s.name }, s.id))) })] })) })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "quote-desc", children: "Description" }), _jsx(Input, { id: "quote-desc", ...register("description", { required: true }), placeholder: "e.g. Oak Lumber - Bulk Order Q2" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "quote-qty", children: "Quantity" }), _jsx(Input, { id: "quote-qty", type: "number", step: "0.01", ...register("quantity", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "quote-unit", children: "Unit price ($)" }), _jsx(Input, { id: "quote-unit", type: "number", step: "0.01", ...register("unitPrice", { valueAsNumber: true }) })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "quote-notes", children: "Notes" }), _jsx(Input, { id: "quote-notes", ...register("notes"), placeholder: "Optional notes\u2026" })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowDialog(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: createQuote.isPending, children: "Create quote" })] })] })] }) })] }));
}
