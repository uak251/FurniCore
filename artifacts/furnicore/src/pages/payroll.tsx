import { useState, useMemo, useEffect } from "react";
import { useListPayroll, useGeneratePayroll, useApprovePayroll, useListEmployees, useGetCurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePayrollAdjustments,
  useAddPayrollAdjustment,
  useDeletePayrollAdjustment,
  useRegeneratePayroll,
  type PayrollAdjustment,
  type PayrollBreakdown,
} from "@/hooks/use-hr-portal";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Banknote, CheckCircle, Plus, ChevronDown, ChevronUp, RefreshCw,
  TrendingUp, TrendingDown, AlertTriangle, Clock, Trash2, Info, Upload, Images,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";
import { cn } from "@/lib/utils";
import { BulkImportExport } from "@/components/BulkImportExport";
import { ModuleAnalyticsPanel } from "@/components/ModuleAnalyticsPanel";
import { useCurrency } from "@/lib/currency";
import { RecordAvatar, RecordImagePanel, ModuleGallery, useModuleImages } from "@/components/images";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TABLE_ID = "payroll";

/* ─── Payroll breakdown panel ────────────────────────────────────────────────── */

function BreakdownPanel({ payrollId, notes }: { payrollId: number; notes?: string | null }) {
  const { format: fmtCur } = useCurrency();
  const fmt = (n: number) => fmtCur(Math.abs(n));

  let bd: PayrollBreakdown | null = null;
  try { if (notes) bd = JSON.parse(notes) as PayrollBreakdown; } catch { /* no-op */ }

  if (!bd) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" aria-hidden />
        No detailed breakdown available. Regenerate this record to compute it.
      </div>
    );
  }

  const att = bd.attendance;

  return (
    <div className="space-y-4 py-2 text-sm">
      {/* Calculation formula */}
      <div className="rounded-md bg-muted/40 px-4 py-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Net Salary Formula</p>
        <p className="font-mono text-xs leading-relaxed">
          Monthly Base {fmt(bd.monthlyBase)}
          {bd.totalBonus > 0     && ` + Bonuses ${fmt(bd.totalBonus)}`}
          {bd.totalDeductions > 0 && ` − Deductions ${fmt(bd.totalDeductions)}`}
          {" "}= <strong>{fmt(bd.netSalary)}</strong>
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Daily rate: {fmt(bd.dayRate)} ({bd.workingDays} working days)
        </p>
      </div>

      {/* Attendance breakdown */}
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Attendance — {att.totalRecords} records
        </p>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          {[
            { label: "Present",  value: att.present,  color: "text-green-600" },
            { label: "Absent",   value: att.absent,   color: "text-red-600"   },
            { label: "Late",     value: att.late,     color: "text-amber-600" },
            { label: "Half Day", value: att.halfDay,  color: "text-blue-600"  },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-md border bg-card p-2">
              <p className="text-muted-foreground">{label}</p>
              <p className={cn("text-lg font-bold tabular-nums", color)}>{value}</p>
            </div>
          ))}
        </div>
        {att.totalAttendancePenalty > 0 && (
          <div className="mt-2 space-y-1 rounded-md bg-red-50 px-3 py-2 text-xs dark:bg-red-950/20">
            <p className="font-medium text-red-700 dark:text-red-400">Attendance deductions</p>
            {att.absentPenalty  > 0 && <p className="flex justify-between text-red-600"><span>{att.absent} absent day(s) × {fmt(bd.dayRate)}</span><span>−{fmt(att.absentPenalty)}</span></p>}
            {att.latePenalty    > 0 && <p className="flex justify-between text-red-600"><span>{att.late} late occurrence(s) × {fmt(bd.dayRate * 0.25)}</span><span>−{fmt(att.latePenalty)}</span></p>}
            {att.halfDayPenalty > 0 && <p className="flex justify-between text-red-600"><span>{att.halfDay} half-day(s) × {fmt(bd.dayRate * 0.5)}</span><span>−{fmt(att.halfDayPenalty)}</span></p>}
            <Separator className="my-1" />
            <p className="flex justify-between font-semibold text-red-700 dark:text-red-400">
              <span>Total attendance penalty</span><span>−{fmt(att.totalAttendancePenalty)}</span>
            </p>
          </div>
        )}
      </div>

      {/* Manual adjustments */}
      {(bd.bonusAdjustments.length > 0 || bd.penaltyAdjustments.length > 0) && (
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Manual Adjustments</p>
          <div className="space-y-1">
            {bd.bonusAdjustments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md bg-green-50 px-3 py-1.5 text-xs dark:bg-green-950/20">
                <span className="text-green-700 dark:text-green-400">
                  <TrendingUp className="mr-1 inline h-3 w-3" aria-hidden />Bonus: {a.reason}
                </span>
                <span className="font-mono font-semibold text-green-700 dark:text-green-400">+{fmt(a.amount)}</span>
              </div>
            ))}
            {bd.penaltyAdjustments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md bg-red-50 px-3 py-1.5 text-xs dark:bg-red-950/20">
                <span className="text-red-700 dark:text-red-400">
                  <TrendingDown className="mr-1 inline h-3 w-3" aria-hidden />Penalty: {a.reason}
                </span>
                <span className="font-mono font-semibold text-red-700 dark:text-red-400">−{fmt(a.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Net summary */}
      <div className="flex items-center justify-between rounded-lg bg-primary/5 px-4 py-3 font-semibold">
        <span>Net Salary</span>
        <span className="text-lg tabular-nums text-primary">{fmt(bd.netSalary)}</span>
      </div>
    </div>
  );
}

