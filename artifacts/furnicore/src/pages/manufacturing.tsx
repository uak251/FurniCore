import { useState } from "react";
import { useListManufacturingTasks, useCreateManufacturingTask, useUpdateManufacturingTask, useDeleteManufacturingTask, useGetManufacturingOverview } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Hammer, Search, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";

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

export default function ManufacturingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data: tasks, isLoading } = useListManufacturingTasks();
  const { data: overview } = useGetManufacturingOverview();
  const createTask = useCreateManufacturingTask();
  const updateTask = useUpdateManufacturingTask();
  const deleteTask = useDeleteManufacturingTask();

  const { register, handleSubmit, control, reset, setValue } = useForm<TaskForm>({
    defaultValues: { status: "pending", priority: "medium", progress: 0, estimatedHours: 8 }
  });

  const filtered = (tasks ?? []).filter((t: any) =>
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listManufacturingTasks"] });

  const openCreate = () => {
    setEditItem(null);
    reset({ title: "", description: "", status: "pending", priority: "medium", progress: 0, estimatedHours: 8, dueDate: "" });
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manufacturing Floor</h1>
          <p className="text-muted-foreground">Track production tasks and progress</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Tasks", value: overview.totalTasks },
            { label: "In Progress", value: overview.inProgressTasks },
            { label: "Completed", value: overview.completedTasks },
            { label: "Avg Completion", value: `${Math.round(overview.averageCompletion ?? 0)}%` },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="space-y-3">
        {isLoading ? (
          [1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Hammer className="h-10 w-10 mb-3" />
            <p>No manufacturing tasks found</p>
          </div>
        ) : filtered.map((t: any) => {
          const s = STATUS_MAP[t.status] || { label: t.status, color: "secondary" };
          const progress = Number(t.progress ?? 0);
          return (
            <Card key={t.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-base">{t.title}</h3>
                      <Badge variant={s.color as any}>{s.label}</Badge>
                      <Badge variant={PRIORITY_COLORS[t.priority] as any} className="capitalize">{t.priority}</Badge>
                    </div>
                    {t.description && <p className="text-sm text-muted-foreground mb-3">{t.description}</p>}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      {t.estimatedHours && <span>{Number(t.estimatedHours)}h estimated</span>}
                      {t.dueDate && <span>Due {new Date(t.dueDate).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Task" : "New Manufacturing Task"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Title</Label>
                <Input {...register("title", { required: true })} placeholder="e.g. Oak Desk Production Run" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description</Label>
                <Input {...register("description")} placeholder="Brief task description" />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Controller name="status" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Controller name="priority" control={control} render={({ field }) => (
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
                <Label>Progress (%)</Label>
                <Input type="number" min="0" max="100" {...register("progress", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label>Estimated Hours</Label>
                <Input type="number" step="0.5" {...register("estimatedHours", { valueAsNumber: true })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Due Date</Label>
                <Input type="date" {...register("dueDate")} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createTask.isPending || updateTask.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
