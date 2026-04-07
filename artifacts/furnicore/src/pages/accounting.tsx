import { useState, useMemo, useCallback, useEffect } from "react";
import { useListTransactions, useCreateTransaction, useGetFinancialSummary, useGetCurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp, TrendingDown, DollarSign, Plus, Receipt, BarChart3,
  BookOpen, RefreshCw, CheckCircle2, RotateCcw, ClipboardList,
  FileText, Scale, Banknote, ChevronDown, ChevronUp, AlertTriangle,
  Search, Trash2, ArrowUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

const TABLE_ID = "accounting";

/* ══════════════════════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════════════════════ */
interface Account { id: number; code: string; name: string; type: string; normalBalance: string; isActive: boolean; }
interface JELine { accountId: number; description?: string; debit: number; credit: number; }
interface JournalEntry {
  id: number; entryNumber: string; date: string; description: string;
  referenceType: string; status: string; postedAt: string | null;
  totalDebit: string; totalCredit: string;
  lines?: Array<{ id: number; accountId: number; accountCode: string; accountName: string; description: string; debit: string; credit: string }>;
}
interface TBRow { id: number; code: string; name: string; type: string; normalBalance: string; totalDebit: number; totalCredit: number; balance: number; }
interface PLRow  { id: number; code: string; name: string; type: string; balance: number; }
interface BSRow  { id: number; code: string; name: string; balance: number; }
interface Accrual { id: number; type: string; description: string; amount: number; status: string; accrualDate: string; recognitionDate: string | null; accountName: string | null; notes: string | null; journalEntryId: number | null; }

type TransactionForm = { type: string; category: string; amount: number; description: string; status: string; transactionDate: string; debitAccountId?: string; creditAccountId?: string; };

/* ══════════════════════════════════════════════════════════════════════════════
   API helpers
   ══════════════════════════════════════════════════════════════════════════════ */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).message ?? `HTTP ${r.status}`); }
  return r.json();
}

const useAccounts   = () => useQuery<Account[]>({ queryKey: ["accounts"], queryFn: () => apiFetch("/api/accounts") });
const useJEs        = (params?: string) => useQuery<JournalEntry[]>({ queryKey: ["journal-entries", params], queryFn: () => apiFetch(`/api/journal-entries${params ? "?" + params : ""}`) });
const useTrialBal   = (asOf: string) => useQuery({ queryKey: ["trial-balance", asOf], queryFn: () => apiFetch<{ asOf: string; rows: TBRow[]; totals: any }>(`/api/reports/trial-balance?asOf=${asOf}`) });
const usePL         = (from: string, to: string) => useQuery({ queryKey: ["profit-loss", from, to], queryFn: () => apiFetch<{ income: PLRow[]; expenses: PLRow[]; totals: any }>(`/api/reports/profit-loss?from=${from}&to=${to}`) });
const useBS         = (asOf: string) => useQuery({ queryKey: ["balance-sheet", asOf], queryFn: () => apiFetch<{ assets: BSRow[]; liabilities: BSRow[]; equity: BSRow[]; totals: any }>(`/api/reports/balance-sheet?asOf=${asOf}`) });
const useAccruals   = () => useQuery<Accrual[]>({ queryKey: ["accruals"], queryFn: () => apiFetch("/api/accruals") });

/* ══════════════════════════════════════════════════════════════════════════════
   Shared: AccountSelect
   ══════════════════════════════════════════════════════════════════════════════ */
