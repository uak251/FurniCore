import { useState, useMemo, useEffect } from "react";
import {
  useListEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useRecordAttendance,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAttendance,
  useUpdateAttendance,
  useDeleteAttendance,
  useAttendanceSummary,
  usePerformanceReviews,
  useCreatePerformanceReview,
  useUpdatePerformanceReview,
  useDeletePerformanceReview,
  type PerformanceReview,
  type AttendanceRecord,
} from "@/hooks/use-hr-portal";

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
import {
  Users, ClipboardList, Plus, Pencil, Trash2,
  Star, BarChart3, TrendingUp, CalendarDays, CheckCircle,
  AlertTriangle, Clock, UserCheck, UserX, Banknote,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";
import { cn } from "@/lib/utils";

/* ─── Shared helpers ─────────────────────────────────────────────────────────── */

function apiErrorMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const resp = (e as any).response;
    if (resp?.data) {
      const d = resp.data;
      if (typeof d === "string" && !d.startsWith("<!")) return d;
      if (d.message) return d.message;
      if (d.error)   return d.error;
    }
    if ((e as any).message) return (e as any).message;
  }
  return "Something went wrong. Please try again.";
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_COLORS: Record<string, string> = {
  present:  "bg-green-100 text-green-800",
  absent:   "bg-red-100 text-red-800",
  late:     "bg-amber-100 text-amber-800",
  half_day: "bg-blue-100 text-blue-800",
};
const STATUS_LABELS: Record<string, string> = {
  present: "Present", absent: "Absent", late: "Late", half_day: "Half Day",
};

function StarRating({ value, max = 5, onChange }: { value: number; max?: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange?.(i + 1)}
          className={cn(
            "h-5 w-5 transition-colors",
            onChange ? "cursor-pointer hover:scale-110" : "cursor-default",
          )}
          aria-label={`${i + 1} star${i + 1 !== 1 ? "s" : ""}`}
        >
          <Star
            className={cn(
              "h-5 w-5",
              i < value
                ? "fill-amber-400 text-amber-400"
                : "fill-muted text-muted-foreground",
            )}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}

const RATING_COLORS: Record<number, string> = {
  5: "text-green-600",
  4: "text-blue-600",
  3: "text-amber-600",
  2: "text-orange-600",
  1: "text-red-600",
};
const RATING_LABELS: Record<number, string> = {
  5: "Exceptional",
  4: "Exceeds expectations",
  3: "Meets expectations",
  2: "Below expectations",
  1: "Unsatisfactory",
};

/* ─── KPI card ────────────────────────────────────────────────────────────────── */

