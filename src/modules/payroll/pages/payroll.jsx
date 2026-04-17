import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, LineChart, Plus } from "lucide-react";
import { ModuleInsightsDrawer } from "@/components/analytics/ModuleInsightsDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/lib/currency";
import { ModulePageHeader } from "@/components/module/ModulePageHeader";
import { ModuleActionsMenu } from "@/components/module/ModuleActionsMenu";
import { ModuleTableState } from "@/components/module/ModuleTableState";
import { usePayrollPageModel } from "@/hooks/modules/usePayrollPageModel";

export default function PayrollPage() {
    const { toast } = useToast();
    const qc = useQueryClient();
  const [insightsOpen, setInsightsOpen] = useState(false);
  const { format } = useCurrency();
  const {
    MONTHS,
    years,
        search,
    setSearch,
    statusFilter,
    setStatusFilter,
    monthFilter,
    setMonthFilter,
    yearFilter,
    setYearFilter,
    showGenerateDialog,
    setShowGenerateDialog,
    genMonth,
    setGenMonth,
    genYear,
    setGenYear,
    rows,
    pendingTotal,
    isLoading,
    generatePayroll,
    approvePayroll,
  } = usePayrollPageModel();

  const refetchPayroll = () => {
    qc.invalidateQueries({ queryKey: ["listPayroll"] });
  };

  const onApprove = async (id) => {
        try {
            await approvePayroll.mutateAsync({ id });
            toast({ title: "Payroll approved" });
      refetchPayroll();
    } catch (err) {
      toast({ title: "Approve failed", description: String(err?.message ?? err), variant: "destructive" });
    }
  };

  const onGenerate = async () => {
    const month = Number(genMonth);
    const year = Number(genYear);
    if (!month || !year) return;
    try {
      await generatePayroll.mutateAsync({ data: { month, year } });
      toast({ title: "Payroll generated", description: `${MONTHS[month - 1]} ${year}` });
      setShowGenerateDialog(false);
      refetchPayroll();
    } catch (err) {
      toast({ title: "Generation failed", description: String(err?.message ?? err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Payroll"
        description="Generate and approve monthly payroll with clear status tracking."
        actions={(
          <>
            <ModuleActionsMenu
              label="Actions"
              items={[
                {
                  label: "Generate payroll",
                  icon: Plus,
                  onSelect: () => setShowGenerateDialog(true),
                },
                {
                  label: "View analytics",
                  icon: LineChart,
                  separatorBefore: true,
                  onSelect: () => setInsightsOpen(true),
                },
              ]}
            />
            <ModuleInsightsDrawer
              moduleName="payroll"
              title="Payroll Analytics"
              reportId="payroll-summary"
              filters={{ status: statusFilter, month: monthFilter, year: yearFilter }}
              hideTrigger
              open={insightsOpen}
              onOpenChange={setInsightsOpen}
            />
          </>
        )}
      />

      {pendingTotal > 0 ? (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/10">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Pending disbursement</p>
              <p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{format(pendingTotal)}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-amber-500/60" aria-hidden />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee..."
              aria-label="Search payroll by employee"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {MONTHS.map((m, idx) => (
                  <SelectItem key={m} value={String(idx + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ModuleTableState isLoading={isLoading} isEmpty={rows.length === 0} emptyMessage="No payroll records found.">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Bonus</TableHead>
                    <TableHead className="text-right">Deduction</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isApproved = row.status === "approved";
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.employeeName || `Employee #${row.employeeId}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {MONTHS[(row.month ?? 1) - 1]} {row.year}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{format(Number(row.baseSalary ?? 0))}</TableCell>
                        <TableCell className="text-right tabular-nums text-green-600">
                          {Number(row.bonus ?? 0) > 0 ? `+${format(Number(row.bonus))}` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">
                          {Number(row.deductions ?? 0) > 0 ? `−${format(Number(row.deductions))}` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {format(Number(row.netSalary ?? 0))}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isApproved ? "default" : "secondary"}
                            className={isApproved ? "bg-green-100 text-green-800" : ""}
                          >
                            {isApproved ? "Approved" : row.status ?? "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isApproved ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onApprove(row.id)}
                              disabled={approvePayroll.isPending}
                            >
                              <CheckCircle className="mr-1 h-3.5 w-3.5" aria-hidden />
                              Approve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </ModuleTableState>
        </CardContent>
      </Card>

      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate monthly payroll</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1">
              <Label>Month</Label>
              <Select value={genMonth} onValueChange={setGenMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, idx) => (
                    <SelectItem key={m} value={String(idx + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Year</Label>
              <Input value={genYear} onChange={(e) => setGenYear(e.target.value)} type="number" min="2020" max="2035" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancel</Button>
            <Button onClick={onGenerate} disabled={generatePayroll.isPending}>Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
