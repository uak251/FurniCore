import { useState, useMemo, useEffect } from "react";
import { useListTransactions, useCreateTransaction, useGetFinancialSummary } from "@workspace/api-client-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Receipt, TrendingUp, TrendingDown, DollarSign, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { cn } from "@/lib/utils";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";
import { PowerBIReportsHub } from "@/components/PowerBIReportsHub";
import { useCurrency } from "@/lib/currency";

interface TransactionForm {
  type: string;
  category: string;
  amount: number;
  description: string;
  status: string;
  transactionDate: string;
}

const TABLE_ID = "accounting";

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("ledger");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState("transactionDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [showDialog, setShowDialog] = useState(false);

  const { data: transactions, isLoading } = useListTransactions();
  const { data: financial } = useGetFinancialSummary();
  const createTransaction = useCreateTransaction();

  const { register, handleSubmit, control, reset } = useForm<TransactionForm>({
    defaultValues: {
      type: "income",
      status: "completed",
      transactionDate: new Date().toISOString().split("T")[0],
    },
  });

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, sortKey, sortDir, pageSize]);

  const rows = transactions ?? [];

  const sorted = useMemo(() => {
    return filterAndSortRows(rows, {
      search,
      match: (row: any, q: string) => {
        const qn = q.toLowerCase();
        const textMatch =
          !qn ||
          (row.description || "").toLowerCase().includes(qn) ||
          (row.category || "").toLowerCase().includes(qn);
        if (!textMatch) return false;
        if (typeFilter === "all") return true;
        return row.type === typeFilter;
      },
      sortKey,
      sortDir,
      getSortValue: (row: any, key: string) => {
        switch (key) {
          case "amount":
            return Number(row.amount ?? 0);
          case "type":
            return String(row.type ?? "");
          case "category":
            return String(row.category ?? "");
          case "status":
            return String(row.status ?? "");
          case "transactionDate":
            return new Date(row.transactionDate || row.createdAt).getTime();
          default:
            return String(row.description ?? "");
        }
      },
    });
  }, [rows, search, typeFilter, sortKey, sortDir]);

  const { pageRows, total, totalPages, page: safePage } = useMemo(
    () => paginateRows(sorted, page, pageSize),
    [sorted, page, pageSize],
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const { format: formatCurrency } = useCurrency();
  const fmt = (n: number) => formatCurrency(Math.abs(n));

  const exportCsv = () => {
    const headers = ["transactionDate", "type", "category", "description", "amount", "status"];
    const data = sorted.map((t: any) => ({
      transactionDate: new Date(t.transactionDate || t.createdAt).toISOString().split("T")[0],
      type: t.type,
      category: t.category ?? "",
      description: (t.description || "").replace(/\r?\n/g, " "),
      amount: Number(t.amount),
      status: t.status,
    }));
    exportRowsToCsv(
      `furnicore-accounting-${new Date().toISOString().slice(0, 10)}`,
      headers,
      data,
    );
    toast({ title: "Export started", description: `${data.length} rows exported.` });
  };

  const onSubmit = async (data: TransactionForm) => {
    try {
      await createTransaction.mutateAsync({ data });
      toast({ title: "Transaction recorded" });
      queryClient.invalidateQueries({ queryKey: ["listTransactions"] });
      setShowDialog(false);
      reset();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  // BI report tabs definition (always rendered; auth gated in the tab content)
  const biReports = [
    { id: "supplier-ledger", label: "Supplier Ledger" },
    { id: "expense-income",  label: "Expense vs Income" },
    { id: "payroll-summary", label: "Payroll" },
    { id: "profit-margin",   label: "Profit Margin" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounting</h1>
          <p className="text-muted-foreground">Ledger, reports, and financial dashboards</p>
        </div>
        {activeTab === "ledger" && (
          <Button onClick={() => { reset(); setShowDialog(true); }}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Record transaction
          </Button>
        )}
      </div>

      {/* ── KPI cards ── */}
      {financial && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs text-muted-foreground">Total revenue</p>
                <p className="text-2xl font-bold tabular-nums text-green-600">
                  {fmt(Number(financial.totalRevenue ?? 0))}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500/50" aria-hidden />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs text-muted-foreground">Total expenses</p>
                <p className="text-2xl font-bold tabular-nums text-destructive">
                  {fmt(Number(financial.totalExpenses ?? 0))}
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-destructive/40" aria-hidden />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs text-muted-foreground">Net profit</p>
                <p
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    Number(financial.netProfit ?? 0) >= 0 ? "text-green-600" : "text-destructive",
                  )}
                >
                  {Number(financial.netProfit ?? 0) < 0 ? "−" : ""}
                  {fmt(Number(financial.netProfit ?? 0))}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-primary/40" aria-hidden />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="ledger">
            <Receipt className="mr-1.5 h-4 w-4" aria-hidden />
            Ledger
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="h-4 w-4" aria-hidden />
            Reports &amp; Analytics
          </TabsTrigger>
        </TabsList>

        {/* ── Ledger tab ── */}
        <TabsContent value="ledger" className="space-y-4">
          <TableToolbar
            id={TABLE_ID}
            entityLabel="transactions"
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by description or category…"
            filterLabel="Type"
            filterValue={typeFilter}
            onFilterChange={setTypeFilter}
            filterOptions={[
              { value: "all", label: "All" },
              { value: "income", label: "Income" },
              { value: "expense", label: "Expense" },
            ]}
            sortKey={sortKey}
            onSortKeyChange={setSortKey}
            sortOptions={[
              { value: "transactionDate", label: "Date" },
              { value: "description", label: "Description" },
              { value: "category", label: "Category" },
              { value: "type", label: "Type" },
              { value: "amount", label: "Amount" },
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
                ? "No matching transactions"
                : `Showing ${from}–${to} of ${total} matching transactions`
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
                  <Receipt className="mb-3 h-10 w-10" aria-hidden />
                  <p>No transactions match your filters</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Date</TableHead>
                          <TableHead scope="col">Description</TableHead>
                          <TableHead scope="col">Category</TableHead>
                          <TableHead scope="col">Type</TableHead>
                          <TableHead scope="col" className="text-right">
                            Amount
                          </TableHead>
                          <TableHead scope="col">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageRows.map((t: any) => (
                          <TableRow key={t.id}>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(t.transactionDate || t.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate font-medium">
                              {t.description || "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{t.category || "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant={t.type === "income" ? "default" : "outline"}
                                className={t.type === "income" ? "bg-green-100 text-green-800" : ""}
                              >
                                {t.type === "income" ? "Income" : "Expense"}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right font-mono font-semibold tabular-nums",
                                t.type === "income" ? "text-green-600" : "text-destructive",
                              )}
                            >
                              {t.type === "expense" ? "−" : "+"}{formatCurrency(Number(t.amount))}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="capitalize">
                                {t.status}
                              </Badge>
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
        </TabsContent>

        {/* ── Analytics tab (Power BI Reports Hub) ── */}
        <TabsContent value="analytics">
          <PowerBIReportsHub />
        </TabsContent>
      </Tabs>

      {/* ── Record transaction dialog ── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record transaction</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Type</Label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="acct-cat">Category</Label>
                <Input id="acct-cat" {...register("category")} placeholder="e.g. Product Sales" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="acct-desc">Description</Label>
                <Input
                  id="acct-desc"
                  {...register("description", { required: true })}
                  placeholder="Transaction description"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="acct-amount">Amount ($)</Label>
                <Input
                  id="acct-amount"
                  type="number"
                  step="0.01"
                  {...register("amount", { valueAsNumber: true, required: true })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="acct-date">Date</Label>
                <Input id="acct-date" type="date" {...register("transactionDate")} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Status</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTransaction.isPending}>
                Record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