function KpiCard({
  icon: Icon, label, value, sub, accentClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accentClass?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <div className={cn("rounded-lg p-2", accentClass ?? "bg-primary/10")}>
          <Icon className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════ */
/*  TAB 1 — OVERVIEW                                                               */
/* ═══════════════════════════════════════════════════════════════════════════════ */

function OverviewTab({ onTabChange }: { onTabChange: (t: string) => void }) {
  const now = new Date();
  const { data: employees }        = useListEmployees();
  const { data: attendanceData }   = useAttendanceSummary(now.getMonth() + 1, now.getFullYear());
  const { data: reviews }          = usePerformanceReviews();

  const active   = (employees ?? []).filter((e: any) => e.isActive).length;
  const inactive = (employees ?? []).filter((e: any) => !e.isActive).length;

  // Attendance rate this month
  const summary = attendanceData?.summary ?? [];
  const totalRecords  = summary.reduce((s, r) => s + r.totalRecords, 0);
  const totalPresent  = summary.reduce((s, r) => s + r.present, 0);
  const attRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;

  // Attendance issues (employees with absences or lates)
  const issues = summary
    .filter((r) => r.absent > 0 || r.late > 0)
    .sort((a, b) => (b.absent + b.late) - (a.absent + a.late))
    .slice(0, 5);

  // Department breakdown
  const byDept: Record<string, number> = {};
  for (const e of employees ?? []) {
    const d = (e as any).department || "Unassigned";
    byDept[d] = (byDept[d] ?? 0) + 1;
  }

  // Recent reviews
  const recentReviews = (reviews ?? []).slice(0, 4);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard icon={Users}      label="Total Employees"   value={active}   sub={`${inactive} inactive`}             accentClass="bg-blue-50 dark:bg-blue-950/30" />
        <KpiCard icon={UserCheck}  label="Attendance Rate"   value={`${attRate}%`} sub={`${MONTHS_SHORT[now.getMonth()]} ${now.getFullYear()}`} accentClass={attRate >= 90 ? "bg-green-50 dark:bg-green-950/30" : "bg-amber-50 dark:bg-amber-950/30"} />
        <KpiCard icon={ClipboardList} label="Reviews This Month" value={(reviews ?? []).filter((r) => r.period.includes(String(now.getFullYear()))).length} sub="performance evaluations" accentClass="bg-purple-50 dark:bg-purple-950/30" />
        <KpiCard icon={Banknote}   label="Pending Payroll"   value="—"        sub="Go to Payroll tab"                  accentClass="bg-orange-50 dark:bg-orange-950/30" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Attendance issues */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
              Attendance Issues — {MONTHS_SHORT[now.getMonth()]}
            </CardTitle>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => onTabChange("attendance")}>
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {issues.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No attendance issues this month
              </p>
            ) : (
              <div className="space-y-3">
                {issues.map((row) => (
                  <div key={row.employeeId} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{row.employeeName}</p>
                      <p className="text-xs text-muted-foreground">{row.department}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.absent > 0 && (
                        <Badge className={STATUS_COLORS.absent}>{row.absent} absent</Badge>
                      )}
                      {row.late > 0 && (
                        <Badge className={STATUS_COLORS.late}>{row.late} late</Badge>
                      )}
                      {row.totalPenalty > 0 && (
                        <span className="text-xs font-mono text-destructive">
                          −{fmt(row.totalPenalty)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Department breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">By Department</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(byDept)
              .sort(([, a], [, b]) => b - a)
              .map(([dept, count]) => (
                <div key={dept}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="truncate font-medium">{dept}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {count} / {active}
                    </span>
                  </div>
                  <Progress value={(count / Math.max(active, 1)) * 100} className="h-1.5" />
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent reviews */}
      {recentReviews.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Star className="h-4 w-4 text-amber-400" aria-hidden />
              Recent Performance Reviews
            </CardTitle>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => onTabChange("performance")}>
              View all
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {recentReviews.map((r) => (
                <div key={r.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{r.employeeName}</p>
                    <p className="text-xs text-muted-foreground">{r.period}</p>
                  </div>
                  <div className="text-right">
                    <StarRating value={r.overallRating} />
                    <p className={cn("text-[10px] mt-0.5", RATING_COLORS[r.overallRating])}>
                      {RATING_LABELS[r.overallRating]}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════ */
/*  TAB 2 — EMPLOYEES                                                              */
/* ═══════════════════════════════════════════════════════════════════════════════ */

interface EmployeeForm {
  name: string; email: string; phone: string;
  department: string; position: string;
  baseSalary: number; hireDate: string; isActive: boolean;
}
interface AttendanceForm {
  employeeId: number; date: string; status: string; hoursWorked: number; notes: string;
}

function EmployeesTab() {
  const { toast }  = useToast();
  const qc         = useQueryClient();
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey]   = useState("name");
  const [sortDir, setSortDir]   = useState<SortDir>("asc");
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showEmpDialog, setShowEmpDialog]   = useState(false);
  const [showAttDialog, setShowAttDialog]   = useState(false);
  const [editItem, setEditItem]             = useState<any>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  const { data: employees, isLoading } = useListEmployees();
  const createEmployee  = useCreateEmployee();
  const updateEmployee  = useUpdateEmployee();
  const deleteEmployee  = useDeleteEmployee();
  const recordAttendance = useRecordAttendance();

  const empForm = useForm<EmployeeForm>({ defaultValues: { isActive: true, baseSalary: 0 } });
  const attForm = useForm<AttendanceForm>({ defaultValues: { status: "present", hoursWorked: 8 } });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["listEmployees"] });

  useEffect(() => { setPage(1); }, [search, statusFilter, sortKey, sortDir, pageSize]);

  const rows = employees ?? [];
  const sorted = useMemo(() => filterAndSortRows(rows, {
    search,
    match: (row: any, q: string) => {
      const qn = q.toLowerCase();
      const ok = !qn || row.name.toLowerCase().includes(qn) ||
        (row.department || "").toLowerCase().includes(qn) ||
        (row.position   || "").toLowerCase().includes(qn);
      if (!ok) return false;
      if (statusFilter === "active")   return row.isActive;
      if (statusFilter === "inactive") return !row.isActive;
      return true;
    },
    sortKey, sortDir,
    getSortValue: (row: any, k: string) => {
      if (k === "department") return String(row.department ?? "");
      if (k === "position")   return String(row.position ?? "");
      if (k === "baseSalary") return Number(row.baseSalary);
      if (k === "hireDate")   return row.hireDate ? new Date(row.hireDate).getTime() : 0;
      return String(row.name ?? "");
    },
  }), [rows, search, statusFilter, sortKey, sortDir]);

  const { pageRows, total, totalPages, page: safePage } = useMemo(
    () => paginateRows(sorted, page, pageSize), [sorted, page, pageSize]);
  useEffect(() => { if (safePage !== page) setPage(safePage); }, [safePage, page]);

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to   = Math.min(safePage * pageSize, total);

  const exportCsv = () => {
    exportRowsToCsv(`furnicore-employees-${new Date().toISOString().slice(0, 10)}`,
      ["name","email","phone","department","position","baseSalary","hireDate","isActive"],
      sorted.map((e: any) => ({
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
    empForm.reset({ name:"", email:"", phone:"", department:"", position:"", baseSalary:0, hireDate:"", isActive:true });
    setShowEmpDialog(true);
  };
  const openEdit = (e: any) => {
    setEditItem(e);
    empForm.reset({
      name: e.name, email: e.email||"", phone: e.phone||"",
      department: e.department||"", position: e.position||"",
      baseSalary: Number(e.baseSalary),
      hireDate: e.hireDate ? new Date(e.hireDate).toISOString().split("T")[0] : "",
      isActive: e.isActive,
    });
    setShowEmpDialog(true);
  };
  const openAttendance = (e: any) => {
    setSelectedEmployee(e);
    attForm.reset({ employeeId: e.id, date: new Date().toISOString().split("T")[0], status:"present", hoursWorked:8, notes:"" });
    setShowAttDialog(true);
  };

  const onSubmitEmployee = async (data: EmployeeForm) => {
    try {
      if (editItem) { await updateEmployee.mutateAsync({ id: editItem.id, data }); toast({ title: "Employee updated" }); }
      else          { await createEmployee.mutateAsync({ data });                   toast({ title: "Employee created" }); }
      invalidate(); setShowEmpDialog(false);
    } catch (e) { toast({ variant:"destructive", title:"Error", description: apiErrorMessage(e) }); }
  };
  const onSubmitAttendance = async (data: AttendanceForm) => {
    try {
      await recordAttendance.mutateAsync({ data });
      toast({ title: "Attendance recorded" });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["attendanceSummary"] });
      setShowAttDialog(false);
    } catch (e) { toast({ variant:"destructive", title:"Error", description: apiErrorMessage(e) }); }
  };
  const handleDeactivate = async (id: number) => {
    if (!confirm("Deactivate this employee? They can be reactivated later via Edit.")) return;
    try { await deleteEmployee.mutateAsync({ id }); toast({ title: "Employee deactivated" }); invalidate(); }
    catch (e) { toast({ variant:"destructive", title:"Error", description: apiErrorMessage(e) }); }
  };
  const handleReactivate = async (emp: any) => {
    try {
      await updateEmployee.mutateAsync({ id: emp.id, data: { isActive: true } });
      toast({ title: "Employee reactivated" });
      invalidate();
    } catch (e) { toast({ variant:"destructive", title:"Error", description: apiErrorMessage(e) }); }
  };

  return (
    <div className="space-y-4">
      <TableToolbar
        id="hr-employees"
        entityLabel="employees"
        searchValue={search} onSearchChange={setSearch}
        searchPlaceholder="Search by name, department, or position…"
        filterLabel="Status" filterValue={statusFilter} onFilterChange={setStatusFilter}
        filterOptions={[{value:"all",label:"All"},{value:"active",label:"Active"},{value:"inactive",label:"Inactive"}]}
        sortKey={sortKey} onSortKeyChange={setSortKey}
        sortOptions={[
          {value:"name",label:"Name"},{value:"department",label:"Department"},
          {value:"position",label:"Position"},{value:"baseSalary",label:"Salary"},{value:"hireDate",label:"Hire date"},
        ]}
        sortDir={sortDir} onSortDirChange={setSortDir}
        pageSize={pageSize} onPageSizeChange={setPageSize}
        onExportCsv={exportCsv} exportDisabled={sorted.length===0}
        resultsText={total===0 ? "No matching employees" : `Showing ${from}–${to} of ${total}`}
      >
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Add employee
        </Button>
      </TableToolbar>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">{[1,2,3,4].map(i=><Skeleton key={i} className="h-14 w-full"/>)}</div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="mb-3 h-10 w-10" aria-hidden />
              <p>No employees match your filters</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Name</TableHead>
                      <TableHead scope="col">Department</TableHead>
                      <TableHead scope="col">Position</TableHead>
                      <TableHead scope="col" className="text-right">Annual Salary</TableHead>
                      <TableHead scope="col">Hired</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col" className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <p className="font-medium">{e.name}</p>
                          <p className="text-xs text-muted-foreground">{e.email}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.department||"—"}</TableCell>
                        <TableCell className="text-muted-foreground">{e.position||"—"}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {fmt(Number(e.baseSalary))}/yr
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {e.hireDate ? new Date(e.hireDate).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={e.isActive ? "default" : "outline"} className={e.isActive ? "bg-green-100 text-green-800" : ""}>
                            {e.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" aria-label={`Record attendance for ${e.name}`} onClick={() => openAttendance(e)}>
                              <ClipboardList className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" aria-label={`Edit ${e.name}`} onClick={() => openEdit(e)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {e.isActive ? (
                              <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Deactivate ${e.name}`} onClick={() => handleDeactivate(e.id)}>
                                <UserX className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" className="text-green-600" aria-label={`Reactivate ${e.name}`} onClick={() => handleReactivate(e)}>
                                <UserCheck className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePaginationBar id="hr-employees" page={safePage} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Employee dialog */}
      <Dialog open={showEmpDialog} onOpenChange={setShowEmpDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem ? "Edit employee" : "Add employee"}</DialogTitle></DialogHeader>
          <form onSubmit={empForm.handleSubmit(onSubmitEmployee)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="emp-name">Full name *</Label>
                <Input id="emp-name" {...empForm.register("name", { required: true })} placeholder="Alice Johnson" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emp-email">Email</Label>
                <Input id="emp-email" type="email" {...empForm.register("email")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emp-phone">Phone</Label>
                <Input id="emp-phone" {...empForm.register("phone")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emp-dept">Department</Label>
                <Input id="emp-dept" {...empForm.register("department")} placeholder="Manufacturing" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emp-pos">Position</Label>
                <Input id="emp-pos" {...empForm.register("position")} placeholder="Senior Craftsman" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emp-sal">Annual salary ($)</Label>
                <Input id="emp-sal" type="number" {...empForm.register("baseSalary", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emp-hire">Hire date</Label>
                <Input id="emp-hire" type="date" {...empForm.register("hireDate")} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch id="emp-active" checked={empForm.watch("isActive")} onCheckedChange={(v) => empForm.setValue("isActive", v)} />
                <Label htmlFor="emp-active">Active employee</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowEmpDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createEmployee.isPending || updateEmployee.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Attendance quick-entry dialog */}
      <Dialog open={showAttDialog} onOpenChange={setShowAttDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record attendance — {selectedEmployee?.name}</DialogTitle></DialogHeader>
          <form onSubmit={attForm.handleSubmit(onSubmitAttendance)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="att-date">Date</Label>
                <Input id="att-date" type="date" {...attForm.register("date", { required: true })} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Controller name="status" control={attForm.control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                      <SelectItem value="late">Late</SelectItem>
                      <SelectItem value="half_day">Half day</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="att-hours">Hours worked</Label>
                <Input id="att-hours" type="number" step="0.5" {...attForm.register("hoursWorked", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="att-notes">Notes</Label>
                <Input id="att-notes" {...attForm.register("notes")} placeholder="Optional" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowAttDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={recordAttendance.isPending}>Record</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════ */
/*  TAB 3 — ATTENDANCE                                                             */
/* ═══════════════════════════════════════════════════════════════════════════════ */

function AttendanceTab() {
  const { toast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [empFilter, setEmpFilter]       = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editRecord, setEditRecord]     = useState<AttendanceRecord | null>(null);

  const { data: employees }     = useListEmployees();
  const { data: records = [], isLoading } = useListAttendance({ month, year });
  const { data: summary }       = useAttendanceSummary(month, year);
  const updateAtt = useUpdateAttendance();
  const deleteAtt = useDeleteAttendance();

  const filteredRecords = useMemo(() => {
    let r = records;
    if (empFilter !== "all")    r = r.filter((x) => x.employeeId === Number(empFilter));
    if (statusFilter !== "all") r = r.filter((x) => x.status === statusFilter);
    return r.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [records, empFilter, statusFilter]);

  // Totals for the filtered set
  const totals = useMemo(() => ({
    present:  filteredRecords.filter((r) => r.status === "present").length,
    absent:   filteredRecords.filter((r) => r.status === "absent").length,
    late:     filteredRecords.filter((r) => r.status === "late").length,
    halfDay:  filteredRecords.filter((r) => r.status === "half_day").length,
  }), [filteredRecords]);

  const penaltyRules = summary?.penaltyRules;

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this attendance record?")) return;
    try { await deleteAtt.mutateAsync(id); toast({ title: "Deleted" }); }
    catch (e) { toast({ variant:"destructive", title:"Error", description: apiErrorMessage(e) }); }
  };

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS_SHORT.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All employees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            {(employees ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="present">Present</SelectItem>
            <SelectItem value="absent">Absent</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="half_day">Half Day</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm" variant="outline"
          onClick={() => exportRowsToCsv(
            `attendance-${month}-${year}`,
            ["employee","department","date","status","hours","notes"],
            filteredRecords.map(r => ({ employee: r.employeeName, department: r.department, date: r.date, status: r.status, hours: r.hoursWorked ?? "", notes: r.notes ?? "" })),
          )}
        >
          Export CSV
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { key: "present", label: "Present", color: "text-green-600" },
          { key: "absent",  label: "Absent",  color: "text-red-600"   },
          { key: "late",    label: "Late",    color: "text-amber-600" },
          { key: "halfDay", label: "Half Day",color: "text-blue-600"  },
        ].map(({ key, label, color }) => (
          <div key={key} className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn("text-2xl font-bold tabular-nums", color)}>{(totals as any)[key]}</p>
          </div>
        ))}
      </div>

      {/* Penalty rules reference */}
      {penaltyRules && (
        <div className="rounded-lg border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Penalty rules: </span>
          Absent = {penaltyRules.absentRate} · Late = {penaltyRules.lateRate} · Half Day = {penaltyRules.halfDayRate}
          <span className="ml-2 text-[10px]">(Daily rate: {penaltyRules.dailyRate})</span>
        </div>
      )}

      {/* Records table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">{[1,2,3,4].map(i=><Skeleton key={i} className="h-12 w-full"/>)}</div>
          ) : filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CalendarDays className="mb-3 h-10 w-10" aria-hidden />
              <p>No attendance records for selected filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Employee</TableHead>
                    <TableHead scope="col">Department</TableHead>
                    <TableHead scope="col">Date</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col" className="text-right">Hours</TableHead>
                    <TableHead scope="col">Notes</TableHead>
                    <TableHead scope="col" className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.employeeName}</TableCell>
                      <TableCell className="text-muted-foreground">{r.department || "—"}</TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">{r.date}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[r.status]}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {r.hoursWorked ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                        {r.notes || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditRecord(r)} aria-label="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(r.id)} aria-label="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit attendance dialog */}
      {editRecord && (
        <EditAttendanceDialog
          record={editRecord}
          onClose={() => setEditRecord(null)}
          updateAtt={updateAtt}
          toast={toast}
        />
      )}
    </div>
  );
}

function EditAttendanceDialog({
  record, onClose, updateAtt, toast,
}: {
  record: AttendanceRecord;
  onClose: () => void;
  updateAtt: ReturnType<typeof useUpdateAttendance>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const { register, handleSubmit, control } = useForm({
    defaultValues: { status: record.status, hoursWorked: record.hoursWorked ?? 8, notes: record.notes ?? "" },
  });

  const onSubmit = async (data: any) => {
    try {
      await updateAtt.mutateAsync({ id: record.id, ...data });
      toast({ title: "Attendance updated" });
      onClose();
    } catch (e) { toast({ variant:"destructive", title:"Error", description: apiErrorMessage(e) }); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit attendance — {record.employeeName} on {record.date}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Status</Label>
              <Controller name="status" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="half_day">Half Day</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-hours">Hours worked</Label>
              <Input id="edit-hours" type="number" step="0.5" {...register("hoursWorked", { valueAsNumber: true })} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="edit-notes">Notes</Label>
              <Input id="edit-notes" {...register("notes")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={updateAtt.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════ */
/*  TAB 4 — PERFORMANCE REVIEWS                                                    */
/* ═══════════════════════════════════════════════════════════════════════════════ */

interface ReviewForm {
  employeeId: number;
  period: string;
  overallRating: number;
  kpiScore: number;
  attendanceScore: number;
  punctualityScore: number;
  summary: string;
  goals: string;
  achievements: string;
  areasForImprovement: string;
  recommendBonus: boolean;
  bonusSuggestion: number;
}

function PerformanceTab() {
  const { toast }     = useToast();
  const { data: employees } = useListEmployees();
  const [empFilter, setEmpFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editReview, setEditReview] = useState<PerformanceReview | null>(null);

  const { data: reviews = [], isLoading } = usePerformanceReviews(empFilter !== "all" ? Number(empFilter) : undefined);
  const createReview = useCreatePerformanceReview();
  const updateReview = useUpdatePerformanceReview();
  const deleteReview = useDeletePerformanceReview();

  const { register, handleSubmit, control, setValue, watch, reset } = useForm<ReviewForm>({
    defaultValues: { overallRating: 3, kpiScore: 70, attendanceScore: 80, punctualityScore: 80, recommendBonus: false, bonusSuggestion: 0 },
  });
  const watchedRating = watch("overallRating");

  const openCreate = () => {
    setEditReview(null);
    reset({ overallRating: 3, kpiScore: 70, attendanceScore: 80, punctualityScore: 80, recommendBonus: false, bonusSuggestion: 0, summary: "", goals: "", achievements: "", areasForImprovement: "", period: "" });
    setShowDialog(true);
  };
  const openEdit = (r: PerformanceReview) => {
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

  const onSubmit = async (data: ReviewForm) => {
    try {
      if (editReview) {
        await updateReview.mutateAsync({ id: editReview.id, ...data });
        toast({ title: "Review updated" });
      } else {
        await createReview.mutateAsync(data as any);
        toast({ title: "Review created" });
      }
      setShowDialog(false);
    } catch (e) { toast({ variant:"destructive", title:"Error", description: apiErrorMessage(e) }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this review?")) return;
    try { await deleteReview.mutateAsync(id); toast({ title: "Review deleted" }); }
    catch (e) { toast({ variant:"destructive", title:"Error", description: apiErrorMessage(e) }); }
  };

  // Suggested bonus from rating
  const RATING_BONUS_HINT: Record<number, string> = {
    5: "Consider 10–15% bonus",
    4: "Consider 5–10% bonus",
    3: "No bonus / standard",
    2: "Consider performance plan",
    1: "Immediate improvement plan",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="w-52"><SelectValue placeholder="All employees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            {(employees ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden /> New review
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i=><Skeleton key={i} className="h-24 w-full"/>)}</div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Star className="mb-3 h-10 w-10" aria-hidden />
          <p>No performance reviews yet</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={openCreate}>Create first review</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r) => (
            <Card key={r.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.employeeName}</p>
                    <p className="text-xs text-muted-foreground">{r.department}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">{r.period}</Badge>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <StarRating value={r.overallRating} />
                  <span className={cn("text-xs font-medium", RATING_COLORS[r.overallRating])}>
                    {RATING_LABELS[r.overallRating]}
                  </span>
                </div>

                {(r.kpiScore !== null || r.attendanceScore !== null) && (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    {r.kpiScore !== null && (
                      <div className="rounded-md bg-muted/50 p-1.5">
                        <p className="text-muted-foreground">KPI</p>
                        <p className="font-semibold">{r.kpiScore}%</p>
                      </div>
                    )}
                    {r.attendanceScore !== null && (
                      <div className="rounded-md bg-muted/50 p-1.5">
                        <p className="text-muted-foreground">Attend.</p>
                        <p className="font-semibold">{r.attendanceScore}%</p>
                      </div>
                    )}
                    {r.punctualityScore !== null && (
                      <div className="rounded-md bg-muted/50 p-1.5">
                        <p className="text-muted-foreground">Punctual.</p>
                        <p className="font-semibold">{r.punctualityScore}%</p>
                      </div>
                    )}
                  </div>
                )}

                {r.summary && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.summary}</p>
                )}

                {r.recommendBonus && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md bg-green-50 px-2 py-1.5 text-xs text-green-700 dark:bg-green-950/30 dark:text-green-400">
                    <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Bonus recommended: {fmt(r.bonusSuggestion)}
                  </div>
                )}

                <div className="mt-auto flex justify-end gap-1 pt-4">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label="Edit review">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(r.id)} aria-label="Delete review">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={showDialog} onOpenChange={(v) => { if (!v) setShowDialog(false); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editReview ? "Edit performance review" : "New performance review"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Employee + period */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Employee *</Label>
                <Controller name="employeeId" control={control} rules={{ required: true }} render={({ field }) => (
                  <Select value={field.value?.toString()} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
                    <SelectContent>
                      {(employees ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rv-period">Period *</Label>
                <Input id="rv-period" {...register("period", { required: true })} placeholder="2024-Q2, 2024-H1, 2024-Annual" />
              </div>
            </div>

            {/* Overall rating */}
            <div className="space-y-1">
              <Label>Overall Rating *</Label>
              <div className="flex items-center gap-4">
                <Controller name="overallRating" control={control} render={({ field }) => (
                  <StarRating value={field.value} onChange={field.onChange} />
                )} />
                <span className={cn("text-sm font-medium", RATING_COLORS[watchedRating])}>
                  {watchedRating} — {RATING_LABELS[watchedRating]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{RATING_BONUS_HINT[watchedRating]}</p>
            </div>

            {/* Scores */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="rv-kpi">KPI Score (0–100)</Label>
                <Input id="rv-kpi" type="number" min={0} max={100} {...register("kpiScore", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rv-att">Attendance Score (0–100)</Label>
                <Input id="rv-att" type="number" min={0} max={100} {...register("attendanceScore", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rv-punc">Punctuality Score (0–100)</Label>
                <Input id="rv-punc" type="number" min={0} max={100} {...register("punctualityScore", { valueAsNumber: true })} />
              </div>
            </div>

            {/* Text fields */}
            <div className="space-y-1">
              <Label htmlFor="rv-summary">Summary</Label>
              <Textarea id="rv-summary" rows={2} {...register("summary")} placeholder="Overall performance summary…" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="rv-achieve">Achievements</Label>
                <Textarea id="rv-achieve" rows={2} {...register("achievements")} placeholder="Key accomplishments this period…" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rv-improve">Areas for Improvement</Label>
                <Textarea id="rv-improve" rows={2} {...register("areasForImprovement")} placeholder="Skills or behaviours to develop…" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rv-goals">Goals for Next Period</Label>
              <Textarea id="rv-goals" rows={2} {...register("goals")} placeholder="SMART goals for next review cycle…" />
            </div>

            {/* Bonus recommendation */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Controller name="recommendBonus" control={control} render={({ field }) => (
                  <Switch id="rv-bonus" checked={field.value} onCheckedChange={field.onChange} />
                )} />
                <Label htmlFor="rv-bonus" className="font-medium">Recommend bonus</Label>
              </div>
              {watch("recommendBonus") && (
                <div className="space-y-1">
                  <Label htmlFor="rv-bonus-amount">Suggested bonus amount ($)</Label>
                  <Input id="rv-bonus-amount" type="number" step="0.01" {...register("bonusSuggestion", { valueAsNumber: true })} />
                  <p className="text-xs text-muted-foreground">
                    Add this to Payroll Adjustments to apply it to the employee's payslip.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createReview.isPending || updateReview.isPending}>
                {editReview ? "Save changes" : "Create review"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                      */
/* ═══════════════════════════════════════════════════════════════════════════════ */

export default function HRPage() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">HR Portal</h1>
        <p className="text-muted-foreground">
          Employee management · Attendance · Performance evaluations · Payroll integration
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-4 w-4" aria-hidden /> Overview
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-1.5">
            <Users className="h-4 w-4" aria-hidden /> Employees
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5">
            <Clock className="h-4 w-4" aria-hidden /> Attendance
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5">
            <Star className="h-4 w-4" aria-hidden /> Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview"    className="mt-4"><OverviewTab onTabChange={setActiveTab} /></TabsContent>
        <TabsContent value="employees"   className="mt-4"><EmployeesTab /></TabsContent>
        <TabsContent value="attendance"  className="mt-4"><AttendanceTab /></TabsContent>
        <TabsContent value="performance" className="mt-4"><PerformanceTab /></TabsContent>
      </Tabs>
    </div>
  );
}
