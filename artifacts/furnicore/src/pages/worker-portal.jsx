import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Worker Portal page — three tabs:
 *
 *   My Tasks    — assigned manufacturing tasks; workers update status / progress
 *   Attendance  — read-only month view with penalty preview
 *   My Payroll  — read-only payslips with transparent breakdown
 *
 * All data is scoped server-side to req.user.id — workers never see anyone
 * else's data.
 */
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useWorkerMe, useWorkerTasks, useUpdateWorkerTask, useWorkerAttendance, useWorkerPayroll, } from "@/hooks/use-worker-portal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClipboardList, CalendarDays, Banknote, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Info, Play, CheckCheck, } from "lucide-react";
import { cn } from "@/lib/utils";
/* ─── Constants ──────────────────────────────────────────────────────────── */
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TASK_STATUS_CONFIG = {
    pending: { label: "Pending", color: "bg-slate-100 text-slate-700", icon: Clock },
    in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700", icon: Play },
    completed: { label: "Completed", color: "bg-green-100 text-green-700", icon: CheckCheck },
    on_hold: { label: "On Hold", color: "bg-amber-100 text-amber-700", icon: AlertTriangle },
    cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", icon: AlertTriangle },
};
const PRIORITY_CONFIG = {
    low: { label: "Low", color: "bg-slate-100 text-slate-600" },
    medium: { label: "Medium", color: "bg-amber-100 text-amber-700" },
    high: { label: "High", color: "bg-orange-100 text-orange-700" },
    critical: { label: "Critical", color: "bg-red-100 text-red-700" },
};
const ATTENDANCE_COLORS = {
    present: "bg-green-100 text-green-700",
    absent: "bg-red-100 text-red-700",
    late: "bg-amber-100 text-amber-700",
    half_day: "bg-blue-100 text-blue-700",
};
const ATTENDANCE_LABELS = {
    present: "Present", absent: "Absent", late: "Late", half_day: "Half Day",
};
const fmt = (n) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function isOverdue(dueDate) {
    if (!dueDate)
        return false;
    return new Date(dueDate) < new Date();
}
/* ─── Profile header ─────────────────────────────────────────────────────── */
function ProfileCard() {
    const { data, isLoading } = useWorkerMe();
    if (isLoading)
        return _jsx(Skeleton, { className: "h-24 w-full rounded-xl" });
    if (!data)
        return null;
    const { user, employee } = data;
    const initials = user.name?.slice(0, 2).toUpperCase() ?? "WK";
    return (_jsxs(Card, { className: "overflow-hidden", children: [_jsx("div", { className: "h-2 bg-gradient-to-r from-primary/70 to-primary" }), _jsxs(CardContent, { className: "flex flex-col gap-4 p-5 sm:flex-row sm:items-center", children: [_jsx("div", { className: "flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xl font-bold text-primary", children: initials }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("h2", { className: "text-lg font-semibold", children: user.name }), _jsx("p", { className: "text-sm text-muted-foreground", children: user.email }), employee && (_jsxs("div", { className: "mt-1.5 flex flex-wrap gap-2", children: [_jsx(Badge, { variant: "secondary", children: employee.department }), _jsx(Badge, { variant: "outline", children: employee.position }), employee.hireDate && (_jsxs("span", { className: "text-xs text-muted-foreground self-center", children: ["Since ", new Date(employee.hireDate).toLocaleDateString()] }))] }))] }), _jsx("div", { className: "flex items-center gap-2", children: _jsxs("div", { className: cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", employee?.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"), children: [_jsx("span", { className: cn("h-1.5 w-1.5 rounded-full", employee?.isActive ? "bg-green-500" : "bg-red-500") }), employee?.isActive ? "Active" : "Inactive"] }) })] })] }));
}
function TaskUpdateDialog({ task, onClose }) {
    const { toast } = useToast();
    const update = useUpdateWorkerTask();
    const { register, handleSubmit, control, watch } = useForm({
        defaultValues: {
            status: task.status === "pending" ? "in_progress" : task.status,
            progress: task.progress,
            actualHours: task.actualHours ?? 0,
        },
    });
    const watchedStatus = watch("status");
    const watchedProgress = watch("progress");
    const onSubmit = async (data) => {
        try {
            await update.mutateAsync({ id: task.id, ...data });
            toast({ title: "Task updated", description: `Status set to "${data.status.replace("_", " ")}"` });
            onClose();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    return (_jsx(Dialog, { open: true, onOpenChange: (v) => { if (!v)
            onClose(); }, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { className: "pr-6 leading-snug", children: task.title }), task.productName && _jsx("p", { className: "text-sm text-muted-foreground", children: task.productName })] }), _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-5", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Update status *" }), _jsx(Controller, { name: "status", control: control, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "in_progress", children: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(Play, { className: "h-3.5 w-3.5 text-blue-500", "aria-hidden": true }), " In Progress"] }) }), _jsx(SelectItem, { value: "completed", children: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(CheckCheck, { className: "h-3.5 w-3.5 text-green-500", "aria-hidden": true }), " Completed"] }) })] })] })) })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx(Label, { htmlFor: "task-progress", children: "Progress" }), _jsxs("span", { className: "text-sm font-mono font-semibold tabular-nums", children: [watchedProgress, "%"] })] }), _jsx(Input, { id: "task-progress", type: "range", min: 0, max: 100, step: 5, className: "h-2 cursor-pointer accent-primary", ...register("progress", { valueAsNumber: true }) }), _jsx(Progress, { value: watchedProgress, className: "h-2" }), watchedStatus === "completed" && watchedProgress < 100 && (_jsx("p", { className: "text-xs text-amber-600", children: "Tip: set progress to 100% when marking as completed." }))] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "task-hours", children: "Actual hours worked" }), _jsx(Input, { id: "task-hours", type: "number", step: "0.5", min: 0, ...register("actualHours", { valueAsNumber: true }) }), task.estimatedHours && (_jsxs("p", { className: "text-xs text-muted-foreground", children: ["Estimated: ", task.estimatedHours, "h"] }))] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: onClose, children: "Cancel" }), _jsx(Button, { type: "submit", disabled: update.isPending, children: update.isPending ? "Saving…" : "Save update" })] })] })] }) }));
}
function MyTasksTab() {
    const { data: tasks = [], isLoading } = useWorkerTasks();
    const [statusFilter, setStatusFilter] = useState("active");
    const [updateTask, setUpdateTask] = useState(null);
    const filtered = tasks.filter((t) => {
        if (statusFilter === "active")
            return t.status === "pending" || t.status === "in_progress";
        if (statusFilter === "completed")
            return t.status === "completed";
        if (statusFilter === "all")
            return true;
        return true;
    });
    const pending = tasks.filter((t) => t.status === "pending").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const overdue = tasks.filter((t) => isOverdue(t.dueDate) && t.status !== "completed").length;
    return (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "grid grid-cols-4 gap-3", children: [
                    { label: "Pending", value: pending, color: "text-slate-600" },
                    { label: "In Progress", value: inProgress, color: "text-blue-600" },
                    { label: "Completed", value: completed, color: "text-green-600" },
                    { label: "Overdue", value: overdue, color: "text-red-600" },
                ].map(({ label, value, color }) => (_jsxs("div", { className: "rounded-lg border bg-card p-3 text-center", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: label }), _jsx("p", { className: cn("text-2xl font-bold tabular-nums", color), children: value })] }, label))) }), _jsx("div", { className: "flex gap-2", children: [
                    { value: "active", label: "Active" },
                    { value: "completed", label: "Completed" },
                    { value: "all", label: "All" },
                ].map(({ value, label }) => (_jsx(Button, { size: "sm", variant: statusFilter === value ? "default" : "outline", onClick: () => setStatusFilter(value), children: label }, value))) }), isLoading ? (_jsx("div", { className: "space-y-3", children: [1, 2, 3].map(i => _jsx(Skeleton, { className: "h-32 w-full rounded-xl" }, i)) })) : filtered.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center rounded-xl border bg-card py-16 text-muted-foreground", children: [_jsx(ClipboardList, { className: "mb-3 h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No tasks in this category" })] })) : (_jsx("div", { className: "space-y-3", children: filtered.map((task) => {
                    const statusCfg = TASK_STATUS_CONFIG[task.status] ?? { label: task.status, color: "bg-muted text-muted-foreground", icon: Clock };
                    const priorityCfg = PRIORITY_CONFIG[task.priority] ?? { label: task.priority, color: "bg-muted text-muted-foreground" };
                    const overdue = isOverdue(task.dueDate) && task.status !== "completed";
                    const StatusIcon = statusCfg.icon;
                    return (_jsx(Card, { className: cn("transition-shadow hover:shadow-md", overdue && "border-red-200"), children: _jsx(CardContent, { className: "p-5", children: _jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-start", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 mb-1", children: [_jsx("h3", { className: "font-semibold leading-tight", children: task.title }), overdue && (_jsxs(Badge, { className: "bg-red-100 text-red-700 text-[10px]", children: [_jsx(AlertTriangle, { className: "mr-0.5 h-3 w-3", "aria-hidden": true }), " Overdue"] }))] }), task.productName && (_jsxs("p", { className: "text-xs text-muted-foreground mb-2", children: ["Product: ", task.productName] })), task.description && (_jsx("p", { className: "text-sm text-muted-foreground mb-3 line-clamp-2", children: task.description })), _jsxs("div", { className: "flex flex-wrap gap-1.5", children: [_jsxs(Badge, { className: cn("text-[11px]", statusCfg.color), children: [_jsx(StatusIcon, { className: "mr-1 h-3 w-3", "aria-hidden": true }), statusCfg.label] }), _jsxs(Badge, { className: cn("text-[11px]", priorityCfg.color), children: [priorityCfg.label, " priority"] }), task.dueDate && (_jsxs(Badge, { variant: "outline", className: cn("text-[11px]", overdue && "border-red-300 text-red-600"), children: ["Due ", new Date(task.dueDate).toLocaleDateString()] })), task.estimatedHours !== null && (_jsxs(Badge, { variant: "outline", className: "text-[11px]", children: ["Est. ", task.estimatedHours, "h", task.actualHours !== null && ` · Actual ${task.actualHours}h`] }))] }), _jsxs("div", { className: "mt-3", children: [_jsxs("div", { className: "mb-1 flex items-center justify-between text-xs text-muted-foreground", children: [_jsx("span", { children: "Progress" }), _jsxs("span", { className: "font-mono font-medium tabular-nums", children: [task.progress, "%"] })] }), _jsx(Progress, { value: task.progress, className: "h-2" })] })] }), task.status !== "completed" && task.status !== "cancelled" && (_jsx("div", { className: "shrink-0 pt-0.5", children: _jsxs(Button, { size: "sm", onClick: () => setUpdateTask(task), className: "w-full sm:w-auto", children: [_jsx(Play, { className: "mr-1.5 h-3.5 w-3.5", "aria-hidden": true }), "Update"] }) })), task.status === "completed" && (_jsxs("div", { className: "shrink-0 pt-1", children: [_jsxs("div", { className: "flex items-center gap-1 text-xs font-medium text-green-600", children: [_jsx(CheckCircle2, { className: "h-4 w-4", "aria-hidden": true }), "Done"] }), task.completedAt && (_jsx("p", { className: "text-[10px] text-muted-foreground mt-0.5", children: new Date(task.completedAt).toLocaleDateString() }))] }))] }) }) }, task.id));
                }) })), updateTask && (_jsx(TaskUpdateDialog, { task: updateTask, onClose: () => setUpdateTask(null) }))] }));
}
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 2 — ATTENDANCE                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */
function AttendanceTab() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const { data, isLoading } = useWorkerAttendance(month, year);
    const summary = data?.summary;
    const records = data?.records ?? [];
    const penaltyPreview = data?.penaltyPreview;
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsxs(Select, { value: String(month), onValueChange: (v) => setMonth(Number(v)), children: [_jsx(SelectTrigger, { className: "w-28", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: MONTHS_SHORT.map((m, i) => (_jsx(SelectItem, { value: String(i + 1), children: m }, i + 1))) })] }), _jsxs(Select, { value: String(year), onValueChange: (v) => setYear(Number(v)), children: [_jsx(SelectTrigger, { className: "w-24", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: [now.getFullYear() - 1, now.getFullYear()].map((y) => (_jsx(SelectItem, { value: String(y), children: y }, y))) })] })] }), data?.message && !summary && (_jsxs(Alert, { children: [_jsx(Info, { className: "h-4 w-4", "aria-hidden": true }), _jsx(AlertDescription, { children: data.message })] })), isLoading ? (_jsx("div", { className: "space-y-3", children: [1, 2, 3].map(i => _jsx(Skeleton, { className: "h-16 w-full" }, i)) })) : summary ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "grid grid-cols-2 gap-3 sm:grid-cols-4", children: [
                            { key: "present", label: "Present", color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20" },
                            { key: "absent", label: "Absent", color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20" },
                            { key: "late", label: "Late", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20" },
                            { key: "halfDay", label: "Half Day", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
                        ].map(({ key, label, color, bg }) => (_jsxs("div", { className: cn("rounded-xl p-4 text-center", bg), children: [_jsx("p", { className: "text-xs text-muted-foreground", children: label }), _jsx("p", { className: cn("text-3xl font-bold tabular-nums mt-1", color), children: summary[key] })] }, key))) }), summary.attendanceRate !== null && (_jsx(Card, { children: _jsxs(CardContent, { className: "p-4", children: [_jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsx("span", { className: "text-sm font-medium", children: "Attendance Rate" }), _jsxs("span", { className: cn("text-sm font-bold tabular-nums", summary.attendanceRate >= 90 ? "text-green-600" : summary.attendanceRate >= 75 ? "text-amber-600" : "text-red-600"), children: [summary.attendanceRate, "%"] })] }), _jsx(Progress, { value: summary.attendanceRate, className: cn("h-3", summary.attendanceRate >= 90 ? "[&>div]:bg-green-500" : summary.attendanceRate >= 75 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500") }), _jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: [summary.totalHours > 0 && `${summary.totalHours} total hours logged · `, summary.totalRecords, " records this month"] })] }) })), penaltyPreview && penaltyPreview.total > 0 && (_jsxs(Alert, { className: "border-amber-200 bg-amber-50 dark:bg-amber-950/20", children: [_jsx(AlertTriangle, { className: "h-4 w-4 text-amber-600", "aria-hidden": true }), _jsxs(AlertDescription, { className: "text-sm", children: [_jsx("p", { className: "font-medium text-amber-800 dark:text-amber-300 mb-1", children: "Estimated attendance deductions for this month" }), _jsxs("div", { className: "space-y-0.5 text-amber-700 dark:text-amber-400 text-xs", children: [penaltyPreview.absentPenalty > 0 && _jsxs("p", { children: ["Absent: \u2212", fmt(penaltyPreview.absentPenalty)] }), penaltyPreview.latePenalty > 0 && _jsxs("p", { children: ["Late: \u2212", fmt(penaltyPreview.latePenalty)] }), penaltyPreview.halfDayPenalty > 0 && _jsxs("p", { children: ["Half days: \u2212", fmt(penaltyPreview.halfDayPenalty)] }), _jsxs("p", { className: "font-semibold border-t border-amber-200 pt-1 mt-1", children: ["Estimated total deduction: \u2212", fmt(penaltyPreview.total)] })] }), _jsx("p", { className: "mt-1 text-[11px] text-muted-foreground", children: "This is a preview. Actual deductions are applied when payroll is generated. Contact HR for discrepancies." })] })] })), records.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center rounded-xl border bg-card py-12 text-muted-foreground", children: [_jsx(CalendarDays, { className: "mb-3 h-10 w-10", "aria-hidden": true }), _jsxs("p", { children: ["No attendance records for ", MONTHS_SHORT[month - 1], " ", year] })] })) : (_jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b bg-muted/30 text-left text-xs font-semibold text-muted-foreground", children: [_jsx("th", { className: "px-4 py-3", children: "Date" }), _jsx("th", { className: "px-4 py-3", children: "Status" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Hours" }), _jsx("th", { className: "px-4 py-3", children: "Notes" })] }) }), _jsx("tbody", { children: records.map((r) => (_jsxs("tr", { className: "border-b last:border-0 hover:bg-muted/20", children: [_jsx("td", { className: "px-4 py-3 tabular-nums text-muted-foreground", children: r.date }), _jsx("td", { className: "px-4 py-3", children: _jsx(Badge, { className: cn("text-[11px]", ATTENDANCE_COLORS[r.status]), children: ATTENDANCE_LABELS[r.status] ?? r.status }) }), _jsx("td", { className: "px-4 py-3 text-right font-mono tabular-nums", children: r.hoursWorked ?? "—" }), _jsx("td", { className: "px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate", children: r.notes || "—" })] }, r.id))) })] }) }) }) }))] })) : null] }));
}
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 3 — MY PAYROLL                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */
function PayslipBreakdown({ bd }) {
    const att = bd.attendance;
    return (_jsxs("div", { className: "mt-3 space-y-3 text-sm", children: [_jsxs("div", { className: "rounded-lg bg-muted/40 px-4 py-3 font-mono text-xs", children: [_jsx("span", { className: "font-sans font-medium text-muted-foreground mr-2", children: "Net =" }), fmt(bd.monthlyBase), bd.totalBonus > 0 && _jsxs("span", { className: "text-green-600", children: [" + ", fmt(bd.totalBonus)] }), bd.totalDeductions > 0 && _jsxs("span", { className: "text-red-600", children: [" \u2212 ", fmt(bd.totalDeductions)] }), _jsxs("span", { className: "ml-1 font-semibold", children: [" = ", fmt(bd.netSalary)] }), _jsxs("span", { className: "ml-2 font-sans text-[10px] text-muted-foreground", children: ["(daily rate: ", fmt(bd.dayRate), ")"] })] }), att.totalAttendancePenalty > 0 && (_jsxs("div", { className: "rounded-lg bg-red-50 px-4 py-3 text-xs dark:bg-red-950/20 space-y-1", children: [_jsx("p", { className: "font-semibold text-red-700 dark:text-red-400", children: "Attendance deductions" }), att.absentPenalty > 0 && _jsxs("p", { className: "text-red-600 flex justify-between", children: [_jsxs("span", { children: [att.absent, " absent \u00D7 ", fmt(bd.dayRate)] }), _jsxs("span", { children: ["\u2212", fmt(att.absentPenalty)] })] }), att.latePenalty > 0 && _jsxs("p", { className: "text-red-600 flex justify-between", children: [_jsxs("span", { children: [att.late, " late \u00D7 ", fmt(bd.dayRate * 0.25)] }), _jsxs("span", { children: ["\u2212", fmt(att.latePenalty)] })] }), att.halfDayPenalty > 0 && _jsxs("p", { className: "text-red-600 flex justify-between", children: [_jsxs("span", { children: [att.halfDay, " half-days \u00D7 ", fmt(bd.dayRate * 0.5)] }), _jsxs("span", { children: ["\u2212", fmt(att.halfDayPenalty)] })] })] })), bd.bonusAdjustments.length > 0 && (_jsx("div", { className: "space-y-1", children: bd.bonusAdjustments.map((a) => (_jsxs("div", { className: "flex items-center justify-between rounded-md bg-green-50 px-3 py-1.5 text-xs dark:bg-green-950/20", children: [_jsxs("span", { className: "text-green-700 dark:text-green-400", children: [_jsx(TrendingUp, { className: "mr-1 inline h-3 w-3", "aria-hidden": true }), "Bonus: ", a.reason] }), _jsxs("span", { className: "font-mono font-semibold text-green-700 dark:text-green-400", children: ["+", fmt(a.amount)] })] }, a.id))) })), bd.penaltyAdjustments.length > 0 && (_jsx("div", { className: "space-y-1", children: bd.penaltyAdjustments.map((a) => (_jsxs("div", { className: "flex items-center justify-between rounded-md bg-red-50 px-3 py-1.5 text-xs dark:bg-red-950/20", children: [_jsxs("span", { className: "text-red-700 dark:text-red-400", children: [_jsx(TrendingDown, { className: "mr-1 inline h-3 w-3", "aria-hidden": true }), "Penalty: ", a.reason] }), _jsxs("span", { className: "font-mono font-semibold text-red-700 dark:text-red-400", children: ["\u2212", fmt(a.amount)] })] }, a.id))) }))] }));
}
function MyPayrollTab() {
    const { data, isLoading } = useWorkerPayroll();
    const [expandedId, setExpandedId] = useState(null);
    const records = data?.records ?? [];
    const annualSalary = data?.annualSalary ?? 0;
    return (_jsxs("div", { className: "space-y-4", children: [data?.message && records.length === 0 && (_jsxs(Alert, { children: [_jsx(Info, { className: "h-4 w-4", "aria-hidden": true }), _jsx(AlertDescription, { children: data.message })] })), annualSalary > 0 && (_jsx(Card, { className: "border-primary/20 bg-primary/5", children: _jsxs(CardContent, { className: "flex items-center gap-4 p-4", children: [_jsx("div", { className: "flex h-10 w-10 items-center justify-center rounded-full bg-primary/15", children: _jsx(Banknote, { className: "h-5 w-5 text-primary", "aria-hidden": true }) }), _jsxs("div", { children: [_jsx("p", { className: "text-xs text-muted-foreground", children: "Annual Salary (Gross)" }), _jsx("p", { className: "text-xl font-bold tabular-nums text-primary", children: fmt(annualSalary) }), _jsxs("p", { className: "text-xs text-muted-foreground", children: ["Monthly base \u2248 ", fmt(annualSalary / 12)] })] })] }) })), isLoading ? (_jsx("div", { className: "space-y-3", children: [1, 2, 3].map(i => _jsx(Skeleton, { className: "h-20 w-full" }, i)) })) : records.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center rounded-xl border bg-card py-14 text-muted-foreground", children: [_jsx(Banknote, { className: "mb-3 h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No payroll records yet" }), _jsx("p", { className: "mt-1 text-xs", children: "Contact HR if you expect payslips to appear here." })] })) : (_jsx("div", { className: "space-y-3", children: records.map((p) => {
                    const isExpanded = expandedId === p.id;
                    return (_jsx(Card, { className: cn("overflow-hidden transition-shadow hover:shadow-sm", p.status === "approved" && "border-green-100"), children: _jsxs(CardContent, { className: "p-0", children: [_jsxs("button", { type: "button", className: "flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/20 transition-colors", onClick: () => setExpandedId(isExpanded ? null : p.id), "aria-expanded": isExpanded, children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-xs font-bold", children: [MONTHS_SHORT[p.month - 1], _jsx("br", {}), String(p.year).slice(2)] }), _jsxs("div", { children: [_jsxs("p", { className: "font-semibold", children: [MONTHS_SHORT[p.month - 1], " ", p.year] }), _jsxs("p", { className: "text-xs text-muted-foreground", children: ["Base ", fmt(p.baseSalary), p.bonus > 0 && _jsxs("span", { className: "text-green-600", children: [" + ", fmt(p.bonus)] }), p.deductions > 0 && _jsxs("span", { className: "text-red-600", children: [" \u2212 ", fmt(p.deductions)] })] })] })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "text-right", children: [_jsx("p", { className: "text-lg font-bold tabular-nums", children: fmt(p.netSalary) }), _jsx(Badge, { className: cn("text-[10px]", p.status === "approved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"), children: p.status === "approved" ? "Paid" : "Pending" })] }), isExpanded
                                                    ? _jsx(ChevronUp, { className: "h-4 w-4 text-muted-foreground shrink-0", "aria-hidden": true })
                                                    : _jsx(ChevronDown, { className: "h-4 w-4 text-muted-foreground shrink-0", "aria-hidden": true })] })] }), isExpanded && (_jsxs("div", { className: "border-t bg-muted/10 px-4 pb-4", children: [p.breakdown ? (_jsx(PayslipBreakdown, { bd: p.breakdown })) : (_jsxs("p", { className: "py-3 text-xs text-muted-foreground flex items-center gap-2", children: [_jsx(Info, { className: "h-3.5 w-3.5", "aria-hidden": true }), "No detailed breakdown available for this period. Contact HR for details."] })), p.paidAt && (_jsxs("p", { className: "mt-3 text-xs text-green-600 flex items-center gap-1", children: [_jsx(CheckCircle2, { className: "h-3.5 w-3.5", "aria-hidden": true }), "Paid on ", new Date(p.paidAt).toLocaleDateString()] }))] }))] }) }, p.id));
                }) })), _jsx("p", { className: "text-center text-xs text-muted-foreground pt-2", children: "All payroll data is read-only. For corrections or queries, please contact HR." })] }));
}
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function WorkerPortalPage() {
    const [activeTab, setActiveTab] = useState("tasks");
    const { data: tasks = [] } = useWorkerTasks();
    const activeTaskCount = tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length;
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(ProfileCard, {}), _jsxs(Tabs, { value: activeTab, onValueChange: setActiveTab, children: [_jsxs(TabsList, { className: "w-full sm:w-auto", children: [_jsxs(TabsTrigger, { value: "tasks", className: "relative gap-1.5", children: [_jsx(ClipboardList, { className: "h-4 w-4", "aria-hidden": true }), "My Tasks", activeTaskCount > 0 && (_jsx("span", { className: "ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground tabular-nums", children: activeTaskCount }))] }), _jsxs(TabsTrigger, { value: "attendance", className: "gap-1.5", children: [_jsx(CalendarDays, { className: "h-4 w-4", "aria-hidden": true }), "Attendance"] }), _jsxs(TabsTrigger, { value: "payroll", className: "gap-1.5", children: [_jsx(Banknote, { className: "h-4 w-4", "aria-hidden": true }), "My Payroll"] })] }), _jsx(TabsContent, { value: "tasks", className: "mt-4", children: _jsx(MyTasksTab, {}) }), _jsx(TabsContent, { value: "attendance", className: "mt-4", children: _jsx(AttendanceTab, {}) }), _jsx(TabsContent, { value: "payroll", className: "mt-4", children: _jsx(MyPayrollTab, {}) })] })] }));
}
