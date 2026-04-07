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
import {
  useWorkerMe,
  useWorkerTasks,
  useUpdateWorkerTask,
  useWorkerAttendance,
  useWorkerPayroll,
  type WorkerTask,
  type PayrollBreakdown,
} from "@/hooks/use-worker-portal";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ClipboardList, CalendarDays, Banknote, CheckCircle2, Clock,
  AlertTriangle, ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  HardHat, Info, Play, CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const TASK_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:    { label: "Pending",     color: "bg-slate-100 text-slate-700",  icon: Clock       },
  in_progress:{ label: "In Progress", color: "bg-blue-100 text-blue-700",    icon: Play        },
  completed:  { label: "Completed",   color: "bg-green-100 text-green-700",  icon: CheckCheck  },
  on_hold:    { label: "On Hold",     color: "bg-amber-100 text-amber-700",  icon: AlertTriangle },
  cancelled:  { label: "Cancelled",   color: "bg-red-100 text-red-700",      icon: AlertTriangle },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:      { label: "Low",      color: "bg-slate-100 text-slate-600"    },
  medium:   { label: "Medium",   color: "bg-amber-100 text-amber-700"    },
  high:     { label: "High",     color: "bg-orange-100 text-orange-700"  },
  critical: { label: "Critical", color: "bg-red-100 text-red-700"        },
};

const ATTENDANCE_COLORS: Record<string, string> = {
  present:  "bg-green-100 text-green-700",
  absent:   "bg-red-100 text-red-700",
  late:     "bg-amber-100 text-amber-700",
  half_day: "bg-blue-100 text-blue-700",
};
const ATTENDANCE_LABELS: Record<string, string> = {
  present: "Present", absent: "Absent", late: "Late", half_day: "Half Day",
};

const fmt = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date() ;
}

/* ─── Profile header ─────────────────────────────────────────────────────── */

