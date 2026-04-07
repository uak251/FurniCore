import { useState, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import {
  useSupplierMe,
  useSupplierQuotes,
  useSubmitQuote,
  useSupplierDeliveries,
  useAddDeliveryUpdate,
  usePatchDeliveryUpdate,
  useSupplierLedger,
  type SupplierQuote,
  type DeliveryUpdate,
} from "@/hooks/use-supplier-portal";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText,
  Plus,
  Truck,
  BarChart3,
  Building2,
  Star,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Info,
} from "lucide-react";

/* ─── Constants ─────────────────────────────────────────────────────────────── */

const QUOTE_STATUS_COLOR: Record<string, string> = {
  PENDING: "secondary",
  LOCKED: "outline",
  ADMIN_APPROVED: "default",
  PAID: "default",
};
const QUOTE_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  LOCKED: "Under Review",
  ADMIN_APPROVED: "Approved",
  PAID: "Paid",
};

const DELIVERY_STATUS_COLOR: Record<string, string> = {
  preparing: "secondary",
  shipped: "outline",
  in_transit: "default",
  delivered: "default",
  delayed: "destructive",
};
const DELIVERY_STATUS_LABEL: Record<string, string> = {
  preparing: "Preparing",
  shipped: "Shipped",
  in_transit: "In Transit",
  delivered: "Delivered",
  delayed: "Delayed",
};
const DELIVERY_STATUSES = ["preparing", "shipped", "in_transit", "delivered", "delayed"] as const;

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <div className={`rounded-lg p-2 ${color ?? "bg-primary/10"}`}>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Quote submission dialog ────────────────────────────────────────────────── */

interface QuoteForm {
  description: string;
  quantity: number;
  unitPrice: number;
  notes: string;
  validUntil: string;
}

function SubmitQuoteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const submitQuote = useSubmitQuote();
  const { register, handleSubmit, watch, reset } = useForm<QuoteForm>({
    defaultValues: { quantity: 1, unitPrice: 0 },
  });

  const quantity = watch("quantity");
  const unitPrice = watch("unitPrice");
  const total = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  const onSubmit = async (data: QuoteForm) => {
    try {
      await submitQuote.mutateAsync({
        description: data.description,
        quantity: Number(data.quantity),
        unitPrice: Number(data.unitPrice),
        notes: data.notes || undefined,
        validUntil: data.validUntil || undefined,
      });
      toast({ title: "Quotation submitted", description: "Your quote is now pending review." });
      reset();
      onClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" aria-hidden />
            Submit Quotation
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="sq-desc">Description *</Label>
            <Input
              id="sq-desc"
              placeholder="e.g. Oak Lumber 2×4 – Bulk Q3 Order"
              {...register("description", { required: true })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="sq-qty">Quantity *</Label>
              <Input
                id="sq-qty"
                type="number"
                step="0.01"
                min="0.01"
                {...register("quantity", { valueAsNumber: true, required: true })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sq-price">Unit Price ($) *</Label>
              <Input
                id="sq-price"
                type="number"
                step="0.01"
                min="0"
                {...register("unitPrice", { valueAsNumber: true, required: true })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-2 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">${total.toFixed(2)}</span>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sq-valid">Valid Until (optional)</Label>
            <Input id="sq-valid" type="date" {...register("validUntil")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sq-notes">Notes (optional)</Label>
            <Input id="sq-notes" placeholder="Lead time, terms…" {...register("notes")} />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitQuote.isPending}>
              Submit Quote
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Delivery update dialog ─────────────────────────────────────────────────── */

interface DeliveryForm {
  quoteId: string;
  status: string;
  note: string;
  estimatedDelivery: string;
}

function AddDeliveryDialog({
  open,
  onClose,
  quotes,
  prefillQuoteId,
}: {
  open: boolean;
  onClose: () => void;
  quotes: SupplierQuote[];
  prefillQuoteId?: number;
}) {
  const { toast } = useToast();
  const addUpdate = useAddDeliveryUpdate();
  const { register, handleSubmit, control, reset } = useForm<DeliveryForm>({
    defaultValues: { quoteId: prefillQuoteId?.toString() ?? "", status: "preparing" },
  });

  const onSubmit = async (data: DeliveryForm) => {
    try {
      await addUpdate.mutateAsync({
        quoteId: Number(data.quoteId),
        status: data.status,
        note: data.note || undefined,
        estimatedDelivery: data.estimatedDelivery || undefined,
      });
      toast({ title: "Delivery update added" });
      reset();
      onClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const eligibleQuotes = quotes.filter((q) =>
    ["ADMIN_APPROVED", "PAID", "LOCKED"].includes(q.status),
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" aria-hidden />
            Add Delivery Update
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label>Quote *</Label>
            <Controller
              name="quoteId"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select quote…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleQuotes.map((q) => (
                      <SelectItem key={q.id} value={q.id.toString()}>
                        #{q.id} — {q.description.slice(0, 40)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {eligibleQuotes.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No approved/locked quotes available yet.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Delivery Status *</Label>
            <Controller
              name="status"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status…" />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {DELIVERY_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="del-eta">Estimated Delivery (optional)</Label>
            <Input id="del-eta" type="date" {...register("estimatedDelivery")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="del-note">Note (optional)</Label>
            <Input id="del-note" placeholder="Any remarks about shipment…" {...register("note")} />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={addUpdate.isPending || eligibleQuotes.length === 0}>
              Add Update
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit delivery dialog ───────────────────────────────────────────────────── */

function EditDeliveryDialog({
  update,
  onClose,
}: {
  update: DeliveryUpdate | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const patchUpdate = usePatchDeliveryUpdate();
  const { register, handleSubmit, control, reset } = useForm<{
    status: string;
    note: string;
    estimatedDelivery: string;
  }>({
    values: update
      ? {
          status: update.status,
          note: update.note ?? "",
          estimatedDelivery: update.estimatedDelivery
            ? update.estimatedDelivery.slice(0, 10)
            : "",
        }
      : undefined,
  });

  const onSubmit = async (data: { status: string; note: string; estimatedDelivery: string }) => {
    if (!update) return;
    try {
      await patchUpdate.mutateAsync({
        id: update.id,
        status: data.status,
        note: data.note || undefined,
        estimatedDelivery: data.estimatedDelivery || null,
      });
      toast({ title: "Delivery update saved" });
      reset();
      onClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  return (
    <Dialog open={!!update} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Delivery Update</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label>Status *</Label>
            <Controller
              name="status"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {DELIVERY_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-eta">Estimated Delivery</Label>
            <Input id="edit-eta" type="date" {...register("estimatedDelivery")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-note">Note</Label>
            <Input id="edit-note" {...register("note")} />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={patchUpdate.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main portal page ───────────────────────────────────────────────────────── */

export default function SupplierPortalPage() {
  const { data: profile, isLoading: profileLoading, error: profileError } = useSupplierMe();
  const { data: quotes = [], isLoading: quotesLoading } = useSupplierQuotes();
  const { data: deliveries = [], isLoading: deliveriesLoading } = useSupplierDeliveries();
  const { data: ledger, isLoading: ledgerLoading } = useSupplierLedger();

  const [showSubmitQuote, setShowSubmitQuote] = useState(false);
  const [showAddDelivery, setShowAddDelivery] = useState(false);
  const [deliveryPrefillId, setDeliveryPrefillId] = useState<number | undefined>();
  const [editDelivery, setEditDelivery] = useState<DeliveryUpdate | null>(null);
  const [quoteSearch, setQuoteSearch] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");

  const filteredQuotes = useMemo(
    () =>
      quotes.filter((q) =>
        q.description.toLowerCase().includes(quoteSearch.toLowerCase()),
      ),
    [quotes, quoteSearch],
  );

  const filteredLedger = useMemo(
    () =>
      (ledger?.ledger ?? []).filter((r) =>
        r.description.toLowerCase().includes(ledgerSearch.toLowerCase()),
      ),
    [ledger, ledgerSearch],
  );

  if (profileLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500" aria-hidden />
        <div>
          <p className="text-xl font-semibold">Supplier profile not linked</p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Your account is not yet linked to a supplier record. Please ask your FurniCore
            administrator to create a supplier entry with your email address (
            <span className="font-mono text-xs">{/* email shown server-side */}</span>).
          </p>
        </div>
        <Alert className="max-w-md text-left">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Admin steps: Go to <strong>Suppliers</strong> module → create or edit a supplier →
            set the <strong>Email</strong> field to match your login email → save. Then refresh
            this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  /* ── Summary cards ─────────────────────────────────────────────── */
  const summary = ledger?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" aria-hidden />
            <h1 className="text-2xl font-bold tracking-tight">{profile.name}</h1>
            {profile.status === "active" ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                Active
              </Badge>
            ) : (
              <Badge variant="secondary">{profile.status}</Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {profile.email}
            {profile.phone ? ` · ${profile.phone}` : ""}
            {profile.rating !== null ? (
              <span className="ml-2 inline-flex items-center gap-0.5">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                {profile.rating}/5
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Button onClick={() => setShowSubmitQuote(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Submit Quote
          </Button>
          <Button
            variant="outline"
            onClick={() => { setDeliveryPrefillId(undefined); setShowAddDelivery(true); }}
          >
            <Truck className="mr-1.5 h-4 w-4" aria-hidden />
            Add Delivery Update
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            icon={FileText}
            label="Total Quotes"
            value={summary.totalQuotes}
            color="bg-blue-50 dark:bg-blue-900/20"
          />
          <SummaryCard
            icon={DollarSign}
            label="Total Value"
            value={`$${summary.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            color="bg-purple-50 dark:bg-purple-900/20"
          />
          <SummaryCard
            icon={CheckCircle2}
            label="Paid"
            value={`$${summary.paidValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            color="bg-green-50 dark:bg-green-900/20"
          />
          <SummaryCard
            icon={Clock}
            label="Pending"
            value={`$${summary.pendingValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            color="bg-amber-50 dark:bg-amber-900/20"
          />
        </div>
      )}

      {/* Main tabs */}
      <Tabs defaultValue="quotes">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="quotes" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" aria-hidden />
            My Quotes
          </TabsTrigger>
          <TabsTrigger value="deliveries" className="flex items-center gap-1.5">
            <Truck className="h-4 w-4" aria-hidden />
            Deliveries
          </TabsTrigger>
          <TabsTrigger value="ledger" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" aria-hidden />
            Ledger
          </TabsTrigger>
        </TabsList>

        {/* ── Quotes tab ───────────────────────────────────────────── */}
        <TabsContent value="quotes" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Input
              placeholder="Search quotes…"
              value={quoteSearch}
              onChange={(e) => setQuoteSearch(e.target.value)}
              className="max-w-xs"
            />
            <Button size="sm" onClick={() => setShowSubmitQuote(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              New Quote
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {quotesLoading ? (
                <div className="space-y-3 p-6">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : filteredQuotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <FileText className="h-10 w-10" aria-hidden />
                  <p>No quotes yet</p>
                  <Button size="sm" variant="outline" onClick={() => setShowSubmitQuote(true)}>
                    Submit your first quote
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">#</TableHead>
                        <TableHead scope="col">Description</TableHead>
                        <TableHead scope="col" className="text-right">Qty</TableHead>
                        <TableHead scope="col" className="text-right">Unit Price</TableHead>
                        <TableHead scope="col" className="text-right">Total</TableHead>
                        <TableHead scope="col">Status</TableHead>
                        <TableHead scope="col">Valid Until</TableHead>
                        <TableHead scope="col">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredQuotes.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            #{q.id}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate font-medium">
                            {q.description}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {q.quantity}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${q.unitPrice.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            ${q.totalPrice.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={QUOTE_STATUS_COLOR[q.status] as any}
                              className={q.status === "PAID" ? "bg-green-100 text-green-800" : ""}
                            >
                              {QUOTE_STATUS_LABEL[q.status] ?? q.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {q.validUntil ? new Date(q.validUntil).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell>
                            {["ADMIN_APPROVED", "LOCKED"].includes(q.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setDeliveryPrefillId(q.id);
                                  setShowAddDelivery(true);
                                }}
                              >
                                <Truck className="mr-1 h-3.5 w-3.5" aria-hidden />
                                Update Delivery
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Deliveries tab ──────────────────────────────────────── */}
        <TabsContent value="deliveries" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Track and update delivery status for your approved quotes.
            </p>
            <Button
              size="sm"
              onClick={() => { setDeliveryPrefillId(undefined); setShowAddDelivery(true); }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Add Update
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {deliveriesLoading ? (
                <div className="space-y-3 p-6">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : deliveries.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Truck className="h-10 w-10" aria-hidden />
                  <p>No delivery updates yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">Quote</TableHead>
                        <TableHead scope="col">Delivery Status</TableHead>
                        <TableHead scope="col">Estimated Delivery</TableHead>
                        <TableHead scope="col">Note</TableHead>
                        <TableHead scope="col">Posted</TableHead>
                        <TableHead scope="col" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveries.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>
                            <div className="max-w-[160px]">
                              <p className="truncate text-sm font-medium">{d.quoteDescription}</p>
                              <Badge
                                variant={QUOTE_STATUS_COLOR[d.quoteStatus] as any}
                                className="mt-0.5 text-[10px]"
                              >
                                Quote: {QUOTE_STATUS_LABEL[d.quoteStatus] ?? d.quoteStatus}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={DELIVERY_STATUS_COLOR[d.status] as any}
                              className={
                                d.status === "delivered"
                                  ? "bg-green-100 text-green-800"
                                  : d.status === "delayed"
                                  ? "bg-red-100 text-red-800"
                                  : ""
                              }
                            >
                              {DELIVERY_STATUS_LABEL[d.status] ?? d.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {d.estimatedDelivery
                              ? new Date(d.estimatedDelivery).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                            {d.note ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(d.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditDelivery(d)}
                              aria-label="Edit delivery update"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Ledger tab ───────────────────────────────────────────── */}
        <TabsContent value="ledger" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
                Transaction Ledger
              </h2>
              <p className="text-xs text-muted-foreground">
                All quotes and their financial status — scoped to your account only.
              </p>
            </div>
            <Input
              placeholder="Search ledger…"
              value={ledgerSearch}
              onChange={(e) => setLedgerSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {/* Ledger summary bar */}
          {ledger && (
            <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Approved (Pending Payment)</p>
                <p className="mt-0.5 text-lg font-bold text-amber-600 tabular-nums">
                  ${ledger.summary.approvedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Paid</p>
                <p className="mt-0.5 text-lg font-bold text-green-600 tabular-nums">
                  ${ledger.summary.paidValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Lifetime Total</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">
                  ${ledger.summary.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              {ledgerLoading ? (
                <div className="space-y-3 p-6">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : filteredLedger.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <BarChart3 className="h-10 w-10" aria-hidden />
                  <p>No ledger entries yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">#</TableHead>
                        <TableHead scope="col">Description</TableHead>
                        <TableHead scope="col" className="text-right">Qty</TableHead>
                        <TableHead scope="col" className="text-right">Unit Price</TableHead>
                        <TableHead scope="col" className="text-right">Total</TableHead>
                        <TableHead scope="col">Status</TableHead>
                        <TableHead scope="col">Date</TableHead>
                        <TableHead scope="col">Paid On</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLedger.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            #{r.id}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate font-medium">
                            {r.description}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {r.quantity}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${r.unitPrice.toFixed(2)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono font-semibold ${
                              r.status === "PAID"
                                ? "text-green-600"
                                : r.status === "ADMIN_APPROVED"
                                ? "text-amber-600"
                                : ""
                            }`}
                          >
                            ${r.totalPrice.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={QUOTE_STATUS_COLOR[r.status] as any}
                              className={r.status === "PAID" ? "bg-green-100 text-green-800" : ""}
                            >
                              {QUOTE_STATUS_LABEL[r.status] ?? r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.paidAt ? new Date(r.paidAt).toLocaleDateString() : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Power BI note */}
          <Card className="border-dashed bg-muted/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
                Power BI Analytics (Optional)
              </CardTitle>
              <CardDescription className="text-xs">
                An administrator can embed a Power BI report filtered to your supplier account.
                Once configured, an embedded dashboard will appear here showing advanced charts
                for your transaction trends.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Ask your FurniCore admin to set{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                    POWERBI_SUPPLIER_LEDGER_REPORT_ID
                  </code>{" "}
                  in the environment and configure Row-Level Security in your Power BI workspace
                  to filter by <strong>Supplier ID {profile.id}</strong>.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ──────────────────────────────────────────────────── */}
      <SubmitQuoteDialog open={showSubmitQuote} onClose={() => setShowSubmitQuote(false)} />
      <AddDeliveryDialog
        open={showAddDelivery}
        onClose={() => { setShowAddDelivery(false); setDeliveryPrefillId(undefined); }}
        quotes={quotes}
        prefillQuoteId={deliveryPrefillId}
      />
      <EditDeliveryDialog
        update={editDelivery}
        onClose={() => setEditDelivery(null)}
      />
    </div>
  );
}
