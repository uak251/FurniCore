import { useState } from "react";
import { useListPayroll, useGeneratePayroll, useApprovePayroll } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Banknote, Search, CheckCircle, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";

interface GenerateForm {
  month: number;
  year: number;
}

export default function PayrollPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);

  const { data: payroll, isLoading } = useListPayroll();
  const generatePayroll = useGeneratePayroll();
  const approvePayroll = useApprovePayroll();

  const { register, handleSubmit, control, reset } = useForm<GenerateForm>({
    defaultValues: { month: new Date().getMonth() + 1, year: new Date().getFullYear() }
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listPayroll"] });

  const filtered = (payroll ?? []).filter((p: any) =>
    (p.employeeName || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPending = filtered
    .filter((p: any) => p.status === "pending")
    .reduce((sum: number, p: any) => sum + Number(p.netSalary ?? 0), 0);

  const onGenerate = async (data: GenerateForm) => {
    try {
      await generatePayroll.mutateAsync({ data });
      toast({ title: "Payroll generated", description: `Generated for ${data.month}/${data.year}` });
      invalidate();
      setShowDialog(false);
      reset();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await approvePayroll.mutateAsync({ id });
      toast({ title: "Payroll approved" });
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Generate and approve employee payroll</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Generate Payroll
        </Button>
      </div>

      {totalPending > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/10">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-amber-800">Pending Disbursement</p>
            <p className="text-2xl font-bold text-amber-700">${totalPending.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by employee name..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Banknote className="h-10 w-10 mb-3" />
              <p>No payroll records found. Generate payroll to get started.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Employee</th>
                  <th className="px-6 py-3 font-medium">Period</th>
                  <th className="px-6 py-3 font-medium">Base Salary</th>
                  <th className="px-6 py-3 font-medium">Deductions</th>
                  <th className="px-6 py-3 font-medium">Net Pay</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-4 font-medium">{p.employeeName || `Employee #${p.employeeId}`}</td>
                    <td className="px-6 py-4 text-muted-foreground">{months[(p.month ?? 1) - 1]} {p.year}</td>
                    <td className="px-6 py-4 font-mono">${Number(p.baseSalary ?? 0).toFixed(2)}</td>
                    <td className="px-6 py-4 font-mono text-destructive">-${Number(p.deductions ?? 0).toFixed(2)}</td>
                    <td className="px-6 py-4 font-mono font-semibold">${Number(p.netSalary ?? 0).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <Badge variant={p.status === "approved" ? "default" : "secondary"} className={p.status === "approved" ? "bg-green-100 text-green-800" : ""}>
                        {p.status === "approved" ? "Approved" : "Pending"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      {p.status !== "approved" && (
                        <Button size="sm" variant="outline" onClick={() => handleApprove(p.id)}>
                          <CheckCircle className="mr-1.5 h-3.5 w-3.5" />Approve
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Monthly Payroll</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onGenerate)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Month</Label>
                <Controller name="month" control={control} render={({ field }) => (
                  <Select value={field.value?.toString()} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {months.map((m, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label>Year</Label>
                <Input type="number" {...register("year", { valueAsNumber: true })} min="2020" max="2030" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">This will generate payroll records for all active employees for the selected period.</p>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={generatePayroll.isPending}>Generate</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
