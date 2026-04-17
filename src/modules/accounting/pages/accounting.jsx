import { ModuleInsightsDrawer } from "@/components/analytics/ModuleInsightsDrawer";
import { Badge } from "@/components/ui/badge";
import { RecordImagePanel } from "@/components/images";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link } from "wouter";
import { LineChart, Plus } from "lucide-react";
import { ModulePageHeader } from "@/components/module/ModulePageHeader";
import { ModuleActionsMenu } from "@/components/module/ModuleActionsMenu";
import { ModuleTableState } from "@/components/module/ModuleTableState";
import { useAccountingPageModel } from "@/hooks/modules/useAccountingPageModel";
import { useToast } from "@/hooks/use-toast";

export default function AccountingPage() {
  const { format } = useCurrency();
  const { toast } = useToast();
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [evidenceTx, setEvidenceTx] = useState(null);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    type: "expense",
    status: "pending",
    transactionDate: new Date().toISOString().slice(0, 10),
    reference: "",
  });
  const { query, setQuery, type, setType, status, setStatus, rows, createTransaction, isLoading, isError, error, refetch } = useAccountingPageModel();

  const submitCreate = async () => {
    if (!form.description.trim() || !form.amount) {
      toast({ title: "Description and amount are required", variant: "destructive" });
      return;
    }
    try {
      const created = await createTransaction.mutateAsync({
        description: form.description.trim(),
        amount: Number(form.amount),
        type: form.type,
        status: form.status,
        transactionDate: form.transactionDate,
        reference: form.reference.trim() || undefined,
      });
      setCreateOpen(false);
      setEvidenceTx(created);
      setForm({
        description: "",
        amount: "",
        type: "expense",
        status: "pending",
        transactionDate: new Date().toISOString().slice(0, 10),
        reference: "",
      });
      toast({ title: "Cashbook entry added", description: "Attach evidence image(s) in the next step." });
    } catch (e) {
      toast({ title: "Create failed", description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Accounting"
        description="Cashbook overview with clean filters and readable financial status."
        actions={(
          <>
            <ModuleActionsMenu
              label="Actions"
              items={[
                {
                  label: "Add cashbook entry",
                  icon: Plus,
                  onSelect: () => setCreateOpen(true),
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
              moduleName="accounting"
              title="Accounting Analytics"
              reportId="accounting-overview"
              filters={{ type, status }}
              hideTrigger
              open={insightsOpen}
              onOpenChange={setInsightsOpen}
            />
          </>
        )}
      />

      <Card className="border-dashed bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">Financial reporting roadmap</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Today this screen is a <strong className="text-foreground">cashbook</strong> (simple income/expense lines).
            For full <strong className="text-foreground">accounting principles</strong> (double-entry GL, period close,
            trial balance, AR/AP aging tied to invoices, bank reconciliation), the usual approach is: native journal
            APIs you already have under the hood, plus either <strong className="text-foreground">embedded analytics</strong>{" "}
            (this app&apos;s charts) or <strong className="text-foreground">Power BI / Looker Studio</strong> reading the same
            database or a read replica.
          </p>
          <ul className="list-inside list-disc space-y-1 text-foreground/90">
            <li>Phase A (recommended first): GL view + trial balance + export from posted journal entries.</li>
            <li>Phase B: Power BI dataset on invoices, payroll accruals, and inventory COGS (you already have Power BI routes for deck-style reports).</li>
            <li>Phase C: Bank feed rules and reconciliation workflow.</li>
          </ul>
          <p className="pt-1">
            <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/settings">
              Configure Power BI (Settings)
            </Link>
            {" · "}
            <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/chart-of-accounts">
              Chart of accounts
            </Link>
          </p>
          <p className="text-xs">Implementation of Phase A/B can follow once you confirm priority and data source (live DB vs warehouse).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Cashbook</CardTitle>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search description or category..."
              aria-label="Search transactions"
            />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">{String(error?.message ?? "Failed to load transactions.")}</p>
              <Button variant="outline" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : (
            <ModuleTableState isLoading={isLoading} isEmpty={rows.length === 0} emptyMessage="No transactions found.">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-muted-foreground">{tx.transactionDate?.slice(0, 10) || "—"}</TableCell>
                      <TableCell className="font-medium">{tx.description || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{tx.category || "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={tx.type === "income" ? "default" : "secondary"}
                          className={tx.type === "income" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                        >
                          {tx.type || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {tx.type === "expense" ? "-" : "+"}
                        {format(Number(tx.amount ?? 0))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{tx.status || "pending"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setEvidenceTx(tx)}>
                          Evidence
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </ModuleTableState>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add daily cashbook entry</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={form.transactionDate} onChange={(e) => setForm((p) => ({ ...p, transactionDate: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Reference (optional)</Label>
              <Input value={form.reference} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={createTransaction.isPending}>Save entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(evidenceTx)} onOpenChange={(open) => { if (!open) setEvidenceTx(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Entry evidence gallery</DialogTitle>
          </DialogHeader>
          {evidenceTx ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Attach receipt/proof for: <span className="font-medium">{evidenceTx.description}</span> ({format(Number(evidenceTx.amount ?? 0))})
              </p>
              <RecordImagePanel entityType="transaction" entityId={evidenceTx.id} canUpload canDelete />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEvidenceTx(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
