import { useState } from "react";
import { useListTransactions, useCreateTransaction, useGetFinancialSummary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Receipt, Search, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { cn } from "@/lib/utils";

interface TransactionForm {
  type: string;
  category: string;
  amount: number;
  description: string;
  status: string;
  transactionDate: string;
}

export default function AccountingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);

  const { data: transactions, isLoading } = useListTransactions();
  const { data: financial } = useGetFinancialSummary();
  const createTransaction = useCreateTransaction();

  const { register, handleSubmit, control, reset, watch } = useForm<TransactionForm>({
    defaultValues: { type: "income", status: "completed", transactionDate: new Date().toISOString().split("T")[0] }
  });

  const filtered = (transactions ?? []).filter((t: any) =>
    (t.description || "").toLowerCase().includes(search.toLowerCase()) ||
    (t.category || "").toLowerCase().includes(search.toLowerCase())
  );

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

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounting Ledger</h1>
          <p className="text-muted-foreground">Track income, expenses, and financial health</p>
        </div>
        <Button onClick={() => { reset(); setShowDialog(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Record Transaction
        </Button>
      </div>

      {financial && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">{fmt(Number(financial.totalRevenue ?? 0))}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Expenses</p>
                  <p className="text-2xl font-bold text-destructive">{fmt(Number(financial.totalExpenses ?? 0))}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-destructive/40" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Net Profit</p>
                  <p className={cn("text-2xl font-bold", Number(financial.netProfit ?? 0) >= 0 ? "text-green-600" : "text-destructive")}>
                    {Number(financial.netProfit ?? 0) < 0 ? "-" : ""}{fmt(Number(financial.netProfit ?? 0))}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-primary/40" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search transactions..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Receipt className="h-10 w-10 mb-3" />
              <p>No transactions found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Description</th>
                  <th className="px-6 py-3 font-medium">Category</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((t: any) => (
                  <tr key={t.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {new Date(t.transactionDate || t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-medium max-w-[200px] truncate">{t.description || "—"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{t.category || "—"}</td>
                    <td className="px-6 py-4">
                      <Badge variant={t.type === "income" ? "default" : "outline"} className={t.type === "income" ? "bg-green-100 text-green-800" : ""}>
                        {t.type === "income" ? "Income" : "Expense"}
                      </Badge>
                    </td>
                    <td className={cn("px-6 py-4 font-mono font-semibold", t.type === "income" ? "text-green-600" : "text-destructive")}>
                      {t.type === "expense" ? "-" : "+"}${Number(t.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="secondary" className="capitalize">{t.status}</Badge>
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
            <DialogTitle>Record Transaction</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Type</Label>
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
              <div className="space-y-1">
                <Label>Category</Label>
                <Input {...register("category")} placeholder="e.g. Product Sales" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description</Label>
                <Input {...register("description", { required: true })} placeholder="Transaction description" />
              </div>
              <div className="space-y-1">
                <Label>Amount ($)</Label>
                <Input type="number" step="0.01" {...register("amount", { valueAsNumber: true, required: true })} />
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" {...register("transactionDate")} />
              </div>
              <div className="col-span-2 space-y-1">
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
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createTransaction.isPending}>Record</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