/* ─── Payroll adjustment row ─────────────────────────────────────────────────── */

function AdjustmentsPanel({
  payrollRecord,
  onClose,
}: {
  payrollRecord: any;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { format: fmtCur } = useCurrency();
  const fmt = (n: number) => fmtCur(Math.abs(n));
  const { data: adjustments = [], isLoading } = usePayrollAdjustments({
    employeeId: payrollRecord.employeeId,
    month:      payrollRecord.month,
    year:       payrollRecord.year,
  });
  const addAdj    = useAddPayrollAdjustment();
  const deleteAdj = useDeletePayrollAdjustment();
  const regen     = useRegeneratePayroll();

  const { register, handleSubmit, control, reset } = useForm({
    defaultValues: { type: "bonus" as "bonus" | "penalty", reason: "", amount: 0 },
  });

  const onAdd = async (data: any) => {
    try {
      await addAdj.mutateAsync({
        employeeId: payrollRecord.employeeId,
        type:       data.type,
        reason:     data.reason,
        amount:     Number(data.amount),
        month:      payrollRecord.month,
        year:       payrollRecord.year,
      });
      toast({ title: `${data.type === "bonus" ? "Bonus" : "Penalty"} added` });
      reset({ type: "bonus", reason: "", amount: 0 });
    } catch (e: any) { toast({ variant:"destructive", title:"Error", description: e.message }); }
  };

  const onDelete = async (id: number) => {
    if (!confirm("Remove this adjustment?")) return;
    try { await deleteAdj.mutateAsync(id); toast({ title: "Adjustment removed" }); }
    catch (e: any) { toast({ variant:"destructive", title:"Error", description: e.message }); }
  };

  const onRegenerate = async () => {
    try {
      await regen.mutateAsync(payrollRecord.id);
      toast({ title: "Payroll recalculated", description: "Breakdown updated with latest attendance and adjustments." });
    } catch (e: any) { toast({ variant:"destructive", title:"Error", description: e.message }); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{payrollRecord.employeeName}</p>
          <p className="text-sm text-muted-foreground">{MONTHS[(payrollRecord.month ?? 1) - 1]} {payrollRecord.year}</p>
        </div>
        {payrollRecord.status !== "approved" && (
          <Button size="sm" variant="outline" onClick={onRegenerate} disabled={regen.isPending}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", regen.isPending && "animate-spin")} aria-hidden />
            Recalculate
          </Button>
        )}
      </div>

      {/* Current breakdown */}
      <BreakdownPanel payrollId={payrollRecord.id} notes={payrollRecord.notes} />

      <Separator />

      {/* Adjustments list */}
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Manual Adjustments ({adjustments.length})
        </p>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : adjustments.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">No manual adjustments yet</p>
        ) : (
          <div className="space-y-1.5">
            {adjustments.map((a: PayrollAdjustment) => (
              <div key={a.id} className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
                a.type === "bonus" ? "border-green-100 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                                   : "border-red-100 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20",
              )}>
                <div>
                  <Badge variant={a.type === "bonus" ? "default" : "destructive"} className="mr-2 text-[10px]">
                    {a.type}
                  </Badge>
                  <span className="font-medium">{a.reason}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("font-mono font-semibold tabular-nums", a.type === "bonus" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>
                    {a.type === "bonus" ? "+" : "−"}{fmt(a.amount)}
                  </span>
                  {payrollRecord.status !== "approved" && (
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => onDelete(a.id)} aria-label="Remove adjustment">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add adjustment form */}
      {payrollRecord.status !== "approved" && (
        <form onSubmit={handleSubmit(onAdd)} className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add Adjustment</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Controller name="type" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bonus">Bonus</SelectItem>
                    <SelectItem value="penalty">Penalty</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adj-amount" className="text-xs">Amount ($)</Label>
              <Input id="adj-amount" type="number" step="0.01" className="h-8" {...register("amount", { valueAsNumber: true, required: true, min: 0.01 })} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="adj-reason" className="text-xs">Reason *</Label>
              <Input id="adj-reason" className="h-8" placeholder="e.g. Performance bonus Q2, Equipment damage…" {...register("reason", { required: true })} />
            </div>
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={addAdj.isPending}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Add &amp; Recalculate on Generate
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            After adding, click <strong>Recalculate</strong> above to update the net salary.
          </p>
        </form>
      )}

      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────────── */

interface GenerateForm { month: number; year: number; }

export default function PayrollPage() {
  const { toast }  = useToast();
  const { format: fmtCur } = useCurrency();
  const fmt = (n: number) => fmtCur(Math.abs(n));
  const qc         = useQueryClient();
  const { data: me } = useGetCurrentUser();
  const canManageImages =
    me?.role === "admin" || me?.role === "manager" || me?.role === "accountant";

  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState("all");
  const [sortKey, setSortKey]             = useState("employeeName");
  const [sortDir, setSortDir]             = useState<SortDir>("asc");
  const [page, setPage]                   = useState(1);
  const [pageSize, setPageSize]           = useState(10);
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [showBulk, setShowBulk]           = useState(false);
  const [showGallery, setShowGallery]     = useState(false);
  const [expandedId, setExpandedId]       = useState<number | null>(null);
  const [imagesPayrollId, setImagesPayrollId] = useState<number | null>(null);
  const [adjRecord, setAdjRecord]         = useState<any | null>(null);
  const [filterMonth, setFilterMonth]     = useState<string>("all");
  const [filterYear, setFilterYear]       = useState<string>(String(new Date().getFullYear()));

  const { data: allImages = [] } = useModuleImages("payroll");

  const { data: payroll, isLoading } = useListPayroll();
  const { data: employees }          = useListEmployees();
  const generatePayroll = useGeneratePayroll();
  const approvePayroll  = useApprovePayroll();

  const { register, handleSubmit, control, reset } = useForm<GenerateForm>({
    defaultValues: { month: new Date().getMonth() + 1, year: new Date().getFullYear() },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["listPayroll"] });

  useEffect(() => { setPage(1); }, [search, statusFilter, sortKey, sortDir, pageSize, filterMonth, filterYear]);

  const rows = payroll ?? [];

  const sorted = useMemo(() => filterAndSortRows(rows, {
    search,
    match: (row: any, q: string) => {
      const textMatch = !q || (row.employeeName || "").toLowerCase().includes(q);
      if (!textMatch) return false;
      if (statusFilter === "pending")  return row.status === "pending" || row.status === "draft";
      if (statusFilter === "approved") return row.status === "approved";
      return true;
    },
    sortKey, sortDir,
    getSortValue: (row: any, key: string) => {
      if (key === "netSalary")  return Number(row.netSalary ?? 0);
      if (key === "baseSalary") return Number(row.baseSalary ?? 0);
      if (key === "period")     return (row.year ?? 0) * 100 + (row.month ?? 0);
      if (key === "status")     return String(row.status ?? "");
      return String(row.employeeName ?? "");
    },
  }), [rows, search, statusFilter, sortKey, sortDir]);

  // Additional month/year filter
  const displayed = useMemo(() => {
    let r = sorted;
    if (filterMonth !== "all") r = r.filter((p: any) => p.month === Number(filterMonth));
    if (filterYear  !== "all") r = r.filter((p: any) => p.year  === Number(filterYear));
    return r;
  }, [sorted, filterMonth, filterYear]);

  const { pageRows, total, totalPages, page: safePage } = useMemo(
    () => paginateRows(displayed, page, pageSize), [displayed, page, pageSize]);
  useEffect(() => { if (safePage !== page) setPage(safePage); }, [safePage, page]);

  const totalPending = sorted
    .filter((p: any) => p.status !== "approved")
    .reduce((s: number, p: any) => s + Number(p.netSalary ?? 0), 0);

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to   = Math.min(safePage * pageSize, total);

  const exportCsv = () => {
    exportRowsToCsv(`furnicore-payroll-${new Date().toISOString().slice(0, 10)}`,
      ["employee","period","monthlyBase","bonus","deductions","net","status"],
      displayed.map((p: any) => ({
        employee: p.employeeName || `Employee #${p.employeeId}`,
        period:   `${MONTHS[(p.month ?? 1) - 1]} ${p.year}`,
        monthlyBase: Number(p.baseSalary ?? 0).toFixed(2),
        bonus:    Number(p.bonus ?? 0).toFixed(2),
        deductions: Number(p.deductions ?? 0).toFixed(2),
        net:      Number(p.netSalary ?? 0).toFixed(2),
        status:   p.status,
      })));
    toast({ title: "Export started" });
  };

  const handleApprove = async (id: number) => {
    try { await approvePayroll.mutateAsync({ id }); toast({ title: "Payroll approved" }); invalidate(); }
    catch (e: any) { toast({ variant:"destructive", title:"Error", description: e.message }); }
  };

  const onGenerate = async (data: GenerateForm) => {
    try {
      await generatePayroll.mutateAsync({ data });
      toast({ title: "Payroll generated", description: `${MONTHS[data.month - 1]} ${data.year} — with attendance penalties and adjustments applied.` });
      invalidate(); setShowGenDialog(false); reset();
    } catch (e: any) { toast({ variant:"destructive", title:"Error", description: e.message }); }
  };

  const years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Generate payroll with transparent attendance penalties and bonuses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowGallery(true)}>
            <Images className="mr-2 h-4 w-4" /> Gallery
          </Button>
          <Button variant="outline" onClick={() => setShowBulk(true)}>
            <Upload className="mr-2 h-4 w-4" aria-hidden /> Bulk import/export
          </Button>
          <Button onClick={() => setShowGenDialog(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Generate payroll
          </Button>
        </div>
      </div>

      {/* Pending alert */}
      {totalPending > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/10">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Pending disbursement</p>
              <p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
                {fmt(totalPending)}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-amber-500/60" aria-hidden />
          </CardContent>
        </Card>
      )}

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-28"><SelectValue placeholder="All months" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <TableToolbar
        id={TABLE_ID} entityLabel="payroll records"
        searchValue={search} onSearchChange={setSearch}
        searchPlaceholder="Search by employee name…"
        filterLabel="Status" filterValue={statusFilter} onFilterChange={setStatusFilter}
        filterOptions={[{value:"all",label:"All"},{value:"pending",label:"Pending"},{value:"approved",label:"Approved"}]}
        sortKey={sortKey} onSortKeyChange={setSortKey}
        sortOptions={[
          {value:"employeeName",label:"Employee"},{value:"period",label:"Period"},
          {value:"baseSalary",label:"Base"},{value:"netSalary",label:"Net pay"},{value:"status",label:"Status"},
        ]}
        sortDir={sortDir} onSortDirChange={setSortDir}
        pageSize={pageSize} onPageSizeChange={setPageSize}
        onExportCsv={exportCsv} exportDisabled={displayed.length===0}
        resultsText={total===0 ? "No matching payroll records" : `Showing ${from}–${to} of ${total}`}
      />

      {/* Main table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">{[1,2,3,4].map(i=><Skeleton key={i} className="h-14 w-full"/>)}</div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Banknote className="mb-3 h-10 w-10" aria-hidden />
              <p>No payroll records found.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowGenDialog(true)}>
                Generate payroll to get started
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col" className="w-8" />
                      <TableHead scope="col" className="w-12"></TableHead>
                      <TableHead scope="col">Employee</TableHead>
                      <TableHead scope="col">Period</TableHead>
                      <TableHead scope="col" className="text-right">Monthly Base</TableHead>
                      <TableHead scope="col" className="text-right">Bonuses</TableHead>
                      <TableHead scope="col" className="text-right">Deductions</TableHead>
                      <TableHead scope="col" className="text-right">Net Pay</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((p: any) => {
                      const isExpanded = expandedId === p.id;
                      const hasBreakdown = !!p.notes;
                      return (
                        <>
                          <TableRow
                            key={p.id}
                            className={cn(isExpanded && "border-b-0 bg-muted/20")}
                          >
                            <TableCell>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => setExpandedId(isExpanded ? null : p.id)}
                                aria-label={isExpanded ? "Collapse breakdown" : "Expand breakdown"}
                              >
                                {isExpanded
                                  ? <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                                  : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                              </Button>
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <RecordAvatar entityType="payroll" entityId={p.id} className="h-9 w-9" />
                            </TableCell>
                            <TableCell className="font-medium">
                              {p.employeeName || `Employee #${p.employeeId}`}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {MONTHS[(p.month ?? 1) - 1]} {p.year}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {fmt(Number(p.baseSalary ?? 0))}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-green-600">
                              {Number(p.bonus ?? 0) > 0 ? `+${fmt(Number(p.bonus))}` : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-destructive">
                              {Number(p.deductions ?? 0) > 0 ? `−${fmt(Number(p.deductions))}` : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold tabular-nums">
                              {fmt(Number(p.netSalary ?? 0))}
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
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAdjRecord(p)}>
                                  Adjustments
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setImagesPayrollId(p.id)}>
                                  <Images className="mr-1 h-3.5 w-3.5" aria-hidden />Docs
                                </Button>
                                {p.status !== "approved" && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleApprove(p.id)}>
                                    <CheckCircle className="mr-1 h-3.5 w-3.5" aria-hidden />Approve
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${p.id}-bd`} className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={9} className="py-0 px-4 pb-4">
                                <BreakdownPanel payrollId={p.id} notes={p.notes} />
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <TablePaginationBar id={TABLE_ID} page={safePage} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Generate dialog */}
      <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate monthly payroll</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onGenerate)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Month</Label>
                <Controller name="month" control={control} render={({ field }) => (
                  <Select value={field.value?.toString()} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pr-year">Year</Label>
                <Input id="pr-year" type="number" {...register("year", { valueAsNumber: true })} min="2020" max="2030" />
              </div>
            </div>
            <Card className="border-blue-100 bg-blue-50/50 dark:bg-blue-950/20">
              <CardHeader className="pb-1 pt-3"><CardTitle className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400"><Info className="h-3.5 w-3.5" aria-hidden />Transparent calculation</CardTitle></CardHeader>
              <CardContent className="pb-3 text-xs text-blue-600 dark:text-blue-400 space-y-1">
                <p>• Monthly base = annual salary ÷ 12</p>
                <p>• Absent days deducted at full daily rate (base ÷ 22)</p>
                <p>• Late: 25% · Half day: 50% of daily rate</p>
                <p>• All manual adjustments (bonuses/penalties) are applied and shown in the breakdown</p>
              </CardContent>
            </Card>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowGenDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={generatePayroll.isPending}>Generate</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk import/export dialog */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk Import / Export — Payroll</DialogTitle>
          </DialogHeader>
          <BulkImportExport
            module="Payroll"
            importEndpoint="/api/bulk/payroll/import"
            exportEndpoint="/api/bulk/payroll/export"
            exportFilename="payroll-export.csv"
            templateHeaders={["employeeEmail", "month", "year", "baseSalary", "bonus", "deductions", "netSalary", "status", "notes"]}
            templateSample={[
              ["alice@company.com", "4", "2026", "4000", "200", "50", "4150", "draft", ""],
              ["bob@company.com",   "4", "2026", "3500", "0",   "0",  "3500", "draft", "No deductions"],
            ]}
            onImported={invalidate}
          />
        </DialogContent>
      </Dialog>

      {/* Adjustments panel dialog */}
      <Dialog open={!!adjRecord} onOpenChange={(v) => { if (!v) setAdjRecord(null); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" aria-hidden />
              Payroll Adjustments &amp; Breakdown
            </DialogTitle>
          </DialogHeader>
          {adjRecord && (
            <AdjustmentsPanel payrollRecord={adjRecord} onClose={() => setAdjRecord(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Payroll record images dialog */}
      <Dialog open={imagesPayrollId !== null} onOpenChange={(v) => { if (!v) setImagesPayrollId(null); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Documents / Images — Payroll Record #{imagesPayrollId}</DialogTitle>
          </DialogHeader>
          {imagesPayrollId !== null && (
            <RecordImagePanel
              entityType="payroll"
              entityId={imagesPayrollId}
              canUpload={canManageImages}
              canDelete={canManageImages}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Module gallery */}
      <Dialog open={showGallery} onOpenChange={setShowGallery}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Payroll Documents Gallery</DialogTitle></DialogHeader>
          <ModuleGallery
            entityType="payroll"
            images={allImages}
            canDelete={canManageImages}
            entityLabels={Object.fromEntries((payroll ?? []).map((p: any) => [p.id, `${p.employeeName ?? `#${p.employeeId}`} — ${MONTHS[(p.month ?? 1) - 1]} ${p.year}`]))}
          />
        </DialogContent>
      </Dialog>

      {/* ── Payroll Analytics panel ──────────────────────────────────── */}
      <ModuleAnalyticsPanel
        module="payroll"
        reportId="payroll-summary"
        title="Payroll Analytics Dashboard"
      />
    </div>
  );
}
