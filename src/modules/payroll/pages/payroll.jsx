import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, Download, FileText, LineChart, MoreHorizontal, Plus, Printer } from "lucide-react";
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
import { useGetCurrentUser } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadPayrollRowsCsv, parsePayrollBreakdown, printPayrollSlip } from "@/modules/payroll/lib/payroll-export";
import { RecordImagePanel } from "@/components/images";
import { useEntityImages } from "@/components/images/useRecordImages";
import { resolvePublicAssetUrl } from "@/lib/image-url";

export default function PayrollPage() {
    const { toast } = useToast();
    const qc = useQueryClient();
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [breakdownRow, setBreakdownRow] = useState(null);
  const [payslipRow, setPayslipRow] = useState(null);
  const [signatureRow, setSignatureRow] = useState(null);
  const { data: me } = useGetCurrentUser();
  const canManagePayrollImages = me?.role === "admin" || me?.role === "manager" || me?.role === "accountant";
  const { data: signatureImages = [] } = useEntityImages("payroll", signatureRow?.id ?? payslipRow?.id);
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

  const exportFilteredCsv = () => {
    if (rows.length === 0) {
      toast({ title: "Nothing to export", description: "Adjust filters or generate payroll first.", variant: "destructive" });
      return;
    }
    const y = yearFilter === "all" ? "all-years" : yearFilter;
    const m = monthFilter === "all" ? "all-months" : monthFilter;
    downloadPayrollRowsCsv(rows, `payroll-export-${y}-${m}.csv`);
    toast({ title: "Export started", description: `${rows.length} row(s) in CSV.` });
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
                  label: "Export filtered view (CSV)",
                  icon: Download,
                  separatorBefore: true,
                  onSelect: exportFilteredCsv,
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
                    const breakdown = parsePayrollBreakdown(row.notes);
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline" className="gap-1" aria-label={`Actions for ${row.employeeName || row.employeeId}`}>
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                                Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem
                                onSelect={() => {
                                  downloadPayrollRowsCsv([row], `payroll-${row.id}-${row.year}-${row.month}.csv`);
                                  toast({ title: "Row exported" });
                                }}
                              >
                                <Download className="h-4 w-4" aria-hidden />
                                Export row (CSV)
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => {
                                  printPayrollSlip(row, { months: MONTHS, format });
                                }}
                              >
                                <Printer className="h-4 w-4" aria-hidden />
                                Print pay slip
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setPayslipRow(row)}>
                                <FileText className="h-4 w-4" aria-hidden />
                                Open detailed pay slip
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!breakdown}
                                onSelect={() => {
                                  if (breakdown) setBreakdownRow(row);
                                }}
                              >
                                <FileText className="h-4 w-4" aria-hidden />
                                View calculation breakdown
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setSignatureRow(row)}>
                                <FileText className="h-4 w-4" aria-hidden />
                                Attach signed slip image
                              </DropdownMenuItem>
                              {!isApproved ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => onApprove(row.id)}
                                    disabled={approvePayroll.isPending}
                                  >
                                    <CheckCircle className="h-4 w-4" aria-hidden />
                                    Approve payroll
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      <Dialog open={Boolean(breakdownRow)} onOpenChange={(open) => { if (!open) setBreakdownRow(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Calculation breakdown</DialogTitle>
          </DialogHeader>
          {breakdownRow ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {breakdownRow.employeeName || `Employee #${breakdownRow.employeeId}`} — {MONTHS[(breakdownRow.month ?? 1) - 1]} {breakdownRow.year}
              </p>
              <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-xs">
                {JSON.stringify(parsePayrollBreakdown(breakdownRow.notes), null, 2)}
              </pre>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBreakdownRow(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(payslipRow)} onOpenChange={(open) => { if (!open) setPayslipRow(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Payroll slip</DialogTitle>
          </DialogHeader>
          {payslipRow ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border p-3">
                <p className="font-medium">{payslipRow.employeeName || `Employee #${payslipRow.employeeId}`}</p>
                <p className="text-muted-foreground">{MONTHS[(payslipRow.month ?? 1) - 1]} {payslipRow.year}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                <p className="text-muted-foreground">Base Salary</p><p className="text-right font-medium">{format(Number(payslipRow.baseSalary ?? 0))}</p>
                <p className="text-muted-foreground">Bonus</p><p className="text-right font-medium text-green-600">{format(Number(payslipRow.bonus ?? 0))}</p>
                <p className="text-muted-foreground">Deductions</p><p className="text-right font-medium text-destructive">{format(Number(payslipRow.deductions ?? 0))}</p>
                <p className="text-muted-foreground">Net Salary</p><p className="text-right text-base font-semibold">{format(Number(payslipRow.netSalary ?? 0))}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="mb-2 font-medium">Employee Signature</p>
                {signatureImages.length > 0 ? (
                  <img
                    src={resolvePublicAssetUrl((signatureImages.find((img) => img.sortOrder === 0) ?? signatureImages[0]).url)}
                    alt="Employee signature"
                    className="h-20 max-w-[220px] object-contain"
                  />
                ) : (
                  <p className="text-muted-foreground">No signature attached yet.</p>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayslipRow(null)}>Close</Button>
            <Button
              onClick={() => {
                if (!payslipRow) return;
                const primarySig = signatureImages.find((img) => img.sortOrder === 0) ?? signatureImages[0];
                printPayrollSlip(
                  { ...payslipRow, signatureUrl: primarySig ? resolvePublicAssetUrl(primarySig.url) : "" },
                  { months: MONTHS, format },
                );
              }}
            >
              <Printer className="mr-1 h-4 w-4" aria-hidden />
              Print standard slip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(signatureRow)} onOpenChange={(open) => { if (!open) setSignatureRow(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Attach signed payroll image</DialogTitle>
          </DialogHeader>
          {signatureRow ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Upload employee signature or signed payroll slip for {signatureRow.employeeName || `Employee #${signatureRow.employeeId}`} ({MONTHS[(signatureRow.month ?? 1) - 1]} {signatureRow.year}).
              </p>
              <RecordImagePanel
                entityType="payroll"
                entityId={signatureRow.id}
                canUpload={canManagePayrollImages}
                canDelete={canManagePayrollImages}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignatureRow(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
