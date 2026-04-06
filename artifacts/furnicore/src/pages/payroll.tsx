import { useState, useMemo, useEffect } from "react";
import { useListPayroll, useGeneratePayroll, useApprovePayroll } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Banknote, CheckCircle, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";

interface GenerateForm {
  month: number;
  year: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TABLE_ID = "payroll";

export default function PayrollPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("employeeName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showDialog, setShowDialog] = useState(false);

  const { data: payroll, isLoading } = useListPayroll();
  const generatePayroll = useGeneratePayroll();
  const approvePayroll = useApprovePayroll();

  const { register, handleSubmit, control, reset } = useForm<GenerateForm>({
    defaultValues: { month: new Date().getMonth() + 1, year: new Date().getFullYear() },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listPayroll"] });

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortKey, sortDir, pageSize]);

  const rows = payroll ?? [];

  const sorted = useMemo(() => {
    return filterAndSortRows(rows, {
      search,
      match: (row: any, q: string) => {
        const textMatch = !q || (row.employeeName || "").toLowerCase().includes(q);
        if (!textMatch) return false;
        if (statusFilter === "pending") return row.status === "pending";
        if (statusFilter === "approved") return row.status === "approved";
        return true;
      },
      sortKey,
      sortDir,
      getSortValue: (row: any, key: string) => {
        switch (key) {
          case "netSalary":
            return Number(row.netSalary ?? 0);
          case "baseSalary":
            return Number(row.baseSalary ?? 0);
          case "period":
            return (row.year ?? 0) * 100 + (row.month ?? 0);
          case "status":
            return String(row.status ?? "");
          default:
            return String(row.employeeName ?? "");
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

  const totalPending = sorted
    .filter((p: any) => p.status === "pending")
    .reduce((sum: number, p: any) => sum + Number(p.netSalary ?? 0), 0);

  const exportCsv = () => {
    const headers = ["employeeName", "period", "baseSalary", "deductions", "netSalary", "status"];
    const data = sorted.map((p: any) => ({
      employeeName: p.employeeName || `Employee #${p.employeeId}`,
      period: `${MONTHS[(p.month ?? 1) - 1]} ${p.year}`,
      baseSalary: Number(p.baseSalary ?? 0),
      deductions: Number(p.deductions ?? 0),
      netSalary: Number(p.netSalary ?? 0),
      status: p.status,
    }));
    exportRowsToCsv(`furnicore-payroll-${new Date().toISOString().slice(0, 10)}`, headers, data);
    toast({ title: "Export started", description: `${data.length} rows exported.` });
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

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Generate and approve employee payroll</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Generate payroll
        </Button>
      </div>

      {totalPending > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/10">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Pending disbursement</p>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
              ${totalPending.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
      )}

      <TableToolbar
        id={TABLE_ID}
        entityLabel="payroll records"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by employee name…"
        filterLabel="Status"
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={[
          { value: "all", label: "All" },
          { value: "pending", label: "Pending" },
          { value: "approved", label: "Approved" },
        ]}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={[
          { value: "employeeName", label: "Employee" },
          { value: "period", label: "Period" },
          { value: "baseSalary", label: "Base salary" },
          { value: "netSalary", label: "Net pay" },
          { value: "status", label: "Status" },
        ]}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onExportCsv={exportCsv}
        exportDisabled={sorted.length === 0}
        resultsText={
          total === 0
            ? "No matching payroll records"
            : `Showing ${from}–${to} of ${total} matching records`
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
              <Banknote className="mb-3 h-10 w-10" aria-hidden />
              <p>No payroll records found. Generate payroll to get started.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Employee</TableHead>
                      <TableHead scope="col">Period</TableHead>
                      <TableHead scope="col" className="text-right">
                        Base salary
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Deductions
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Net pay
                      </TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          {p.employeeName || `Employee #${p.employeeId}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {MONTHS[(p.month ?? 1) - 1]} {p.year}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          ${Number(p.baseSalary ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-destructive">
                          −${Number(p.deductions ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold tabular-nums">
                          ${Number(p.netSalary ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={p.status === "approved" ? "default" : "secondary"}
                            className={p.status === "approved" ? "bg-green-100 text-green-800" : ""}
                          >
                            {p.status === "approved" ? "Approved" : "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {p.status !== "approved" && (
                            <Button size="sm" variant="outline" onClick={() => handleApprove(p.id)}>
                              <CheckCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                              Approve
                            </Button>
                          )}
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

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate monthly payroll</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onGenerate)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Month</Label>
                <Controller
                  name="month"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value?.toString()} onValueChange={(v) => field.onChange(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => (
                          <SelectItem key={i + 1} value={(i + 1).toString()}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pr-year">Year</Label>
                <Input
                  id="pr-year"
                  type="number"
                  {...register("year", { valueAsNumber: true })}
                  min="2020"
                  max="2030"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              This will generate payroll records for all active employees for the selected period.
            </p>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={generatePayroll.isPending}>
                Generate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
