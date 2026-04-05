import { useState } from "react";
import { useListEmployees, useCreateEmployee, useUpdateEmployee, useDeleteEmployee, useRecordAttendance } from "@workspace/api-client-react";
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
import { Plus, Users, Search, Pencil, Trash2, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";

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

export default function HRPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
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

  const filtered = (employees ?? []).filter((e: any) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.department && e.department.toLowerCase().includes(search.toLowerCase()))
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listEmployees"] });

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
    attForm.reset({ employeeId: e.id, date: new Date().toISOString().split("T")[0], status: "present", hoursWorked: 8, notes: "" });
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Human Resources</h1>
          <p className="text-muted-foreground">Manage employees and attendance</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="h-10 w-10 mb-3" />
              <p>No employees found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Department</th>
                  <th className="px-6 py-3 font-medium">Position</th>
                  <th className="px-6 py-3 font-medium">Salary</th>
                  <th className="px-6 py-3 font-medium">Hired</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((e: any) => (
                  <tr key={e.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-muted-foreground">{e.email}</div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{e.department || "—"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{e.position || "—"}</td>
                    <td className="px-6 py-4 font-mono">${Number(e.baseSalary).toLocaleString()}/yr</td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {e.hireDate ? new Date(e.hireDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={e.isActive ? "default" : "outline"}>{e.isActive ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" title="Record Attendance" onClick={() => openAttendance(e)}>
                          <ClipboardList className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Employee Dialog */}
      <Dialog open={showEmpDialog} onOpenChange={setShowEmpDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Employee" : "Add Employee"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={empForm.handleSubmit(onSubmitEmployee)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Full Name</Label>
                <Input {...empForm.register("name", { required: true })} placeholder="Alice Johnson" />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" {...empForm.register("email")} placeholder="alice@furnicore.com" />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input {...empForm.register("phone")} placeholder="+1-555-2001" />
              </div>
              <div className="space-y-1">
                <Label>Department</Label>
                <Input {...empForm.register("department")} placeholder="Manufacturing" />
              </div>
              <div className="space-y-1">
                <Label>Position</Label>
                <Input {...empForm.register("position")} placeholder="Senior Craftsman" />
              </div>
              <div className="space-y-1">
                <Label>Base Salary ($/yr)</Label>
                <Input type="number" {...empForm.register("baseSalary", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label>Hire Date</Label>
                <Input type="date" {...empForm.register("hireDate")} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch checked={empForm.watch("isActive")} onCheckedChange={(v) => empForm.setValue("isActive", v)} />
                <Label>Active Employee</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowEmpDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createEmployee.isPending || updateEmployee.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Attendance Dialog */}
      <Dialog open={showAttDialog} onOpenChange={setShowAttDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Attendance — {selectedEmployee?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={attForm.handleSubmit(onSubmitAttendance)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" {...attForm.register("date", { required: true })} />
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
                      <SelectItem value="half_day">Half Day</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label>Hours Worked</Label>
                <Input type="number" step="0.5" {...attForm.register("hoursWorked", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input {...attForm.register("notes")} placeholder="Optional notes" />
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