function AccountSelect({ value, onChange, placeholder, accounts, filterType }: { value: string; onChange: (v: string) => void; placeholder?: string; accounts: Account[]; filterType?: string }) {
  const opts = filterType ? accounts.filter((a) => a.type === filterType && a.isActive) : accounts.filter((a) => a.isActive);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder ?? "Select account…"} /></SelectTrigger>
      <SelectContent>
        {opts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.code} – {a.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 1 — CASH BOOK
   ══════════════════════════════════════════════════════════════════════════════ */
function CashBookTab({ accounts }: { accounts: Account[] }) {
  const { toast } = useToast();
  const { format: fmt } = useCurrency();
  const qc = useQueryClient();
  const { data: me } = useGetCurrentUser();
  const canWrite = me?.role === "admin" || me?.role === "accountant";

  const { data: transactions = [], isLoading } = useListTransactions();
  const { data: financial } = useGetFinancialSummary();
  const createTx = useCreateTransaction();

  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey,    setSortKey]    = useState("transactionDate");
  const [sortDir,    setSortDir]    = useState<SortDir>("desc");
  const [page,       setPage]       = useState(1);
  const [pageSize,   setPageSize]   = useState(15);
  const [showDialog, setShowDialog] = useState(false);

  const { register, handleSubmit, control, reset } = useForm<TransactionForm>({
    defaultValues: { type: "income", category: "", amount: 0, description: "", status: "completed", transactionDate: new Date().toISOString().split("T")[0] },
  });

  const SORTABLE_COLS = [
    { value: "transactionDate", label: "Date" },
    { value: "description",     label: "Description" },
    { value: "category",        label: "Category" },
    { value: "amount",          label: "Amount" },
  ];

  const filtered = useMemo(() => {
    let rows = (transactions as any[]).filter((t) => {
      const q = search.toLowerCase();
      const matchQ = !q || t.description?.toLowerCase().includes(q) || t.category?.toLowerCase().includes(q);
      const matchType = typeFilter === "all" || t.type === typeFilter;
      return matchQ && matchType;
    });
    if (sortKey) rows = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
      return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === "asc" ? 1 : -1);
    });
    return rows;
  }, [transactions, search, typeFilter, sortKey, sortDir]);

  const { pageRows, total, totalPages, page: safePage } = useMemo(() => paginateRows(filtered, page, pageSize), [filtered, page, pageSize]);
  useEffect(() => { if (safePage !== page) setPage(safePage); }, [safePage, page]);

  const onSubmit = async (data: TransactionForm) => {
    try {
      const body: any = { ...data, amount: Number(data.amount), transactionDate: new Date(data.transactionDate).toISOString() };
      if (data.debitAccountId)  body.debitAccountId  = parseInt(data.debitAccountId,  10);
      if (data.creditAccountId) body.creditAccountId = parseInt(data.creditAccountId, 10);
      await createTx.mutateAsync({ data: body });
      toast({ title: "Transaction recorded" });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      reset();
      setShowDialog(false);
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  const totalIncome  = (transactions as any[]).filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = (transactions as any[]).filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const netCash      = totalIncome - totalExpense;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Income",  value: fmt(totalIncome),  icon: TrendingUp,   cls: "text-green-600" },
          { label: "Total Expenses",value: fmt(totalExpense), icon: TrendingDown, cls: "text-destructive" },
          { label: "Net Cash Flow", value: fmt(Math.abs(netCash)), icon: Banknote, cls: netCash >= 0 ? "text-green-600" : "text-destructive" },
          { label: "Transactions",  value: String(total), icon: Receipt, cls: "text-primary" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-muted/50 p-2"><Icon className={`h-5 w-5 ${cls}`} /></div>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className={`text-lg font-bold tabular-nums ${cls}`}>{value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <TableToolbar
        id={TABLE_ID}
        searchValue={search} onSearchChange={setSearch}
        sortKey={sortKey} onSortKeyChange={setSortKey}
        sortDir={sortDir} onSortDirChange={setSortDir}
        sortOptions={SORTABLE_COLS}
        pageSize={pageSize} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
        resultsText={total === 0 ? "No transactions" : `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, total)} of ${total}`}
        onExportCsv={() => exportRowsToCsv(`furnicore-cashbook-${new Date().toISOString().slice(0,10)}`, ["date","type","category","description","amount","status"], filtered.map((t: any) => ({ date: t.transactionDate?.slice(0,10), type: t.type, category: t.category, description: t.description, amount: Number(t.amount), status: t.status })))}
      >
        {canWrite && (
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="mr-1.5 h-4 w-4" />New Transaction
          </Button>
        )}
      </TableToolbar>

      {/* Filter chips */}
      <div className="flex gap-2">
        {["all","income","expense"].map((v) => (
          <Button key={v} size="sm" variant={typeFilter === v ? "default" : "outline"} className="capitalize" onClick={() => setTypeFilter(v)}>{v}</Button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="hidden md:table-cell">Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">JE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">No transactions found.</TableCell></TableRow>
              ) : (
                pageRows.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(t.transactionDate).toLocaleDateString()}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{t.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">{t.category}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{t.accountCode ? `${t.accountCode} – ${t.accountName}` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.type === "income" ? "default" : "secondary"} className={cn("text-xs", t.type === "income" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell className={cn("text-right font-mono font-semibold tabular-nums text-sm", t.type === "income" ? "text-green-600" : "text-destructive")}>
                      {t.type === "expense" ? "−" : "+"}{fmt(Number(t.amount))}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{t.status}</Badge></TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{t.journalEntryId ? `#${t.journalEntryId}` : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <TablePaginationBar id={TABLE_ID} page={safePage} totalPages={totalPages} onPageChange={setPage} />

      {/* New Transaction Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Cash Transaction</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type *</Label>
                <Controller name="type" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller name="status" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Input placeholder="e.g. Sales, Rent, Utilities" {...register("category", { required: true })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" min="0" {...register("amount", { required: true, valueAsNumber: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" {...register("transactionDate", { required: true })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Input placeholder="Transaction description" {...register("description", { required: true })} />
            </div>
            <Separator />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Double-Entry (optional)</p>
            <p className="text-xs text-muted-foreground">Select accounts to auto-generate a journal entry.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Debit Account</Label>
                <Controller name="debitAccountId" control={control} render={({ field }) => (
                  <AccountSelect value={field.value ?? ""} onChange={field.onChange} accounts={accounts} placeholder="Debit…" />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Credit Account</Label>
                <Controller name="creditAccountId" control={control} render={({ field }) => (
                  <AccountSelect value={field.value ?? ""} onChange={field.onChange} accounts={accounts} placeholder="Credit…" />
                )} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createTx.isPending}>Save transaction</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 2 — JOURNAL ENTRIES
   ══════════════════════════════════════════════════════════════════════════════ */
function JournalEntriesTab({ accounts }: { accounts: Account[] }) {
  const { toast } = useToast();
  const { format: fmt } = useCurrency();
  const qc = useQueryClient();
  const { data: me } = useGetCurrentUser();
  const canWrite = me?.role === "admin" || me?.role === "accountant";
  const isAdmin  = me?.role === "admin";

  const [statusFilter, setStatusFilter] = useState("all");
  const [showDialog,   setShowDialog]   = useState(false);
  const [expandedId,   setExpandedId]   = useState<number | null>(null);
  const [expandedData, setExpandedData] = useState<JournalEntry | null>(null);

  const qParams = statusFilter !== "all" ? `status=${statusFilter}` : "";
  const { data: entries = [], isLoading, refetch } = useJEs(qParams);

  type JEForm = {
    date: string; description: string; notes: string;
    lines: Array<{ accountId: string; description: string; debit: number; credit: number }>;
    autoPost: boolean;
  };
  const { register, handleSubmit, control, watch, reset, setValue } = useForm<JEForm>({
    defaultValues: { date: new Date().toISOString().split("T")[0], description: "", notes: "", autoPost: false, lines: [{ accountId: "", description: "", debit: 0, credit: 0 }, { accountId: "", description: "", debit: 0, credit: 0 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const linesWatch = watch("lines");
  const totalD = linesWatch.reduce((s, l) => s + Number(l.debit  ?? 0), 0);
  const totalC = linesWatch.reduce((s, l) => s + Number(l.credit ?? 0), 0);
  const balanced = Math.abs(totalD - totalC) < 0.001;

  const createMut = useMutation({
    mutationFn: (body: any) => apiFetch<JournalEntry>("/api/journal-entries", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (je) => {
      toast({ title: `Journal entry ${je.entryNumber} ${je.status === "posted" ? "created & posted" : "saved as draft"}` });
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      reset();
      setShowDialog(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const postMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/journal-entries/${id}/post`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Entry posted" }); qc.invalidateQueries({ queryKey: ["journal-entries"] }); },
    onError:   (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const reverseMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/journal-entries/${id}/reverse`, { method: "POST", body: JSON.stringify({ date: new Date().toISOString().split("T")[0] }) }),
    onSuccess: () => { toast({ title: "Reversal entry created" }); qc.invalidateQueries({ queryKey: ["journal-entries"] }); },
    onError:   (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); setExpandedData(null); return; }
    const data = await apiFetch<JournalEntry>(`/api/journal-entries/${id}`);
    setExpandedData(data);
    setExpandedId(id);
  };

  const onSubmit = (data: JEForm) => {
    const lines = data.lines.filter((l) => l.accountId).map((l) => ({ accountId: parseInt(l.accountId, 10), description: l.description, debit: Number(l.debit), credit: Number(l.credit) }));
    createMut.mutate({ date: data.date, description: data.description, notes: data.notes, lines, autoPost: data.autoPost });
  };

  const STATUS_COLORS: Record<string, string> = {
    draft:    "bg-amber-100 text-amber-800",
    posted:   "bg-green-100 text-green-800",
    reversed: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {["all","draft","posted","reversed"].map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} className="capitalize" onClick={() => setStatusFilter(s)}>{s}</Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          {canWrite && <Button size="sm" onClick={() => setShowDialog(true)}><Plus className="mr-1.5 h-4 w-4" />New Entry</Button>}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="w-8" />
                <TableHead>Entry No.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Ref Type</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4" /></TableCell>)}</TableRow>)
              ) : entries.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">No journal entries found.</TableCell></TableRow>
              ) : (
                entries.map((je) => (
                  <>
                    <TableRow key={je.id} className="cursor-pointer hover:bg-muted/30" onClick={() => toggleExpand(je.id)}>
                      <TableCell>{expandedId === je.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</TableCell>
                      <TableCell className="font-mono text-sm font-semibold">{je.entryNumber}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(je.date).toLocaleDateString()}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{je.description ?? "—"}</TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">{je.referenceType ?? "manual"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(Number(je.totalDebit))}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(Number(je.totalCredit))}</TableCell>
                      <TableCell><Badge className={`text-xs capitalize ${STATUS_COLORS[je.status] ?? ""}`}>{je.status}</Badge></TableCell>
                      {canWrite && (
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {je.status === "draft" && (
                              <Button size="sm" variant="outline" className="text-green-700 border-green-300 h-7" onClick={() => postMut.mutate(je.id)}>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Post
                              </Button>
                            )}
                            {je.status === "posted" && isAdmin && (
                              <Button size="sm" variant="outline" className="h-7" onClick={() => reverseMut.mutate(je.id)}>
                                <RotateCcw className="mr-1 h-3.5 w-3.5" />Reverse
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    {expandedId === je.id && expandedData && (
                      <TableRow key={`${je.id}-detail`}>
                        <TableCell colSpan={9} className="bg-muted/20 p-4">
                          <table className="w-full text-xs">
                            <thead><tr className="text-muted-foreground border-b"><th className="pb-1 text-left">Account</th><th className="pb-1 text-right">Debit</th><th className="pb-1 text-right">Credit</th></tr></thead>
                            <tbody>
                              {expandedData.lines?.map((l) => (
                                <tr key={l.id} className="border-b border-dashed last:border-0">
                                  <td className="py-1">{l.accountCode} – {l.accountName}{l.description ? ` (${l.description})` : ""}</td>
                                  <td className="py-1 text-right font-mono">{Number(l.debit) > 0 ? fmt(Number(l.debit)) : "—"}</td>
                                  <td className="py-1 text-right font-mono">{Number(l.credit) > 0 ? fmt(Number(l.credit)) : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {je.status === "posted" && je.postedAt && (
                            <p className="mt-2 text-xs text-muted-foreground">Posted {new Date(je.postedAt).toLocaleString()}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New JE Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Journal Entry</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" {...register("date", { required: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input placeholder="Entry description" {...register("description")} />
              </div>
            </div>

            {/* Lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Entry Lines</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => append({ accountId: "", description: "", debit: 0, credit: 0 })}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Add line
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">Account</th>
                      <th className="px-3 py-2 text-left">Memo</th>
                      <th className="px-3 py-2 text-right w-28">Debit</th>
                      <th className="px-3 py-2 text-right w-28">Credit</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, idx) => (
                      <tr key={field.id} className="border-t">
                        <td className="px-3 py-1.5">
                          <Controller name={`lines.${idx}.accountId`} control={control} render={({ field: f }) => (
                            <AccountSelect value={f.value} onChange={f.onChange} accounts={accounts} placeholder="Select…" />
                          )} />
                        </td>
                        <td className="px-3 py-1.5"><Input className="h-8" placeholder="Memo…" {...register(`lines.${idx}.description`)} /></td>
                        <td className="px-3 py-1.5"><Input className="h-8 text-right" type="number" step="0.01" min="0" {...register(`lines.${idx}.debit`, { valueAsNumber: true })} /></td>
                        <td className="px-3 py-1.5"><Input className="h-8 text-right" type="number" step="0.01" min="0" {...register(`lines.${idx}.credit`, { valueAsNumber: true })} /></td>
                        <td className="px-3 py-1.5">
                          {fields.length > 2 && <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/20 text-xs font-semibold border-t">
                    <tr>
                      <td className="px-3 py-2 text-right" colSpan={2}>Totals</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totalD)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totalC)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!balanced && totalD + totalC > 0 && (
                <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Unbalanced — Debits ({fmt(totalD)}) ≠ Credits ({fmt(totalC)})
                </p>
              )}
              {balanced && totalD > 0 && (
                <p className="mt-1 flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Balanced
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Internal notes…" {...register("notes")} />
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="autoPost" {...register("autoPost")} className="h-4 w-4" />
              <Label htmlFor="autoPost" className="font-normal text-sm cursor-pointer">Post immediately (requires balanced entry)</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { reset(); setShowDialog(false); }}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending}>Save entry</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 3 — TRIAL BALANCE
   ══════════════════════════════════════════════════════════════════════════════ */
function TrialBalanceTab() {
  const { format: fmt } = useCurrency();
  const [asOf, setAsOf] = useState(new Date().toISOString().split("T")[0]);
  const { data, isLoading, refetch } = useTrialBal(asOf);

  const TYPE_COLORS: Record<string, string> = {
    asset: "text-blue-700", liability: "text-red-700", equity: "text-purple-700", income: "text-green-700", expense: "text-amber-700",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Trial Balance</h2>
          <p className="text-sm text-muted-foreground">All account balances as of a given date — verifies that debits equal credits.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">As of</Label>
          <Input type="date" className="w-40" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {data && (
        <div className="flex gap-3 flex-wrap">
          <Badge className={data.totals.balanced ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
            {data.totals.balanced ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <AlertTriangle className="mr-1 h-3.5 w-3.5" />}
            {data.totals.balanced ? "Balanced" : "Out of balance"}
          </Badge>
          <Badge variant="outline">Total Debits: {fmt(data.totals.debit)}</Badge>
          <Badge variant="outline">Total Credits: {fmt(data.totals.credit)}</Badge>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs bg-muted/30">
                <TableHead>Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right font-semibold">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4" /></TableCell>)}</TableRow>)
              ) : !data?.rows.length ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">No account data. Make sure Chart of Accounts is seeded and Journal Entries are posted.</TableCell></TableRow>
              ) : (
                <>
                  {data.rows.map((r) => (
                    <TableRow key={r.id} className="text-sm">
                      <TableCell className="font-mono font-semibold">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell><span className={`capitalize font-medium text-xs ${TYPE_COLORS[r.type] ?? ""}`}>{r.type}</span></TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{r.totalDebit > 0 ? fmt(r.totalDebit) : "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{r.totalCredit > 0 ? fmt(r.totalCredit) : "—"}</TableCell>
                      <TableCell className={`text-right font-mono tabular-nums font-semibold ${r.balance >= 0 ? "" : "text-destructive"}`}>{fmt(Math.abs(r.balance))}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/30 font-bold text-sm">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right font-mono">{fmt(data.totals.debit)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(data.totals.credit)}</TableCell>
                    <TableCell className={`text-right font-mono ${data.totals.balanced ? "text-green-600" : "text-destructive"}`}>
                      {data.totals.balanced ? "Balanced" : fmt(Math.abs(data.totals.debit - data.totals.credit))}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 4 — PROFIT & LOSS
   ══════════════════════════════════════════════════════════════════════════════ */
function ProfitLossTab() {
  const { format: fmt } = useCurrency();
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`);
  const [to,   setTo]   = useState(now.toISOString().split("T")[0]);
  const { data, isLoading, refetch } = usePL(from, to);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Profit & Loss Statement</h2>
          <p className="text-sm text-muted-foreground">Revenue vs expenses for a period.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-sm">From</Label>
          <Input type="date" className="w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Label className="text-sm">To</Label>
          <Input type="date" className="w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Revenue",  value: fmt(data.totals.income),    cls: "text-green-600" },
            { label: "Total Expenses", value: fmt(data.totals.expenses),  cls: "text-destructive" },
            { label: "Net Profit",     value: fmt(Math.abs(data.totals.netProfit)), cls: data.totals.netProfit >= 0 ? "text-green-600" : "text-destructive" },
            { label: "Profit Margin",  value: `${data.totals.margin}%`,   cls: data.totals.margin >= 0 ? "text-green-600" : "text-destructive" },
          ].map(({ label, value, cls }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Income */}
        <Card>
          <CardHeader><CardTitle className="text-sm text-green-700 flex items-center gap-1.5"><TrendingUp className="h-4 w-4" />Revenue</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow className="text-xs"><TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={3}><Skeleton className="h-20" /></TableCell></TableRow>
                  : !data?.income.length ? <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground text-sm">No income recorded.</TableCell></TableRow>
                  : data.income.map((r) => (
                    <TableRow key={r.id} className="text-sm">
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-right font-mono text-green-600">{fmt(r.balance)}</TableCell>
                    </TableRow>
                  ))
                }
                {data && (
                  <TableRow className="bg-green-50/50 dark:bg-green-950/20 font-semibold text-sm">
                    <TableCell colSpan={2} className="text-green-700">Total Revenue</TableCell>
                    <TableCell className="text-right font-mono text-green-700">{fmt(data.totals.income)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Expenses */}
        <Card>
          <CardHeader><CardTitle className="text-sm text-red-700 flex items-center gap-1.5"><TrendingDown className="h-4 w-4" />Expenses</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow className="text-xs"><TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={3}><Skeleton className="h-20" /></TableCell></TableRow>
                  : !data?.expenses.length ? <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground text-sm">No expenses recorded.</TableCell></TableRow>
                  : data.expenses.map((r) => (
                    <TableRow key={r.id} className="text-sm">
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-right font-mono text-destructive">{fmt(r.balance)}</TableCell>
                    </TableRow>
                  ))
                }
                {data && (
                  <TableRow className="bg-red-50/50 dark:bg-red-950/20 font-semibold text-sm">
                    <TableCell colSpan={2} className="text-red-700">Total Expenses</TableCell>
                    <TableCell className="text-right font-mono text-destructive">{fmt(data.totals.expenses)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Net Profit summary */}
      {data && (
        <Card className={cn("border-2", data.totals.netProfit >= 0 ? "border-green-200 dark:border-green-900" : "border-red-200 dark:border-red-900")}>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Net {data.totals.netProfit >= 0 ? "Profit" : "Loss"}</p>
              <p className="text-xs text-muted-foreground">{from} to {to}</p>
            </div>
            <p className={`text-3xl font-bold tabular-nums ${data.totals.netProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
              {data.totals.netProfit < 0 ? "−" : "+"}{fmt(Math.abs(data.totals.netProfit))}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 5 — BALANCE SHEET
   ══════════════════════════════════════════════════════════════════════════════ */
function BalanceSheetTab() {
  const { format: fmt } = useCurrency();
  const [asOf, setAsOf] = useState(new Date().toISOString().split("T")[0]);
  const { data, isLoading, refetch } = useBS(asOf);

  function Section({ title, rows, total, cls }: { title: string; rows: BSRow[]; total: number; cls: string }) {
    return (
      <Card>
        <CardHeader><CardTitle className={`text-sm font-semibold flex items-center gap-1.5 ${cls}`}>{title}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow className="text-xs"><TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={3}><Skeleton className="h-20" /></TableCell></TableRow>
                : !rows.length ? <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground text-sm">No entries.</TableCell></TableRow>
                : rows.map((r) => (
                  <TableRow key={r.id} className="text-sm">
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.balance)}</TableCell>
                  </TableRow>
                ))
              }
              {!isLoading && (
                <TableRow className="bg-muted/30 font-semibold text-sm">
                  <TableCell colSpan={2}>Total {title}</TableCell>
                  <TableCell className={`text-right font-mono font-bold ${cls}`}>{fmt(total)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Balance Sheet</h2>
          <p className="text-sm text-muted-foreground">Snapshot of assets, liabilities, and equity at a given date.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">As of</Label>
          <Input type="date" className="w-40" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {data && (
        <div className="flex gap-3 flex-wrap">
          <Badge className={data.totals.balanced ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
            {data.totals.balanced ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <AlertTriangle className="mr-1 h-3.5 w-3.5" />}
            {data.totals.balanced ? "Balanced (Assets = Liabilities + Equity)" : "Out of balance"}
          </Badge>
          <Badge variant="outline">Assets: {fmt(data.totals.assets)}</Badge>
          <Badge variant="outline">Liabilities: {fmt(data.totals.liabilities)}</Badge>
          <Badge variant="outline">Equity: {fmt(data.totals.equity)}</Badge>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Assets" rows={data?.assets ?? []} total={data?.totals.assets ?? 0} cls="text-blue-700" />
        <div className="space-y-5">
          <Section title="Liabilities" rows={data?.liabilities ?? []} total={data?.totals.liabilities ?? 0} cls="text-red-700" />
          <Section title="Equity" rows={data?.equity ?? []} total={data?.totals.equity ?? 0} cls="text-purple-700" />
          {data && (
            <Card className="border-purple-200 dark:border-purple-900">
              <CardContent className="flex items-center justify-between p-4">
                <p className="text-sm font-semibold">Total Liabilities + Equity</p>
                <p className={`text-xl font-bold font-mono ${data.totals.balanced ? "text-green-600" : "text-destructive"}`}>{fmt(data.totals.liabilitiesAndEquity)}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 6 — ACCRUALS
   ══════════════════════════════════════════════════════════════════════════════ */
function AccrualsTab({ accounts }: { accounts: Account[] }) {
  const { toast } = useToast();
  const { format: fmt } = useCurrency();
  const qc = useQueryClient();
  const { data: me } = useGetCurrentUser();
  const canWrite = me?.role === "admin" || me?.role === "accountant";

  const { data: accruals = [], isLoading, refetch } = useAccruals();
  const [showDialog, setShowDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  interface AccrualForm { type: string; description: string; amount: number; accrualDate: string; recognitionDate: string; accountId: string; notes: string; relatedEntityType: string; }
  const { register, handleSubmit, control, reset, watch } = useForm<AccrualForm>({
    defaultValues: { type: "accrued_income", description: "", amount: 0, accrualDate: new Date().toISOString().split("T")[0], recognitionDate: "", accountId: "", notes: "", relatedEntityType: "" },
  });

  const createMut = useMutation({
    mutationFn: (body: any) => apiFetch<Accrual>("/api/accruals", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Accrual created" }); qc.invalidateQueries({ queryKey: ["accruals"] }); reset(); setShowDialog(false); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const recognizeMut = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) => apiFetch(`/api/accruals/${id}/recognize`, { method: "POST", body: JSON.stringify({ date }) }),
    onSuccess: () => { toast({ title: "Accrual recognized" }); qc.invalidateQueries({ queryKey: ["accruals"] }); },
    onError:   (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const reverseMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/accruals/${id}/reverse`, { method: "POST", body: JSON.stringify({ date: new Date().toISOString().split("T")[0] }) }),
    onSuccess: () => { toast({ title: "Accrual reversed" }); qc.invalidateQueries({ queryKey: ["accruals"] }); },
    onError:   (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const onSubmit = (data: AccrualForm) => {
    createMut.mutate({
      type: data.type, description: data.description, amount: Number(data.amount),
      accrualDate: data.accrualDate, recognitionDate: data.recognitionDate || null,
      accountId: data.accountId ? parseInt(data.accountId, 10) : null,
      notes: data.notes || null, relatedEntityType: data.relatedEntityType || null,
    });
  };

  const filtered = accruals.filter((a) => statusFilter === "all" || a.status === statusFilter);

  const TYPE_LABELS: Record<string, string> = {
    accrued_income: "Accrued Income", accrued_expense: "Accrued Expense",
    deferred_income: "Deferred Income", deferred_expense: "Deferred Expense",
  };
  const STATUS_COLORS: Record<string, string> = {
    pending:    "bg-amber-100 text-amber-800",
    recognized: "bg-green-100 text-green-800",
    reversed:   "bg-muted text-muted-foreground",
  };
  const TYPE_COLORS: Record<string, string> = {
    accrued_income: "bg-green-100 text-green-800", accrued_expense: "bg-red-100 text-red-800",
    deferred_income: "bg-blue-100 text-blue-800", deferred_expense: "bg-purple-100 text-purple-800",
  };

  const accrualType = watch("type");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Accruals</h2>
          <p className="text-sm text-muted-foreground">Accrual-basis adjusting entries — recognize revenue and expenses when earned/incurred regardless of cash flow.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          {canWrite && <Button size="sm" onClick={() => setShowDialog(true)}><Plus className="mr-1.5 h-4 w-4" />New Accrual</Button>}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pending",    status: "pending",    cls: "text-amber-600" },
          { label: "Recognized", status: "recognized", cls: "text-green-600" },
          { label: "Reversed",   status: "reversed",   cls: "text-muted-foreground" },
        ].map(({ label, status, cls }) => {
          const items = accruals.filter((a) => a.status === status);
          const total = items.reduce((s, a) => s + a.amount, 0);
          return (
            <Card key={status} className="cursor-pointer" onClick={() => setStatusFilter(status === statusFilter ? "all" : status)}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-xl font-bold ${cls}`}>{fmt(total)}</p>
                <p className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2">
        {["all","pending","recognized","reversed"].map((s) => (
          <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} className="capitalize" onClick={() => setStatusFilter(s)}>{s}</Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="hidden md:table-cell">Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4" /></TableCell>)}</TableRow>)
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">No accruals found.</TableCell></TableRow>
              ) : (
                filtered.map((a) => (
                  <TableRow key={a.id} className="text-sm">
                    <TableCell><Badge className={`text-xs ${TYPE_COLORS[a.type] ?? ""}`}>{TYPE_LABELS[a.type] ?? a.type}</Badge></TableCell>
                    <TableCell className="max-w-[180px] truncate">{a.description}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{a.accountName ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono font-semibold tabular-nums">{fmt(a.amount)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{new Date(a.accrualDate).toLocaleDateString()}</TableCell>
                    <TableCell><Badge className={`text-xs capitalize ${STATUS_COLORS[a.status] ?? ""}`}>{a.status}</Badge></TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {a.status === "pending" && (
                            <Button size="sm" variant="outline" className="h-7 text-green-700 border-green-300" onClick={() => recognizeMut.mutate({ id: a.id, date: new Date().toISOString().split("T")[0] })}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Recognize
                            </Button>
                          )}
                          {a.status !== "reversed" && me?.role === "admin" && (
                            <Button size="sm" variant="outline" className="h-7" onClick={() => reverseMut.mutate(a.id)}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New Accrual Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Accrual Entry</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Accrual Type *</Label>
              <Controller name="type" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accrued_income">Accrued Income (revenue earned, not yet received)</SelectItem>
                    <SelectItem value="accrued_expense">Accrued Expense (cost incurred, not yet paid)</SelectItem>
                    <SelectItem value="deferred_income">Deferred Income (cash received, not yet earned)</SelectItem>
                    <SelectItem value="deferred_expense">Deferred Expense (prepaid cost)</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>

            <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
              {accrualType === "accrued_income" && "Journal Entry: Dr. Accounts Receivable (1100) / Cr. Sales Revenue (4000)"}
              {accrualType === "accrued_expense" && "Journal Entry: Dr. Expense Account / Cr. Accrued Liabilities (2100)"}
              {accrualType === "deferred_income" && "Journal Entry: Dr. Cash (1000) / Cr. Deferred Revenue (2200)"}
              {accrualType === "deferred_expense" && "Journal Entry: Dr. Prepaid Expenses (1300) / Cr. Cash (1000)"}
            </div>

            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Input placeholder="e.g. November service revenue not yet billed" {...register("description", { required: true })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" min="0" {...register("amount", { required: true, valueAsNumber: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Accrual Date *</Label>
                <Input type="date" {...register("accrualDate", { required: true })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Expected Recognition Date</Label>
                <Input type="date" {...register("recognitionDate")} />
              </div>
              <div className="space-y-1.5">
                <Label>Override Account</Label>
                <Controller name="accountId" control={control} render={({ field }) => (
                  <AccountSelect value={field.value} onChange={field.onChange} accounts={accounts} placeholder="Auto-selected…" />
                )} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Related Entity</Label>
                <Controller name="relatedEntityType" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input placeholder="Optional notes" {...register("notes")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { reset(); setShowDialog(false); }}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending}>Create accrual</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   ROOT PAGE
   ══════════════════════════════════════════════════════════════════════════════ */
export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState("cashbook");
  const { data: accounts = [] } = useAccounts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Accounting</h1>
        <p className="text-muted-foreground">Cash book, double-entry journal, financial reports, and accrual management.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex-wrap h-auto gap-1 justify-start">
          <TabsTrigger value="cashbook"  className="gap-1.5"><Receipt     className="h-4 w-4" />Cash Book</TabsTrigger>
          <TabsTrigger value="journal"   className="gap-1.5"><BookOpen    className="h-4 w-4" />Journal Entries</TabsTrigger>
          <TabsTrigger value="trialbal"  className="gap-1.5"><ArrowUpDown className="h-4 w-4" />Trial Balance</TabsTrigger>
          <TabsTrigger value="pl"        className="gap-1.5"><BarChart3   className="h-4 w-4" />Profit & Loss</TabsTrigger>
          <TabsTrigger value="bs"        className="gap-1.5"><Scale       className="h-4 w-4" />Balance Sheet</TabsTrigger>
          <TabsTrigger value="accruals"  className="gap-1.5"><ClipboardList className="h-4 w-4" />Accruals</TabsTrigger>
        </TabsList>

        <TabsContent value="cashbook">  <CashBookTab       accounts={accounts} /></TabsContent>
        <TabsContent value="journal">   <JournalEntriesTab accounts={accounts} /></TabsContent>
        <TabsContent value="trialbal">  <TrialBalanceTab /></TabsContent>
        <TabsContent value="pl">        <ProfitLossTab /></TabsContent>
        <TabsContent value="bs">        <BalanceSheetTab /></TabsContent>
        <TabsContent value="accruals">  <AccrualsTab       accounts={accounts} /></TabsContent>
      </Tabs>
    </div>
  );
}
