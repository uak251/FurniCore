import { useState } from "react";
import { useListQuotes, useCreateQuote, useLockQuote, useApproveQuote, usePayQuote, useListSuppliers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileText, Search, Lock, CheckCircle, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";

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

export default function QuotesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);

  const { data: quotes, isLoading } = useListQuotes();
  const { data: suppliers } = useListSuppliers();
  const createQuote = useCreateQuote();
  const lockQuote = useLockQuote();
  const approveQuote = useApproveQuote();
  const payQuote = usePayQuote();

  const { register, handleSubmit, control, reset } = useForm<QuoteForm>({
    defaultValues: { quantity: 1, unitPrice: 0 }
  });

  const filtered = (quotes ?? []).filter((q: any) => {
    const desc = (q.description || "").toLowerCase();
    const sup = (q.supplierName || "").toLowerCase();
    return desc.includes(search.toLowerCase()) || sup.includes(search.toLowerCase());
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listQuotes"] });

  const handleAction = async (action: () => Promise<any>, msg: string) => {
    try {
      await action();
      toast({ title: msg });
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const onSubmit = async (data: QuoteForm) => {
    const total = Number(data.quantity) * Number(data.unitPrice);
    try {
      await createQuote.mutateAsync({ data: { ...data, totalPrice: total } });
      toast({ title: "Quote created" });
      invalidate();
      setShowDialog(false);
      reset();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Supplier Quotes</h1>
          <p className="text-muted-foreground">Price-locked quote workflow: Pending → Locked → Approved → Paid</p>
        </div>
        <Button onClick={() => { reset(); setShowDialog(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          New Quote
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search quotes..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-10 w-10 mb-3" />
              <p>No quotes found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Supplier</th>
                  <th className="px-6 py-3 font-medium">Description</th>
                  <th className="px-6 py-3 font-medium">Qty</th>
                  <th className="px-6 py-3 font-medium">Unit Price</th>
                  <th className="px-6 py-3 font-medium">Total</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((q: any) => (
                  <tr key={q.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-4 font-medium">{q.supplierName || `Supplier #${q.supplierId}`}</td>
                    <td className="px-6 py-4 text-muted-foreground max-w-[200px] truncate">{q.description}</td>
                    <td className="px-6 py-4 font-mono">{Number(q.quantity)}</td>
                    <td className="px-6 py-4 font-mono">${Number(q.unitPrice).toFixed(2)}</td>
                    <td className="px-6 py-4 font-mono font-semibold">${Number(q.totalPrice).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <Badge variant={STATUS_COLORS[q.status] as any} className={q.status === "PAID" ? "bg-green-100 text-green-800" : ""}>
                        {STATUS_LABEL[q.status] || q.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {q.status === "PENDING" && (
                          <Button size="sm" variant="outline" onClick={() => handleAction(() => lockQuote.mutateAsync({ id: q.id }), "Quote locked")}>
                            <Lock className="mr-1.5 h-3.5 w-3.5" />Lock
                          </Button>
                        )}
                        {q.status === "LOCKED" && (
                          <Button size="sm" variant="outline" onClick={() => handleAction(() => approveQuote.mutateAsync({ id: q.id }), "Quote approved")}>
                            <CheckCircle className="mr-1.5 h-3.5 w-3.5" />Approve
                          </Button>
                        )}
                        {q.status === "ADMIN_APPROVED" && (
                          <Button size="sm" onClick={() => handleAction(() => payQuote.mutateAsync({ id: q.id }), "Quote paid")}>
                            <CreditCard className="mr-1.5 h-3.5 w-3.5" />Mark Paid
                          </Button>
                        )}
                        {q.status === "PAID" && (
                          <span className="text-xs text-green-600 font-medium">Complete</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Supplier Quote</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Supplier</Label>
                <Controller name="supplierId" control={control} rules={{ required: true }} render={({ field }) => (
                  <Select value={field.value?.toString()} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                    <SelectContent>
                      {(suppliers ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description</Label>
                <Input {...register("description", { required: true })} placeholder="e.g. Oak Lumber - Bulk Order Q2" />
              </div>
              <div className="space-y-1">
                <Label>Quantity</Label>
                <Input type="number" step="0.01" {...register("quantity", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label>Unit Price ($)</Label>
                <Input type="number" step="0.01" {...register("unitPrice", { valueAsNumber: true })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notes</Label>
                <Input {...register("notes")} placeholder="Optional notes..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createQuote.isPending}>Create Quote</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
