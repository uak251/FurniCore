import { useState, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { useListProducts } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  useSalesOverview, useSalesOrders, useCreateSalesOrder, useUpdateSalesOrder, useAddOrderUpdate,
  useSalesInvoices, useGenerateInvoice, useUpdateInvoice,
  useSalesDiscounts, useCreateDiscount, useUpdateDiscount, useDeleteDiscount,
  useSalesReceivables,
  type CustomerOrder, type Invoice, type Discount,
} from "@/hooks/use-sales-manager";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ShoppingCart, FileText, Tag, BarChart3, TrendingUp, TrendingDown,
  Plus, Pencil, Trash2, CheckCircle2, ChevronDown, ChevronUp,
  Package, AlertTriangle, DollarSign, Users, Clock, Image,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Shared helpers ──────────────────────────────────────────────────────── */

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:          { label: "Draft",          color: "bg-slate-100 text-slate-700"    },
  confirmed:      { label: "Confirmed",      color: "bg-blue-100 text-blue-700"      },
  in_production:  { label: "In Production",  color: "bg-purple-100 text-purple-700"  },
  quality_check:  { label: "Quality Check",  color: "bg-amber-100 text-amber-700"    },
  shipped:        { label: "Shipped",        color: "bg-teal-100 text-teal-700"      },
  delivered:      { label: "Delivered",      color: "bg-green-100 text-green-700"    },
  cancelled:      { label: "Cancelled",      color: "bg-red-100 text-red-700"        },
};