function ProfileCard() {
  const { data, isLoading } = useWorkerMe();

  if (isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;
  if (!data) return null;

  const { user, employee } = data;
  const initials = user.name?.slice(0, 2).toUpperCase() ?? "WK";

  return (
    <Card className="overflow-hidden">
      <div className="h-2 bg-gradient-to-r from-primary/70 to-primary" />
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        {/* Avatar */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xl font-bold text-primary">
          {initials}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold">{user.name}</h2>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          {employee && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Badge variant="secondary">{employee.department}</Badge>
              <Badge variant="outline">{employee.position}</Badge>
              {employee.hireDate && (
                <span className="text-xs text-muted-foreground self-center">
                  Since {new Date(employee.hireDate).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </div>
        {/* Status */}
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            employee?.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600",
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full", employee?.isActive ? "bg-green-500" : "bg-red-500")} />
            {employee?.isActive ? "Active" : "Inactive"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 1 — MY TASKS                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface UpdateTaskForm {
  status:      "in_progress" | "completed";
  progress:    number;
  actualHours: number;
}

function TaskUpdateDialog({ task, onClose }: { task: WorkerTask; onClose: () => void }) {
  const { toast } = useToast();
  const update    = useUpdateWorkerTask();

  const { register, handleSubmit, control, watch } = useForm<UpdateTaskForm>({
    defaultValues: {
      status:      task.status === "pending" ? "in_progress" : (task.status as "in_progress" | "completed"),
      progress:    task.progress,
      actualHours: task.actualHours ?? 0,
    },
  });

  const watchedStatus   = watch("status");
  const watchedProgress = watch("progress");

  const onSubmit = async (data: UpdateTaskForm) => {
    try {
      await update.mutateAsync({ id: task.id, ...data });
      toast({ title: "Task updated", description: `Status set to "${data.status.replace("_", " ")}"` });
      onClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">{task.title}</DialogTitle>
          {task.productName && <p className="text-sm text-muted-foreground">{task.productName}</p>}
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Status */}
          <div className="space-y-1">
            <Label>Update status *</Label>
            <Controller name="status" control={control} render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">
                    <span className="flex items-center gap-2">
                      <Play className="h-3.5 w-3.5 text-blue-500" aria-hidden /> In Progress
                    </span>
                  </SelectItem>
                  <SelectItem value="completed">
                    <span className="flex items-center gap-2">
                      <CheckCheck className="h-3.5 w-3.5 text-green-500" aria-hidden /> Completed
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            )} />
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="task-progress">Progress</Label>
              <span className="text-sm font-mono font-semibold tabular-nums">{watchedProgress}%</span>
            </div>
            <Input
              id="task-progress"
              type="range"
              min={0} max={100} step={5}
              className="h-2 cursor-pointer accent-primary"
              {...register("progress", { valueAsNumber: true })}
            />
            <Progress value={watchedProgress} className="h-2" />
            {watchedStatus === "completed" && watchedProgress < 100 && (
              <p className="text-xs text-amber-600">Tip: set progress to 100% when marking as completed.</p>
            )}
          </div>

          {/* Actual hours */}
          <div className="space-y-1">
            <Label htmlFor="task-hours">Actual hours worked</Label>
            <Input
              id="task-hours"
              type="number"
              step="0.5"
              min={0}
              {...register("actualHours", { valueAsNumber: true })}
            />
            {task.estimatedHours && (
              <p className="text-xs text-muted-foreground">Estimated: {task.estimatedHours}h</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save update"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MyTasksTab() {
  const { data: tasks = [], isLoading } = useWorkerTasks();
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [updateTask, setUpdateTask]     = useState<WorkerTask | null>(null);

  const filtered = tasks.filter((t) => {
    if (statusFilter === "active")    return t.status === "pending" || t.status === "in_progress";
    if (statusFilter === "completed") return t.status === "completed";
    if (statusFilter === "all")       return true;
    return true;
  });

  const pending    = tasks.filter((t) => t.status === "pending").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const completed  = tasks.filter((t) => t.status === "completed").length;
  const overdue    = tasks.filter((t) => isOverdue(t.dueDate) && t.status !== "completed").length;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Pending",     value: pending,    color: "text-slate-600"  },
          { label: "In Progress", value: inProgress, color: "text-blue-600"   },
          { label: "Completed",   value: completed,  color: "text-green-600"  },
          { label: "Overdue",     value: overdue,    color: "text-red-600"    },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { value: "active",    label: "Active" },
          { value: "completed", label: "Completed" },
          { value: "all",       label: "All" },
        ].map(({ value, label }) => (
          <Button
            key={value}
            size="sm"
            variant={statusFilter === value ? "default" : "outline"}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16 text-muted-foreground">
          <ClipboardList className="mb-3 h-10 w-10" aria-hidden />
          <p>No tasks in this category</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task) => {
            const statusCfg   = TASK_STATUS_CONFIG[task.status]   ?? { label: task.status, color: "bg-muted text-muted-foreground", icon: Clock };
            const priorityCfg = PRIORITY_CONFIG[task.priority]   ?? { label: task.priority, color: "bg-muted text-muted-foreground" };
            const overdue     = isOverdue(task.dueDate) && task.status !== "completed";
            const StatusIcon  = statusCfg.icon;

            return (
              <Card key={task.id} className={cn("transition-shadow hover:shadow-md", overdue && "border-red-200")}>
                <CardContent className="p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    {/* Left: content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold leading-tight">{task.title}</h3>
                        {overdue && (
                          <Badge className="bg-red-100 text-red-700 text-[10px]">
                            <AlertTriangle className="mr-0.5 h-3 w-3" aria-hidden /> Overdue
                          </Badge>
                        )}
                      </div>
                      {task.productName && (
                        <p className="text-xs text-muted-foreground mb-2">Product: {task.productName}</p>
                      )}
                      {task.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{task.description}</p>
                      )}

                      {/* Meta badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <Badge className={cn("text-[11px]", statusCfg.color)}>
                          <StatusIcon className="mr-1 h-3 w-3" aria-hidden />
                          {statusCfg.label}
                        </Badge>
                        <Badge className={cn("text-[11px]", priorityCfg.color)}>
                          {priorityCfg.label} priority
                        </Badge>
                        {task.dueDate && (
                          <Badge variant="outline" className={cn("text-[11px]", overdue && "border-red-300 text-red-600")}>
                            Due {new Date(task.dueDate).toLocaleDateString()}
                          </Badge>
                        )}
                        {task.estimatedHours !== null && (
                          <Badge variant="outline" className="text-[11px]">
                            Est. {task.estimatedHours}h
                            {task.actualHours !== null && ` · Actual ${task.actualHours}h`}
                          </Badge>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Progress</span>
                          <span className="font-mono font-medium tabular-nums">{task.progress}%</span>
                        </div>
                        <Progress value={task.progress} className="h-2" />
                      </div>
                    </div>

                    {/* Right: action button */}
                    {task.status !== "completed" && task.status !== "cancelled" && (
                      <div className="shrink-0 pt-0.5">
                        <Button
                          size="sm"
                          onClick={() => setUpdateTask(task)}
                          className="w-full sm:w-auto"
                        >
                          <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          Update
                        </Button>
                      </div>
                    )}
                    {task.status === "completed" && (
                      <div className="shrink-0 pt-1">
                        <div className="flex items-center gap-1 text-xs font-medium text-green-600">
                          <CheckCircle2 className="h-4 w-4" aria-hidden />
                          Done
                        </div>
                        {task.completedAt && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(task.completedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {updateTask && (
        <TaskUpdateDialog task={updateTask} onClose={() => setUpdateTask(null)} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 2 — ATTENDANCE                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

function AttendanceTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  const { data, isLoading } = useWorkerAttendance(month, year);

  const summary        = data?.summary;
  const records        = data?.records ?? [];
  const penaltyPreview = data?.penaltyPreview;

  return (
    <div className="space-y-4">
      {/* Month / year picker */}
      <div className="flex items-center gap-3">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS_SHORT.map((m, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[now.getFullYear() - 1, now.getFullYear()].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data?.message && !summary && (
        <Alert>
          <Info className="h-4 w-4" aria-hidden />
          <AlertDescription>{data.message}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : summary ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { key: "present",  label: "Present",  color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20" },
              { key: "absent",   label: "Absent",   color: "text-red-600",   bg: "bg-red-50 dark:bg-red-950/20"    },
              { key: "late",     label: "Late",     color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20"},
              { key: "halfDay",  label: "Half Day", color: "text-blue-600",  bg: "bg-blue-50 dark:bg-blue-950/20"  },
            ].map(({ key, label, color, bg }) => (
              <div key={key} className={cn("rounded-xl p-4 text-center", bg)}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("text-3xl font-bold tabular-nums mt-1", color)}>{(summary as any)[key]}</p>
              </div>
            ))}
          </div>

          {/* Attendance rate bar */}
          {summary.attendanceRate !== null && (
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Attendance Rate</span>
                  <span className={cn(
                    "text-sm font-bold tabular-nums",
                    summary.attendanceRate >= 90 ? "text-green-600" : summary.attendanceRate >= 75 ? "text-amber-600" : "text-red-600",
                  )}>{summary.attendanceRate}%</span>
                </div>
                <Progress
                  value={summary.attendanceRate}
                  className={cn("h-3", summary.attendanceRate >= 90 ? "[&>div]:bg-green-500" : summary.attendanceRate >= 75 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500")}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {summary.totalHours > 0 && `${summary.totalHours} total hours logged · `}
                  {summary.totalRecords} records this month
                </p>
              </CardContent>
            </Card>
          )}

          {/* Penalty preview (informational) */}
          {penaltyPreview && penaltyPreview.total > 0 && (
            <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
              <AlertDescription className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300 mb-1">
                  Estimated attendance deductions for this month
                </p>
                <div className="space-y-0.5 text-amber-700 dark:text-amber-400 text-xs">
                  {penaltyPreview.absentPenalty  > 0 && <p>Absent: −{fmt(penaltyPreview.absentPenalty)}</p>}
                  {penaltyPreview.latePenalty    > 0 && <p>Late: −{fmt(penaltyPreview.latePenalty)}</p>}
                  {penaltyPreview.halfDayPenalty > 0 && <p>Half days: −{fmt(penaltyPreview.halfDayPenalty)}</p>}
                  <p className="font-semibold border-t border-amber-200 pt-1 mt-1">
                    Estimated total deduction: −{fmt(penaltyPreview.total)}
                  </p>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  This is a preview. Actual deductions are applied when payroll is generated. Contact HR for discrepancies.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Records table */}
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-12 text-muted-foreground">
              <CalendarDays className="mb-3 h-10 w-10" aria-hidden />
              <p>No attendance records for {MONTHS_SHORT[month - 1]} {year}</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-left text-xs font-semibold text-muted-foreground">
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Hours</th>
                        <th className="px-4 py-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.date}</td>
                          <td className="px-4 py-3">
                            <Badge className={cn("text-[11px]", ATTENDANCE_COLORS[r.status])}>
                              {ATTENDANCE_LABELS[r.status] ?? r.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {r.hoursWorked ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">
                            {r.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 3 — MY PAYROLL                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

function PayslipBreakdown({ bd }: { bd: PayrollBreakdown }) {
  const att = bd.attendance;
  return (
    <div className="mt-3 space-y-3 text-sm">
      {/* Formula */}
      <div className="rounded-lg bg-muted/40 px-4 py-3 font-mono text-xs">
        <span className="font-sans font-medium text-muted-foreground mr-2">Net =</span>
        {fmt(bd.monthlyBase)}
        {bd.totalBonus > 0     && <span className="text-green-600"> + {fmt(bd.totalBonus)}</span>}
        {bd.totalDeductions > 0 && <span className="text-red-600"> − {fmt(bd.totalDeductions)}</span>}
        <span className="ml-1 font-semibold"> = {fmt(bd.netSalary)}</span>
        <span className="ml-2 font-sans text-[10px] text-muted-foreground">
          (daily rate: {fmt(bd.dayRate)})
        </span>
      </div>

      {/* Attendance breakdown */}
      {att.totalAttendancePenalty > 0 && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-xs dark:bg-red-950/20 space-y-1">
          <p className="font-semibold text-red-700 dark:text-red-400">Attendance deductions</p>
          {att.absentPenalty  > 0 && <p className="text-red-600 flex justify-between"><span>{att.absent} absent × {fmt(bd.dayRate)}</span><span>−{fmt(att.absentPenalty)}</span></p>}
          {att.latePenalty    > 0 && <p className="text-red-600 flex justify-between"><span>{att.late} late × {fmt(bd.dayRate * 0.25)}</span><span>−{fmt(att.latePenalty)}</span></p>}
          {att.halfDayPenalty > 0 && <p className="text-red-600 flex justify-between"><span>{att.halfDay} half-days × {fmt(bd.dayRate * 0.5)}</span><span>−{fmt(att.halfDayPenalty)}</span></p>}
        </div>
      )}

      {/* Bonuses */}
      {bd.bonusAdjustments.length > 0 && (
        <div className="space-y-1">
          {bd.bonusAdjustments.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md bg-green-50 px-3 py-1.5 text-xs dark:bg-green-950/20">
              <span className="text-green-700 dark:text-green-400">
                <TrendingUp className="mr-1 inline h-3 w-3" aria-hidden />Bonus: {a.reason}
              </span>
              <span className="font-mono font-semibold text-green-700 dark:text-green-400">+{fmt(a.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Penalty adjustments */}
      {bd.penaltyAdjustments.length > 0 && (
        <div className="space-y-1">
          {bd.penaltyAdjustments.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md bg-red-50 px-3 py-1.5 text-xs dark:bg-red-950/20">
              <span className="text-red-700 dark:text-red-400">
                <TrendingDown className="mr-1 inline h-3 w-3" aria-hidden />Penalty: {a.reason}
              </span>
              <span className="font-mono font-semibold text-red-700 dark:text-red-400">−{fmt(a.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MyPayrollTab() {
  const { data, isLoading } = useWorkerPayroll();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const records      = data?.records ?? [];
  const annualSalary = data?.annualSalary ?? 0;

  return (
    <div className="space-y-4">
      {data?.message && records.length === 0 && (
        <Alert>
          <Info className="h-4 w-4" aria-hidden />
          <AlertDescription>{data.message}</AlertDescription>
        </Alert>
      )}

      {/* Annual salary header */}
      {annualSalary > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
              <Banknote className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Annual Salary (Gross)</p>
              <p className="text-xl font-bold tabular-nums text-primary">{fmt(annualSalary)}</p>
              <p className="text-xs text-muted-foreground">Monthly base ≈ {fmt(annualSalary / 12)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i=><Skeleton key={i} className="h-20 w-full"/>)}</div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-14 text-muted-foreground">
          <Banknote className="mb-3 h-10 w-10" aria-hidden />
          <p>No payroll records yet</p>
          <p className="mt-1 text-xs">Contact HR if you expect payslips to appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((p) => {
            const isExpanded = expandedId === p.id;
            return (
              <Card key={p.id} className={cn("overflow-hidden transition-shadow hover:shadow-sm", p.status === "approved" && "border-green-100")}>
                <CardContent className="p-0">
                  {/* Header row */}
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-xs font-bold">
                        {MONTHS_SHORT[p.month - 1]}<br/>{String(p.year).slice(2)}
                      </div>
                      <div>
                        <p className="font-semibold">{MONTHS_SHORT[p.month - 1]} {p.year}</p>
                        <p className="text-xs text-muted-foreground">
                          Base {fmt(p.baseSalary)}
                          {p.bonus > 0        && <span className="text-green-600"> + {fmt(p.bonus)}</span>}
                          {p.deductions > 0   && <span className="text-red-600"> − {fmt(p.deductions)}</span>}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-lg font-bold tabular-nums">{fmt(p.netSalary)}</p>
                        <Badge className={cn("text-[10px]", p.status === "approved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                          {p.status === "approved" ? "Paid" : "Pending"}
                        </Badge>
                      </div>
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />}
                    </div>
                  </button>

                  {/* Breakdown */}
                  {isExpanded && (
                    <div className="border-t bg-muted/10 px-4 pb-4">
                      {p.breakdown ? (
                        <PayslipBreakdown bd={p.breakdown} />
                      ) : (
                        <p className="py-3 text-xs text-muted-foreground flex items-center gap-2">
                          <Info className="h-3.5 w-3.5" aria-hidden />
                          No detailed breakdown available for this period. Contact HR for details.
                        </p>
                      )}
                      {p.paidAt && (
                        <p className="mt-3 text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Paid on {new Date(p.paidAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground pt-2">
        All payroll data is read-only. For corrections or queries, please contact HR.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function WorkerPortalPage() {
  const [activeTab, setActiveTab] = useState("tasks");
  const { data: tasks = [] }  = useWorkerTasks();
  const activeTaskCount = tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length;

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <ProfileCard />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="tasks" className="relative gap-1.5">
            <ClipboardList className="h-4 w-4" aria-hidden />
            My Tasks
            {activeTaskCount > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground tabular-nums">
                {activeTaskCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="payroll" className="gap-1.5">
            <Banknote className="h-4 w-4" aria-hidden />
            My Payroll
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks"      className="mt-4"><MyTasksTab /></TabsContent>
        <TabsContent value="attendance" className="mt-4"><AttendanceTab /></TabsContent>
        <TabsContent value="payroll"    className="mt-4"><MyPayrollTab /></TabsContent>
      </Tabs>
    </div>
  );
}
