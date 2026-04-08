import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { useListEmployees, useCreateEmployee, useUpdateEmployee, useDeleteEmployee, useRecordAttendance, } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useListAttendance, useUpdateAttendance, useDeleteAttendance, useAttendanceSummary, usePerformanceReviews, useCreatePerformanceReview, useUpdatePerformanceReview, useDeletePerformanceReview, } from "@/hooks/use-hr-portal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Users, ClipboardList, Plus, Pencil, Trash2, Star, BarChart3, TrendingUp, CalendarDays, AlertTriangle, Clock, UserCheck, UserX, Banknote, Upload, Images, } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv } from "@/lib/table-helpers";
import { cn } from "@/lib/utils";
import { BulkImportExport } from "@/components/BulkImportExport";
import { ModuleAnalyticsPanel } from "@/components/ModuleAnalyticsPanel";
import { useCurrency } from "@/lib/currency";
import { RecordAvatar, RecordImagePanel, ModuleGallery, useModuleImages } from "@/components/images";
import { useGetCurrentUser } from "@workspace/api-client-react";
/* ─── Shared helpers ─────────────────────────────────────────────────────────── */
function apiErrorMessage(e) {
    if (e && typeof e === "object") {
        const resp = e.response;
        if (resp?.data) {
            const d = resp.data;
            if (typeof d === "string" && !d.startsWith("<!"))
                return d;
            if (d.message)
                return d.message;
            if (d.error)
                return d.error;
        }
        if (e.message)
            return e.message;
    }
    return "Something went wrong. Please try again.";
}
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** useFmt — returns a currency formatter that respects the selected currency. */
function useFmt() {
    const { format } = useCurrency();
    return (n) => format(Math.abs(n));
}
const STATUS_COLORS = {
    present: "bg-green-100 text-green-800",
    absent: "bg-red-100 text-red-800",
    late: "bg-amber-100 text-amber-800",
    half_day: "bg-blue-100 text-blue-800",
};
const STATUS_LABELS = {
    present: "Present", absent: "Absent", late: "Late", half_day: "Half Day",
};
function StarRating({ value, max = 5, onChange }) {
    return (_jsx("div", { className: "flex items-center gap-0.5", children: Array.from({ length: max }).map((_, i) => (_jsx("button", { type: "button", onClick: () => onChange?.(i + 1), className: cn("h-5 w-5 transition-colors", onChange ? "cursor-pointer hover:scale-110" : "cursor-default"), "aria-label": `${i + 1} star${i + 1 !== 1 ? "s" : ""}`, children: _jsx(Star, { className: cn("h-5 w-5", i < value
                    ? "fill-amber-400 text-amber-400"
                    : "fill-muted text-muted-foreground"), "aria-hidden": true }) }, i))) }));
}
const RATING_COLORS = {
    5: "text-green-600",
    4: "text-blue-600",
    3: "text-amber-600",
    2: "text-orange-600",
    1: "text-red-600",
};
const RATING_LABELS = {
    5: "Exceptional",
    4: "Exceeds expectations",
    3: "Meets expectations",
    2: "Below expectations",
    1: "Unsatisfactory",
};
/* ─── KPI card ────────────────────────────────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, sub, accentClass, }) {
    return (_jsx(Card, { children: _jsxs(CardContent, { className: "flex items-start gap-4 p-5", children: [_jsx("div", { className: cn("rounded-lg p-2", accentClass ?? "bg-primary/10"), children: _jsx(Icon, { className: "h-5 w-5 text-primary", "aria-hidden": true }) }), _jsxs("div", { children: [_jsx("p", { className: "text-xs text-muted-foreground", children: label }), _jsx("p", { className: "text-xl font-bold tabular-nums", children: value }), sub && _jsx("p", { className: "text-xs text-muted-foreground", children: sub })] })] }) }));
}
/* ═══════════════════════════════════════════════════════════════════════════════ */
/*  TAB 1 — OVERVIEW                                                               */
/* ═══════════════════════════════════════════════════════════════════════════════ */
function OverviewTab({ onTabChange }) {
    const fmt = useFmt();
    const now = new Date();
    const { data: employees } = useListEmployees();
    const { data: attendanceData } = useAttendanceSummary(now.getMonth() + 1, now.getFullYear());
    const { data: reviews } = usePerformanceReviews();
    const active = (employees ?? []).filter((e) => e.isActive).length;
    const inactive = (employees ?? []).filter((e) => !e.isActive).length;
    // Attendance rate this month
    const summary = attendanceData?.summary ?? [];
    const totalRecords = summary.reduce((s, r) => s + r.totalRecords, 0);
    const totalPresent = summary.reduce((s, r) => s + r.present, 0);
    const attRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;
    // Attendance issues (employees with absences or lates)
    const issues = summary
        .filter((r) => r.absent > 0 || r.late > 0)
        .sort((a, b) => (b.absent + b.late) - (a.absent + a.late))
        .slice(0, 5);
    // Department breakdown
    const byDept = {};
    for (const e of employees ?? []) {
        const d = e.department || "Unassigned";
        byDept[d] = (byDept[d] ?? 0) + 1;
    }
    // Recent reviews
    const recentReviews = (reviews ?? []).slice(0, 4);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4 sm:grid-cols-4", children: [_jsx(KpiCard, { icon: Users, label: "Total Employees", value: active, sub: `${inactive} inactive`, accentClass: "bg-blue-50 dark:bg-blue-950/30" }), _jsx(KpiCard, { icon: UserCheck, label: "Attendance Rate", value: `${attRate}%`, sub: `${MONTHS_SHORT[now.getMonth()]} ${now.getFullYear()}`, accentClass: attRate >= 90 ? "bg-green-50 dark:bg-green-950/30" : "bg-amber-50 dark:bg-amber-950/30" }), _jsx(KpiCard, { icon: ClipboardList, label: "Reviews This Month", value: (reviews ?? []).filter((r) => r.period.includes(String(now.getFullYear()))).length, sub: "performance evaluations", accentClass: "bg-purple-50 dark:bg-purple-950/30" }), _jsx(KpiCard, { icon: Banknote, label: "Pending Payroll", value: "\u2014", sub: "Go to Payroll tab", accentClass: "bg-orange-50 dark:bg-orange-950/30" })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-3", children: [_jsxs(Card, { className: "lg:col-span-2", children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between pb-2", children: [_jsxs(CardTitle, { className: "flex items-center gap-2 text-sm font-semibold", children: [_jsx(AlertTriangle, { className: "h-4 w-4 text-amber-500", "aria-hidden": true }), "Attendance Issues \u2014 ", MONTHS_SHORT[now.getMonth()]] }), _jsx(Button, { size: "sm", variant: "ghost", className: "text-xs", onClick: () => onTabChange("attendance"), children: "View all" })] }), _jsx(CardContent, { children: issues.length === 0 ? (_jsx("p", { className: "py-4 text-center text-sm text-muted-foreground", children: "No attendance issues this month" })) : (_jsx("div", { className: "space-y-3", children: issues.map((row) => (_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: row.employeeName }), _jsx("p", { className: "text-xs text-muted-foreground", children: row.department })] }), _jsxs("div", { className: "flex items-center gap-2", children: [row.absent > 0 && (_jsxs(Badge, { className: STATUS_COLORS.absent, children: [row.absent, " absent"] })), row.late > 0 && (_jsxs(Badge, { className: STATUS_COLORS.late, children: [row.late, " late"] })), row.totalPenalty > 0 && (_jsxs("span", { className: "text-xs font-mono text-destructive", children: ["\u2212", fmt(row.totalPenalty)] }))] })] }, row.employeeId))) })) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-2", children: _jsx(CardTitle, { className: "text-sm font-semibold", children: "By Department" }) }), _jsx(CardContent, { className: "space-y-3", children: Object.entries(byDept)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([dept, count]) => (_jsxs("div", { children: [_jsxs("div", { className: "mb-1 flex items-center justify-between text-xs", children: [_jsx("span", { className: "truncate font-medium", children: dept }), _jsxs("span", { className: "tabular-nums text-muted-foreground", children: [count, " / ", active] })] }), _jsx(Progress, { value: (count / Math.max(active, 1)) * 100, className: "h-1.5" })] }, dept))) })] })] }), recentReviews.length > 0 && (_jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between pb-2", children: [_jsxs(CardTitle, { className: "flex items-center gap-2 text-sm font-semibold", children: [_jsx(Star, { className: "h-4 w-4 text-amber-400", "aria-hidden": true }), "Recent Performance Reviews"] }), _jsx(Button, { size: "sm", variant: "ghost", className: "text-xs", onClick: () => onTabChange("performance"), children: "View all" })] }), _jsx(CardContent, { children: _jsx("div", { className: "grid gap-3 sm:grid-cols-2", children: recentReviews.map((r) => (_jsxs("div", { className: "flex items-start gap-3 rounded-lg border p-3", children: [_jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "text-sm font-medium", children: r.employeeName }), _jsx("p", { className: "text-xs text-muted-foreground", children: r.period })] }), _jsxs("div", { className: "text-right", children: [_jsx(StarRating, { value: r.overallRating }), _jsx("p", { className: cn("text-[10px] mt-0.5", RATING_COLORS[r.overallRating]), children: RATING_LABELS[r.overallRating] })] })] }, r.id))) }) })] }))] }));
}
function EmployeesTab() {
    const fmt = useFmt();
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data: me } = useGetCurrentUser();
    const canManageImages = me?.role === "admin" || me?.role === "manager";
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [sortKey, setSortKey] = useState("name");
    const [sortDir, setSortDir] = useState("asc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [showEmpDialog, setShowEmpDialog] = useState(false);
    const [showAttDialog, setShowAttDialog] = useState(false);
    const [showBulkEmp, setShowBulkEmp] = useState(false);
    const [showGallery, setShowGallery] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const { data: allImages = [] } = useModuleImages("employee");
    const { data: employees, isLoading } = useListEmployees();
    const createEmployee = useCreateEmployee();
    const updateEmployee = useUpdateEmployee();
    const deleteEmployee = useDeleteEmployee();
    const recordAttendance = useRecordAttendance();
    const empForm = useForm({ defaultValues: { isActive: true, baseSalary: 0 } });
    const attForm = useForm({ defaultValues: { status: "present", hoursWorked: 8 } });
    const invalidate = () => qc.invalidateQueries({ queryKey: ["listEmployees"] });
    useEffect(() => { setPage(1); }, [search, statusFilter, sortKey, sortDir, pageSize]);
    const rows = employees ?? [];
    const sorted = useMemo(() => filterAndSortRows(rows, {
        search,
        match: (row, q) => {
            const qn = q.toLowerCase();
            const ok = !qn || row.name.toLowerCase().includes(qn) ||
                (row.department || "").toLowerCase().includes(qn) ||
                (row.position || "").toLowerCase().includes(qn);
            if (!ok)
                return false;
            if (statusFilter === "active")
                return row.isActive;
            if (statusFilter === "inactive")
                return !row.isActive;
            return true;
        },
        sortKey, sortDir,
        getSortValue: (row, k) => {
            if (k === "department")
                return String(row.department ?? "");
            if (k === "position")
                return String(row.position ?? "");
            if (k === "baseSalary")
                return Number(row.baseSalary);
            if (k === "hireDate")
                return row.hireDate ? new Date(row.hireDate).getTime() : 0;
            return String(row.name ?? "");
        },
    }), [rows, search, statusFilter, sortKey, sortDir]);
    const { pageRows, total, totalPages, page: safePage } = useMemo(() => paginateRows(sorted, page, pageSize), [sorted, page, pageSize]);
    useEffect(() => { if (safePage !== page)
        setPage(safePage); }, [safePage, page]);
    const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const to = Math.min(safePage * pageSize, total);
    const exportCsv = () => {
        exportRowsToCsv(`furnicore-employees-${new Date().toISOString().slice(0, 10)}`, ["name", "email", "phone", "department", "position", "baseSalary", "hireDate", "isActive"], sorted.map((e) => ({
            name: e.name, email: e.email ?? "", phone: e.phone ?? "",
            department: e.department ?? "", position: e.position ?? "",
            baseSalary: Number(e.baseSalary),
            hireDate: e.hireDate ? new Date(e.hireDate).toISOString().split("T")[0] : "",
            isActive: e.isActive ? "Yes" : "No",
        })));
        toast({ title: "Export started" });
    };
    const openCreate = () => {
        setEditItem(null);
        empForm.reset({ name: "", email: "", phone: "", department: "", position: "", baseSalary: 0, hireDate: "", isActive: true });
        setShowEmpDialog(true);
    };
    const openEdit = (e) => {
        setEditItem(e);
        empForm.reset({
            name: e.name, email: e.email || "", phone: e.phone || "",
            department: e.department || "", position: e.position || "",
            baseSalary: Number(e.baseSalary),
            hireDate: e.hireDate ? new Date(e.hireDate).toISOString().split("T")[0] : "",
            isActive: e.isActive,
        });
        setShowEmpDialog(true);
    };
    const openAttendance = (e) => {
        setSelectedEmployee(e);
        attForm.reset({ employeeId: e.id, date: new Date().toISOString().split("T")[0], status: "present", hoursWorked: 8, notes: "" });
        setShowAttDialog(true);
    };
    const onSubmitEmployee = async (data) => {
        try {
            if (editItem) {
                await updateEmployee.mutateAsync({ id: editItem.id, data });
                toast({ title: "Employee updated" });
            }
            else {
                await createEmployee.mutateAsync({ data });
                toast({ title: "Employee created" });
            }
            invalidate();
            setShowEmpDialog(false);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
        }
    };
    const onSubmitAttendance = async (data) => {
        try {
            await recordAttendance.mutateAsync({ data });
            toast({ title: "Attendance recorded" });
            qc.invalidateQueries({ queryKey: ["attendance"] });
            qc.invalidateQueries({ queryKey: ["attendanceSummary"] });
            setShowAttDialog(false);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
        }
    };
    const handleDeactivate = async (id) => {
        if (!confirm("Deactivate this employee? They can be reactivated later via Edit."))
            return;
        try {
            await deleteEmployee.mutateAsync({ id });
            toast({ title: "Employee deactivated" });
            invalidate();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
        }
    };
    const handleReactivate = async (emp) => {
        try {
            await updateEmployee.mutateAsync({ id: emp.id, data: { isActive: true } });
            toast({ title: "Employee reactivated" });
            invalidate();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
        }
    };
    return (_jsxs("div", { className: "space-y-4", children: [_jsx(TableToolbar, { id: "hr-employees", entityLabel: "employees", searchValue: search, onSearchChange: setSearch, searchPlaceholder: "Search by name, department, or position\u2026", filterLabel: "Status", filterValue: statusFilter, onFilterChange: setStatusFilter, filterOptions: [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }], sortKey: sortKey, onSortKeyChange: setSortKey, sortOptions: [
                    { value: "name", label: "Name" }, { value: "department", label: "Department" },
                    { value: "position", label: "Position" }, { value: "baseSalary", label: "Salary" }, { value: "hireDate", label: "Hire date" },
                ], sortDir: sortDir, onSortDirChange: setSortDir, pageSize: pageSize, onPageSizeChange: setPageSize, onExportCsv: exportCsv, exportDisabled: sorted.length === 0, resultsText: total === 0 ? "No matching employees" : `Showing ${from}–${to} of ${total}`, children: _jsxs("div", { className: "flex gap-2", children: [_jsxs(Button, { variant: "outline", size: "sm", onClick: () => setShowGallery(true), children: [_jsx(Images, { className: "mr-1.5 h-4 w-4" }), " Gallery"] }), _jsxs(Button, { variant: "outline", size: "sm", onClick: () => setShowBulkEmp(true), children: [_jsx(Upload, { className: "mr-1.5 h-4 w-4", "aria-hidden": true }), " Bulk import/export"] }), _jsxs(Button, { onClick: openCreate, children: [_jsx(Plus, { className: "mr-1.5 h-4 w-4", "aria-hidden": true }), " Add employee"] })] }) }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: isLoading ? (_jsx("div", { className: "space-y-3 p-6", children: [1, 2, 3, 4].map(i => _jsx(Skeleton, { className: "h-14 w-full" }, i)) })) : pageRows.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(Users, { className: "mb-3 h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No employees match your filters" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { scope: "col", className: "w-12" }), _jsx(TableHead, { scope: "col", children: "Name" }), _jsx(TableHead, { scope: "col", children: "Department" }), _jsx(TableHead, { scope: "col", children: "Position" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Annual Salary" }), _jsx(TableHead, { scope: "col", children: "Hired" }), _jsx(TableHead, { scope: "col", children: "Status" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Actions" })] }) }), _jsx(TableBody, { children: pageRows.map((e) => (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "px-3 py-2", children: _jsx(RecordAvatar, { entityType: "employee", entityId: e.id, className: "h-9 w-9 rounded-full" }) }), _jsxs(TableCell, { children: [_jsx("p", { className: "font-medium", children: e.name }), _jsx("p", { className: "text-xs text-muted-foreground", children: e.email })] }), _jsx(TableCell, { className: "text-muted-foreground", children: e.department || "—" }), _jsx(TableCell, { className: "text-muted-foreground", children: e.position || "—" }), _jsxs(TableCell, { className: "text-right font-mono tabular-nums", children: [fmt(Number(e.baseSalary)), "/yr"] }), _jsx(TableCell, { className: "text-xs text-muted-foreground", children: e.hireDate ? new Date(e.hireDate).toLocaleDateString() : "—" }), _jsx(TableCell, { children: _jsx(Badge, { variant: e.isActive ? "default" : "outline", className: e.isActive ? "bg-green-100 text-green-800" : "", children: e.isActive ? "Active" : "Inactive" }) }), _jsx(TableCell, { className: "text-right", children: _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx(Button, { size: "icon", variant: "ghost", "aria-label": `Record attendance for ${e.name}`, onClick: () => openAttendance(e), children: _jsx(ClipboardList, { className: "h-4 w-4" }) }), _jsx(Button, { size: "icon", variant: "ghost", "aria-label": `Edit ${e.name}`, onClick: () => openEdit(e), children: _jsx(Pencil, { className: "h-4 w-4" }) }), e.isActive ? (_jsx(Button, { size: "icon", variant: "ghost", className: "text-destructive", "aria-label": `Deactivate ${e.name}`, onClick: () => handleDeactivate(e.id), children: _jsx(UserX, { className: "h-4 w-4" }) })) : (_jsx(Button, { size: "icon", variant: "ghost", className: "text-green-600", "aria-label": `Reactivate ${e.name}`, onClick: () => handleReactivate(e), children: _jsx(UserCheck, { className: "h-4 w-4" }) }))] }) })] }, e.id))) })] }) }), _jsx(TablePaginationBar, { id: "hr-employees", page: safePage, totalPages: totalPages, onPageChange: setPage })] })) }) }), _jsx(Dialog, { open: showBulkEmp, onOpenChange: setShowBulkEmp, children: _jsxs(DialogContent, { className: "max-w-3xl", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Bulk Import / Export \u2014 Employees" }) }), _jsx(BulkImportExport, { module: "Employees", importEndpoint: "/api/bulk/employees/import", exportEndpoint: "/api/bulk/employees/export", exportFilename: "employees-export.csv", templateHeaders: ["name", "email", "phone", "department", "position", "baseSalary", "hireDate", "isActive"], templateSample: [
                                ["Alice Johnson", "alice@company.com", "+1-555-0101", "Manufacturing", "Senior Craftsman", "48000", "2022-03-15", "true"],
                                ["Bob Smith", "bob@company.com", "+1-555-0102", "Sales", "Sales Executive", "42000", "2021-07-01", "true"],
                            ], onImported: invalidate })] }) }), _jsx(Dialog, { open: showEmpDialog, onOpenChange: setShowEmpDialog, children: _jsxs(DialogContent, { className: "max-w-xl", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: editItem ? "Edit employee" : "Add employee" }) }), _jsxs(Tabs, { defaultValue: "details", children: [_jsxs(TabsList, { className: "mb-4", children: [_jsx(TabsTrigger, { value: "details", children: "Details" }), editItem && _jsx(TabsTrigger, { value: "images", children: "Photo" })] }), _jsx(TabsContent, { value: "details", children: _jsxs("form", { onSubmit: empForm.handleSubmit(onSubmitEmployee), className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "emp-name", children: "Full name *" }), _jsx(Input, { id: "emp-name", ...empForm.register("name", { required: true }), placeholder: "Alice Johnson" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "emp-email", children: "Email" }), _jsx(Input, { id: "emp-email", type: "email", ...empForm.register("email") })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "emp-phone", children: "Phone" }), _jsx(Input, { id: "emp-phone", ...empForm.register("phone") })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "emp-dept", children: "Department" }), _jsx(Input, { id: "emp-dept", ...empForm.register("department"), placeholder: "Manufacturing" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "emp-pos", children: "Position" }), _jsx(Input, { id: "emp-pos", ...empForm.register("position"), placeholder: "Senior Craftsman" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "emp-sal", children: "Annual salary" }), _jsx(Input, { id: "emp-sal", type: "number", ...empForm.register("baseSalary", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "emp-hire", children: "Hire date" }), _jsx(Input, { id: "emp-hire", type: "date", ...empForm.register("hireDate") })] }), _jsxs("div", { className: "col-span-2 flex items-center gap-2", children: [_jsx(Switch, { id: "emp-active", checked: empForm.watch("isActive"), onCheckedChange: (v) => empForm.setValue("isActive", v) }), _jsx(Label, { htmlFor: "emp-active", children: "Active employee" })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowEmpDialog(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: createEmployee.isPending || updateEmployee.isPending, children: "Save" })] })] }) }), editItem && (_jsx(TabsContent, { value: "images", children: _jsx(RecordImagePanel, { entityType: "employee", entityId: editItem.id, canUpload: canManageImages, canDelete: canManageImages }) }))] })] }) }), _jsx(Dialog, { open: showGallery, onOpenChange: setShowGallery, children: _jsxs(DialogContent, { className: "max-w-4xl max-h-[85vh] overflow-y-auto", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Employee Photo Gallery" }) }), _jsx(ModuleGallery, { entityType: "employee", images: allImages, canDelete: canManageImages, entityLabels: Object.fromEntries((employees ?? []).map((e) => [e.id, e.name])) })] }) }), _jsx(Dialog, { open: showAttDialog, onOpenChange: setShowAttDialog, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { children: ["Record attendance \u2014 ", selectedEmployee?.name] }) }), _jsxs("form", { onSubmit: attForm.handleSubmit(onSubmitAttendance), className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "att-date", children: "Date" }), _jsx(Input, { id: "att-date", type: "date", ...attForm.register("date", { required: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Status" }), _jsx(Controller, { name: "status", control: attForm.control, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "present", children: "Present" }), _jsx(SelectItem, { value: "absent", children: "Absent" }), _jsx(SelectItem, { value: "late", children: "Late" }), _jsx(SelectItem, { value: "half_day", children: "Half day" })] })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "att-hours", children: "Hours worked" }), _jsx(Input, { id: "att-hours", type: "number", step: "0.5", ...attForm.register("hoursWorked", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "att-notes", children: "Notes" }), _jsx(Input, { id: "att-notes", ...attForm.register("notes"), placeholder: "Optional" })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowAttDialog(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: recordAttendance.isPending, children: "Record" })] })] })] }) })] }));
}
/* ═══════════════════════════════════════════════════════════════════════════════ */
/*  TAB 3 — ATTENDANCE                                                             */
/* ═══════════════════════════════════════════════════════════════════════════════ */
function AttendanceTab() {
    const { toast } = useToast();
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [empFilter, setEmpFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [editRecord, setEditRecord] = useState(null);
    const { data: employees } = useListEmployees();
    const { data: records = [], isLoading } = useListAttendance({ month, year });
    const { data: summary } = useAttendanceSummary(month, year);
    const updateAtt = useUpdateAttendance();
    const deleteAtt = useDeleteAttendance();
    const filteredRecords = useMemo(() => {
        let r = records;
        if (empFilter !== "all")
            r = r.filter((x) => x.employeeId === Number(empFilter));
        if (statusFilter !== "all")
            r = r.filter((x) => x.status === statusFilter);
        return r.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [records, empFilter, statusFilter]);
    // Totals for the filtered set
    const totals = useMemo(() => ({
        present: filteredRecords.filter((r) => r.status === "present").length,
        absent: filteredRecords.filter((r) => r.status === "absent").length,
        late: filteredRecords.filter((r) => r.status === "late").length,
        halfDay: filteredRecords.filter((r) => r.status === "half_day").length,
    }), [filteredRecords]);
    const penaltyRules = summary?.penaltyRules;
    const handleDelete = async (id) => {
        if (!confirm("Delete this attendance record?"))
            return;
        try {
            await deleteAtt.mutateAsync(id);
            toast({ title: "Deleted" });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
        }
    };
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsxs(Select, { value: String(month), onValueChange: (v) => setMonth(Number(v)), children: [_jsx(SelectTrigger, { className: "w-28", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: MONTHS_SHORT.map((m, i) => _jsx(SelectItem, { value: String(i + 1), children: m }, i + 1)) })] }), _jsxs(Select, { value: String(year), onValueChange: (v) => setYear(Number(v)), children: [_jsx(SelectTrigger, { className: "w-24", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => _jsx(SelectItem, { value: String(y), children: y }, y)) })] }), _jsxs(Select, { value: empFilter, onValueChange: setEmpFilter, children: [_jsx(SelectTrigger, { className: "w-48", children: _jsx(SelectValue, { placeholder: "All employees" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "all", children: "All employees" }), (employees ?? []).map((e) => _jsx(SelectItem, { value: String(e.id), children: e.name }, e.id))] })] }), _jsxs(Select, { value: statusFilter, onValueChange: setStatusFilter, children: [_jsx(SelectTrigger, { className: "w-36", children: _jsx(SelectValue, { placeholder: "All statuses" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "all", children: "All statuses" }), _jsx(SelectItem, { value: "present", children: "Present" }), _jsx(SelectItem, { value: "absent", children: "Absent" }), _jsx(SelectItem, { value: "late", children: "Late" }), _jsx(SelectItem, { value: "half_day", children: "Half Day" })] })] }), _jsx(Button, { size: "sm", variant: "outline", onClick: () => exportRowsToCsv(`attendance-${month}-${year}`, ["employee", "department", "date", "status", "hours", "notes"], filteredRecords.map(r => ({ employee: r.employeeName, department: r.department, date: r.date, status: r.status, hours: r.hoursWorked ?? "", notes: r.notes ?? "" }))), children: "Export CSV" })] }), _jsx("div", { className: "grid grid-cols-4 gap-3", children: [
                    { key: "present", label: "Present", color: "text-green-600" },
                    { key: "absent", label: "Absent", color: "text-red-600" },
                    { key: "late", label: "Late", color: "text-amber-600" },
                    { key: "halfDay", label: "Half Day", color: "text-blue-600" },
                ].map(({ key, label, color }) => (_jsxs("div", { className: "rounded-lg border bg-card p-3 text-center", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: label }), _jsx("p", { className: cn("text-2xl font-bold tabular-nums", color), children: totals[key] })] }, key))) }), penaltyRules && (_jsxs("div", { className: "rounded-lg border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground", children: [_jsx("span", { className: "font-medium text-foreground", children: "Penalty rules: " }), "Absent = ", penaltyRules.absentRate, " \u00B7 Late = ", penaltyRules.lateRate, " \u00B7 Half Day = ", penaltyRules.halfDayRate, _jsxs("span", { className: "ml-2 text-[10px]", children: ["(Daily rate: ", penaltyRules.dailyRate, ")"] })] })), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: isLoading ? (_jsx("div", { className: "space-y-3 p-6", children: [1, 2, 3, 4].map(i => _jsx(Skeleton, { className: "h-12 w-full" }, i)) })) : filteredRecords.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(CalendarDays, { className: "mb-3 h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No attendance records for selected filters" })] })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { scope: "col", children: "Employee" }), _jsx(TableHead, { scope: "col", children: "Department" }), _jsx(TableHead, { scope: "col", children: "Date" }), _jsx(TableHead, { scope: "col", children: "Status" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Hours" }), _jsx(TableHead, { scope: "col", children: "Notes" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Actions" })] }) }), _jsx(TableBody, { children: filteredRecords.map((r) => (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "font-medium", children: r.employeeName }), _jsx(TableCell, { className: "text-muted-foreground", children: r.department || "—" }), _jsx(TableCell, { className: "text-sm tabular-nums text-muted-foreground", children: r.date }), _jsx(TableCell, { children: _jsx(Badge, { className: STATUS_COLORS[r.status], children: STATUS_LABELS[r.status] ?? r.status }) }), _jsx(TableCell, { className: "text-right font-mono tabular-nums", children: r.hoursWorked ?? "—" }), _jsx(TableCell, { className: "max-w-[160px] truncate text-xs text-muted-foreground", children: r.notes || "—" }), _jsx(TableCell, { className: "text-right", children: _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx(Button, { size: "icon", variant: "ghost", onClick: () => setEditRecord(r), "aria-label": "Edit", children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) }), _jsx(Button, { size: "icon", variant: "ghost", className: "text-destructive", onClick: () => handleDelete(r.id), "aria-label": "Delete", children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }) })] }, r.id))) })] }) })) }) }), editRecord && (_jsx(EditAttendanceDialog, { record: editRecord, onClose: () => setEditRecord(null), updateAtt: updateAtt, toast: toast }))] }));
}
function EditAttendanceDialog({ record, onClose, updateAtt, toast, }) {
    const { register, handleSubmit, control } = useForm({
        defaultValues: { status: record.status, hoursWorked: record.hoursWorked ?? 8, notes: record.notes ?? "" },
    });
    const onSubmit = async (data) => {
        try {
            await updateAtt.mutateAsync({ id: record.id, ...data });
            toast({ title: "Attendance updated" });
            onClose();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
        }
    };
    return (_jsx(Dialog, { open: true, onOpenChange: (v) => { if (!v)
            onClose(); }, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { children: ["Edit attendance \u2014 ", record.employeeName, " on ", record.date] }) }), _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Status" }), _jsx(Controller, { name: "status", control: control, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "present", children: "Present" }), _jsx(SelectItem, { value: "absent", children: "Absent" }), _jsx(SelectItem, { value: "late", children: "Late" }), _jsx(SelectItem, { value: "half_day", children: "Half Day" })] })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "edit-hours", children: "Hours worked" }), _jsx(Input, { id: "edit-hours", type: "number", step: "0.5", ...register("hoursWorked", { valueAsNumber: true }) })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "edit-notes", children: "Notes" }), _jsx(Input, { id: "edit-notes", ...register("notes") })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: onClose, children: "Cancel" }), _jsx(Button, { type: "submit", disabled: updateAtt.isPending, children: "Save" })] })] })] }) }));
}
function PerformanceTab() {
    const fmt = useFmt();
    const { toast } = useToast();
    const { data: employees } = useListEmployees();
    const [empFilter, setEmpFilter] = useState("all");
    const [showDialog, setShowDialog] = useState(false);
    const [editReview, setEditReview] = useState(null);
    const { data: reviews = [], isLoading } = usePerformanceReviews(empFilter !== "all" ? Number(empFilter) : undefined);
    const createReview = useCreatePerformanceReview();
    const updateReview = useUpdatePerformanceReview();
    const deleteReview = useDeletePerformanceReview();
    const { register, handleSubmit, control, setValue, watch, reset } = useForm({
        defaultValues: { overallRating: 3, kpiScore: 70, attendanceScore: 80, punctualityScore: 80, recommendBonus: false, bonusSuggestion: 0 },
    });
    const watchedRating = watch("overallRating");
    const openCreate = () => {
        setEditReview(null);
        reset({ overallRating: 3, kpiScore: 70, attendanceScore: 80, punctualityScore: 80, recommendBonus: false, bonusSuggestion: 0, summary: "", goals: "", achievements: "", areasForImprovement: "", period: "" });
        setShowDialog(true);
    };
    const openEdit = (r) => {
        setEditReview(r);
        reset({
            employeeId: r.employeeId, period: r.period, overallRating: r.overallRating,
            kpiScore: r.kpiScore ?? 0, attendanceScore: r.attendanceScore ?? 0,
            punctualityScore: r.punctualityScore ?? 0,
            summary: r.summary ?? "", goals: r.goals ?? "",
            achievements: r.achievements ?? "", areasForImprovement: r.areasForImprovement ?? "",
            recommendBonus: r.recommendBonus, bonusSuggestion: r.bonusSuggestion,
        });
        setShowDialog(true);
    };
    const onSubmit = async (data) => {
        try {
            if (editReview) {
                await updateReview.mutateAsync({ id: editReview.id, ...data });
                toast({ title: "Review updated" });
            }
            else {
                await createReview.mutateAsync(data);
                toast({ title: "Review created" });
            }
            setShowDialog(false);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
        }
    };
    const handleDelete = async (id) => {
        if (!confirm("Delete this review?"))
            return;
        try {
            await deleteReview.mutateAsync(id);
            toast({ title: "Review deleted" });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: apiErrorMessage(e) });
        }
    };
    // Suggested bonus from rating
    const RATING_BONUS_HINT = {
        5: "Consider 10–15% bonus",
        4: "Consider 5–10% bonus",
        3: "No bonus / standard",
        2: "Consider performance plan",
        1: "Immediate improvement plan",
    };
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs(Select, { value: empFilter, onValueChange: setEmpFilter, children: [_jsx(SelectTrigger, { className: "w-52", children: _jsx(SelectValue, { placeholder: "All employees" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "all", children: "All employees" }), (employees ?? []).map((e) => _jsx(SelectItem, { value: String(e.id), children: e.name }, e.id))] })] }), _jsxs(Button, { onClick: openCreate, children: [_jsx(Plus, { className: "mr-1.5 h-4 w-4", "aria-hidden": true }), " New review"] })] }), isLoading ? (_jsx("div", { className: "space-y-3", children: [1, 2, 3].map(i => _jsx(Skeleton, { className: "h-24 w-full" }, i)) })) : reviews.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(Star, { className: "mb-3 h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No performance reviews yet" }), _jsx(Button, { size: "sm", variant: "outline", className: "mt-3", onClick: openCreate, children: "Create first review" })] })) : (_jsx("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: reviews.map((r) => (_jsx(Card, { className: "flex flex-col", children: _jsxs(CardContent, { className: "flex flex-1 flex-col p-5", children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-semibold", children: r.employeeName }), _jsx("p", { className: "text-xs text-muted-foreground", children: r.department })] }), _jsx(Badge, { variant: "outline", className: "shrink-0 text-xs", children: r.period })] }), _jsxs("div", { className: "mt-3 flex items-center gap-2", children: [_jsx(StarRating, { value: r.overallRating }), _jsx("span", { className: cn("text-xs font-medium", RATING_COLORS[r.overallRating]), children: RATING_LABELS[r.overallRating] })] }), (r.kpiScore !== null || r.attendanceScore !== null) && (_jsxs("div", { className: "mt-3 grid grid-cols-3 gap-2 text-center text-xs", children: [r.kpiScore !== null && (_jsxs("div", { className: "rounded-md bg-muted/50 p-1.5", children: [_jsx("p", { className: "text-muted-foreground", children: "KPI" }), _jsxs("p", { className: "font-semibold", children: [r.kpiScore, "%"] })] })), r.attendanceScore !== null && (_jsxs("div", { className: "rounded-md bg-muted/50 p-1.5", children: [_jsx("p", { className: "text-muted-foreground", children: "Attend." }), _jsxs("p", { className: "font-semibold", children: [r.attendanceScore, "%"] })] })), r.punctualityScore !== null && (_jsxs("div", { className: "rounded-md bg-muted/50 p-1.5", children: [_jsx("p", { className: "text-muted-foreground", children: "Punctual." }), _jsxs("p", { className: "font-semibold", children: [r.punctualityScore, "%"] })] }))] })), r.summary && (_jsx("p", { className: "mt-2 line-clamp-2 text-xs text-muted-foreground", children: r.summary })), r.recommendBonus && (_jsxs("div", { className: "mt-2 flex items-center gap-1.5 rounded-md bg-green-50 px-2 py-1.5 text-xs text-green-700 dark:bg-green-950/30 dark:text-green-400", children: [_jsx(TrendingUp, { className: "h-3.5 w-3.5 shrink-0", "aria-hidden": true }), "Bonus recommended: ", fmt(r.bonusSuggestion)] })), _jsxs("div", { className: "mt-auto flex justify-end gap-1 pt-4", children: [_jsx(Button, { size: "icon", variant: "ghost", onClick: () => openEdit(r), "aria-label": "Edit review", children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) }), _jsx(Button, { size: "icon", variant: "ghost", className: "text-destructive", onClick: () => handleDelete(r.id), "aria-label": "Delete review", children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] })] }) }, r.id))) })), _jsx(Dialog, { open: showDialog, onOpenChange: (v) => { if (!v)
                    setShowDialog(false); }, children: _jsxs(DialogContent, { className: "max-h-[90vh] max-w-2xl overflow-y-auto", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: editReview ? "Edit performance review" : "New performance review" }) }), _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-5", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Employee *" }), _jsx(Controller, { name: "employeeId", control: control, rules: { required: true }, render: ({ field }) => (_jsxs(Select, { value: field.value?.toString(), onValueChange: (v) => field.onChange(Number(v)), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Select employee\u2026" }) }), _jsx(SelectContent, { children: (employees ?? []).map((e) => _jsx(SelectItem, { value: String(e.id), children: e.name }, e.id)) })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "rv-period", children: "Period *" }), _jsx(Input, { id: "rv-period", ...register("period", { required: true }), placeholder: "2024-Q2, 2024-H1, 2024-Annual" })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Overall Rating *" }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsx(Controller, { name: "overallRating", control: control, render: ({ field }) => (_jsx(StarRating, { value: field.value, onChange: field.onChange })) }), _jsxs("span", { className: cn("text-sm font-medium", RATING_COLORS[watchedRating]), children: [watchedRating, " \u2014 ", RATING_LABELS[watchedRating]] })] }), _jsx("p", { className: "text-xs text-muted-foreground", children: RATING_BONUS_HINT[watchedRating] })] }), _jsxs("div", { className: "grid grid-cols-3 gap-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "rv-kpi", children: "KPI Score (0\u2013100)" }), _jsx(Input, { id: "rv-kpi", type: "number", min: 0, max: 100, ...register("kpiScore", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "rv-att", children: "Attendance Score (0\u2013100)" }), _jsx(Input, { id: "rv-att", type: "number", min: 0, max: 100, ...register("attendanceScore", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "rv-punc", children: "Punctuality Score (0\u2013100)" }), _jsx(Input, { id: "rv-punc", type: "number", min: 0, max: 100, ...register("punctualityScore", { valueAsNumber: true }) })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "rv-summary", children: "Summary" }), _jsx(Textarea, { id: "rv-summary", rows: 2, ...register("summary"), placeholder: "Overall performance summary\u2026" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "rv-achieve", children: "Achievements" }), _jsx(Textarea, { id: "rv-achieve", rows: 2, ...register("achievements"), placeholder: "Key accomplishments this period\u2026" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "rv-improve", children: "Areas for Improvement" }), _jsx(Textarea, { id: "rv-improve", rows: 2, ...register("areasForImprovement"), placeholder: "Skills or behaviours to develop\u2026" })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "rv-goals", children: "Goals for Next Period" }), _jsx(Textarea, { id: "rv-goals", rows: 2, ...register("goals"), placeholder: "SMART goals for next review cycle\u2026" })] }), _jsxs("div", { className: "rounded-lg border p-4 space-y-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Controller, { name: "recommendBonus", control: control, render: ({ field }) => (_jsx(Switch, { id: "rv-bonus", checked: field.value, onCheckedChange: field.onChange })) }), _jsx(Label, { htmlFor: "rv-bonus", className: "font-medium", children: "Recommend bonus" })] }), watch("recommendBonus") && (_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "rv-bonus-amount", children: "Suggested bonus amount ($)" }), _jsx(Input, { id: "rv-bonus-amount", type: "number", step: "0.01", ...register("bonusSuggestion", { valueAsNumber: true }) }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Add this to Payroll Adjustments to apply it to the employee's payslip." })] }))] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowDialog(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: createReview.isPending || updateReview.isPending, children: editReview ? "Save changes" : "Create review" })] })] })] }) })] }));
}
/* ═══════════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                      */
/* ═══════════════════════════════════════════════════════════════════════════════ */
export default function HRPage() {
    const [activeTab, setActiveTab] = useState("overview");
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "HR Portal" }), _jsx("p", { className: "text-muted-foreground", children: "Employee management \u00B7 Attendance \u00B7 Performance evaluations \u00B7 Payroll integration" })] }), _jsxs(Tabs, { value: activeTab, onValueChange: setActiveTab, children: [_jsxs(TabsList, { className: "w-full sm:w-auto", children: [_jsxs(TabsTrigger, { value: "overview", className: "gap-1.5", children: [_jsx(BarChart3, { className: "h-4 w-4", "aria-hidden": true }), " Overview"] }), _jsxs(TabsTrigger, { value: "employees", className: "gap-1.5", children: [_jsx(Users, { className: "h-4 w-4", "aria-hidden": true }), " Employees"] }), _jsxs(TabsTrigger, { value: "attendance", className: "gap-1.5", children: [_jsx(Clock, { className: "h-4 w-4", "aria-hidden": true }), " Attendance"] }), _jsxs(TabsTrigger, { value: "performance", className: "gap-1.5", children: [_jsx(Star, { className: "h-4 w-4", "aria-hidden": true }), " Performance"] })] }), _jsx(TabsContent, { value: "overview", className: "mt-4", children: _jsx(OverviewTab, { onTabChange: setActiveTab }) }), _jsx(TabsContent, { value: "employees", className: "mt-4", children: _jsx(EmployeesTab, {}) }), _jsx(TabsContent, { value: "attendance", className: "mt-4", children: _jsx(AttendanceTab, {}) }), _jsx(TabsContent, { value: "performance", className: "mt-4", children: _jsx(PerformanceTab, {}) })] }), _jsx(ModuleAnalyticsPanel, { module: "hr", reportId: "hr-dashboard", title: "HR Analytics Dashboard" })] }));
}
