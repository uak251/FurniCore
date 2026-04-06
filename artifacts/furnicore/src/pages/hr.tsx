import { useState, useMemo, useEffect } from "react";
import {
  useListEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useRecordAttendance,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Users, Pencil, Trash2, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";

interface EmployeeForm {
  name: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  baseSalary: number;
  hireDate: string;
  isActive: boolean;
}

interface AttendanceForm {
  employeeId: number;
  date: string;
  status: string;
  hoursWorked: number;
  notes: string;
}

const TABLE_ID = "hr";

export default function HRPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showEmpDialog, setShowEmpDialog] = useState(false);
  const [showAttDialog, setShowAttDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  const { data: employees, isLoading } = useListEmployees();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();
  const recordAttendance = useRecordAttendance();

  const empForm = useForm<EmployeeForm>({ defaultValues: { isActive: true, baseSalary: 0 } });
  const attForm = useForm<AttendanceForm>({ defaultValues: { status: "present", hoursWorked: 8 } });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listEmployees"] });

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortKey, sortDir, pageSize]);

  const rows = employees ?? [];

  const sorted = useMemo(() => {
    return filterAndSortRows(rows, {
      search,
      match: (row: any, q: string) => {
        const qn = q.toLowerCase();
        const textMatch =
          !qn ||
          row.name.toLowerCase().includes(qn) ||
          (row.department && row.department.toLowerCase().includes(qn)) ||
          (row.position && row.position.toLowerCase().includes(qn)) ||
          (row.email && row.email.toLowerCase().includes(qn));
        if (!textMatch) return false;
        if (statusFilter === "active") return row.isActive;
        if (statusFilter === "inactive") return !row.isActive;
        return true;
      },
      sortKey,
      sortDir,
      getSortValue: (row: any, key: string) => {
        switch (key) {
          case "department":
            return String(row.department ?? "");
          case "position":
            return String(row.position ?? "");
          case "baseSalary":
            return Number(row.baseSalary);
          case "hireDate":
            return row.hireDate ? new Date(row.hireDate).getTime() : 0;
          default:
            return String(row.name ?? "");
        }
      },
    });
  }, [rows, search, statusFilter, sortKey, sortDir]);

  const { pageRows, total, totalPages, page: safePage } = useMemo(
    () => paginateRows(sorted, page, pageSize),
    [sorted, page, pageSize],
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const exportCsv = () => {
    const headers = [
      "name", "email", "phone", "department", "position", "baseSalary", "hireDate", "isActive",
    ];
    const data = sorted.map((e: any) => ({
      name: e.name,
      email: e.email ?? "",
      phone: e.phone ?? "",
      department: e.department ?? "",
      position: e.position ?? "",
      baseSalary: Number(e.baseSalary),
      hireDate: e.hireDate ? new Date(e.hireDate).toISOString().split("T")[0] : "",
      isActive: e.isActive ? "Yes" : "No",
    }));
    exportRowsToCsv(`furnicore-employees-${new Date().toISOString().slice(0, 10)}`, headers, data);
    toast({ title: "Export started", description: `${data.length} rows exported.` });
  };

  const openCreate = () => {
    setEditItem(null);
    empForm.reset({ name: "", email: "", phone: "", department: "", position: "", baseSalary: 0, hireDate: "", isActive: true });
    setShowEmpDialog(true);
  };

  const openEdit = (e: any) => {
    setEditItem(e);
    empForm.setValue("name", e.name);
    empForm.setValue("email", e.email || "");
    empForm.setValue("phone", e.phone || "");
    empForm.setValue("department", e.department || "");
    empForm.setValue("position", e.position || "");
    empForm.setValue("baseSalary", Number(e.baseSalary));
    empForm.setValue("hireDate", e.hireDate ? new Date(e.hireDate).toISOString().split("T")[0] : "");
    empForm.setValue("isActive", e.isActive);
    setShowEmpDialog(true);
  };

  const openAttendance = (e: any) => {
    setSelectedEmployee(e);
    attForm.reset({
      employeeId: e.id,
      date: new Date().toISOString().split("T")[0],
      status: "present",
      hoursWorked: 8,
      notes: "",
    });
    setShowAttDialog(true);
  };

  const onSubmitEmployee = async (data: EmployeeForm) => {
    try {
      if (editItem) {
        await updateEmployee.mutateAsync({ id: editItem.id, data });
        toast({ title: "Employee updated" });
      } else {
        await createEmployee.mutateAsync({ data });
        toast({ title: "Employee created" });
      }
      invalidate();
      setShowEmpDialog(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const onSubmitAttendance = async (data: AttendanceForm) => {
    try {
      await recordAttendance.mutateAsync({ data });
      toast({ title: "Attendance recorded" });
      setShowAttDialog(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this employee?")) return;
    try {
      await deleteEmployee.mutateAsync({ id });
      toast({ title: "Employee deleted" });
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
          <h1 className="text-3xl font-bold tracking-tight">Human resources</h1>
          <p className="text-muted-foreground">Manage employees and attendance</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Add employee
        </Button>
      </div>

      <TableToolbar
        id={TABLE_ID}
        entityLabel="employees"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, department, or position…"
        filterLabel="Status"
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={[
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ]}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={[
          { value: "name", label: "Name" },
          { value: "department", label: "Department" },
          { value: "position", label: "Position" },
          { value: "baseSalary", label: "Salary" },
          { value: "hireDate", label: "Hire date" },
        ]}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onExportCsv={exportCsv}
        exportDisabled={sorted.length === 0}
        resultsText={
          total === 0
            ? "No matching employees"
            : `Showing ${from}–${to} of ${total} matching employees`
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
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
                      <TableHead scope="col" className="text-right">
                        Salary
                      </TableHead>
                      <TableHead scope="col">Hired</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col" className="text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <div className="font-medium">{e.name}</div>
                          <div className="text-xs text-muted-foreground">{e.email}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.department || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{e.position || "—"}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          ${Number(e.baseSalary).toLocaleString()}/yr
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {e.hireDate ? new Date(e.hireDate).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={e.isActive ? "default" : "outline"}>
                            {e.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Record attendance for ${e.name}`}
                              onClick={() => openAttendance(e)}
                            >
                              <ClipboardList className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Edit ${e.name}`}
                              onClick={() => openEdit(e)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              aria-label={`Delete ${e.name}`}
                              onClick={() => handleDelete(e.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePaginationBar
                id={TABLE_ID}
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showEmpDialog} onOpenChange={setShowEmpDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit employee" : "Add employee"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={empForm.handleSubmit(onSubmitEmployee)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="hr-name">Full name</Label>
                <Input id="hr-name" {...empForm.register("name", { required: true })} placeholder="Alice Johnson" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hr-email">Email</Label>
                <Input id="hr-email" type="email" {...empForm.register("email")} placeholder="alice@furnicore.com" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hr-phone">Phone</Label>
                <Input id="hr-phone" {...empForm.register("phone")} placeholder="+1-555-2001" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hr-dept">Department</Label>
                <Input id="hr-dept" {...empForm.register("department")} placeholder="Manufacturing" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hr-pos">Position</Label>
                <Input id="hr-pos" {...empForm.register("position")} placeholder="Senior Craftsman" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hr-salary">Base salary ($/yr)</Label>
                <Input id="hr-salary" type="number" {...empForm.register("baseSalary", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hr-hire">Hire date</Label>
                <Input id="hr-hire" type="date" {...empForm.register("hireDate")} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch
                  id="hr-active"
                  checked={empForm.watch("isActive")}
                  onCheckedChange={(v) => empForm.setValue("isActive", v)}
                />
                <Label htmlFor="hr-active">Active employee</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowEmpDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createEmployee.isPending || updateEmployee.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showAttDialog} onOpenChange={setShowAttDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record attendance — {selectedEmployee?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={attForm.handleSubmit(onSubmitAttendance)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="att-date">Date</Label>
                <Input id="att-date" type="date" {...attForm.register("date", { required: true })} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Controller
                  name="status"
                  control={attForm.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                        <SelectItem value="late">Late</SelectItem>
                        <SelectItem value="half_day">Half day</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="att-hours">Hours worked</Label>
                <Input
                  id="att-hours"
                  type="number"
                  step="0.5"
                  {...attForm.register("hoursWorked", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="att-notes">Notes</Label>
                <Input id="att-notes" {...attForm.register("notes")} placeholder="Optional notes" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowAttDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={recordAttendance.isPending}>
                Record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