const INVOICE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:     { label: "Draft",    color: "bg-slate-100 text-slate-600"   },
  sent:      { label: "Sent",     color: "bg-blue-100 text-blue-700"     },
  paid:      { label: "Paid",     color: "bg-green-100 text-green-700"   },
  overdue:   { label: "Overdue",  color: "bg-red-100 text-red-700"       },
  cancelled: { label: "Cancelled",color: "bg-slate-100 text-slate-500"   },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ─── KPI card ────────────────────────────────────────────────────────────── */

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: React.ElementType; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <div className={cn("rounded-lg p-2", accent ?? "bg-primary/10")}><Icon className="h-5 w-5 text-primary" /></div>
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 1 — OVERVIEW                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function OverviewTab({ onTabChange }: { onTabChange: (t: string) => void }) {
  const { data, isLoading } = useSalesOverview();
  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i=><Skeleton key={i} className="h-24 w-full"/>)}</div>;
  if (!data) return null;

  const statusOrder = ["confirmed","in_production","quality_check","shipped","delivered"];
  const totalActive = statusOrder.reduce((s,k) => s + (data.ordersByStatus[k] ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi icon={DollarSign} label="MTD Revenue"    value={fmt(data.mtdRevenue)}   sub={`Total: ${fmt(data.totalRevenue)}`}  accent="bg-green-50 dark:bg-green-950/20" />
        <Kpi icon={ShoppingCart} label="MTD Orders"   value={String(data.mtdOrders)} sub={`Total: ${data.totalOrders}`}        accent="bg-blue-50 dark:bg-blue-950/20"  />
        <Kpi icon={FileText} label="Outstanding AR"   value={fmt(data.outstandingAR)}sub="unpaid invoices"                     accent="bg-amber-50 dark:bg-amber-950/20" />
        <Kpi icon={AlertTriangle} label="Overdue Invoices" value={String(data.overdueCount)} sub="require follow-up"           accent="bg-red-50 dark:bg-red-950/20"     />
      </div>

      {/* Order funnel */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Order Pipeline</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {statusOrder.map(status => {
            const count = data.ordersByStatus[status] ?? 0;
            const pct = totalActive > 0 ? (count / totalActive) * 100 : 0;
            const cfg = ORDER_STATUS_CONFIG[status];
            return (
              <div key={status} className="flex items-center gap-3 text-sm">
                <Badge className={cn("w-28 justify-center text-[11px] shrink-0", cfg.color)}>{cfg.label}</Badge>
                <Progress value={pct} className="flex-1 h-2" />
                <span className="w-6 text-right font-semibold tabular-nums">{count}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Recent orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold">Recent Orders</CardTitle>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => onTabChange("orders")}>View all</Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Order</TableHead><TableHead>Customer</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.recentOrders.map(o => {
                const cfg = ORDER_STATUS_CONFIG[o.status] ?? { label: o.status, color: "bg-muted" };
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                    <TableCell>{o.customerName}<br/><span className="text-xs text-muted-foreground">{o.customerEmail}</span></TableCell>
                    <TableCell className="text-right font-semibold">{fmt(o.totalAmount)}</TableCell>
                    <TableCell><Badge className={cn("text-[11px]", cfg.color)}>{cfg.label}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 2 — ORDERS                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

function OrdersTab() {
  const { toast } = useToast();
  const { data: orders = [], isLoading } = useSalesOrders();
  const { data: products = [] } = useListProducts();
  const createOrder  = useCreateSalesOrder();
  const updateOrder  = useUpdateSalesOrder();
  const addUpdate    = useAddOrderUpdate();

  const [search, setSearch]     = useState("");
  const [statusF, setStatusF]   = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updateOrderId, setUpdateOrderId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let r = orders;
    if (search) r = r.filter(o => o.orderNumber.toLowerCase().includes(search.toLowerCase()) || o.customerName.toLowerCase().includes(search.toLowerCase()) || o.customerEmail.toLowerCase().includes(search.toLowerCase()));
    if (statusF !== "all") r = r.filter(o => o.status === statusF);
    return r;
  }, [orders, search, statusF]);

  // Create order form
  const [cartLines, setCartLines] = useState<{ productId: number; name: string; price: number; quantity: number; discountPercent: number }[]>([]);
  const { register: creg, handleSubmit: cSubmit, control: cCtrl, reset: cReset } = useForm({
    defaultValues: { customerName: "", customerEmail: "", shippingAddress: "", notes: "", discountCode: "", taxRate: 0 },
  });

  const addCartLine = (pid: number) => {
    const p = (products as any[]).find((x: any) => x.id === pid);
    if (!p) return;
    setCartLines(prev => {
      const existing = prev.find(l => l.productId === pid);
      if (existing) return prev.map(l => l.productId === pid ? {...l, quantity: l.quantity + 1} : l);
      return [...prev, { productId: pid, name: p.name, price: Number(p.sellingPrice), quantity: 1, discountPercent: 0 }];
    });
  };
  const removeCartLine = (pid: number) => setCartLines(prev => prev.filter(l => l.productId !== pid));
  const cartSubtotal = cartLines.reduce((s, l) => s + l.price * l.quantity * (1 - l.discountPercent / 100), 0);

  const onCreateSubmit = async (data: any) => {
    if (cartLines.length === 0) { toast({ variant: "destructive", title: "Add at least one product" }); return; }
    try {
      await createOrder.mutateAsync({ ...data, taxRate: Number(data.taxRate), items: cartLines.map(l => ({ productId: l.productId, quantity: l.quantity, discountPercent: l.discountPercent })) });
      toast({ title: "Order created" });
      setShowCreate(false); cReset(); setCartLines([]);
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try { await updateOrder.mutateAsync({ id, status }); toast({ title: "Status updated" }); }
    catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input className="w-60" placeholder="Search by name or order #…" value={search} onChange={e => setSearch(e.target.value)} />
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(ORDER_STATUS_CONFIG).map(([k,v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setShowCreate(true)} className="ml-auto"><Plus className="mr-1.5 h-4 w-4" />New order</Button>
      </div>

      {isLoading ? <div className="space-y-2">{[1,2,3].map(i=><Skeleton key={i} className="h-16 w-full"/>)}</div> : (
        <Card><CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8" /><TableHead>Order #</TableHead><TableHead>Customer</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead>
                <TableHead>Date</TableHead><TableHead>Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(o => {
                  const cfg = ORDER_STATUS_CONFIG[o.status] ?? { label: o.status, color: "bg-muted" };
                  const isExp = expandedId === o.id;
                  return (
                    <>
                      <TableRow key={o.id} className={cn(isExp && "border-b-0 bg-muted/20")}>
                        <TableCell>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setExpandedId(isExp ? null : o.id)}>
                            {isExp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                        <TableCell>
                          <p className="font-medium">{o.customerName}</p>
                          <p className="text-xs text-muted-foreground">{o.customerEmail}</p>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{fmt(o.totalAmount)}</TableCell>
                        <TableCell>
                          <Select value={o.status} onValueChange={v => handleStatusChange(o.id, v)}>
                            <SelectTrigger className="h-7 w-36 text-xs">
                              <Badge className={cn("text-[11px]", cfg.color)}>{cfg.label}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(ORDER_STATUS_CONFIG).map(([k,v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setUpdateOrderId(o.id)}>
                            <Image className="mr-1 h-3.5 w-3.5" />Update
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExp && (
                        <TableRow key={`${o.id}-detail`} className="bg-muted/10 hover:bg-muted/10">
                          <TableCell colSpan={7} className="px-4 pb-4 pt-0">
                            <div className="grid gap-4 pt-2 sm:grid-cols-2">
                              <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items ({o.items.length})</p>
                                <div className="space-y-1 text-sm">
                                  {o.items.map(it => (
                                    <div key={it.id} className="flex justify-between">
                                      <span>{it.productName} × {it.quantity}{it.discountPercent > 0 && <span className="ml-1 text-green-600">−{it.discountPercent}%</span>}</span>
                                      <span className="font-mono tabular-nums">{fmt(it.lineTotal)}</span>
                                    </div>
                                  ))}
                                  <Separator className="my-1" />
                                  {o.discountAmount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>−{fmt(o.discountAmount)}</span></div>}
                                  {o.taxAmount > 0 && <div className="flex justify-between text-muted-foreground"><span>Tax ({o.taxRate}%)</span><span>{fmt(o.taxAmount)}</span></div>}
                                  <div className="flex justify-between font-semibold"><span>Total</span><span>{fmt(o.totalAmount)}</span></div>
                                </div>
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Production Updates</p>
                                {o.updates.length === 0 ? <p className="text-xs text-muted-foreground">No updates yet</p> : (
                                  <div className="space-y-1 max-h-48 overflow-y-auto text-xs">
                                    {o.updates.map(u => (
                                      <div key={u.id} className="rounded-md border p-2">
                                        {u.status && <Badge className={cn("mb-1 text-[10px]", ORDER_STATUS_CONFIG[u.status]?.color ?? "bg-muted")}>{u.status}</Badge>}
                                        <p>{u.message}</p>
                                        {u.imageUrl && <a href={u.imageUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-primary hover:underline"><Image className="h-3 w-3" />Photo</a>}
                                        <p className="mt-0.5 text-muted-foreground">{new Date(u.createdAt).toLocaleString()}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {o.shippingAddress && <><p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ship to</p><p className="text-xs">{o.shippingAddress}</p></>}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      )}

      {/* Create order dialog */}
      <Dialog open={showCreate} onOpenChange={v => { if (!v) { setShowCreate(false); cReset(); setCartLines([]); }}}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Create customer order</DialogTitle></DialogHeader>
          <form onSubmit={cSubmit(onCreateSubmit)} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Customer name *</Label><Input {...creg("customerName", { required: true })} /></div>
              <div className="space-y-1"><Label>Customer email *</Label><Input type="email" {...creg("customerEmail", { required: true })} /></div>
              <div className="col-span-2 space-y-1"><Label>Shipping address *</Label><Textarea rows={2} {...creg("shippingAddress", { required: true })} /></div>
              <div className="space-y-1"><Label>Discount code</Label><Input {...creg("discountCode")} placeholder="SAVE10" /></div>
              <div className="space-y-1"><Label>Tax rate (%)</Label><Input type="number" step="0.01" min={0} max={100} {...creg("taxRate", { valueAsNumber: true })} /></div>
              <div className="col-span-2 space-y-1"><Label>Notes</Label><Textarea rows={2} {...creg("notes")} /></div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">Products</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {(products as any[]).filter((p: any) => p.isActive).map((p: any) => (
                  <Button key={p.id} type="button" size="sm" variant="outline" onClick={() => addCartLine(p.id)}>
                    <Plus className="mr-1 h-3 w-3" />{p.name} ({fmt(Number(p.sellingPrice))})
                  </Button>
                ))}
              </div>
              {cartLines.length > 0 && (
                <div className="rounded-lg border divide-y text-sm">
                  {cartLines.map(l => (
                    <div key={l.productId} className="flex items-center gap-3 px-3 py-2">
                      <span className="flex-1">{l.name}</span>
                      <Input type="number" min={1} value={l.quantity} onChange={e => setCartLines(prev => prev.map(x => x.productId === l.productId ? {...x, quantity: Math.max(1, Number(e.target.value))} : x))} className="h-7 w-16 text-xs" />
                      <span className="w-8 text-center text-muted-foreground">@</span>
                      <span className="w-20 text-right font-mono tabular-nums">{fmt(l.price)}</span>
                      <Input type="number" min={0} max={100} value={l.discountPercent} onChange={e => setCartLines(prev => prev.map(x => x.productId === l.productId ? {...x, discountPercent: Number(e.target.value)} : x))} placeholder="Disc%" className="h-7 w-16 text-xs" />
                      <span className="w-20 text-right font-semibold tabular-nums">{fmt(l.price * l.quantity * (1 - l.discountPercent / 100))}</span>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeCartLine(l.productId)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                  <div className="flex justify-between px-3 py-2 font-semibold"><span>Subtotal</span><span className="font-mono">{fmt(cartSubtotal)}</span></div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { setShowCreate(false); cReset(); setCartLines([]); }}>Cancel</Button>
              <Button type="submit" disabled={createOrder.isPending}>Create order</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add production update dialog */}
      {updateOrderId && (
        <AddUpdateDialog orderId={updateOrderId} onClose={() => setUpdateOrderId(null)} addUpdate={addUpdate} toast={toast} />
      )}
    </div>
  );
}

function AddUpdateDialog({ orderId, onClose, addUpdate, toast }: any) {
  const { register, handleSubmit, reset } = useForm({ defaultValues: { message: "", status: "", imageUrl: "", visibleToCustomer: true } });
  const onSubmit = async (data: any) => {
    try {
      await addUpdate.mutateAsync({ orderId, message: data.message, status: data.status || undefined, imageUrl: data.imageUrl || undefined, visibleToCustomer: data.visibleToCustomer });
      toast({ title: "Update added" }); onClose(); reset();
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };
  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add production update</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1"><Label>Message *</Label><Textarea rows={3} {...register("message", { required: true })} placeholder="What happened with this order…" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Status change (optional)</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" {...register("status")}>
                <option value="">No change</option>
                {Object.entries(ORDER_STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label>Image URL</Label><Input {...register("imageUrl")} placeholder="https://…" /></div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="vis" {...register("visibleToCustomer")} defaultChecked className="h-4 w-4 rounded" />
            <Label htmlFor="vis">Visible to customer</Label>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={addUpdate.isPending}>Post update</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 3 — INVOICES                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function InvoicesTab() {
  const { toast } = useToast();
  const { data: invoices = [], isLoading } = useSalesInvoices();
  const { data: orders = [] } = useSalesOrders();
  const generateInvoice = useGenerateInvoice();
  const updateInvoice   = useUpdateInvoice();
  const [statusF, setStatusF] = useState("all");
  const [showGen, setShowGen] = useState(false);

  const { register: greg, handleSubmit: gSubmit, reset: gReset } = useForm({ defaultValues: { orderId: 0, dueDate: "", notes: "", taxRate: 0 } });

  const filtered = useMemo(() => {
    if (statusF === "all") return invoices;
    return invoices.filter(i => i.status === statusF);
  }, [invoices, statusF]);

  const onGenerate = async (data: any) => {
    try {
      await generateInvoice.mutateAsync({ orderId: Number(data.orderId), dueDate: data.dueDate || undefined, notes: data.notes || undefined, taxRate: Number(data.taxRate) || undefined });
      toast({ title: "Invoice generated" }); setShowGen(false); gReset();
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  const markPaid = async (inv: Invoice) => {
    const method = prompt("Payment method (e.g. Bank Transfer, Credit Card):");
    if (!method) return;
    const ref = prompt("Payment reference (optional):") ?? undefined;
    try { await updateInvoice.mutateAsync({ id: inv.id, status: "paid", paymentMethod: method, paymentReference: ref }); toast({ title: "Invoice marked as paid" }); }
    catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {Object.entries(INVOICE_STATUS_CONFIG).map(([k,v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={() => setShowGen(true)}><Plus className="mr-1.5 h-4 w-4" />Generate invoice</Button>
      </div>

      {isLoading ? <Skeleton className="h-48 w-full" /> : (
        <Card><CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Invoice #</TableHead><TableHead>Customer</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Due Date</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(inv => {
                  const cfg = INVOICE_STATUS_CONFIG[inv.status] ?? { label: inv.status, color: "bg-muted" };
                  const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                      <TableCell>
                        <p className="font-medium">{inv.customerName}</p>
                        <p className="text-xs text-muted-foreground">{inv.customerEmail}</p>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(inv.totalAmount)}</TableCell>
                      <TableCell className={cn("text-sm", isOverdue && "font-semibold text-red-600")}>
                        {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}
                        {isOverdue && " (Overdue)"}
                      </TableCell>
                      <TableCell><Badge className={cn("text-[11px]", cfg.color)}>{cfg.label}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {inv.status !== "paid" && inv.status !== "cancelled" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markPaid(inv)}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Mark paid
                            </Button>
                          )}
                          {inv.status === "draft" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateInvoice.mutateAsync({ id: inv.id, status: "sent" }).then(() => toast({ title: "Invoice sent" })).catch((e: any) => toast({ variant:"destructive", title:"Error", description: e.message }))}>
                              Send
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      )}

      <Dialog open={showGen} onOpenChange={setShowGen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate invoice from order</DialogTitle></DialogHeader>
          <form onSubmit={gSubmit(onGenerate)} className="space-y-4">
            <div className="space-y-1">
              <Label>Order *</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1" {...greg("orderId", { required: true, valueAsNumber: true })}>
                <option value={0}>Select order…</option>
                {orders.filter(o => o.status !== "cancelled").map(o => <option key={o.id} value={o.id}>{o.orderNumber} — {o.customerName} ({fmt(o.totalAmount)})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Due date</Label><Input type="datetime-local" {...greg("dueDate")} /></div>
              <div className="space-y-1"><Label>Tax rate (%)</Label><Input type="number" step="0.01" {...greg("taxRate", { valueAsNumber: true })} /></div>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Textarea {...greg("notes")} /></div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowGen(false)}>Cancel</Button>
              <Button type="submit" disabled={generateInvoice.isPending}>Generate</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 4 — DISCOUNTS                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

function DiscountsTab() {
  const { toast } = useToast();
  const { data: discounts = [], isLoading } = useSalesDiscounts();
  const createDiscount = useCreateDiscount();
  const updateDiscount = useUpdateDiscount();
  const deleteDiscount = useDeleteDiscount();
  const [showDialog, setShowDialog] = useState(false);
  const [editDisc, setEditDisc]     = useState<Discount | null>(null);

  const { register, handleSubmit, control, reset } = useForm({
    defaultValues: { code: "", description: "", type: "percentage", value: 10, minOrderAmount: 0, maxUses: null as null | number, expiresAt: "", isActive: true },
  });

  const openCreate = () => { setEditDisc(null); reset(); setShowDialog(true); };
  const openEdit   = (d: Discount) => {
    setEditDisc(d);
    reset({ code: d.code, description: d.description ?? "", type: d.type, value: d.value, minOrderAmount: d.minOrderAmount, maxUses: d.maxUses, expiresAt: d.expiresAt ? d.expiresAt.slice(0,16) : "", isActive: d.isActive });
    setShowDialog(true);
  };

  const onSubmit = async (data: any) => {
    try {
      if (editDisc) { await updateDiscount.mutateAsync({ id: editDisc.id, ...data, value: Number(data.value), minOrderAmount: Number(data.minOrderAmount), maxUses: data.maxUses ? Number(data.maxUses) : null, expiresAt: data.expiresAt || null }); toast({ title: "Discount updated" }); }
      else          { await createDiscount.mutateAsync({ ...data, value: Number(data.value), minOrderAmount: Number(data.minOrderAmount), maxUses: data.maxUses ? Number(data.maxUses) : null, expiresAt: data.expiresAt || null }); toast({ title: "Discount created" }); }
      setShowDialog(false); reset();
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this discount?")) return;
    try { await deleteDiscount.mutateAsync(id); toast({ title: "Deleted" }); }
    catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New discount</Button></div>
      {isLoading ? <Skeleton className="h-48 w-full" /> : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Type</TableHead><TableHead>Value</TableHead>
              <TableHead>Min Order</TableHead><TableHead>Uses</TableHead><TableHead>Expires</TableHead>
              <TableHead>Active</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {discounts.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono font-bold">{d.code}</TableCell>
                  <TableCell><Badge variant="outline">{d.type}</Badge></TableCell>
                  <TableCell className="tabular-nums">{d.type === "percentage" ? `${d.value}%` : fmt(d.value)}</TableCell>
                  <TableCell className="tabular-nums">{d.minOrderAmount > 0 ? fmt(d.minOrderAmount) : "—"}</TableCell>
                  <TableCell className="tabular-nums">{d.usedCount}{d.maxUses ? ` / ${d.maxUses}` : ""}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : "Never"}</TableCell>
                  <TableCell><Badge className={d.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}>{d.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      <Dialog open={showDialog} onOpenChange={v => { if (!v) setShowDialog(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editDisc ? "Edit discount" : "New discount"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Code *</Label><Input {...register("code", { required: true })} className="uppercase" placeholder="SAVE20" /></div>
              <div className="space-y-1"><Label>Type *</Label>
                <Controller name="type" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="fixed">Fixed amount</SelectItem></SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1"><Label>Value</Label><Input type="number" step="0.01" {...register("value", { valueAsNumber: true })} /></div>
              <div className="space-y-1"><Label>Min order amount</Label><Input type="number" step="0.01" {...register("minOrderAmount", { valueAsNumber: true })} /></div>
              <div className="space-y-1"><Label>Max uses (blank = unlimited)</Label><Input type="number" {...register("maxUses", { valueAsNumber: true })} /></div>
              <div className="space-y-1"><Label>Expires at</Label><Input type="datetime-local" {...register("expiresAt")} /></div>
              <div className="col-span-2 space-y-1"><Label>Description</Label><Input {...register("description")} /></div>
              <div className="col-span-2 flex items-center gap-2">
                <Controller name="isActive" control={control} render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
                <Label>Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 5 — RECEIVABLES                                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ReceivablesTab() {
  const { data, isLoading } = useSalesReceivables();
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!data) return null;

  const bucketRows = [
    { key: "current", label: "Current (not yet due)", color: "text-green-600" },
    { key: "days30",  label: "1–30 days overdue",     color: "text-amber-600" },
    { key: "days60",  label: "31–60 days overdue",    color: "text-orange-600" },
    { key: "days90",  label: "61–90 days overdue",    color: "text-red-600"   },
    { key: "over90",  label: ">90 days overdue",       color: "text-red-800"   },
  ];

  return (
    <div className="space-y-6">
      {/* AR summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {bucketRows.map(({ key, label, color }) => (
          <div key={key} className="rounded-lg border bg-card p-3 text-center">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className={cn("text-lg font-bold tabular-nums mt-1", color)}>{fmt((data.buckets as any)[key])}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-primary/5 px-5 py-3">
        <span className="font-semibold">Total Outstanding</span>
        <span className="text-xl font-bold tabular-nums text-primary">{fmt(data.totalOutstanding)}</span>
      </div>

      {/* Invoice list */}
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Invoice #</TableHead><TableHead>Customer</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Due Date</TableHead><TableHead>Age</TableHead><TableHead>Bucket</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.invoices.map(inv => {
              const bucketCfg = bucketRows.find(b => b.key === inv.bucket) ?? bucketRows[0];
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                  <TableCell>
                    <p className="font-medium">{inv.customerName}</p>
                    <p className="text-xs text-muted-foreground">{inv.customerEmail}</p>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{fmt(inv.totalAmount)}</TableCell>
                  <TableCell className="text-sm">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "No due date"}</TableCell>
                  <TableCell className={cn("tabular-nums font-medium", bucketCfg.color)}>
                    {inv.ageDays > 0 ? `${inv.ageDays}d` : "—"}
                  </TableCell>
                  <TableCell><Badge className={cn("text-[10px]", inv.ageDays > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>{bucketCfg.label.split(" ")[0]}</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function SalesPage() {
  const [activeTab, setActiveTab] = useState("overview");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sales Manager</h1>
        <p className="text-muted-foreground">Orders · Invoices · Discounts · Receivables</p>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="overview"     className="gap-1.5"><BarChart3     className="h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="orders"       className="gap-1.5"><ShoppingCart  className="h-4 w-4" />Orders</TabsTrigger>
          <TabsTrigger value="invoices"     className="gap-1.5"><FileText      className="h-4 w-4" />Invoices</TabsTrigger>
          <TabsTrigger value="discounts"    className="gap-1.5"><Tag           className="h-4 w-4" />Discounts</TabsTrigger>
          <TabsTrigger value="receivables"  className="gap-1.5"><TrendingUp    className="h-4 w-4" />Receivables</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"    className="mt-4"><OverviewTab onTabChange={setActiveTab} /></TabsContent>
        <TabsContent value="orders"      className="mt-4"><OrdersTab /></TabsContent>
        <TabsContent value="invoices"    className="mt-4"><InvoicesTab /></TabsContent>
        <TabsContent value="discounts"   className="mt-4"><DiscountsTab /></TabsContent>
        <TabsContent value="receivables" className="mt-4"><ReceivablesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
