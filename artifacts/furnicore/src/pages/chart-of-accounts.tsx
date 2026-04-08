import { useState, useMemo, useRef } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, BookOpen, Pencil, ToggleLeft, ToggleRight, Sprout, Search, Download, Upload, FileDown } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCurrency } from "@/lib/currency";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";

const API_BASE = apiOriginPrefix();

function apiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}

/* ── types ───────────────────────────────────────────────────────────────── */
interface Account {
  id: number; code: string; name: string;
  type: string; subtype: string | null; normalBalance: string;
  description: string | null; isActive: boolean; createdAt: string;
}

interface AccountForm { code: string; name: string; type: string; subtype: string; normalBalance: string; description: string; }

/* ── api helpers ─────────────────────────────────────────────────────────── */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken() ?? ""}`,
      ...(init?.headers as Record<string, string>),
    },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as { message?: string }).message ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

function useAccounts() {
  return useQuery<Account[]>({ queryKey: ["accounts"], queryFn: () => apiFetch("/api/accounts") });
}

/* ── colour maps ─────────────────────────────────────────────────────────── */
const TYPE_COLORS: Record<string, string> = {
  asset:     "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  liability: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  equity:    "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  income:    "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
  expense:   "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};

const SUBTYPES: Record<string, string[]> = {
  asset:     ["current_asset","fixed_asset","other_asset"],
  liability: ["current_liability","long_term_liability","other_liability"],
  equity:    ["equity"],
  income:    ["operating","non_operating"],
  expense:   ["cogs","operating","non_operating"],
};

export default function ChartOfAccountsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: me } = useGetCurrentUser();
  const canWrite = me?.role === "admin" || me?.role === "accountant";
  const isAdmin  = me?.role === "admin";

  const { data: accounts = [], isLoading } = useAccounts();

  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editItem,   setEditItem]   = useState<Account | null>(null);
  const [form,       setForm]       = useState<AccountForm>({ code: "", name: "", type: "asset", subtype: "current_asset", normalBalance: "debit", description: "" });
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: string[]; total: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounts"] });

  const seedMutation = useMutation({
    mutationFn: () => apiFetch("/api/accounts/seed", { method: "POST" }),
    onSuccess: (data: any) => {
      if (data.seeded) { toast({ title: "Standard accounts seeded", description: `${data.count} accounts created.` }); invalidate(); }
      else toast({ title: "Already seeded", description: data.message });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Seed failed", description: e.message }),
  });

  const createMutation = useMutation({
    mutationFn: (body: AccountForm) => apiFetch("/api/accounts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Account created" }); invalidate(); setShowDialog(false); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<AccountForm> }) =>
      apiFetch(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Account updated" }); invalidate(); setShowDialog(false); setEditItem(null); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => { toast({ title: "Account updated" }); invalidate(); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const openCreate = () => {
    setEditItem(null);
    setForm({ code: "", name: "", type: "asset", subtype: "current_asset", normalBalance: "debit", description: "" });
    setShowDialog(true);
  };

  const handleExport = async () => {
    try {
      const resp = await fetch(apiUrl("/api/accounts/export.csv"), {
        headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = "chart-of-accounts.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast({ variant: "destructive", title: "Export failed", description: e.message }); }
  };

  const handleSampleDownload = async () => {
    try {
      const resp = await fetch(apiUrl("/api/accounts/sample.csv"), {
        headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = "chart-of-accounts-sample.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast({ variant: "destructive", title: "Download failed", description: e.message }); }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const csv = await file.text();
      const resp = await fetch(apiUrl("/api/accounts/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken() ?? ""}` },
        body: JSON.stringify({ csv }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message ?? `HTTP ${resp.status}`);
      const errList = Array.isArray(data.errors) ? data.errors : [];
      setImportResult({ ...data, errors: errList });
      invalidate();
      toast({
        title: "Import complete",
        description: `Created: ${data.created}, Updated: ${data.updated}${errList.length ? `, Errors: ${errList.length}` : ""}`,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Import failed", description: e.message });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openEdit = (a: Account) => {
    setEditItem(a);
    setForm({ code: a.code, name: a.name, type: a.type, subtype: a.subtype ?? "", normalBalance: a.normalBalance, description: a.description ?? "" });
    setShowDialog(true);
  };

  const handleTypeChange = (t: string) => {
    const defaultSub = SUBTYPES[t]?.[0] ?? "";
    const defaultNB  = ["asset","expense"].includes(t) ? "debit" : "credit";
    setForm((f) => ({ ...f, type: t, subtype: defaultSub, normalBalance: defaultNB }));
  };

  const handleSubmit = () => {
    if (!form.code || !form.name) { toast({ variant: "destructive", title: "Code and name are required" }); return; }
    if (editItem) { updateMutation.mutate({ id: editItem.id, body: { name: form.name, subtype: form.subtype, description: form.description } }); }
    else          { createMutation.mutate(form); }
  };

  const filtered = useMemo(() => accounts.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
    const matchType   = typeFilter === "all" || a.type === typeFilter;
    return matchSearch && matchType;
  }), [accounts, search, typeFilter]);

  const grouped = useMemo(() => {
    const g: Record<string, Account[]> = {};
    for (const a of filtered) { (g[a.type] ??= []).push(a); }
    return g;
  }, [filtered]);

  const typeOrder = ["asset","liability","equity","income","expense"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-muted-foreground">Manage the master list of ledger accounts used in double-entry bookkeeping.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSampleDownload} title="Download sample CSV format">
            <FileDown className="mr-1.5 h-4 w-4" />
            Sample CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
          {canWrite && (
            <Button variant="outline" size="sm" onClick={() => { setImportResult(null); setShowImport(true); }}>
              <Upload className="mr-1.5 h-4 w-4" />
              Import CSV
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              <Sprout className="mr-1.5 h-4 w-4" />
              Seed standard accounts
            </Button>
          )}
          {canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Account
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by code or name…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {typeOrder.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary badges */}
      {!isLoading && (
        <div className="flex flex-wrap gap-2">
          {typeOrder.map((t) => {
            const count = accounts.filter((a) => a.type === t && a.isActive).length;
            return count > 0 ? (
              <Badge key={t} className={`${TYPE_COLORS[t]} capitalize cursor-pointer`} onClick={() => setTypeFilter(t === typeFilter ? "all" : t)}>
                {t}: {count}
              </Badge>
            ) : null;
          })}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i=><Skeleton key={i} className="h-12 w-full"/>)}</div>
      ) : (
        <div className="space-y-4">
          {typeOrder.filter((t) => grouped[t]?.length).map((t) => (
            <Card key={t}>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold capitalize flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[t]}`}>{t}</span>
                  <span className="text-muted-foreground font-normal">({grouped[t].length} accounts)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-24">Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">Subtype</TableHead>
                      <TableHead className="hidden sm:table-cell">Normal Balance</TableHead>
                      <TableHead className="hidden lg:table-cell">Description</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      {canWrite && <TableHead className="w-24 text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped[t].map((a) => (
                      <TableRow key={a.id} className={a.isActive ? "" : "opacity-50"}>
                        <TableCell className="font-mono text-sm font-semibold">{a.code}</TableCell>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground capitalize">{a.subtype?.replace(/_/g," ") ?? "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={a.normalBalance === "debit" ? "secondary" : "outline"} className="text-xs capitalize">
                            {a.normalBalance}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{a.description ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={a.isActive ? "default" : "outline"} className="text-xs">
                            {a.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        {canWrite && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => openEdit(a)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {isAdmin && (
                                <Button size="icon" variant="ghost" onClick={() => toggleMutation.mutate({ id: a.id, isActive: !a.isActive })}>
                                  {a.isActive ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
          {!Object.keys(grouped).length && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <BookOpen className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">No accounts found. {isAdmin ? 'Click "Seed standard accounts" to get started.' : "Contact your admin to set up the chart of accounts."}</p>
            </div>
          )}
        </div>
      )}

      {/* Hidden file input for CSV import */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
      />

      {/* CSV Import dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Chart of Accounts from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file to bulk create or update accounts. Existing accounts (matched by <span className="font-mono text-xs">code</span>) will be updated; new codes will be created.
            </p>
            <div className="rounded-md border bg-muted/40 p-3 text-xs font-mono text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Required columns:</p>
              <p>code, name, type, normal_balance</p>
              <p className="font-semibold text-foreground mt-1">Optional columns:</p>
              <p>subtype, description</p>
              <p className="font-semibold text-foreground mt-1">Valid types:</p>
              <p>asset · liability · equity · income · expense</p>
              <p className="font-semibold text-foreground mt-1">Valid normal_balance:</p>
              <p>debit · credit</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSampleDownload} className="flex-1">
                <FileDown className="mr-1.5 h-4 w-4" />
                Download sample CSV
              </Button>
              <Button size="sm" className="flex-1" disabled={importing} onClick={() => fileRef.current?.click()}>
                <Upload className="mr-1.5 h-4 w-4" />
                {importing ? "Importing…" : "Choose CSV file"}
              </Button>
            </div>
            {importResult && (
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <p className="font-medium">Import results ({importResult.total} rows processed)</p>
                <p className="text-green-600">✓ Created: {importResult.created}</p>
                <p className="text-blue-600">↻ Updated: {importResult.updated}</p>
                {(importResult.errors ?? []).length > 0 && (
                  <div>
                    <p className="text-destructive">✗ Errors: {(importResult.errors ?? []).length}</p>
                    <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-0.5">
                      {(importResult.errors ?? []).map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImport(false); setImportResult(null); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Account" : "New Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="acc-code">Account Code *</Label>
                <Input id="acc-code" placeholder="e.g. 1001" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} disabled={!!editItem} />
              </div>
              <div className="space-y-1.5">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={handleTypeChange} disabled={!!editItem}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{typeOrder.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-name">Account Name *</Label>
              <Input id="acc-name" placeholder="e.g. Office Supplies" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Subtype</Label>
                <Select value={form.subtype} onValueChange={(v) => setForm((f) => ({ ...f, subtype: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(SUBTYPES[form.type] ?? []).map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g," ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Normal Balance *</Label>
                <Select value={form.normalBalance} onValueChange={(v) => setForm((f) => ({ ...f, normalBalance: v }))} disabled={!!editItem}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-desc">Description</Label>
              <Input id="acc-desc" placeholder="Optional description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editItem ? "Save changes" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
