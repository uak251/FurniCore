import { useState, useMemo, useEffect } from "react";
import {
  useListManufacturingTasks,
  useCreateManufacturingTask,
  useUpdateManufacturingTask,
  useDeleteManufacturingTask,
  useGetManufacturingOverview,
  useListProducts,
  useListUsers,
  useListInventory,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Hammer,
  Pencil,
  Trash2,
  ClipboardList,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Eye,
  Package,
  FlaskConical,
  Layers,
  Users,
  Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";
import { cn } from "@/lib/utils";
import { useRoleAccess } from "@/components/RoleGuard";
import {
  useProductionOrders,
  useCreateProductionOrder,
  useUpdateProductionOrder,
  useDeleteProductionOrder,
  useQcRemarks,
  useCreateQcRemark,
  useUpdateQcRemark,
  useDeleteQcRemark,
  useMaterialUsage,
  useCreateMaterialUsage,
  useDeleteMaterialUsage,
  type ProductionOrder,
  type QcRemark,
  type MaterialUsageRecord,
} from "@/hooks/use-production";

// ─── Constants ────────────────────────────────────────────────────────────────

const TASK_STATUS: Record<string, { label: string; variant: string }> = {
  pending:     { label: "Pending",     variant: "secondary" },
  in_progress: { label: "In Progress", variant: "default" },
  completed:   { label: "Completed",   variant: "outline" },
  on_hold:     { label: "On Hold",     variant: "destructive" },
};

const PRIORITY_VARIANT: Record<string, string> = {
  low: "secondary", medium: "outline", high: "default", critical: "destructive",
};

const ORDER_STATUS: Record<string, { label: string; variant: string }> = {
  planned:        { label: "Planned",        variant: "secondary" },
  in_production:  { label: "In Production",  variant: "default" },
  quality_check:  { label: "Quality Check",  variant: "outline" },
  completed:      { label: "Completed",      variant: "outline" },
  cancelled:      { label: "Cancelled",      variant: "destructive" },
};

const QC_RESULT: Record<string, { label: string; variant: string; icon: typeof CheckCircle2 }> = {
  pass: { label: "Pass", variant: "default",     icon: CheckCircle2 },
  fail: { label: "Fail", variant: "destructive", icon: XCircle },
  hold: { label: "Hold", variant: "outline",     icon: PauseCircle },
};

// ─── Task detail dialog (QC + materials) ─────────────────────────────────────

function TaskDetailDialog({
  task,
  open,
  onClose,
}: {
  task: any;
  open: boolean;
  onClose: () => void;
}) {
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
    result: "pass" as "pass" | "fail" | "hold",
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
  const handleInventorySelect = (id: string) => {
    const item = (inventory as any[]).find((i) => String(i.id) === id);
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
    } catch (e: any) {
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
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer className="h-5 w-5 text-muted-foreground" />
            {task.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant={TASK_STATUS[task.status]?.variant as any}>
            {TASK_STATUS[task.status]?.label ?? task.status}
          </Badge>
          <Badge variant={PRIORITY_VARIANT[task.priority] as any} className="capitalize">
            {task.priority}
          </Badge>
          {task.assigneeName && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {task.assigneeName}
            </span>
          )}
          {task.estimatedHours && (
            <span className="text-muted-foreground">{Number(task.estimatedHours)}h estimated</span>
          )}
          {task.dueDate && (
            <span className="text-muted-foreground">
              Due {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>

        {task.description && (
          <p className="text-sm text-muted-foreground">{task.description}</p>
        )}

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>{task.progress}%</span>
          </div>
          <Progress value={Number(task.progress)} className="h-2" />
        </div>

        <Tabs defaultValue="qc" className="mt-2">
          <TabsList>
            <TabsTrigger value="qc">
              <FlaskConical className="mr-1.5 h-4 w-4" />
              QC Remarks ({qcList.length})
            </TabsTrigger>
            <TabsTrigger value="materials">
              <Layers className="mr-1.5 h-4 w-4" />
              Materials ({matList.length})
            </TabsTrigger>
          </TabsList>

          {/* ── QC Tab ── */}
          <TabsContent value="qc" className="space-y-3 pt-3">
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setShowQcForm((v) => !v)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add QC Remark
              </Button>
            )}

            {showQcForm && canManage && (
              <Card className="border-dashed">
                <CardContent className="space-y-3 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Result</Label>
                      <Select
                        value={qcForm.result}
                        onValueChange={(v) => setQcForm((p) => ({ ...p, result: v as any }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pass">Pass</SelectItem>
                          <SelectItem value="fail">Fail</SelectItem>
                          <SelectItem value="hold">Hold</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <Switch
                        id="qc-visible"
                        checked={qcForm.visibleToCustomer}
                        onCheckedChange={(v) => setQcForm((p) => ({ ...p, visibleToCustomer: v }))}
                      />
                      <Label htmlFor="qc-visible" className="flex items-center gap-1 cursor-pointer">
                        <Globe className="h-3.5 w-3.5" />
                        Visible to customer
                      </Label>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Remarks</Label>
                    <Textarea
                      rows={3}
                      placeholder="Describe the quality inspection findings…"
                      value={qcForm.remarks}
                      onChange={(e) => setQcForm((p) => ({ ...p, remarks: e.target.value }))}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowQcForm(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={submitQc} disabled={createQc.isPending}>
                      Save remark
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {qcLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : qcList.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No QC remarks yet
              </p>
            ) : (
              <ul className="space-y-2">
                {qcList.map((r) => {
                  const qcMeta = QC_RESULT[r.result];
                  const Icon = qcMeta?.icon ?? CheckCircle2;
                  return (
                    <li key={r.id}>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <Icon
                                className={cn(
                                  "mt-0.5 h-5 w-5 shrink-0",
                                  r.result === "pass"
                                    ? "text-green-600"
                                    : r.result === "fail"
                                    ? "text-destructive"
                                    : "text-amber-500",
                                )}
                              />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <Badge variant={qcMeta?.variant as any} className="text-xs">
                                    {qcMeta?.label ?? r.result}
                                  </Badge>
                                  {r.visibleToCustomer && (
                                    <Badge variant="secondary" className="gap-1 text-xs">
                                      <Globe className="h-3 w-3" />
                                      Customer visible
                                    </Badge>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {r.inspectorName ?? "Unknown"}
                                  </span>
                                  <time className="text-xs text-muted-foreground">
                                    {new Date(r.createdAt).toLocaleString()}
                                  </time>
                                </div>
                                <p className="text-sm break-words">{r.remarks}</p>
                              </div>
                            </div>
                            {canManage && (
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  title={r.visibleToCustomer ? "Hide from customer" : "Show to customer"}
                                  onClick={() =>
                                    updateQc.mutateAsync({
                                      id: r.id,
                                      data: { visibleToCustomer: !r.visibleToCustomer },
                                    })
                                  }
                                >
                                  <Eye
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      r.visibleToCustomer ? "text-primary" : "text-muted-foreground",
                                    )}
                                  />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => deleteQc.mutateAsync(r.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          {/* ── Materials Tab ── */}
          <TabsContent value="materials" className="space-y-3 pt-3">
            <Button size="sm" variant="outline" onClick={() => setShowMatForm((v) => !v)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Log Material Use
            </Button>

            {showMatForm && (
              <Card className="border-dashed">
                <CardContent className="space-y-3 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <Label>Inventory item (optional)</Label>
                      <Select
                        value={matForm.inventoryItemId}
                        onValueChange={handleInventorySelect}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select from inventory…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(inventory as any[]).map((i) => (
                            <SelectItem key={i.id} value={String(i.id)}>
                              {i.name} ({i.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label>Material name</Label>
                      <Input
                        placeholder="e.g. Oak planks"
                        value={matForm.materialName}
                        onChange={(e) => setMatForm((p) => ({ ...p, materialName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Quantity used</Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={matForm.quantityUsed}
                        onChange={(e) => setMatForm((p) => ({ ...p, quantityUsed: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Unit</Label>
                      <Input
                        placeholder="kg / pcs / m²"
                        value={matForm.unit}
                        onChange={(e) => setMatForm((p) => ({ ...p, unit: e.target.value }))}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label>Notes</Label>
                      <Input
                        placeholder="Optional notes"
                        value={matForm.notes}
                        onChange={(e) => setMatForm((p) => ({ ...p, notes: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowMatForm(false)}>Cancel</Button>
                    <Button size="sm" onClick={submitMat} disabled={createMat.isPending}>Log usage</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {matLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : matList.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No material usage logged yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Logged by</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matList.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.materialName}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.quantityUsed}</TableCell>
                      <TableCell>{m.unit}</TableCell>
                      <TableCell className="text-muted-foreground">{m.loggedByName ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => deleteMat.mutateAsync(m.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface TaskForm {
  title: string;
  description: string;
  status: string;
  priority: string;
  progress: number;
  estimatedHours: number;
  dueDate: string;
  assigneeId: string;
  productId: string;
}

interface OrderForm {
  productId: string;
  taskId: string;
  quantity: number;
  targetDate: string;
  status: string;
  notes: string;
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

  const createTask   = useCreateManufacturingTask();
  const updateTask   = useUpdateManufacturingTask();
  const deleteTask   = useDeleteManufacturingTask();
  const createOrder  = useCreateProductionOrder();
  const updateOrder  = useUpdateProductionOrder();
  const deleteOrder  = useDeleteProductionOrder();
  const updateQc     = useUpdateQcRemark();
  const deleteQcMut  = useDeleteQcRemark();

  // ── Dialog state ──
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [editTask, setEditTask] = useState<any>(null);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [editOrder, setEditOrder] = useState<ProductionOrder | null>(null);
  const [detailTask, setDetailTask] = useState<any>(null);

  // ── Task table filters ──
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatus, setTaskStatus] = useState("all");
  const [taskSort, setTaskSort] = useState("title");
  const [taskDir, setTaskDir] = useState<SortDir>("asc");
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
  const taskForm = useForm<TaskForm>({
    defaultValues: { status: "pending", priority: "medium", progress: 0, estimatedHours: 8, assigneeId: "", productId: "" },
  });

  // ── Order form ──
  const orderForm = useForm<OrderForm>({
    defaultValues: { productId: "", taskId: "", quantity: 1, targetDate: "", status: "planned", notes: "" },
  });

  // ─── Task sorted/paginated ───
  const sortedTasks = useMemo(() =>
    filterAndSortRows(tasks as any[], {
      search: taskSearch,
      match: (r, q) => {
        const qn = q.toLowerCase();
        const m = !qn || r.title?.toLowerCase().includes(qn) || r.description?.toLowerCase().includes(qn);
        if (!m) return false;
        return taskStatus === "all" || r.status === taskStatus;
      },
      sortKey: taskSort,
      sortDir: taskDir,
      getSortValue: (r, k) => {
        if (k === "progress") return Number(r.progress ?? 0);
        if (k === "dueDate") return r.dueDate ? new Date(r.dueDate).getTime() : 0;
        if (k === "status") return String(r.status ?? "");
        if (k === "priority") return { low: 0, medium: 1, high: 2, critical: 3 }[r.priority as string] ?? 0;
        return String(r.title ?? "");
      },
    }),
  [tasks, taskSearch, taskStatus, taskSort, taskDir]);

  const { pageRows: taskRows, total: taskTotal, totalPages: taskTotalPages, page: safeTaskPage } =
    useMemo(() => paginateRows(sortedTasks, taskPage, taskPageSize), [sortedTasks, taskPage, taskPageSize]);
  useEffect(() => { if (safeTaskPage !== taskPage) setTaskPage(safeTaskPage); }, [safeTaskPage, taskPage]);

  // ─── Order sorted/paginated ───
  const sortedOrders = useMemo(() =>
    (orders as ProductionOrder[]).filter((o) => {
      const q = orderSearch.toLowerCase();
      const m = !q || o.orderNumber.toLowerCase().includes(q) || (o.productName ?? "").toLowerCase().includes(q);
      if (!m) return false;
      return orderStatus === "all" || o.status === orderStatus;
    }),
  [orders, orderSearch, orderStatus]);

  const { pageRows: orderRows, total: orderTotal, totalPages: orderTotalPages, page: safeOrderPage } =
    useMemo(() => paginateRows(sortedOrders, orderPage, orderPageSize), [sortedOrders, orderPage, orderPageSize]);
  useEffect(() => { if (safeOrderPage !== orderPage) setOrderPage(safeOrderPage); }, [safeOrderPage, orderPage]);

  // ─── QC sorted/paginated ───
  const sortedQc = useMemo(() =>
    (qcAll as QcRemark[]).filter((r) => {
      const q = qcSearch.toLowerCase();
      const m = !q || (r.taskTitle ?? "").toLowerCase().includes(q) || r.remarks.toLowerCase().includes(q) || (r.inspectorName ?? "").toLowerCase().includes(q);
      if (!m) return false;
      return qcResult === "all" || r.result === qcResult;
    }),
  [qcAll, qcSearch, qcResult]);

  const { pageRows: qcRows, total: qcTotal, totalPages: qcTotalPages, page: safeQcPage } =
    useMemo(() => paginateRows(sortedQc, qcPage, qcPageSize), [sortedQc, qcPage, qcPageSize]);
  useEffect(() => { if (safeQcPage !== qcPage) setQcPage(safeQcPage); }, [safeQcPage, qcPage]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const openCreateTask = () => {
    setEditTask(null);
    taskForm.reset({ status: "pending", priority: "medium", progress: 0, estimatedHours: 8, dueDate: "", title: "", description: "", assigneeId: "", productId: "" });
    setShowTaskDialog(true);
  };

  const openEditTask = (t: any) => {
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

  const submitTask = async (data: TaskForm) => {
    try {
      const payload: any = {
        ...data,
        assigneeId: data.assigneeId ? Number(data.assigneeId) : null,
        productId:  data.productId  ? Number(data.productId)  : null,
        progress: Number(data.progress),
        estimatedHours: Number(data.estimatedHours),
      };
      if (editTask) {
        await updateTask.mutateAsync({ id: editTask.id, data: payload });
        toast({ title: "Task updated" });
      } else {
        await createTask.mutateAsync({ data: payload });
        toast({ title: "Task created" });
      }
      queryClient.invalidateQueries({ queryKey: ["listManufacturingTasks"] });
      setShowTaskDialog(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDeleteTask = async (id: number) => {
    if (!confirm("Delete this task?")) return;
    try {
      await deleteTask.mutateAsync({ id });
      toast({ title: "Task deleted" });
      queryClient.invalidateQueries({ queryKey: ["listManufacturingTasks"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const openCreateOrder = () => {
    setEditOrder(null);
    orderForm.reset({ productId: "", taskId: "", quantity: 1, targetDate: "", status: "planned", notes: "" });
    setShowOrderDialog(true);
  };

  const openEditOrder = (o: ProductionOrder) => {
    setEditOrder(o);
    orderForm.reset({
      productId:  String(o.productId),
      taskId:     o.taskId ? String(o.taskId) : "",
      quantity:   o.quantity,
      targetDate: o.targetDate ? new Date(o.targetDate).toISOString().split("T")[0] : "",
      status:     o.status,
      notes:      o.notes ?? "",
    });
    setShowOrderDialog(true);
  };

  const submitOrder = async (data: OrderForm) => {
    try {
      const payload: any = {
        productId:  Number(data.productId),
        quantity:   Number(data.quantity),
        status:     data.status,
        notes:      data.notes || null,
        taskId:     data.taskId ? Number(data.taskId) : null,
        targetDate: data.targetDate || null,
      };
      if (editOrder) {
        await updateOrder.mutateAsync({ id: editOrder.id, data: payload });
        toast({ title: "Order updated" });
      } else {
        await createOrder.mutateAsync(payload);
        toast({ title: "Production order created" });
      }
      setShowOrderDialog(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const exportTaskCsv = () => {
    exportRowsToCsv(`furnicore-tasks-${new Date().toISOString().slice(0, 10)}`,
      ["title", "status", "priority", "progress", "dueDate"],
      sortedTasks.map((t: any) => ({
        title: t.title, status: t.status, priority: t.priority,
        progress: t.progress, dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : "",
      })));
    toast({ title: "Exported", description: `${sortedTasks.length} tasks` });
  };

  const exportOrderCsv = () => {
    exportRowsToCsv(`furnicore-orders-${new Date().toISOString().slice(0, 10)}`,
      ["orderNumber", "productName", "quantity", "status", "targetDate"],
      sortedOrders.map((o) => ({
        orderNumber: o.orderNumber, productName: o.productName ?? "", quantity: o.quantity,
        status: o.status, targetDate: o.targetDate ? new Date(o.targetDate).toISOString() : "",
      })));
    toast({ title: "Exported", description: `${sortedOrders.length} orders` });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
        <div>
        <h1 className="text-3xl font-bold tracking-tight">Production Manager</h1>
        <p className="text-muted-foreground">Orders · Tasks · Quality control · Material tracking</p>
      </div>

      {/* KPI strip */}
      {overview && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Total tasks",   value: overview.totalTasks },
            { label: "In progress",   value: overview.inProgressTasks },
            { label: "Completed",     value: overview.completedTasks },
            { label: "Avg progress",  value: `${Math.round(overview.averageCompletion ?? 0)}%` },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Main tabs */}
      <Tabs defaultValue="orders">
        <TabsList className="mb-2">
          <TabsTrigger value="orders">
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Production Orders
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <Hammer className="mr-1.5 h-4 w-4" />
            Floor Tasks
          </TabsTrigger>
          <TabsTrigger value="qc">
            <FlaskConical className="mr-1.5 h-4 w-4" />
            Quality Control
          </TabsTrigger>
        </TabsList>

        {/* ════════ PRODUCTION ORDERS TAB ════════ */}
        <TabsContent value="orders" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Formal work orders linking products to production tasks
            </p>
            {canManage && (
              <Button onClick={openCreateOrder}>
                <Plus className="mr-2 h-4 w-4" />
                New order
              </Button>
            )}
          </div>

      <TableToolbar
            id={ORDER_TABLE_ID}
            entityLabel="orders"
            searchValue={orderSearch}
            onSearchChange={setOrderSearch}
            searchPlaceholder="Search by order # or product…"
            filterLabel="Status"
            filterValue={orderStatus}
            onFilterChange={setOrderStatus}
            filterOptions={[
              { value: "all",           label: "All" },
              { value: "planned",       label: "Planned" },
              { value: "in_production", label: "In Production" },
              { value: "quality_check", label: "Quality Check" },
              { value: "completed",     label: "Completed" },
              { value: "cancelled",     label: "Cancelled" },
            ]}
            sortKey=""
            onSortKeyChange={() => {}}
            sortOptions={[]}
            sortDir="asc"
            onSortDirChange={() => {}}
            pageSize={orderPageSize}
            onPageSizeChange={setOrderPageSize}
            onExportCsv={exportOrderCsv}
            exportDisabled={sortedOrders.length === 0}
            resultsText={
              orderTotal === 0
                ? "No matching orders"
                : `Showing ${(safeOrderPage - 1) * orderPageSize + 1}–${Math.min(safeOrderPage * orderPageSize, orderTotal)} of ${orderTotal}`
            }
          />

          <Card>
            <CardContent className="p-0">
              {ordersLoading ? (
                <div className="space-y-3 p-6">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : orderRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Package className="mb-3 h-10 w-10" />
                  <p>No production orders found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order #</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Linked task</TableHead>
                          <TableHead>Target date</TableHead>
                          <TableHead>Created by</TableHead>
                          {canManage && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(orderRows as ProductionOrder[]).map((o) => {
                          const s = ORDER_STATUS[o.status];
                          return (
                            <TableRow key={o.id}>
                              <TableCell className="font-mono text-sm font-semibold">
                                {o.orderNumber}
                              </TableCell>
                              <TableCell>{o.productName ?? "—"}</TableCell>
                              <TableCell className="tabular-nums">{o.quantity}</TableCell>
                              <TableCell>
                                <Badge variant={s?.variant as any}>{s?.label ?? o.status}</Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {o.taskTitle ?? "—"}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {o.targetDate ? new Date(o.targetDate).toLocaleDateString() : "—"}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {o.createdByName ?? "—"}
                              </TableCell>
                              {canManage && (
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button size="icon" variant="ghost" onClick={() => openEditOrder(o)}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="text-destructive"
                                      onClick={() => {
                                        if (confirm("Delete this order?"))
                                          deleteOrder.mutateAsync(o.id);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePaginationBar
                    id={ORDER_TABLE_ID}
                    page={safeOrderPage}
                    totalPages={orderTotalPages}
                    onPageChange={setOrderPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ FLOOR TASKS TAB ════════ */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Assign workers, track progress, and log details per task
            </p>
            {canManage && (
              <Button onClick={openCreateTask}>
                <Plus className="mr-2 h-4 w-4" />
                New task
              </Button>
            )}
          </div>

          <TableToolbar
            id={TASK_TABLE_ID}
        entityLabel="tasks"
            searchValue={taskSearch}
            onSearchChange={setTaskSearch}
        searchPlaceholder="Search by title or description…"
        filterLabel="Status"
            filterValue={taskStatus}
            onFilterChange={setTaskStatus}
        filterOptions={[
              { value: "all",         label: "All" },
              { value: "pending",     label: "Pending" },
          { value: "in_progress", label: "In progress" },
              { value: "completed",   label: "Completed" },
              { value: "on_hold",     label: "On hold" },
        ]}
            sortKey={taskSort}
            onSortKeyChange={setTaskSort}
        sortOptions={[
              { value: "title",    label: "Title" },
              { value: "status",   label: "Status" },
          { value: "priority", label: "Priority" },
              { value: "progress", label: "Progress" },
              { value: "dueDate",  label: "Due date" },
            ]}
            sortDir={taskDir}
            onSortDirChange={setTaskDir}
            pageSize={taskPageSize}
            onPageSizeChange={setTaskPageSize}
            onExportCsv={exportTaskCsv}
            exportDisabled={sortedTasks.length === 0}
        resultsText={
              taskTotal === 0
            ? "No matching tasks"
                : `Showing ${(safeTaskPage - 1) * taskPageSize + 1}–${Math.min(safeTaskPage * taskPageSize, taskTotal)} of ${taskTotal}`
            }
          />

          {tasksLoading ? (
        <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
          ) : taskRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Hammer className="mb-3 h-10 w-10" />
          <p>No tasks match your filters</p>
        </div>
      ) : (
        <>
              <div className="space-y-3">
                {(taskRows as any[]).map((t) => {
                  const s = TASK_STATUS[t.status] ?? { label: t.status, variant: "secondary" };
                  const taskQcCount = (qcAll as QcRemark[]).filter((r) => r.taskId === t.id).length;
              return (
                    <Card key={t.id}>
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                              <h2 className="text-base font-semibold">{t.title}</h2>
                              <Badge variant={s.variant as any}>{s.label}</Badge>
                              <Badge
                                variant={PRIORITY_VARIANT[t.priority] as any}
                                className="capitalize"
                              >
                              {t.priority}
                            </Badge>
                              {taskQcCount > 0 && (
                                <Badge variant="secondary" className="gap-1">
                                  <FlaskConical className="h-3 w-3" />
                                  {taskQcCount} QC
                                </Badge>
                              )}
                          </div>
                          {t.description && (
                            <p className="mb-3 text-sm text-muted-foreground">{t.description}</p>
                          )}
                          <div className="space-y-1.5">
                              <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Progress</span>
                                <span>{t.progress}%</span>
                            </div>
                              <Progress value={Number(t.progress)} className="h-2" />
                          </div>
                            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                              {t.assigneeName && (
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {t.assigneeName}
                                </span>
                              )}
                              {t.estimatedHours && (
                                <span>{Number(t.estimatedHours)}h estimated</span>
                              )}
                              {t.dueDate && (
                                <time dateTime={t.dueDate}>
                                  Due {new Date(t.dueDate).toLocaleDateString()}
                                </time>
                              )}
                          </div>
                        </div>
                          <div className="flex shrink-0 gap-1 self-end sm:self-start">
                          <Button
                            size="icon"
                            variant="ghost"
                              title="View details / QC / materials"
                              onClick={() => setDetailTask(t)}
                          >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canManage && (
                              <>
                                <Button size="icon" variant="ghost" onClick={() => openEditTask(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                                  onClick={() => handleDeleteTask(t.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                              </>
                            )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
              );
            })}
          </div>
          <TablePaginationBar
                id={TASK_TABLE_ID}
                page={safeTaskPage}
                totalPages={taskTotalPages}
                onPageChange={setTaskPage}
          />
        </>
      )}
        </TabsContent>

        {/* ════════ QUALITY CONTROL TAB ════════ */}
        <TabsContent value="qc" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              All QC inspections across tasks. Use the{" "}
              <Globe className="inline h-3.5 w-3.5 text-primary" /> toggle to expose remarks to
              the customer portal (<code className="text-xs">/api/qc-remarks/public</code>).
            </p>
          </div>

          <TableToolbar
            id={QC_TABLE_ID}
            entityLabel="QC remarks"
            searchValue={qcSearch}
            onSearchChange={setQcSearch}
            searchPlaceholder="Search by task, inspector, or remarks…"
            filterLabel="Result"
            filterValue={qcResult}
            onFilterChange={setQcResult}
            filterOptions={[
              { value: "all",  label: "All" },
              { value: "pass", label: "Pass" },
              { value: "fail", label: "Fail" },
              { value: "hold", label: "Hold" },
            ]}
            sortKey=""
            onSortKeyChange={() => {}}
            sortOptions={[]}
            sortDir="asc"
            onSortDirChange={() => {}}
            pageSize={qcPageSize}
            onPageSizeChange={setQcPageSize}
            onExportCsv={() => {
              exportRowsToCsv(
                `furnicore-qc-${new Date().toISOString().slice(0, 10)}`,
                ["taskTitle", "inspectorName", "result", "remarks", "visibleToCustomer", "createdAt"],
                sortedQc.map((r) => ({
                  taskTitle: r.taskTitle ?? "",
                  inspectorName: r.inspectorName ?? "",
                  result: r.result,
                  remarks: r.remarks.replace(/\r?\n/g, " "),
                  visibleToCustomer: r.visibleToCustomer ? "yes" : "no",
                  createdAt: new Date(r.createdAt).toISOString(),
                })),
              );
              toast({ title: "Exported", description: `${sortedQc.length} QC remarks` });
            }}
            exportDisabled={sortedQc.length === 0}
            resultsText={
              qcTotal === 0
                ? "No QC remarks"
                : `Showing ${(safeQcPage - 1) * qcPageSize + 1}–${Math.min(safeQcPage * qcPageSize, qcTotal)} of ${qcTotal}`
            }
          />

          <Card>
            <CardContent className="p-0">
              {qcLoading ? (
                <div className="space-y-3 p-6">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : qcRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <FlaskConical className="mb-3 h-10 w-10" />
                  <p>No QC remarks recorded yet</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Task</TableHead>
                          <TableHead>Result</TableHead>
                          <TableHead>Remarks</TableHead>
                          <TableHead>Inspector</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-center">Customer visible</TableHead>
                          {canManage && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(qcRows as QcRemark[]).map((r) => {
                          const qcMeta = QC_RESULT[r.result];
                          const Icon = qcMeta?.icon ?? CheckCircle2;
                          return (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">{r.taskTitle ?? "—"}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={qcMeta?.variant as any}
                                  className={cn(
                                    "gap-1",
                                    r.result === "pass" && "bg-green-100 text-green-800",
                                  )}
                                >
                                  <Icon className="h-3 w-3" />
                                  {qcMeta?.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-[260px] truncate text-sm">
                                {r.remarks}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {r.inspectorName ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(r.createdAt).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-center">
                                <Switch
                                  checked={r.visibleToCustomer}
                                  disabled={!canManage}
                                  onCheckedChange={(v) =>
                                    updateQc.mutateAsync({ id: r.id, data: { visibleToCustomer: v } })
                                  }
                                  aria-label="Toggle customer visibility"
                                />
                              </TableCell>
                              {canManage && (
                                <TableCell className="text-right">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => deleteQcMut.mutateAsync(r.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePaginationBar
                    id={QC_TABLE_ID}
                    page={safeQcPage}
                    totalPages={qcTotalPages}
                    onPageChange={setQcPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ════════ TASK DETAIL DIALOG ════════ */}
      <TaskDetailDialog
        task={detailTask}
        open={!!detailTask}
        onClose={() => setDetailTask(null)}
      />

      {/* ════════ TASK EDIT/CREATE DIALOG ════════ */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTask ? "Edit task" : "New manufacturing task"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={taskForm.handleSubmit(submitTask)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="t-title">Title</Label>
                <Input id="t-title" {...taskForm.register("title", { required: true })} placeholder="e.g. Oak Desk Production Run" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="t-desc">Description</Label>
                <Input id="t-desc" {...taskForm.register("description")} placeholder="Brief description" />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Controller name="status" control={taskForm.control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="on_hold">On hold</SelectItem>
                      </SelectContent>
                    </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Controller name="priority" control={taskForm.control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label>Assign to</Label>
                <Controller name="assigneeId" control={taskForm.control} render={({ field }) => (
                  <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {(users as any[]).map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label>Linked product</Label>
                <Controller name="productId" control={taskForm.control} render={({ field }) => (
                  <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {(products as any[]).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-prog">Progress (%)</Label>
                <Input id="t-prog" type="number" min="0" max="100" {...taskForm.register("progress", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-hrs">Est. hours</Label>
                <Input id="t-hrs" type="number" step="0.5" {...taskForm.register("estimatedHours", { valueAsNumber: true })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="t-due">Due date</Label>
                <Input id="t-due" type="date" {...taskForm.register("dueDate")} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowTaskDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createTask.isPending || updateTask.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════════ PRODUCTION ORDER CREATE/EDIT DIALOG ════════ */}
      <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editOrder ? `Edit order ${editOrder.orderNumber}` : "New production order"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={orderForm.handleSubmit(submitOrder)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Product *</Label>
                <Controller name="productId" control={orderForm.control} rules={{ required: true }} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder="Select product…" /></SelectTrigger>
                    <SelectContent>
                      {(products as any[]).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.sku})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="o-qty">Quantity *</Label>
                <Input id="o-qty" type="number" min="1" {...orderForm.register("quantity", { valueAsNumber: true, required: true })} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Controller name="status" control={orderForm.control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="in_production">In Production</SelectItem>
                      <SelectItem value="quality_check">Quality Check</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label>Link to task (optional)</Label>
                <Controller name="taskId" control={orderForm.control} render={({ field }) => (
                  <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="No task linked" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {(tasks as any[]).map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="o-date">Target date</Label>
                <Input id="o-date" type="date" {...orderForm.register("targetDate")} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="o-notes">Notes</Label>
                <Input id="o-notes" {...orderForm.register("notes")} placeholder="Optional production notes" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowOrderDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createOrder.isPending || updateOrder.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
