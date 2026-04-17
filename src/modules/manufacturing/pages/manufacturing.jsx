import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { useListManufacturingTasks, useCreateManufacturingTask, useUpdateManufacturingTask, useDeleteManufacturingTask, useGetManufacturingOverview, useListProducts, useListUsers, useListInventory, } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Hammer, Pencil, Trash2, ClipboardList, CheckCircle2, XCircle, PauseCircle, Eye, Package, FlaskConical, Layers, Users, Globe, } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv } from "@/lib/table-helpers";
import { cn } from "@/lib/utils";
import { useRoleAccess } from "@/components/RoleGuard";
import { useProductionOrders, useCreateProductionOrder, useUpdateProductionOrder, useDeleteProductionOrder, useQcRemarks, useCreateQcRemark, useUpdateQcRemark, useDeleteQcRemark, useMaterialUsage, useCreateMaterialUsage, useDeleteMaterialUsage, } from "@/hooks/use-production";
// ─── Constants ────────────────────────────────────────────────────────────────
const TASK_STATUS = {
    pending: { label: "Pending", variant: "secondary" },
    in_progress: { label: "In Progress", variant: "default" },
    completed: { label: "Completed", variant: "outline" },
    on_hold: { label: "On Hold", variant: "destructive" },
};
const PRIORITY_VARIANT = {
    low: "secondary", medium: "outline", high: "default", critical: "destructive",
};
const ORDER_STATUS = {
    planned: { label: "Planned", variant: "secondary" },
    in_production: { label: "In Production", variant: "default" },
    quality_check: { label: "Quality Check", variant: "outline" },
    completed: { label: "Completed", variant: "outline" },
    cancelled: { label: "Cancelled", variant: "destructive" },
};
const QC_RESULT = {
    pass: { label: "Pass", variant: "default", icon: CheckCircle2 },
    fail: { label: "Fail", variant: "destructive", icon: XCircle },
    hold: { label: "Hold", variant: "outline", icon: PauseCircle },
};
// ─── Task detail dialog (QC + materials) ─────────────────────────────────────
function TaskDetailDialog({ task, open, onClose, }) {
    const { toast } = useToast();
    const { can } = useRoleAccess();
    const canManage = can("admin", "manager");
    const { data: qcList = [], isLoading: qcLoading } = useQcRemarks(task?.id);
    const { data: matList = [], isLoading: matLoading } = useMaterialUsage(task?.id);
    const { data: inventory = [] } = useListInventory();
    const createQc = useCreateQcRemark();
    const updateQc = useUpdateQcRemark();
    const deleteQc = useDeleteQcRemark();
    const createMat = useCreateMaterialUsage();
    const deleteMat = useDeleteMaterialUsage();
    const [qcForm, setQcForm] = useState({
        result: "pass",
        remarks: "",
        visibleToCustomer: false,
    });
    const [matForm, setMatForm] = useState({
        inventoryItemId: "",
        materialName: "",
        quantityUsed: "",
        unit: "",
        notes: "",
    });
    const [showQcForm, setShowQcForm] = useState(false);
    const [showMatForm, setShowMatForm] = useState(false);
    // Auto-fill material name from inventory selection
    const handleInventorySelect = (id) => {
        const item = inventory.find((i) => String(i.id) === id);
        setMatForm((prev) => ({
            ...prev,
            inventoryItemId: id,
            materialName: item?.name ?? prev.materialName,
            unit: item?.unit ?? prev.unit,
        }));
    };
    const submitQc = async () => {
        if (!qcForm.remarks.trim()) {
            toast({ variant: "destructive", title: "Remarks are required" });
            return;
        }
        try {
            await createQc.mutateAsync({ taskId: task.id, ...qcForm });
            toast({ title: "QC remark added" });
            setQcForm({ result: "pass", remarks: "", visibleToCustomer: false });
            setShowQcForm(false);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const submitMat = async () => {
        if (!matForm.materialName || !matForm.quantityUsed || !matForm.unit) {
            toast({ variant: "destructive", title: "Name, quantity, and unit are required" });
            return;
        }
        try {
            await createMat.mutateAsync({
                taskId: task.id,
                inventoryItemId: matForm.inventoryItemId ? Number(matForm.inventoryItemId) : undefined,
                materialName: matForm.materialName,
                quantityUsed: Number(matForm.quantityUsed),
                unit: matForm.unit,
                notes: matForm.notes || undefined,
            });
            toast({ title: "Material usage logged" });
            setMatForm({ inventoryItemId: "", materialName: "", quantityUsed: "", unit: "", notes: "" });
            setShowMatForm(false);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    if (!task)
        return null;
    return (_jsx(Dialog, { open: open, onOpenChange: onClose, children: _jsxs(DialogContent, { className: "max-w-3xl max-h-[90vh] overflow-y-auto", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { className: "flex items-center gap-2", children: [_jsx(Hammer, { className: "h-5 w-5 text-muted-foreground" }), task.title] }) }), _jsxs("div", { className: "flex flex-wrap gap-2 text-sm", children: [_jsx(Badge, { variant: TASK_STATUS[task.status]?.variant, children: TASK_STATUS[task.status]?.label ?? task.status }), _jsx(Badge, { variant: PRIORITY_VARIANT[task.priority], className: "capitalize", children: task.priority }), task.assigneeName && (_jsxs("span", { className: "flex items-center gap-1 text-muted-foreground", children: [_jsx(Users, { className: "h-3.5 w-3.5" }), task.assigneeName] })), task.estimatedHours && (_jsxs("span", { className: "text-muted-foreground", children: [Number(task.estimatedHours), "h estimated"] })), task.dueDate && (_jsxs("span", { className: "text-muted-foreground", children: ["Due ", new Date(task.dueDate).toLocaleDateString()] }))] }), task.description && (_jsx("p", { className: "text-sm text-muted-foreground", children: task.description })), _jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex justify-between text-xs text-muted-foreground", children: [_jsx("span", { children: "Progress" }), _jsxs("span", { children: [task.progress, "%"] })] }), _jsx(Progress, { value: Number(task.progress), className: "h-2" })] }), _jsxs(Tabs, { defaultValue: "qc", className: "mt-2", children: [_jsxs(TabsList, { children: [_jsxs(TabsTrigger, { value: "qc", children: [_jsx(FlaskConical, { className: "mr-1.5 h-4 w-4" }), "QC Remarks (", qcList.length, ")"] }), _jsxs(TabsTrigger, { value: "materials", children: [_jsx(Layers, { className: "mr-1.5 h-4 w-4" }), "Materials (", matList.length, ")"] })] }), _jsxs(TabsContent, { value: "qc", className: "space-y-3 pt-3", children: [canManage && (_jsxs(Button, { size: "sm", variant: "outline", onClick: () => setShowQcForm((v) => !v), children: [_jsx(Plus, { className: "mr-1.5 h-4 w-4" }), "Add QC Remark"] })), showQcForm && canManage && (_jsx(Card, { className: "border-dashed", children: _jsxs(CardContent, { className: "space-y-3 pt-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Result" }), _jsxs(Select, { value: qcForm.result, onValueChange: (v) => setQcForm((p) => ({ ...p, result: v })), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "pass", children: "Pass" }), _jsx(SelectItem, { value: "fail", children: "Fail" }), _jsx(SelectItem, { value: "hold", children: "Hold" })] })] })] }), _jsxs("div", { className: "flex items-center gap-2 pt-6", children: [_jsx(Switch, { id: "qc-visible", checked: qcForm.visibleToCustomer, onCheckedChange: (v) => setQcForm((p) => ({ ...p, visibleToCustomer: v })) }), _jsxs(Label, { htmlFor: "qc-visible", className: "flex items-center gap-1 cursor-pointer", children: [_jsx(Globe, { className: "h-3.5 w-3.5" }), "Visible to customer"] })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Remarks" }), _jsx(Textarea, { rows: 3, placeholder: "Describe the quality inspection findings\u2026", value: qcForm.remarks, onChange: (e) => setQcForm((p) => ({ ...p, remarks: e.target.value })) })] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { variant: "outline", size: "sm", onClick: () => setShowQcForm(false), children: "Cancel" }), _jsx(Button, { size: "sm", onClick: submitQc, disabled: createQc.isPending, children: "Save remark" })] })] }) })), qcLoading ? (_jsx(Skeleton, { className: "h-20 w-full" })) : qcList.length === 0 ? (_jsx("p", { className: "py-6 text-center text-sm text-muted-foreground", children: "No QC remarks yet" })) : (_jsx("ul", { className: "space-y-2", children: qcList.map((r) => {
                                        const qcMeta = QC_RESULT[r.result];
                                        const Icon = qcMeta?.icon ?? CheckCircle2;
                                        return (_jsx("li", { children: _jsx(Card, { children: _jsx(CardContent, { className: "p-4", children: _jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "flex items-start gap-3 min-w-0", children: [_jsx(Icon, { className: cn("mt-0.5 h-5 w-5 shrink-0", r.result === "pass"
                                                                            ? "text-green-600"
                                                                            : r.result === "fail"
                                                                                ? "text-destructive"
                                                                                : "text-amber-500") }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 mb-1", children: [_jsx(Badge, { variant: qcMeta?.variant, className: "text-xs", children: qcMeta?.label ?? r.result }), r.visibleToCustomer && (_jsxs(Badge, { variant: "secondary", className: "gap-1 text-xs", children: [_jsx(Globe, { className: "h-3 w-3" }), "Customer visible"] })), _jsx("span", { className: "text-xs text-muted-foreground", children: r.inspectorName ?? "Unknown" }), _jsx("time", { className: "text-xs text-muted-foreground", children: new Date(r.createdAt).toLocaleString() })] }), _jsx("p", { className: "text-sm break-words", children: r.remarks })] })] }), canManage && (_jsxs("div", { className: "flex shrink-0 items-center gap-1", children: [_jsx(Button, { size: "icon", variant: "ghost", className: "h-7 w-7", title: r.visibleToCustomer ? "Hide from customer" : "Show to customer", onClick: () => updateQc.mutateAsync({
                                                                            id: r.id,
                                                                            data: { visibleToCustomer: !r.visibleToCustomer },
                                                                        }), children: _jsx(Eye, { className: cn("h-3.5 w-3.5", r.visibleToCustomer ? "text-primary" : "text-muted-foreground") }) }), _jsx(Button, { size: "icon", variant: "ghost", className: "h-7 w-7 text-destructive", onClick: () => deleteQc.mutateAsync(r.id), children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }))] }) }) }) }, r.id));
                                    }) }))] }), _jsxs(TabsContent, { value: "materials", className: "space-y-3 pt-3", children: [_jsxs(Button, { size: "sm", variant: "outline", onClick: () => setShowMatForm((v) => !v), children: [_jsx(Plus, { className: "mr-1.5 h-4 w-4" }), "Log Material Use"] }), showMatForm && (_jsx(Card, { className: "border-dashed", children: _jsxs(CardContent, { className: "space-y-3 pt-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { children: "Inventory item (optional)" }), _jsxs(Select, { value: matForm.inventoryItemId, onValueChange: handleInventorySelect, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Select from inventory\u2026" }) }), _jsx(SelectContent, { children: inventory.map((i) => (_jsxs(SelectItem, { value: String(i.id), children: [i.name, " (", i.unit, ")"] }, i.id))) })] })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { children: "Material name" }), _jsx(Input, { placeholder: "e.g. Oak planks", value: matForm.materialName, onChange: (e) => setMatForm((p) => ({ ...p, materialName: e.target.value })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Quantity used" }), _jsx(Input, { type: "number", step: "0.001", value: matForm.quantityUsed, onChange: (e) => setMatForm((p) => ({ ...p, quantityUsed: e.target.value })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Unit" }), _jsx(Input, { placeholder: "kg / pcs / m\u00B2", value: matForm.unit, onChange: (e) => setMatForm((p) => ({ ...p, unit: e.target.value })) })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { children: "Notes" }), _jsx(Input, { placeholder: "Optional notes", value: matForm.notes, onChange: (e) => setMatForm((p) => ({ ...p, notes: e.target.value })) })] })] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { variant: "outline", size: "sm", onClick: () => setShowMatForm(false), children: "Cancel" }), _jsx(Button, { size: "sm", onClick: submitMat, disabled: createMat.isPending, children: "Log usage" })] })] }) })), matLoading ? (_jsx(Skeleton, { className: "h-20 w-full" })) : matList.length === 0 ? (_jsx("p", { className: "py-6 text-center text-sm text-muted-foreground", children: "No material usage logged yet" })) : (_jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "Material" }), _jsx(TableHead, { className: "text-right", children: "Qty" }), _jsx(TableHead, { children: "Unit" }), _jsx(TableHead, { children: "Logged by" }), _jsx(TableHead, { children: "Date" }), _jsx(TableHead, {})] }) }), _jsx(TableBody, { children: matList.map((m) => (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "font-medium", children: m.materialName }), _jsx(TableCell, { className: "text-right tabular-nums", children: m.quantityUsed }), _jsx(TableCell, { children: m.unit }), _jsx(TableCell, { className: "text-muted-foreground", children: m.loggedByName ?? "—" }), _jsx(TableCell, { className: "text-xs text-muted-foreground", children: new Date(m.createdAt).toLocaleDateString() }), _jsx(TableCell, { children: canManage && (_jsx(Button, { size: "icon", variant: "ghost", className: "h-7 w-7 text-destructive", onClick: () => deleteMat.mutateAsync(m.id), children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })) })] }, m.id))) })] }))] })] }), _jsx(DialogFooter, { children: _jsx(Button, { variant: "outline", onClick: onClose, children: "Close" }) })] }) }));
}
const TASK_TABLE_ID = "mfg-tasks";
const ORDER_TABLE_ID = "prod-orders";
const QC_TABLE_ID = "qc-table";
export default function ManufacturingPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { can } = useRoleAccess();
    const canManage = can("admin", "manager");
    // ── Data ──
    const { data: tasks = [], isLoading: tasksLoading } = useListManufacturingTasks();
    const { data: overview } = useGetManufacturingOverview();
    const { data: orders = [], isLoading: ordersLoading } = useProductionOrders();
    const { data: qcAll = [], isLoading: qcLoading } = useQcRemarks();
    const { data: products = [] } = useListProducts();
    const { data: users = [] } = useListUsers();
    const createTask = useCreateManufacturingTask();
    const updateTask = useUpdateManufacturingTask();
    const deleteTask = useDeleteManufacturingTask();
    const createOrder = useCreateProductionOrder();
    const updateOrder = useUpdateProductionOrder();
    const deleteOrder = useDeleteProductionOrder();
    const updateQc = useUpdateQcRemark();
    const deleteQcMut = useDeleteQcRemark();
    // ── Dialog state ──
    const [showTaskDialog, setShowTaskDialog] = useState(false);
    const [editTask, setEditTask] = useState(null);
    const [showOrderDialog, setShowOrderDialog] = useState(false);
    const [editOrder, setEditOrder] = useState(null);
    const [detailTask, setDetailTask] = useState(null);
    // ── Task table filters ──
    const [taskSearch, setTaskSearch] = useState("");
    const [taskStatus, setTaskStatus] = useState("all");
    const [taskSort, setTaskSort] = useState("title");
    const [taskDir, setTaskDir] = useState("asc");
    const [taskPage, setTaskPage] = useState(1);
    const [taskPageSize, setTaskPageSize] = useState(8);
    // ── Order table filters ──
    const [orderSearch, setOrderSearch] = useState("");
    const [orderStatus, setOrderStatus] = useState("all");
    const [orderPage, setOrderPage] = useState(1);
    const [orderPageSize, setOrderPageSize] = useState(8);
    // ── QC table filters ──
    const [qcSearch, setQcSearch] = useState("");
    const [qcResult, setQcResult] = useState("all");
    const [qcPage, setQcPage] = useState(1);
    const [qcPageSize, setQcPageSize] = useState(10);
    useEffect(() => { setTaskPage(1); }, [taskSearch, taskStatus, taskSort, taskDir]);
    useEffect(() => { setOrderPage(1); }, [orderSearch, orderStatus]);
    useEffect(() => { setQcPage(1); }, [qcSearch, qcResult]);
    // ── Task form ──
    const taskForm = useForm({
        defaultValues: { status: "pending", priority: "medium", progress: 0, estimatedHours: 8, assigneeId: "", productId: "" },
    });
    // ── Order form ──
    const orderForm = useForm({
        defaultValues: { productId: "", taskId: "", quantity: 1, targetDate: "", status: "planned", notes: "" },
    });
    // ─── Task sorted/paginated ───
    const sortedTasks = useMemo(() => filterAndSortRows(tasks, {
        search: taskSearch,
        match: (r, q) => {
            const qn = q.toLowerCase();
            const m = !qn || r.title?.toLowerCase().includes(qn) || r.description?.toLowerCase().includes(qn);
            if (!m)
                return false;
            return taskStatus === "all" || r.status === taskStatus;
        },
        sortKey: taskSort,
        sortDir: taskDir,
        getSortValue: (r, k) => {
            if (k === "progress")
                return Number(r.progress ?? 0);
            if (k === "dueDate")
                return r.dueDate ? new Date(r.dueDate).getTime() : 0;
            if (k === "status")
                return String(r.status ?? "");
            if (k === "priority")
                return { low: 0, medium: 1, high: 2, critical: 3 }[r.priority] ?? 0;
            return String(r.title ?? "");
        },
    }), [tasks, taskSearch, taskStatus, taskSort, taskDir]);
    const { pageRows: taskRows, total: taskTotal, totalPages: taskTotalPages, page: safeTaskPage } = useMemo(() => paginateRows(sortedTasks, taskPage, taskPageSize), [sortedTasks, taskPage, taskPageSize]);
    useEffect(() => { if (safeTaskPage !== taskPage)
        setTaskPage(safeTaskPage); }, [safeTaskPage, taskPage]);
    // ─── Order sorted/paginated ───
    const sortedOrders = useMemo(() => orders.filter((o) => {
        const q = orderSearch.toLowerCase();
        const m = !q || o.orderNumber.toLowerCase().includes(q) || (o.productName ?? "").toLowerCase().includes(q);
        if (!m)
            return false;
        return orderStatus === "all" || o.status === orderStatus;
    }), [orders, orderSearch, orderStatus]);
    const { pageRows: orderRows, total: orderTotal, totalPages: orderTotalPages, page: safeOrderPage } = useMemo(() => paginateRows(sortedOrders, orderPage, orderPageSize), [sortedOrders, orderPage, orderPageSize]);
    useEffect(() => { if (safeOrderPage !== orderPage)
        setOrderPage(safeOrderPage); }, [safeOrderPage, orderPage]);
    // ─── QC sorted/paginated ───
    const sortedQc = useMemo(() => qcAll.filter((r) => {
        const q = qcSearch.toLowerCase();
        const m = !q || (r.taskTitle ?? "").toLowerCase().includes(q) || r.remarks.toLowerCase().includes(q) || (r.inspectorName ?? "").toLowerCase().includes(q);
        if (!m)
            return false;
        return qcResult === "all" || r.result === qcResult;
    }), [qcAll, qcSearch, qcResult]);
    const { pageRows: qcRows, total: qcTotal, totalPages: qcTotalPages, page: safeQcPage } = useMemo(() => paginateRows(sortedQc, qcPage, qcPageSize), [sortedQc, qcPage, qcPageSize]);
    useEffect(() => { if (safeQcPage !== qcPage)
        setQcPage(safeQcPage); }, [safeQcPage, qcPage]);
    // ─── Handlers ───────────────────────────────────────────────────────────────
    const openCreateTask = () => {
        setEditTask(null);
        taskForm.reset({ status: "pending", priority: "medium", progress: 0, estimatedHours: 8, dueDate: "", title: "", description: "", assigneeId: "", productId: "" });
        setShowTaskDialog(true);
    };
    const openEditTask = (t) => {
        setEditTask(t);
        taskForm.reset({
            title: t.title,
            description: t.description || "",
            status: t.status,
            priority: t.priority,
            progress: Number(t.progress),
            estimatedHours: Number(t.estimatedHours),
            dueDate: t.dueDate ? new Date(t.dueDate).toISOString().split("T")[0] : "",
            assigneeId: t.assigneeId ? String(t.assigneeId) : "",
            productId: t.productId ? String(t.productId) : "",
        });
        setShowTaskDialog(true);
    };
    const submitTask = async (data) => {
        try {
            const payload = {
                ...data,
                assigneeId: data.assigneeId ? Number(data.assigneeId) : null,
                productId: data.productId ? Number(data.productId) : null,
                progress: Number(data.progress),
                estimatedHours: Number(data.estimatedHours),
            };
            if (editTask) {
                await updateTask.mutateAsync({ id: editTask.id, data: payload });
                toast({ title: "Task updated" });
            }
            else {
                await createTask.mutateAsync({ data: payload });
                toast({ title: "Task created" });
            }
            queryClient.invalidateQueries({ queryKey: ["listManufacturingTasks"] });
            setShowTaskDialog(false);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const handleDeleteTask = async (id) => {
        if (!confirm("Delete this task?"))
            return;
        try {
            await deleteTask.mutateAsync({ id });
            toast({ title: "Task deleted" });
            queryClient.invalidateQueries({ queryKey: ["listManufacturingTasks"] });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const openCreateOrder = () => {
        setEditOrder(null);
        orderForm.reset({ productId: "", taskId: "", quantity: 1, targetDate: "", status: "planned", notes: "" });
        setShowOrderDialog(true);
    };
    const openEditOrder = (o) => {
        setEditOrder(o);
        orderForm.reset({
            productId: String(o.productId),
            taskId: o.taskId ? String(o.taskId) : "",
            quantity: o.quantity,
            targetDate: o.targetDate ? new Date(o.targetDate).toISOString().split("T")[0] : "",
            status: o.status,
            notes: o.notes ?? "",
        });
        setShowOrderDialog(true);
    };
    const submitOrder = async (data) => {
        try {
            const payload = {
                productId: Number(data.productId),
                quantity: Number(data.quantity),
                status: data.status,
                notes: data.notes || null,
                taskId: data.taskId ? Number(data.taskId) : undefined,
                targetDate: data.targetDate || undefined,
            };
            if (editOrder) {
                await updateOrder.mutateAsync({ id: editOrder.id, data: payload });
                toast({ title: "Order updated" });
            }
            else {
                await createOrder.mutateAsync(payload);
                toast({ title: "Production order created" });
            }
            setShowOrderDialog(false);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const exportTaskCsv = () => {
        exportRowsToCsv(`furnicore-tasks-${new Date().toISOString().slice(0, 10)}`, ["title", "status", "priority", "progress", "dueDate"], sortedTasks.map((t) => ({
            title: t.title, status: t.status, priority: t.priority,
            progress: t.progress, dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : "",
        })));
        toast({ title: "Exported", description: `${sortedTasks.length} tasks` });
    };
    const exportOrderCsv = () => {
        exportRowsToCsv(`furnicore-orders-${new Date().toISOString().slice(0, 10)}`, ["orderNumber", "productName", "quantity", "status", "targetDate"], sortedOrders.map((o) => ({
            orderNumber: o.orderNumber, productName: o.productName ?? "", quantity: o.quantity,
            status: o.status, targetDate: o.targetDate ? new Date(o.targetDate).toISOString() : "",
        })));
        toast({ title: "Exported", description: `${sortedOrders.length} orders` });
    };
    // ─── Render ─────────────────────────────────────────────────────────────────
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Production Manager" }), _jsx("p", { className: "text-muted-foreground", children: "Orders \u00B7 Tasks \u00B7 Quality control \u00B7 Material tracking" })] }), overview && (_jsx("div", { className: "grid grid-cols-2 gap-4 md:grid-cols-4", children: [
                    { label: "Total tasks", value: overview.totalTasks },
                    { label: "In progress", value: overview.inProgressTasks },
                    { label: "Completed", value: overview.completedTasks },
                    { label: "Avg progress", value: `${Math.round(overview.averageCompletion ?? 0)}%` },
                ].map((s) => (_jsx(Card, { children: _jsxs(CardContent, { className: "p-4", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: s.label }), _jsx("p", { className: "mt-1 text-2xl font-bold tabular-nums", children: s.value })] }) }, s.label))) })), _jsxs(Tabs, { defaultValue: "orders", children: [_jsxs(TabsList, { className: "mb-2", children: [_jsxs(TabsTrigger, { value: "orders", children: [_jsx(ClipboardList, { className: "mr-1.5 h-4 w-4" }), "Production Orders"] }), _jsxs(TabsTrigger, { value: "tasks", children: [_jsx(Hammer, { className: "mr-1.5 h-4 w-4" }), "Floor Tasks"] }), _jsxs(TabsTrigger, { value: "qc", children: [_jsx(FlaskConical, { className: "mr-1.5 h-4 w-4" }), "Quality Control"] })] }), _jsxs(TabsContent, { value: "orders", className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Formal work orders linking products to production tasks" }), canManage && (_jsxs(Button, { onClick: openCreateOrder, children: [_jsx(Plus, { className: "mr-2 h-4 w-4" }), "New order"] }))] }), _jsx(TableToolbar, { id: ORDER_TABLE_ID, entityLabel: "orders", searchValue: orderSearch, onSearchChange: setOrderSearch, searchPlaceholder: "Search by order # or product\u2026", filterLabel: "Status", filterValue: orderStatus, onFilterChange: setOrderStatus, filterOptions: [
                                    { value: "all", label: "All" },
                                    { value: "planned", label: "Planned" },
                                    { value: "in_production", label: "In Production" },
                                    { value: "quality_check", label: "Quality Check" },
                                    { value: "completed", label: "Completed" },
                                    { value: "cancelled", label: "Cancelled" },
                                ], sortKey: "", onSortKeyChange: () => { }, sortOptions: [], sortDir: "asc", onSortDirChange: () => { }, pageSize: orderPageSize, onPageSizeChange: setOrderPageSize, onExportCsv: exportOrderCsv, exportDisabled: sortedOrders.length === 0, resultsText: orderTotal === 0
                                    ? "No matching orders"
                                    : `Showing ${(safeOrderPage - 1) * orderPageSize + 1}–${Math.min(safeOrderPage * orderPageSize, orderTotal)} of ${orderTotal}` }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: ordersLoading ? (_jsx("div", { className: "space-y-3 p-6", children: [1, 2, 3].map((i) => _jsx(Skeleton, { className: "h-12 w-full" }, i)) })) : orderRows.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(Package, { className: "mb-3 h-10 w-10" }), _jsx("p", { children: "No production orders found" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "Order #" }), _jsx(TableHead, { children: "Product" }), _jsx(TableHead, { children: "Qty" }), _jsx(TableHead, { children: "Status" }), _jsx(TableHead, { children: "Linked task" }), _jsx(TableHead, { children: "Target date" }), _jsx(TableHead, { children: "Created by" }), canManage && _jsx(TableHead, { className: "text-right", children: "Actions" })] }) }), _jsx(TableBody, { children: orderRows.map((o) => {
                                                                const s = ORDER_STATUS[o.status];
                                                                return (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "font-mono text-sm font-semibold", children: o.orderNumber }), _jsx(TableCell, { children: o.productName ?? "—" }), _jsx(TableCell, { className: "tabular-nums", children: o.quantity }), _jsx(TableCell, { children: _jsx(Badge, { variant: s?.variant, children: s?.label ?? o.status }) }), _jsx(TableCell, { className: "text-sm text-muted-foreground", children: o.taskTitle ?? "—" }), _jsx(TableCell, { className: "text-sm text-muted-foreground", children: o.targetDate ? new Date(o.targetDate).toLocaleDateString() : "—" }), _jsx(TableCell, { className: "text-sm text-muted-foreground", children: o.createdByName ?? "—" }), canManage && (_jsx(TableCell, { className: "text-right", children: _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx(Button, { size: "icon", variant: "ghost", onClick: () => openEditOrder(o), children: _jsx(Pencil, { className: "h-4 w-4" }) }), _jsx(Button, { size: "icon", variant: "ghost", className: "text-destructive", onClick: () => {
                                                                                            if (confirm("Delete this order?"))
                                                                                                deleteOrder.mutateAsync(o.id);
                                                                                        }, children: _jsx(Trash2, { className: "h-4 w-4" }) })] }) }))] }, o.id));
                                                            }) })] }) }), _jsx(TablePaginationBar, { id: ORDER_TABLE_ID, page: safeOrderPage, totalPages: orderTotalPages, onPageChange: setOrderPage })] })) }) })] }), _jsxs(TabsContent, { value: "tasks", className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Assign workers, track progress, and log details per task" }), canManage && (_jsxs(Button, { onClick: openCreateTask, children: [_jsx(Plus, { className: "mr-2 h-4 w-4" }), "New task"] }))] }), _jsx(TableToolbar, { id: TASK_TABLE_ID, entityLabel: "tasks", searchValue: taskSearch, onSearchChange: setTaskSearch, searchPlaceholder: "Search by title or description\u2026", filterLabel: "Status", filterValue: taskStatus, onFilterChange: setTaskStatus, filterOptions: [
                                    { value: "all", label: "All" },
                                    { value: "pending", label: "Pending" },
                                    { value: "in_progress", label: "In progress" },
                                    { value: "completed", label: "Completed" },
                                    { value: "on_hold", label: "On hold" },
                                ], sortKey: taskSort, onSortKeyChange: setTaskSort, sortOptions: [
                                    { value: "title", label: "Title" },
                                    { value: "status", label: "Status" },
                                    { value: "priority", label: "Priority" },
                                    { value: "progress", label: "Progress" },
                                    { value: "dueDate", label: "Due date" },
                                ], sortDir: taskDir, onSortDirChange: setTaskDir, pageSize: taskPageSize, onPageSizeChange: setTaskPageSize, onExportCsv: exportTaskCsv, exportDisabled: sortedTasks.length === 0, resultsText: taskTotal === 0
                                    ? "No matching tasks"
                                    : `Showing ${(safeTaskPage - 1) * taskPageSize + 1}–${Math.min(safeTaskPage * taskPageSize, taskTotal)} of ${taskTotal}` }), tasksLoading ? (_jsx("div", { className: "space-y-3", children: [1, 2, 3].map((i) => _jsx(Skeleton, { className: "h-24 w-full rounded-xl" }, i)) })) : taskRows.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(Hammer, { className: "mb-3 h-10 w-10" }), _jsx("p", { children: "No tasks match your filters" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "space-y-3", children: taskRows.map((t) => {
                                            const s = TASK_STATUS[t.status] ?? { label: t.status, variant: "secondary" };
                                            const taskQcCount = qcAll.filter((r) => r.taskId === t.id).length;
                                            return (_jsx(Card, { children: _jsx(CardContent, { className: "p-5", children: _jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "mb-1 flex flex-wrap items-center gap-2", children: [_jsx("h2", { className: "text-base font-semibold", children: t.title }), _jsx(Badge, { variant: s.variant, children: s.label }), _jsx(Badge, { variant: PRIORITY_VARIANT[t.priority], className: "capitalize", children: t.priority }), taskQcCount > 0 && (_jsxs(Badge, { variant: "secondary", className: "gap-1", children: [_jsx(FlaskConical, { className: "h-3 w-3" }), taskQcCount, " QC"] }))] }), t.description && (_jsx("p", { className: "mb-3 text-sm text-muted-foreground", children: t.description })), _jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex justify-between text-xs text-muted-foreground", children: [_jsx("span", { children: "Progress" }), _jsxs("span", { children: [t.progress, "%"] })] }), _jsx(Progress, { value: Number(t.progress), className: "h-2" })] }), _jsxs("div", { className: "mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground", children: [t.assigneeName && (_jsxs("span", { className: "flex items-center gap-1", children: [_jsx(Users, { className: "h-3 w-3" }), t.assigneeName] })), t.estimatedHours && (_jsxs("span", { children: [Number(t.estimatedHours), "h estimated"] })), t.dueDate && (_jsxs("time", { dateTime: t.dueDate, children: ["Due ", new Date(t.dueDate).toLocaleDateString()] }))] })] }), _jsxs("div", { className: "flex shrink-0 gap-1 self-end sm:self-start", children: [_jsx(Button, { size: "icon", variant: "ghost", title: "View details / QC / materials", onClick: () => setDetailTask(t), children: _jsx(Eye, { className: "h-4 w-4" }) }), canManage && (_jsxs(_Fragment, { children: [_jsx(Button, { size: "icon", variant: "ghost", onClick: () => openEditTask(t), children: _jsx(Pencil, { className: "h-4 w-4" }) }), _jsx(Button, { size: "icon", variant: "ghost", className: "text-destructive", onClick: () => handleDeleteTask(t.id), children: _jsx(Trash2, { className: "h-4 w-4" }) })] }))] })] }) }) }, t.id));
                                        }) }), _jsx(TablePaginationBar, { id: TASK_TABLE_ID, page: safeTaskPage, totalPages: taskTotalPages, onPageChange: setTaskPage })] }))] }), _jsxs(TabsContent, { value: "qc", className: "space-y-4", children: [_jsx("div", { className: "flex items-center justify-between", children: _jsxs("p", { className: "text-sm text-muted-foreground", children: ["All QC inspections across tasks. Use the", " ", _jsx(Globe, { className: "inline h-3.5 w-3.5 text-primary" }), " toggle to expose remarks to the customer portal (", _jsx("code", { className: "text-xs", children: "/api/qc-remarks/public" }), ")."] }) }), _jsx(TableToolbar, { id: QC_TABLE_ID, entityLabel: "QC remarks", searchValue: qcSearch, onSearchChange: setQcSearch, searchPlaceholder: "Search by task, inspector, or remarks\u2026", filterLabel: "Result", filterValue: qcResult, onFilterChange: setQcResult, filterOptions: [
                                    { value: "all", label: "All" },
                                    { value: "pass", label: "Pass" },
                                    { value: "fail", label: "Fail" },
                                    { value: "hold", label: "Hold" },
                                ], sortKey: "", onSortKeyChange: () => { }, sortOptions: [], sortDir: "asc", onSortDirChange: () => { }, pageSize: qcPageSize, onPageSizeChange: setQcPageSize, onExportCsv: () => {
                                    exportRowsToCsv(`furnicore-qc-${new Date().toISOString().slice(0, 10)}`, ["taskTitle", "inspectorName", "result", "remarks", "visibleToCustomer", "createdAt"], sortedQc.map((r) => ({
                                        taskTitle: r.taskTitle ?? "",
                                        inspectorName: r.inspectorName ?? "",
                                        result: r.result,
                                        remarks: r.remarks.replace(/\r?\n/g, " "),
                                        visibleToCustomer: r.visibleToCustomer ? "yes" : "no",
                                        createdAt: new Date(r.createdAt).toISOString(),
                                    })));
                                    toast({ title: "Exported", description: `${sortedQc.length} QC remarks` });
                                }, exportDisabled: sortedQc.length === 0, resultsText: qcTotal === 0
                                    ? "No QC remarks"
                                    : `Showing ${(safeQcPage - 1) * qcPageSize + 1}–${Math.min(safeQcPage * qcPageSize, qcTotal)} of ${qcTotal}` }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: qcLoading ? (_jsx("div", { className: "space-y-3 p-6", children: [1, 2, 3].map((i) => _jsx(Skeleton, { className: "h-12 w-full" }, i)) })) : qcRows.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(FlaskConical, { className: "mb-3 h-10 w-10" }), _jsx("p", { children: "No QC remarks recorded yet" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "Task" }), _jsx(TableHead, { children: "Result" }), _jsx(TableHead, { children: "Remarks" }), _jsx(TableHead, { children: "Inspector" }), _jsx(TableHead, { children: "Date" }), _jsx(TableHead, { className: "text-center", children: "Customer visible" }), canManage && _jsx(TableHead, { className: "text-right", children: "Actions" })] }) }), _jsx(TableBody, { children: qcRows.map((r) => {
                                                                const qcMeta = QC_RESULT[r.result];
                                                                const Icon = qcMeta?.icon ?? CheckCircle2;
                                                                return (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "font-medium", children: r.taskTitle ?? "—" }), _jsx(TableCell, { children: _jsxs(Badge, { variant: qcMeta?.variant, className: cn("gap-1", r.result === "pass" && "bg-green-100 text-green-800"), children: [_jsx(Icon, { className: "h-3 w-3" }), qcMeta?.label] }) }), _jsx(TableCell, { className: "max-w-[260px] truncate text-sm", children: r.remarks }), _jsx(TableCell, { className: "text-sm text-muted-foreground", children: r.inspectorName ?? "—" }), _jsx(TableCell, { className: "text-xs text-muted-foreground", children: new Date(r.createdAt).toLocaleDateString() }), _jsx(TableCell, { className: "text-center", children: _jsx(Switch, { checked: r.visibleToCustomer, disabled: !canManage, onCheckedChange: (v) => updateQc.mutateAsync({ id: r.id, data: { visibleToCustomer: v } }), "aria-label": "Toggle customer visibility" }) }), canManage && (_jsx(TableCell, { className: "text-right", children: _jsx(Button, { size: "icon", variant: "ghost", className: "h-7 w-7 text-destructive", onClick: () => deleteQcMut.mutateAsync(r.id), children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) }) }))] }, r.id));
                                                            }) })] }) }), _jsx(TablePaginationBar, { id: QC_TABLE_ID, page: safeQcPage, totalPages: qcTotalPages, onPageChange: setQcPage })] })) }) })] })] }), _jsx(TaskDetailDialog, { task: detailTask, open: !!detailTask, onClose: () => setDetailTask(null) }), _jsx(Dialog, { open: showTaskDialog, onOpenChange: setShowTaskDialog, children: _jsxs(DialogContent, { className: "max-w-lg", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: editTask ? "Edit task" : "New manufacturing task" }) }), _jsxs("form", { onSubmit: taskForm.handleSubmit(submitTask), className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "t-title", children: "Title" }), _jsx(Input, { id: "t-title", ...taskForm.register("title", { required: true }), placeholder: "e.g. Oak Desk Production Run" })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "t-desc", children: "Description" }), _jsx(Input, { id: "t-desc", ...taskForm.register("description"), placeholder: "Brief description" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Status" }), _jsx(Controller, { name: "status", control: taskForm.control, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "pending", children: "Pending" }), _jsx(SelectItem, { value: "in_progress", children: "In progress" }), _jsx(SelectItem, { value: "completed", children: "Completed" }), _jsx(SelectItem, { value: "on_hold", children: "On hold" })] })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Priority" }), _jsx(Controller, { name: "priority", control: taskForm.control, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "low", children: "Low" }), _jsx(SelectItem, { value: "medium", children: "Medium" }), _jsx(SelectItem, { value: "high", children: "High" }), _jsx(SelectItem, { value: "critical", children: "Critical" })] })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Assign to" }), _jsx(Controller, { name: "assigneeId", control: taskForm.control, render: ({ field }) => (_jsxs(Select, { value: field.value || "__none__", onValueChange: (v) => field.onChange(v === "__none__" ? "" : v), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Unassigned" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "__none__", children: "Unassigned" }), users.map((u) => (_jsx(SelectItem, { value: String(u.id), children: u.name }, u.id)))] })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Linked product" }), _jsx(Controller, { name: "productId", control: taskForm.control, render: ({ field }) => (_jsxs(Select, { value: field.value || "__none__", onValueChange: (v) => field.onChange(v === "__none__" ? "" : v), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "None" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "__none__", children: "None" }), products.map((p) => (_jsx(SelectItem, { value: String(p.id), children: p.name }, p.id)))] })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "t-prog", children: "Progress (%)" }), _jsx(Input, { id: "t-prog", type: "number", min: "0", max: "100", ...taskForm.register("progress", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "t-hrs", children: "Est. hours" }), _jsx(Input, { id: "t-hrs", type: "number", step: "0.5", ...taskForm.register("estimatedHours", { valueAsNumber: true }) })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "t-due", children: "Due date" }), _jsx(Input, { id: "t-due", type: "date", ...taskForm.register("dueDate") })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowTaskDialog(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: createTask.isPending || updateTask.isPending, children: "Save" })] })] })] }) }), _jsx(Dialog, { open: showOrderDialog, onOpenChange: setShowOrderDialog, children: _jsxs(DialogContent, { className: "max-w-lg", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: editOrder ? `Edit order ${editOrder.orderNumber}` : "New production order" }) }), _jsxs("form", { onSubmit: orderForm.handleSubmit(submitOrder), className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { children: "Product *" }), _jsx(Controller, { name: "productId", control: orderForm.control, rules: { required: true }, render: ({ field }) => (_jsxs(Select, { value: field.value || "__none__", onValueChange: (v) => field.onChange(v === "__none__" ? "" : v), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Select product\u2026" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "__none__", disabled: true, children: "Select product\u2026" }), products.filter((p) => p.id).map((p) => (_jsxs(SelectItem, { value: String(p.id), children: [p.name, " (", p.sku, ")"] }, p.id)))] })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "o-qty", children: "Quantity *" }), _jsx(Input, { id: "o-qty", type: "number", min: "1", ...orderForm.register("quantity", { valueAsNumber: true, required: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Status" }), _jsx(Controller, { name: "status", control: orderForm.control, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "planned", children: "Planned" }), _jsx(SelectItem, { value: "in_production", children: "In Production" }), _jsx(SelectItem, { value: "quality_check", children: "Quality Check" }), _jsx(SelectItem, { value: "completed", children: "Completed" }), _jsx(SelectItem, { value: "cancelled", children: "Cancelled" })] })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Link to task (optional)" }), _jsx(Controller, { name: "taskId", control: orderForm.control, render: ({ field }) => (_jsxs(Select, { value: field.value || "__none__", onValueChange: (v) => field.onChange(v === "__none__" ? "" : v), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "No task linked" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "__none__", children: "None" }), tasks.map((t) => (_jsx(SelectItem, { value: String(t.id), children: t.title }, t.id)))] })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "o-date", children: "Target date" }), _jsx(Input, { id: "o-date", type: "date", ...orderForm.register("targetDate") })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "o-notes", children: "Notes" }), _jsx(Input, { id: "o-notes", ...orderForm.register("notes"), placeholder: "Optional production notes" })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowOrderDialog(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: createOrder.isPending || updateOrder.isPending, children: "Save" })] })] })] }) })] }));
}
