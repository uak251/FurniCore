import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { useListPayroll, useGeneratePayroll, useApprovePayroll, useListEmployees, useGetCurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePayrollAdjustments, useAddPayrollAdjustment, useDeletePayrollAdjustment, useRegeneratePayroll, } from "@/hooks/use-hr-portal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Banknote, CheckCircle, Plus, ChevronDown, ChevronUp, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Trash2, Info, Upload, Images, } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv } from "@/lib/table-helpers";
import { cn } from "@/lib/utils";
import { BulkImportExport } from "@/components/BulkImportExport";
import { ModuleAnalyticsPanel } from "@/components/ModuleAnalyticsPanel";
import { useCurrency } from "@/lib/currency";
import { RecordAvatar, RecordImagePanel, ModuleGallery, useModuleImages, MODULE_GALLERY_DIALOG_BODY_CLASS, MODULE_GALLERY_DIALOG_CONTENT_CLASS, MODULE_GALLERY_DIALOG_HEADER_CLASS, MODULE_GALLERY_DIALOG_TITLE_CLASS, } from "@/components/images";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TABLE_ID = "payroll";
/* ─── Payroll breakdown panel ────────────────────────────────────────────────── */
function BreakdownPanel({ payrollId, notes }) {
    const { format: fmtCur } = useCurrency();
    const fmt = (n) => fmtCur(Math.abs(n));
    let bd = null;
    try {
        if (notes)
            bd = JSON.parse(notes);
    }
    catch { /* no-op */ }
    if (!bd) {
        return (_jsxs("div", { className: "flex items-center gap-2 py-3 text-xs text-muted-foreground", children: [_jsx(Info, { className: "h-4 w-4 shrink-0", "aria-hidden": true }), "No detailed breakdown available. Regenerate this record to compute it."] }));
    }
    const att = bd.attendance;
    return (_jsxs("div", { className: "space-y-4 py-2 text-sm", children: [_jsxs("div", { className: "rounded-md bg-muted/40 px-4 py-3", children: [_jsx("p", { className: "mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider", children: "Net Salary Formula" }), _jsxs("p", { className: "font-mono text-xs leading-relaxed", children: ["Monthly Base ", fmt(bd.monthlyBase), bd.totalBonus > 0 && ` + Bonuses ${fmt(bd.totalBonus)}`, bd.totalDeductions > 0 && ` − Deductions ${fmt(bd.totalDeductions)}`, " ", "= ", _jsx("strong", { children: fmt(bd.netSalary) })] }), _jsxs("p", { className: "mt-1 text-[10px] text-muted-foreground", children: ["Daily rate: ", fmt(bd.dayRate), " (", bd.workingDays, " working days)"] })] }), _jsxs("div", { children: [_jsxs("p", { className: "mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider", children: ["Attendance \u2014 ", att.totalRecords, " records"] }), _jsx("div", { className: "grid grid-cols-4 gap-2 text-center text-xs", children: [
                            { label: "Present", value: att.present, color: "text-green-600" },
                            { label: "Absent", value: att.absent, color: "text-red-600" },
                            { label: "Late", value: att.late, color: "text-amber-600" },
                            { label: "Half Day", value: att.halfDay, color: "text-blue-600" },
                        ].map(({ label, value, color }) => (_jsxs("div", { className: "rounded-md border bg-card p-2", children: [_jsx("p", { className: "text-muted-foreground", children: label }), _jsx("p", { className: cn("text-lg font-bold tabular-nums", color), children: value })] }, label))) }), att.totalAttendancePenalty > 0 && (_jsxs("div", { className: "mt-2 space-y-1 rounded-md bg-red-50 px-3 py-2 text-xs dark:bg-red-950/20", children: [_jsx("p", { className: "font-medium text-red-700 dark:text-red-400", children: "Attendance deductions" }), att.absentPenalty > 0 && _jsxs("p", { className: "flex justify-between text-red-600", children: [_jsxs("span", { children: [att.absent, " absent day(s) \u00D7 ", fmt(bd.dayRate)] }), _jsxs("span", { children: ["\u2212", fmt(att.absentPenalty)] })] }), att.latePenalty > 0 && _jsxs("p", { className: "flex justify-between text-red-600", children: [_jsxs("span", { children: [att.late, " late occurrence(s) \u00D7 ", fmt(bd.dayRate * 0.25)] }), _jsxs("span", { children: ["\u2212", fmt(att.latePenalty)] })] }), att.halfDayPenalty > 0 && _jsxs("p", { className: "flex justify-between text-red-600", children: [_jsxs("span", { children: [att.halfDay, " half-day(s) \u00D7 ", fmt(bd.dayRate * 0.5)] }), _jsxs("span", { children: ["\u2212", fmt(att.halfDayPenalty)] })] }), _jsx(Separator, { className: "my-1" }), _jsxs("p", { className: "flex justify-between font-semibold text-red-700 dark:text-red-400", children: [_jsx("span", { children: "Total attendance penalty" }), _jsxs("span", { children: ["\u2212", fmt(att.totalAttendancePenalty)] })] })] }))] }), (bd.bonusAdjustments.length > 0 || bd.penaltyAdjustments.length > 0) && (_jsxs("div", { children: [_jsx("p", { className: "mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider", children: "Manual Adjustments" }), _jsxs("div", { className: "space-y-1", children: [bd.bonusAdjustments.map((a) => (_jsxs("div", { className: "flex items-center justify-between rounded-md bg-green-50 px-3 py-1.5 text-xs dark:bg-green-950/20", children: [_jsxs("span", { className: "text-green-700 dark:text-green-400", children: [_jsx(TrendingUp, { className: "mr-1 inline h-3 w-3", "aria-hidden": true }), "Bonus: ", a.reason] }), _jsxs("span", { className: "font-mono font-semibold text-green-700 dark:text-green-400", children: ["+", fmt(a.amount)] })] }, a.id))), bd.penaltyAdjustments.map((a) => (_jsxs("div", { className: "flex items-center justify-between rounded-md bg-red-50 px-3 py-1.5 text-xs dark:bg-red-950/20", children: [_jsxs("span", { className: "text-red-700 dark:text-red-400", children: [_jsx(TrendingDown, { className: "mr-1 inline h-3 w-3", "aria-hidden": true }), "Penalty: ", a.reason] }), _jsxs("span", { className: "font-mono font-semibold text-red-700 dark:text-red-400", children: ["\u2212", fmt(a.amount)] })] }, a.id)))] })] })), _jsxs("div", { className: "flex items-center justify-between rounded-lg bg-primary/5 px-4 py-3 font-semibold", children: [_jsx("span", { children: "Net Salary" }), _jsx("span", { className: "text-lg tabular-nums text-primary", children: fmt(bd.netSalary) })] })] }));
}
/* ─── Payroll adjustment row ─────────────────────────────────────────────────── */
function AdjustmentsPanel({ payrollRecord, onClose, }) {
    const { toast } = useToast();
    const { format: fmtCur } = useCurrency();
    const fmt = (n) => fmtCur(Math.abs(n));
    const { data: adjustments = [], isLoading } = usePayrollAdjustments({
        employeeId: payrollRecord.employeeId,
        month: payrollRecord.month,
        year: payrollRecord.year,
    });
    const addAdj = useAddPayrollAdjustment();
    const deleteAdj = useDeletePayrollAdjustment();
    const regen = useRegeneratePayroll();
    const { register, handleSubmit, control, reset } = useForm({
        defaultValues: { type: "bonus", reason: "", amount: 0 },
    });
    const onAdd = async (data) => {
        try {
            await addAdj.mutateAsync({
                employeeId: payrollRecord.employeeId,
                type: data.type,
                reason: data.reason,
                amount: Number(data.amount),
                month: payrollRecord.month,
                year: payrollRecord.year,
            });
            toast({ title: `${data.type === "bonus" ? "Bonus" : "Penalty"} added` });
            reset({ type: "bonus", reason: "", amount: 0 });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const onDelete = async (id) => {
        if (!confirm("Remove this adjustment?"))
            return;
        try {
            await deleteAdj.mutateAsync(id);
            toast({ title: "Adjustment removed" });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const onRegenerate = async () => {
        try {
            await regen.mutateAsync(payrollRecord.id);
            toast({ title: "Payroll recalculated", description: "Breakdown updated with latest attendance and adjustments." });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold", children: payrollRecord.employeeName }), _jsxs("p", { className: "text-sm text-muted-foreground", children: [MONTHS[(payrollRecord.month ?? 1) - 1], " ", payrollRecord.year] })] }), payrollRecord.status !== "approved" && (_jsxs(Button, { size: "sm", variant: "outline", onClick: onRegenerate, disabled: regen.isPending, children: [_jsx(RefreshCw, { className: cn("mr-1.5 h-3.5 w-3.5", regen.isPending && "animate-spin"), "aria-hidden": true }), "Recalculate"] }))] }), _jsx(BreakdownPanel, { payrollId: payrollRecord.id, notes: payrollRecord.notes }), _jsx(Separator, {}), _jsxs("div", { children: [_jsxs("p", { className: "mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider", children: ["Manual Adjustments (", adjustments.length, ")"] }), isLoading ? (_jsx(Skeleton, { className: "h-16 w-full" })) : adjustments.length === 0 ? (_jsx("p", { className: "py-3 text-center text-xs text-muted-foreground", children: "No manual adjustments yet" })) : (_jsx("div", { className: "space-y-1.5", children: adjustments.map((a) => (_jsxs("div", { className: cn("flex items-center justify-between rounded-md border px-3 py-2 text-sm", a.type === "bonus" ? "border-green-100 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                                : "border-red-100 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"), children: [_jsxs("div", { children: [_jsx(Badge, { variant: a.type === "bonus" ? "default" : "destructive", className: "mr-2 text-[10px]", children: a.type }), _jsx("span", { className: "font-medium", children: a.reason })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("span", { className: cn("font-mono font-semibold tabular-nums", a.type === "bonus" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"), children: [a.type === "bonus" ? "+" : "−", fmt(a.amount)] }), payrollRecord.status !== "approved" && (_jsx(Button, { size: "icon", variant: "ghost", className: "h-6 w-6 text-muted-foreground", onClick: () => onDelete(a.id), "aria-label": "Remove adjustment", children: _jsx(Trash2, { className: "h-3 w-3" }) }))] })] }, a.id))) }))] }), payrollRecord.status !== "approved" && (_jsxs("form", { onSubmit: handleSubmit(onAdd), className: "rounded-lg border bg-muted/20 p-4 space-y-3", children: [_jsx("p", { className: "text-xs font-semibold text-muted-foreground uppercase tracking-wider", children: "Add Adjustment" }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { className: "text-xs", children: "Type" }), _jsx(Controller, { name: "type", control: control, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { className: "h-8", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "bonus", children: "Bonus" }), _jsx(SelectItem, { value: "penalty", children: "Penalty" })] })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "adj-amount", className: "text-xs", children: "Amount ($)" }), _jsx(Input, { id: "adj-amount", type: "number", step: "0.01", className: "h-8", ...register("amount", { valueAsNumber: true, required: true, min: 0.01 }) })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "adj-reason", className: "text-xs", children: "Reason *" }), _jsx(Input, { id: "adj-reason", className: "h-8", placeholder: "e.g. Performance bonus Q2, Equipment damage\u2026", ...register("reason", { required: true }) })] })] }), _jsxs(Button, { type: "submit", size: "sm", className: "w-full", disabled: addAdj.isPending, children: [_jsx(Plus, { className: "mr-1.5 h-3.5 w-3.5", "aria-hidden": true }), "Add & Recalculate on Generate"] }), _jsxs("p", { className: "text-[10px] text-muted-foreground text-center", children: ["After adding, click ", _jsx("strong", { children: "Recalculate" }), " above to update the net salary."] })] })), _jsx("div", { className: "flex justify-end", children: _jsx(Button, { variant: "outline", onClick: onClose, children: "Close" }) })] }));
}
export default function PayrollPage() {
    const { toast } = useToast();
    const { format: fmtCur } = useCurrency();
    const fmt = (n) => fmtCur(Math.abs(n));
    const qc = useQueryClient();
    const { data: me } = useGetCurrentUser();
    const canManageImages = me?.role === "admin" || me?.role === "manager" || me?.role === "accountant";
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [sortKey, setSortKey] = useState("employeeName");
    const [sortDir, setSortDir] = useState("asc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [showGenDialog, setShowGenDialog] = useState(false);
    const [showBulk, setShowBulk] = useState(false);
    const [showGallery, setShowGallery] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [imagesPayrollId, setImagesPayrollId] = useState(null);
    const [adjRecord, setAdjRecord] = useState(null);
    const [filterMonth, setFilterMonth] = useState("all");
    const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
    const { data: allImages = [], isLoading: galleryImagesLoading } = useModuleImages("payroll");
    const { data: payroll, isLoading } = useListPayroll();
    const { data: employees } = useListEmployees();
    const generatePayroll = useGeneratePayroll();
    const approvePayroll = useApprovePayroll();
    const { register, handleSubmit, control, reset } = useForm({
        defaultValues: { month: new Date().getMonth() + 1, year: new Date().getFullYear() },
    });
    const invalidate = () => qc.invalidateQueries({ queryKey: ["listPayroll"] });
    useEffect(() => { setPage(1); }, [search, statusFilter, sortKey, sortDir, pageSize, filterMonth, filterYear]);
    const rows = payroll ?? [];
    const sorted = useMemo(() => filterAndSortRows(rows, {
        search,
        match: (row, q) => {
            const textMatch = !q || (row.employeeName || "").toLowerCase().includes(q);
            if (!textMatch)
                return false;
            if (statusFilter === "pending")
                return row.status === "pending" || row.status === "draft";
            if (statusFilter === "approved")
                return row.status === "approved";
            return true;
        },
        sortKey, sortDir,
        getSortValue: (row, key) => {
            if (key === "netSalary")
                return Number(row.netSalary ?? 0);
            if (key === "baseSalary")
                return Number(row.baseSalary ?? 0);
            if (key === "period")
                return (row.year ?? 0) * 100 + (row.month ?? 0);
            if (key === "status")
                return String(row.status ?? "");
            return String(row.employeeName ?? "");
        },
    }), [rows, search, statusFilter, sortKey, sortDir]);
    // Additional month/year filter
    const displayed = useMemo(() => {
        let r = sorted;
        if (filterMonth !== "all")
            r = r.filter((p) => p.month === Number(filterMonth));
        if (filterYear !== "all")
            r = r.filter((p) => p.year === Number(filterYear));
        return r;
    }, [sorted, filterMonth, filterYear]);
    const { pageRows, total, totalPages, page: safePage } = useMemo(() => paginateRows(displayed, page, pageSize), [displayed, page, pageSize]);
    useEffect(() => { if (safePage !== page)
        setPage(safePage); }, [safePage, page]);
    const totalPending = sorted
        .filter((p) => p.status !== "approved")
        .reduce((s, p) => s + Number(p.netSalary ?? 0), 0);
    const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const to = Math.min(safePage * pageSize, total);
    const exportCsv = () => {
        exportRowsToCsv(`furnicore-payroll-${new Date().toISOString().slice(0, 10)}`, ["employee", "period", "monthlyBase", "bonus", "deductions", "net", "status"], displayed.map((p) => ({
            employee: p.employeeName || `Employee #${p.employeeId}`,
            period: `${MONTHS[(p.month ?? 1) - 1]} ${p.year}`,
            monthlyBase: Number(p.baseSalary ?? 0).toFixed(2),
            bonus: Number(p.bonus ?? 0).toFixed(2),
            deductions: Number(p.deductions ?? 0).toFixed(2),
            net: Number(p.netSalary ?? 0).toFixed(2),
            status: p.status,
        })));
        toast({ title: "Export started" });
    };
    const handleApprove = async (id) => {
        try {
            await approvePayroll.mutateAsync({ id });
            toast({ title: "Payroll approved" });
            invalidate();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const onGenerate = async (data) => {
        try {
            await generatePayroll.mutateAsync({ data });
            toast({ title: "Payroll generated", description: `${MONTHS[data.month - 1]} ${data.year} — with attendance penalties and adjustments applied.` });
            invalidate();
            setShowGenDialog(false);
            reset();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Payroll" }), _jsx("p", { className: "text-muted-foreground", children: "Generate payroll with transparent attendance penalties and bonuses" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs(Button, { variant: "outline", onClick: () => setShowGallery(true), children: [_jsx(Images, { className: "mr-2 h-4 w-4" }), " Gallery"] }), _jsxs(Button, { variant: "outline", onClick: () => setShowBulk(true), children: [_jsx(Upload, { className: "mr-2 h-4 w-4", "aria-hidden": true }), " Bulk import/export"] }), _jsxs(Button, { onClick: () => setShowGenDialog(true), children: [_jsx(Plus, { className: "mr-2 h-4 w-4", "aria-hidden": true }), " Generate payroll"] })] })] }), totalPending > 0 && (_jsx(Card, { className: "border-amber-200 bg-amber-50 dark:bg-amber-950/10", children: _jsxs(CardContent, { className: "flex items-center justify-between p-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-amber-800 dark:text-amber-200", children: "Pending disbursement" }), _jsx("p", { className: "text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300", children: fmt(totalPending) })] }), _jsx(AlertTriangle, { className: "h-8 w-8 text-amber-500/60", "aria-hidden": true })] }) })), _jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsxs(Select, { value: filterMonth, onValueChange: setFilterMonth, children: [_jsx(SelectTrigger, { className: "w-28", children: _jsx(SelectValue, { placeholder: "All months" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "all", children: "All months" }), MONTHS.map((m, i) => _jsx(SelectItem, { value: String(i + 1), children: m }, i + 1))] })] }), _jsxs(Select, { value: filterYear, onValueChange: setFilterYear, children: [_jsx(SelectTrigger, { className: "w-24", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: years.map(y => _jsx(SelectItem, { value: String(y), children: y }, y)) })] })] }), _jsx(TableToolbar, { id: TABLE_ID, entityLabel: "payroll records", searchValue: search, onSearchChange: setSearch, searchPlaceholder: "Search by employee name\u2026", filterLabel: "Status", filterValue: statusFilter, onFilterChange: setStatusFilter, filterOptions: [{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }], sortKey: sortKey, onSortKeyChange: setSortKey, sortOptions: [
                    { value: "employeeName", label: "Employee" }, { value: "period", label: "Period" },
                    { value: "baseSalary", label: "Base" }, { value: "netSalary", label: "Net pay" }, { value: "status", label: "Status" },
                ], sortDir: sortDir, onSortDirChange: setSortDir, pageSize: pageSize, onPageSizeChange: setPageSize, onExportCsv: exportCsv, exportDisabled: displayed.length === 0, resultsText: total === 0 ? "No matching payroll records" : `Showing ${from}–${to} of ${total}` }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: isLoading ? (_jsx("div", { className: "space-y-3 p-6", children: [1, 2, 3, 4].map(i => _jsx(Skeleton, { className: "h-14 w-full" }, i)) })) : pageRows.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(Banknote, { className: "mb-3 h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No payroll records found." }), _jsx(Button, { size: "sm", variant: "outline", className: "mt-3", onClick: () => setShowGenDialog(true), children: "Generate payroll to get started" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { scope: "col", className: "w-8" }), _jsx(TableHead, { scope: "col", className: "w-12" }), _jsx(TableHead, { scope: "col", children: "Employee" }), _jsx(TableHead, { scope: "col", children: "Period" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Monthly Base" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Bonuses" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Deductions" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Net Pay" }), _jsx(TableHead, { scope: "col", children: "Status" }), _jsx(TableHead, { scope: "col", children: "Actions" })] }) }), _jsx(TableBody, { children: pageRows.map((p) => {
                                                const isExpanded = expandedId === p.id;
                                                const hasBreakdown = !!p.notes;
                                                return (_jsxs(_Fragment, { children: [_jsxs(TableRow, { className: cn(isExpanded && "border-b-0 bg-muted/20"), children: [_jsx(TableCell, { children: _jsx(Button, { size: "icon", variant: "ghost", className: "h-6 w-6", onClick: () => setExpandedId(isExpanded ? null : p.id), "aria-label": isExpanded ? "Collapse breakdown" : "Expand breakdown", children: isExpanded
                                                                            ? _jsx(ChevronUp, { className: "h-3.5 w-3.5", "aria-hidden": true })
                                                                            : _jsx(ChevronDown, { className: "h-3.5 w-3.5", "aria-hidden": true }) }) }), _jsx(TableCell, { className: "px-3 py-2", children: _jsx(RecordAvatar, { entityType: "payroll", entityId: p.id, className: "h-9 w-9" }) }), _jsx(TableCell, { className: "font-medium", children: p.employeeName || `Employee #${p.employeeId}` }), _jsxs(TableCell, { className: "text-muted-foreground", children: [MONTHS[(p.month ?? 1) - 1], " ", p.year] }), _jsx(TableCell, { className: "text-right font-mono tabular-nums", children: fmt(Number(p.baseSalary ?? 0)) }), _jsx(TableCell, { className: "text-right font-mono tabular-nums text-green-600", children: Number(p.bonus ?? 0) > 0 ? `+${fmt(Number(p.bonus))}` : "—" }), _jsx(TableCell, { className: "text-right font-mono tabular-nums text-destructive", children: Number(p.deductions ?? 0) > 0 ? `−${fmt(Number(p.deductions))}` : "—" }), _jsx(TableCell, { className: "text-right font-mono font-semibold tabular-nums", children: fmt(Number(p.netSalary ?? 0)) }), _jsx(TableCell, { children: _jsx(Badge, { variant: p.status === "approved" ? "default" : "secondary", className: p.status === "approved" ? "bg-green-100 text-green-800" : "", children: p.status === "approved" ? "Approved" : "Pending" }) }), _jsx(TableCell, { children: _jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Button, { size: "sm", variant: "outline", className: "h-7 px-2 text-xs", onClick: () => setAdjRecord(p), children: "Adjustments" }), _jsxs(Button, { size: "sm", variant: "outline", className: "h-7 px-2 text-xs", onClick: () => setImagesPayrollId(p.id), children: [_jsx(Images, { className: "mr-1 h-3.5 w-3.5", "aria-hidden": true }), "Docs"] }), p.status !== "approved" && (_jsxs(Button, { size: "sm", variant: "outline", className: "h-7 px-2 text-xs", onClick: () => handleApprove(p.id), children: [_jsx(CheckCircle, { className: "mr-1 h-3.5 w-3.5", "aria-hidden": true }), "Approve"] }))] }) })] }, p.id), isExpanded && (_jsx(TableRow, { className: "bg-muted/20 hover:bg-muted/20", children: _jsx(TableCell, { colSpan: 9, className: "py-0 px-4 pb-4", children: _jsx(BreakdownPanel, { payrollId: p.id, notes: p.notes }) }) }, `${p.id}-bd`))] }));
                                            }) })] }) }), _jsx(TablePaginationBar, { id: TABLE_ID, page: safePage, totalPages: totalPages, onPageChange: setPage })] })) }) }), _jsx(Dialog, { open: showGenDialog, onOpenChange: setShowGenDialog, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Generate monthly payroll" }) }), _jsxs("form", { onSubmit: handleSubmit(onGenerate), className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Month" }), _jsx(Controller, { name: "month", control: control, render: ({ field }) => (_jsxs(Select, { value: field.value?.toString(), onValueChange: (v) => field.onChange(Number(v)), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: MONTHS.map((m, i) => _jsx(SelectItem, { value: String(i + 1), children: m }, i + 1)) })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "pr-year", children: "Year" }), _jsx(Input, { id: "pr-year", type: "number", ...register("year", { valueAsNumber: true }), min: "2020", max: "2030" })] })] }), _jsxs(Card, { className: "border-blue-100 bg-blue-50/50 dark:bg-blue-950/20", children: [_jsx(CardHeader, { className: "pb-1 pt-3", children: _jsxs(CardTitle, { className: "flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400", children: [_jsx(Info, { className: "h-3.5 w-3.5", "aria-hidden": true }), "Transparent calculation"] }) }), _jsxs(CardContent, { className: "pb-3 text-xs text-blue-600 dark:text-blue-400 space-y-1", children: [_jsx("p", { children: "\u2022 Monthly base = annual salary \u00F7 12" }), _jsx("p", { children: "\u2022 Absent days deducted at full daily rate (base \u00F7 22)" }), _jsx("p", { children: "\u2022 Late: 25% \u00B7 Half day: 50% of daily rate" }), _jsx("p", { children: "\u2022 All manual adjustments (bonuses/penalties) are applied and shown in the breakdown" })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowGenDialog(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: generatePayroll.isPending, children: "Generate" })] })] })] }) }), _jsx(Dialog, { open: showBulk, onOpenChange: setShowBulk, children: _jsxs(DialogContent, { className: "max-w-3xl", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Bulk Import / Export \u2014 Payroll" }) }), _jsx(BulkImportExport, { module: "Payroll", importEndpoint: "/api/bulk/payroll/import", exportEndpoint: "/api/bulk/payroll/export", exportFilename: "payroll-export.csv", templateHeaders: ["employeeEmail", "month", "year", "baseSalary", "bonus", "deductions", "netSalary", "status", "notes"], templateSample: [
                                ["alice@company.com", "4", "2026", "4000", "200", "50", "4150", "draft", ""],
                                ["bob@company.com", "4", "2026", "3500", "0", "0", "3500", "draft", "No deductions"],
                            ], onImported: invalidate })] }) }), _jsx(Dialog, { open: !!adjRecord, onOpenChange: (v) => { if (!v)
                    setAdjRecord(null); }, children: _jsxs(DialogContent, { className: "max-h-[90vh] max-w-lg overflow-y-auto", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { className: "flex items-center gap-2", children: [_jsx(Banknote, { className: "h-5 w-5 text-primary", "aria-hidden": true }), "Payroll Adjustments & Breakdown"] }) }), adjRecord && (_jsx(AdjustmentsPanel, { payrollRecord: adjRecord, onClose: () => setAdjRecord(null) }))] }) }), _jsx(Dialog, { open: imagesPayrollId !== null, onOpenChange: (v) => { if (!v)
                    setImagesPayrollId(null); }, children: _jsxs(DialogContent, { className: "max-w-xl max-h-[85vh] overflow-y-auto", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { children: ["Documents / Images \u2014 Payroll Record #", imagesPayrollId] }) }), imagesPayrollId !== null && (_jsx(RecordImagePanel, { entityType: "payroll", entityId: imagesPayrollId, canUpload: canManageImages, canDelete: canManageImages }))] }) }), _jsx(Dialog, { open: showGallery, onOpenChange: setShowGallery, children: _jsxs(DialogContent, { className: MODULE_GALLERY_DIALOG_CONTENT_CLASS, children: [_jsx(DialogHeader, { className: MODULE_GALLERY_DIALOG_HEADER_CLASS, children: _jsx(DialogTitle, { className: MODULE_GALLERY_DIALOG_TITLE_CLASS, children: "Payroll Documents Gallery" }) }), _jsx("div", { className: MODULE_GALLERY_DIALOG_BODY_CLASS, children: _jsx(ModuleGallery, { entityType: "payroll", isLoading: galleryImagesLoading, images: allImages.filter((img) => (payroll ?? []).some((p) => p.id === img.entityId)), canDelete: canManageImages, canUpload: canManageImages, entityIds: (payroll ?? []).map((p) => p.id), entityLabels: Object.fromEntries((payroll ?? []).map((p) => [p.id, `${p.employeeName ?? `#${p.employeeId}`} — ${MONTHS[(p.month ?? 1) - 1]} ${p.year}`])), emptyListHint: "No payroll records found. Generate payroll first." }) })] }) }), _jsx(ModuleAnalyticsPanel, { module: "payroll", reportId: "payroll-summary", title: "Payroll Analytics Dashboard" })] }));
}
