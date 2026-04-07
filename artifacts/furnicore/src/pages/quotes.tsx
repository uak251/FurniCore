import { useState, useMemo, useEffect } from "react";
import {
  useListQuotes,
  useCreateQuote,
  useLockQuote,
  useApproveQuote,
  usePayQuote,
  useListSuppliers,
} from "@workspace/api-client-react";
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
import { Plus, FileText, Lock, CheckCircle, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "secondary",
  LOCKED: "outline",
  ADMIN_APPROVED: "default",
  PAID: "default",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  LOCKED: "Locked",
  ADMIN_APPROVED: "Approved",
  PAID: "Paid",
};

interface QuoteForm {
  supplierId: number;
  description: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}

const TABLE_ID = "quotes";

export default function QuotesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showDialog, setShowDialog] = useState(false);

  const { data: quotes, isLoading } = useListQuotes();
  const { data: suppliers } = useListSuppliers();
  const createQuote = useCreateQuote();
  const lockQuote = useLockQuote();
  const approveQuote = useApproveQuote();
  const payQuote = usePayQuote();

  const { register, handleSubmit, control, reset } = useForm<QuoteForm>({
    defaultValues: { quantity: 1, unitPrice: 0 },
  });

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortKey, sortDir, pageSize]);

  const rows = quotes ?? [];

  const sorted = useMemo(() => {
    return filterAndSortRows(rows, {
      search,
      match: (row: any, q: string) => {
        const qn = q.toLowerCase();
        const desc = (row.description || "").toLowerCase();
        const sup = (row.supplierName || "").toLowerCase();
        const textMatch = !qn || desc.includes(qn) || sup.includes(qn);
        if (!textMatch) return false;
        if (statusFilter === "all") return true;
        return row.status === statusFilter;
      },
      sortKey,
      sortDir,
      getSortValue: (row: any, key: string) => {
        switch (key) {
          case "supplierName":
            return String(row.supplierName ?? "");
          case "totalPrice":
            return Number(row.totalPrice);
          case "quantity":
            return Number(row.quantity);
          case "status":
            return String(row.status ?? "");
          case "id":
            return Number(row.id);
          default:
            return String(row.description ?? "");
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listQuotes"] });

  const handleAction = async (action: () => Promise<unknown>, msg: string) => {
    try {
      await action();
      toast({ title: msg });
      invalidate();
    } catch (e: any) {
      // Extract the server-side message from ApiError (e.g. "Quote can only be locked from PENDING status")
      const serverMsg: string =
        e?.data?.message ?? e?.data?.error ?? e?.message ?? "Something went wrong.";
      toast({ variant: "destructive", title: "Action failed", description: serverMsg });
    }
  };

  const exportCsv = () => {
    const headers = [
      "id",
      "supplierName",
      "description",
      "quantity",
      "unitPrice",
      "totalPrice",
      "status",
    ];
    const data = sorted.map((q: any) => ({
      id: q.id,
      supplierName: q.supplierName || `Supplier #${q.supplierId}`,
      description: q.description ?? "",
      quantity: Number(q.quantity),
      unitPrice: Number(q.unitPrice),
      totalPrice: Number(q.totalPrice),
      status: STATUS_LABEL[q.status] || q.status,
    }));
    exportRowsToCsv(`furnicore-quotes-${new Date().toISOString().slice(0, 10)}`, headers, data);
    toast({ title: "Export started", description: `${data.length} rows exported.` });
  };

  const onSubmit = async (data: QuoteForm) => {
    if (!data.supplierId) {
      toast({ variant: "destructive", title: "Validation error", description: "Please select a supplier." });
      return;
    }
    const total = Number(data.quantity) * Number(data.unitPrice);
    try {
      await createQuote.mutateAsync({ data: { ...data, totalPrice: total } });
      toast({ title: "Quote created" });
      invalidate();
      setShowDialog(false);
      reset();
    } catch (e: any) {
      const serverMsg: string = e?.data?.message ?? e?.data?.error ?? e?.message ?? "Something went wrong.";
      toast({ variant: "destructive", title: "Failed to create quote", description: serverMsg });
    }
  };

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Supplier quotes</h1>
          <p className="text-muted-foreground">
            Price-locked workflow: Pending → Locked → Approved → Paid
          </p>
        </div>
        <Button
          onClick={() => {
            reset();
            setShowDialog(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          New quote
        </Button>
      </div>

      <TableToolbar
        id={TABLE_ID}
        entityLabel="quotes"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by supplier or description…"
        filterLabel="Status"
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={[
          { value: "all", label: "All statuses" },
          { value: "PENDING", label: "Pending" },
          { value: "LOCKED", label: "Locked" },
          { value: "ADMIN_APPROVED", label: "Approved" },
          { value: "PAID", label: "Paid" },
        ]}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={[
          { value: "id", label: "Quote #" },
          { value: "supplierName", label: "Supplier" },
          { value: "description", label: "Description" },
          { value: "totalPrice", label: "Total" },
          { value: "status", label: "Status" },
        ]}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onExportCsv={exportCsv}
        exportDisabled={sorted.length === 0}
        resultsText={
          total === 0 ? "No matching quotes" : `Showing ${from}–${to} of ${total} matching quotes`
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
              <FileText className="mb-3 h-10 w-10" aria-hidden />
              <p>No quotes match your filters</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Supplier</TableHead>
                      <TableHead scope="col">Description</TableHead>
                      <TableHead scope="col" className="text-right">
                        Qty
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Unit price
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Total
                      </TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((q: any) => (
                      <TableRow key={q.id}>
                        <TableCell className="font-medium">
                          {q.supplierName || `Supplier #${q.supplierId}`}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground">
                          {q.description}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{Number(q.quantity)}</TableCell>
                        <TableCell className="text-right font-mono">${Number(q.unitPrice).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          ${Number(q.totalPrice).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={STATUS_COLORS[q.status] as any}
                            className={q.status === "PAID" ? "bg-green-100 text-green-800" : ""}
                          >
                            {STATUS_LABEL[q.status] || q.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            {q.status === "PENDING" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleAction(() => lockQuote.mutateAsync({ id: q.id }), "Quote locked")
                                }
                              >
                                <Lock className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                Lock
                              </Button>
                            )}
                            {q.status === "LOCKED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleAction(
                                    () => approveQuote.mutateAsync({ id: q.id }),
                                    "Quote approved",
                                  )
                                }
                              >
                                <CheckCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                Approve
                              </Button>
                            )}
                            {q.status === "ADMIN_APPROVED" && (
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleAction(() => payQuote.mutateAsync({ id: q.id }), "Quote paid")
                                }
                              >
                                <CreditCard className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                Mark paid
                              </Button>
                            )}
                            {q.status === "PAID" && (
                              <span className="text-xs font-medium text-green-600">Complete</span>
                            )}
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

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New supplier quote</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Supplier</Label>
                <Controller
                  name="supplierId"
                  control={control}
                  rules={{ required: true }}
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : ""}
                      onValueChange={(v) => field.onChange(v ? Number(v) : undefined)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(suppliers ?? []).map((s: any) => (
                          <SelectItem key={s.id} value={s.id.toString()}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="quote-desc">Description</Label>
                <Input
                  id="quote-desc"
                  {...register("description", { required: true })}
                  placeholder="e.g. Oak Lumber - Bulk Order Q2"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="quote-qty">Quantity</Label>
                <Input id="quote-qty" type="number" step="0.01" {...register("quantity", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="quote-unit">Unit price ($)</Label>
                <Input id="quote-unit" type="number" step="0.01" {...register("unitPrice", { valueAsNumber: true })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="quote-notes">Notes</Label>
                <Input id="quote-notes" {...register("notes")} placeholder="Optional notes…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createQuote.isPending}>
                Create quote
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
