import { useState, useMemo, useEffect } from "react";
import {
  useListManufacturingTasks,
  useCreateManufacturingTask,
  useUpdateManufacturingTask,
  useDeleteManufacturingTask,
  useGetManufacturingOverview,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Hammer, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "secondary" },
  in_progress: { label: "In Progress", color: "default" },
  completed: { label: "Completed", color: "outline" },
  on_hold: { label: "On Hold", color: "destructive" },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  critical: "destructive",
};

interface TaskForm {
  title: string;
  description: string;
  status: string;
  priority: string;
  progress: number;
  estimatedHours: number;
  dueDate: string;
}

const TABLE_ID = "mfg-tasks";

export default function ManufacturingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortKey, setSortKey] = useState("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data: tasks, isLoading } = useListManufacturingTasks();
  const { data: overview } = useGetManufacturingOverview();
  const createTask = useCreateManufacturingTask();
  const updateTask = useUpdateManufacturingTask();
  const deleteTask = useDeleteManufacturingTask();

  const { register, handleSubmit, control, reset, setValue } = useForm<TaskForm>({
    defaultValues: { status: "pending", priority: "medium", progress: 0, estimatedHours: 8 },
  });

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, priorityFilter, sortKey, sortDir, pageSize]);

  const rows = tasks ?? [];

  const sorted = useMemo(() => {
    return filterAndSortRows(rows, {
      search,
      match: (row: any, q: string) => {
        const qn = q.toLowerCase();
        const textMatch =
          !qn ||
          String(row.title ?? "").toLowerCase().includes(qn) ||
          String(row.description ?? "").toLowerCase().includes(qn);
        if (!textMatch) return false;
        if (statusFilter !== "all" && row.status !== statusFilter) return false;
        if (priorityFilter !== "all" && row.priority !== priorityFilter) return false;
        return true;
      },
      sortKey,
      sortDir,
      getSortValue: (row: any, key: string) => {
        switch (key) {
          case "progress":
            return Number(row.progress ?? 0);
          case "priority": {
            const order: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
            return order[row.priority] ?? 0;
          }
          case "status":
            return String(row.status ?? "");
          case "dueDate":
            return row.dueDate ? new Date(row.dueDate).getTime() : 0;
          default:
            return String(row.title ?? "");
        }
      },
    });
  }, [rows, search, statusFilter, priorityFilter, sortKey, sortDir]);

  const { pageRows, total, totalPages, page: safePage } = useMemo(
    () => paginateRows(sorted, page, pageSize),
    [sorted, page, pageSize],
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listManufacturingTasks"] });

  const exportCsv = () => {
    const headers = [
      "title",
      "status",
      "priority",
      "progress",
      "estimatedHours",
      "dueDate",
      "description",
    ];
    const data = sorted.map((t: any) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      progress: Number(t.progress ?? 0),
      estimatedHours: t.estimatedHours ?? "",
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : "",
      description: (t.description || "").replace(/\r?\n/g, " "),
    }));
    exportRowsToCsv(`furnicore-manufacturing-${new Date().toISOString().slice(0, 10)}`, headers, data);
    toast({ title: "Export started", description: `${data.length} rows exported.` });
  };

  const openCreate = () => {
    setEditItem(null);
    reset({
      title: "",
      description: "",
      status: "pending",
      priority: "medium",
      progress: 0,
      estimatedHours: 8,
      dueDate: "",
    });
    setShowDialog(true);
  };

  const openEdit = (t: any) => {
    setEditItem(t);
    setValue("title", t.title);
    setValue("description", t.description || "");
    setValue("status", t.status);
    setValue("priority", t.priority);
    setValue("progress", Number(t.progress));
    setValue("estimatedHours", Number(t.estimatedHours));
    setValue("dueDate", t.dueDate ? new Date(t.dueDate).toISOString().split("T")[0] : "");
    setShowDialog(true);
  };

  const onSubmit = async (data: TaskForm) => {
    try {
      if (editItem) {
        await updateTask.mutateAsync({ id: editItem.id, data });
        toast({ title: "Task updated" });
      } else {
        await createTask.mutateAsync({ data });
        toast({ title: "Task created" });
      }
      invalidate();
      setShowDialog(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this task?")) return;
    try {
      await deleteTask.mutateAsync({ id });
      toast({ title: "Task deleted" });
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manufacturing floor</h1>
          <p className="text-muted-foreground">Track production tasks and progress</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          New task
        </Button>
      </div>

      {overview && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Total tasks", value: overview.totalTasks },
            { label: "In progress", value: overview.inProgressTasks },
            { label: "Completed", value: overview.completedTasks },
            { label: "Avg completion", value: `${Math.round(overview.averageCompletion ?? 0)}%` },
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

      <TableToolbar
        id={TABLE_ID}
        entityLabel="tasks"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by title or description…"
        filterLabel="Status"
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={[
          { value: "all", label: "All statuses" },
          { value: "pending", label: "Pending" },
          { value: "in_progress", label: "In progress" },
          { value: "completed", label: "Completed" },
          { value: "on_hold", label: "On hold" },
        ]}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={[
          { value: "title", label: "Title" },
          { value: "status", label: "Status" },
          { value: "priority", label: "Priority" },
          { value: "progress", label: "Progress %" },
          { value: "dueDate", label: "Due date" },
        ]}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onExportCsv={exportCsv}
        exportDisabled={sorted.length === 0}
        resultsText={
          total === 0
            ? "No matching tasks"
            : `Showing ${from}–${to} of ${total} matching tasks · Filter priority below`
        }
        className="[&_.flex-wrap]:gap-2"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Label htmlFor={`${TABLE_ID}-priority`} className="text-sm text-muted-foreground shrink-0">
          Priority filter
        </Label>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger id={`${TABLE_ID}-priority`} className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : pageRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Hammer className="mb-3 h-10 w-10" aria-hidden />
          <p>No tasks match your filters</p>
        </div>
      ) : (
        <>
          <div className="space-y-3" role="feed" aria-label="Manufacturing tasks" aria-busy={isLoading}>
            {pageRows.map((t: any) => {
              const s = STATUS_MAP[t.status] || { label: t.status, color: "secondary" };
              const progress = Number(t.progress ?? 0);
              return (
                <article key={t.id} aria-labelledby={`task-title-${t.id}`}>
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <h2 id={`task-title-${t.id}`} className="text-base font-semibold">
                              {t.title}
                            </h2>
                            <Badge variant={s.color as any}>{s.label}</Badge>
                            <Badge variant={PRIORITY_COLORS[t.priority] as any} className="capitalize">
                              {t.priority}
                            </Badge>
                          </div>
                          {t.description && (
                            <p className="mb-3 text-sm text-muted-foreground">{t.description}</p>
                          )}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Progress</span>
                              <span className="tabular-nums">{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-2" aria-label={`Progress ${progress}%`} />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                            {t.estimatedHours ? (
                              <span className="tabular-nums">{Number(t.estimatedHours)}h estimated</span>
                            ) : null}
                            {t.dueDate ? (
                              <time dateTime={t.dueDate}>Due {new Date(t.dueDate).toLocaleDateString()}</time>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2 self-end sm:self-start">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Edit task ${t.title}`}
                            onClick={() => openEdit(t)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            aria-label={`Delete task ${t.title}`}
                            onClick={() => handleDelete(t.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </article>
              );
            })}
          </div>
          <TablePaginationBar
            id={TABLE_ID}
            page={safePage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit task" : "New manufacturing task"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="mfg-title">Title</Label>
                <Input id="mfg-title" {...register("title", { required: true })} placeholder="e.g. Oak Desk Production Run" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="mfg-desc">Description</Label>
                <Input id="mfg-desc" {...register("description")} placeholder="Brief task description" />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="on_hold">On hold</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Controller
                  name="priority"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mfg-prog">Progress (%)</Label>
                <Input id="mfg-prog" type="number" min="0" max="100" {...register("progress", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mfg-hours">Estimated hours</Label>
                <Input id="mfg-hours" type="number" step="0.5" {...register("estimatedHours", { valueAsNumber: true })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="mfg-due">Due date</Label>
                <Input id="mfg-due" type="date" {...register("dueDate")} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTask.isPending || updateTask.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
