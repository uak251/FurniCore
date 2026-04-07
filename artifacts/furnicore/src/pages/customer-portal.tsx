/**
 * Customer Portal — three tabs:
 *   Browse    — product catalog + cart + checkout
 *   My Orders — order list with production timeline + remarks/images
 *   Invoices  — invoice list + pay
 */

import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import {
  useCustomerProfile,
  useProductCatalog,
  useValidateDiscount,
  useCustomerOrders,
  usePlaceOrder,
  useCustomerInvoices,
  usePayInvoice,
  type CatalogProduct,
  type CartItem,
  type CustomerOrder,
  type CustomerInvoice,
} from "@/hooks/use-customer-portal";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShoppingCart, Package, FileText, Minus, Plus, Trash2,
  CheckCircle2, Clock, Truck, Star, Image, Info, ChevronDown, ChevronUp,
  ShoppingBag, Tag, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Shared helpers ──────────────────────────────────────────────────────── */

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ORDER_TIMELINE = [
  { key: "draft",         label: "Order received",   icon: ShoppingCart },
  { key: "confirmed",     label: "Confirmed",        icon: CheckCircle2 },
  { key: "in_production", label: "In Production",    icon: Package },
  { key: "quality_check", label: "Quality Check",    icon: Star },
  { key: "shipped",       label: "Shipped",          icon: Truck },
  { key: "delivered",     label: "Delivered",        icon: CheckCircle2 },
];

const STATUS_ORDER = ORDER_TIMELINE.map(s => s.key);

const STATUS_COLORS: Record<string, string> = {
  draft:          "bg-slate-100 text-slate-600",
  confirmed:      "bg-blue-100 text-blue-700",
  in_production:  "bg-purple-100 text-purple-700",
  quality_check:  "bg-amber-100 text-amber-700",
  shipped:        "bg-teal-100 text-teal-700",
  delivered:      "bg-green-100 text-green-700",
  cancelled:      "bg-red-100 text-red-700",
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft:     "bg-slate-100 text-slate-600",
  sent:      "bg-blue-100 text-blue-700",
  paid:      "bg-green-100 text-green-700",
  overdue:   "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-400",
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PROFILE HEADER                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ProfileHeader({ cartCount }: { cartCount: number }) {
  const { data: user } = useCustomerProfile();
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-primary/60 to-primary" />
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
          {user?.name?.slice(0,2).toUpperCase() ?? "CU"}
        </div>
        <div className="flex-1">
          <p className="font-semibold">{user?.name ?? "—"}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
        {cartCount > 0 && (
          <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
            <ShoppingCart className="h-4 w-4" />
            {cartCount} item{cartCount !== 1 ? "s" : ""} in cart
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 1 — BROWSE & CHECKOUT                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

function BrowseTab({
  cart, setCart, onOrderPlaced,
}: {
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  onOrderPlaced: () => void;
}) {
  const { toast } = useToast();
  const { data: catalog = [], isLoading } = useProductCatalog();
  const placeOrder = usePlaceOrder();

  const [search, setSearch]         = useState("");
  const [categoryF, setCategoryF]   = useState("all");
  const [showCheckout, setShowCheckout] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; discountAmount: number; description?: string | null } | null>(null);

  const subtotal = cart.reduce((s, item) => s + item.product.sellingPrice * item.quantity, 0);
  const discount = appliedDiscount?.discountAmount ?? 0;
  const total    = Math.max(0, subtotal - discount);

  const { data: discountResult } = useValidateDiscount(discountInput, subtotal);

  const categories = useMemo(() => {
    const cats = new Set(catalog.map(p => p.category).filter((c): c is string => !!c));
    return Array.from(cats).sort();
  }, [catalog]);

  const filtered = useMemo(() => {
    let r = catalog;
    if (search) r = r.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.description ?? "").toLowerCase().includes(search.toLowerCase()));
    if (categoryF !== "all") r = r.filter(p => p.category === categoryF);
    return r;
  }, [catalog, search, categoryF]);

  const addToCart = (product: CatalogProduct) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1 }];
    });
  };

  const changeQty = (productId: number, delta: number) => {
    setCart(prev => prev
      .map(i => i.product.id === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
      .filter(i => i.quantity > 0));
  };

  const applyDiscount = () => {
    if (discountResult?.valid) {
      setAppliedDiscount({ code: discountInput.toUpperCase(), discountAmount: discountResult.discountAmount!, description: discountResult.description });
      toast({ title: "Discount applied!", description: discountResult.description ?? `Saving ${fmt(discountResult.discountAmount!)}` });
    } else if (discountResult) {
      toast({ variant: "destructive", title: "Invalid code", description: discountResult.reason });
    }
  };

  const { register, handleSubmit, reset } = useForm({ defaultValues: { shippingAddress: "", notes: "" } });

  const onCheckout = async (data: any) => {
    if (cart.length === 0) { toast({ variant: "destructive", title: "Cart is empty" }); return; }
    try {
      await placeOrder.mutateAsync({
        shippingAddress: data.shippingAddress,
        notes: data.notes || undefined,
        discountCode: appliedDiscount?.code,
        items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity })),
      });
      toast({ title: "Order placed!", description: "We'll notify you as it progresses." });
      setCart([]); setAppliedDiscount(null); setDiscountInput(""); setShowCheckout(false); reset();
      onOrderPlaced();
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input className="w-56" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
        <Select value={categoryF} onValueChange={setCategoryF}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {cart.length > 0 && (
          <Button className="ml-auto" onClick={() => setShowCheckout(true)}>
            <ShoppingCart className="mr-1.5 h-4 w-4" />
            Checkout ({cart.length}) — {fmt(total)}
          </Button>
        )}
      </div>

      {/* Product grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="mb-3 h-10 w-10" /><p>No products match your search</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(product => {
            const cartItem = cart.find(i => i.product.id === product.id);
            return (
              <Card key={product.id} className="flex flex-col hover:shadow-md transition-shadow">
                <div className="flex h-32 items-center justify-center rounded-t-lg bg-gradient-to-br from-primary/5 to-primary/15">
                  <Package className="h-12 w-12 text-primary/40" aria-hidden />
                </div>
                <CardContent className="flex flex-1 flex-col p-4">
                  <Badge variant="outline" className="mb-2 w-fit text-[10px]">{product.category}</Badge>
                  <p className="font-semibold leading-tight">{product.name}</p>
                  {product.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>}
                  <p className="mt-auto pt-3 text-lg font-bold text-primary">{fmt(product.sellingPrice)}</p>
                  {product.stockQuantity === 0 ? (
                    <p className="mt-1 text-xs font-medium text-red-600">Out of stock</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">{product.stockQuantity} in stock</p>
                  )}
                  <div className="mt-3">
                    {cartItem ? (
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(product.id, -1)}><Minus className="h-3.5 w-3.5" /></Button>
                        <span className="w-8 text-center font-semibold tabular-nums">{cartItem.quantity}</span>
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(product.id, 1)}><Plus className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive ml-auto" onClick={() => setCart(prev => prev.filter(i => i.product.id !== product.id))}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <Button className="w-full" size="sm" disabled={product.stockQuantity === 0} onClick={() => addToCart(product)}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />Add to cart
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Checkout dialog */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" />Checkout</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCheckout)} className="space-y-5">
            {/* Cart summary */}
            <div className="rounded-lg border divide-y text-sm">
              {cart.map(item => (
                <div key={item.product.id} className="flex items-center justify-between px-3 py-2 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground">{fmt(item.product.sellingPrice)} each</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={() => changeQty(item.product.id, -1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-6 text-center tabular-nums">{item.quantity}</span>
                    <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={() => changeQty(item.product.id, 1)}><Plus className="h-3 w-3" /></Button>
                  </div>
                  <span className="w-20 text-right font-semibold tabular-nums shrink-0">{fmt(item.product.sellingPrice * item.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2 font-medium"><span>Subtotal</span><span className="font-mono">{fmt(subtotal)}</span></div>
              {appliedDiscount && <div className="flex justify-between px-3 py-1 text-green-700"><span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{appliedDiscount.code}</span><span>−{fmt(appliedDiscount.discountAmount)}</span></div>}
              <div className="flex justify-between px-3 py-2 font-bold text-primary"><span>Total</span><span className="font-mono">{fmt(total)}</span></div>
            </div>

            {/* Discount */}
            <div className="space-y-1">
              <Label>Discount code</Label>
              <div className="flex gap-2">
                <Input value={discountInput} onChange={e => setDiscountInput(e.target.value.toUpperCase())} placeholder="SAVE10" className="uppercase" />
                <Button type="button" variant="outline" onClick={applyDiscount} disabled={!discountInput}>Apply</Button>
              </div>
              {appliedDiscount && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Discount applied — saving {fmt(appliedDiscount.discountAmount)}</p>}
            </div>

            {/* Shipping */}
            <div className="space-y-1">
              <Label htmlFor="ship-addr">Shipping address *</Label>
              <Textarea id="ship-addr" rows={3} {...register("shippingAddress", { required: true })} placeholder="123 Main St, City, Country" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="order-notes">Order notes</Label>
              <Input id="order-notes" {...register("notes")} placeholder="Special requirements…" />
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowCheckout(false)}>Back to shopping</Button>
              <Button type="submit" disabled={placeOrder.isPending || cart.length === 0}>
                Place order — {fmt(total)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 2 — MY ORDERS                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

function OrderTimeline({ order }: { order: CustomerOrder }) {
  const currentIdx = STATUS_ORDER.indexOf(order.status);

  return (
    <div className="mt-3">
      <div className="flex items-center gap-0">
        {ORDER_TIMELINE.map((step, idx) => {
          const done    = idx < currentIdx;
          const active  = idx === currentIdx;
          const StepIcon = step.icon;
          return (
            <div key={step.key} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                {idx > 0 && <div className={cn("h-0.5 flex-1", done || active ? "bg-primary" : "bg-muted")} />}
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  done   ? "border-primary bg-primary text-primary-foreground" :
                  active ? "border-primary bg-primary/10 text-primary" :
                           "border-muted bg-background text-muted-foreground",
                )}>
                  <StepIcon className="h-3.5 w-3.5" aria-hidden />
                </div>
                {idx < ORDER_TIMELINE.length - 1 && <div className={cn("h-0.5 flex-1", done ? "bg-primary" : "bg-muted")} />}
              </div>
              <p className={cn("mt-1 text-[9px] font-medium leading-tight", active ? "text-primary" : done ? "text-muted-foreground" : "text-muted-foreground/50")}>
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MyOrdersTab() {
  const { data: orders = [], isLoading } = useCustomerOrders();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusF, setStatusF] = useState("all");

  const filtered = useMemo(() => {
    if (statusF === "active") return orders.filter(o => !["delivered","cancelled"].includes(o.status));
    if (statusF !== "all")   return orders.filter(o => o.status === statusF);
    return orders;
  }, [orders, statusF]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[
          { value: "active",    label: "Active" },
          { value: "all",       label: "All" },
          { value: "delivered", label: "Delivered" },
          { value: "cancelled", label: "Cancelled" },
        ].map(({ value, label }) => (
          <Button key={value} size="sm" variant={statusF === value ? "default" : "outline"} onClick={() => setStatusF(value)}>{label}</Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-14 text-muted-foreground">
          <ShoppingBag className="mb-3 h-10 w-10" />
          <p>No orders yet</p>
          <p className="text-xs mt-1">Browse the catalog to place your first order</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const isExp = expandedId === order.id;
            const statusCfg = STATUS_COLORS[order.status] ?? "bg-muted text-muted-foreground";

            return (
              <Card key={order.id} className={cn("overflow-hidden transition-shadow hover:shadow-sm", order.status === "cancelled" && "opacity-70")}>
                <CardContent className="p-0">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedId(isExp ? null : order.id)}
                    aria-expanded={isExp}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-bold">{order.orderNumber}</span>
                        <Badge className={cn("text-[11px]", statusCfg)}>{order.status.replace("_"," ")}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {order.items.length} item{order.items.length !== 1 ? "s" : ""} · {new Date(order.createdAt).toLocaleDateString()}
                        {order.estimatedDelivery && ` · Est. delivery ${new Date(order.estimatedDelivery).toLocaleDateString()}`}
                      </p>
                      {order.status !== "cancelled" && order.status !== "delivered" && (
                        <OrderTimeline order={order} />
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="text-lg font-bold tabular-nums">{fmt(order.totalAmount)}</p>
                      {isExp ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isExp && (
                    <div className="border-t bg-muted/10 px-4 pb-5 pt-3">
                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* Items */}
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order Items</p>
                          <div className="space-y-1 text-sm">
                            {order.items.map(it => (
                              <div key={it.id} className="flex justify-between">
                                <span className="text-sm">{it.productName} × {it.quantity}</span>
                                <span className="font-mono tabular-nums">{fmt(it.lineTotal)}</span>
                              </div>
                            ))}
                            <Separator className="my-1" />
                            {order.discountAmount > 0 && (
                              <div className="flex justify-between text-green-600 text-xs">
                                <span>Discount{order.discountCode && ` (${order.discountCode})`}</span>
                                <span>−{fmt(order.discountAmount)}</span>
                              </div>
                            )}
                            {order.taxAmount > 0 && <div className="flex justify-between text-xs text-muted-foreground"><span>Tax</span><span>{fmt(order.taxAmount)}</span></div>}
                            <div className="flex justify-between font-semibold"><span>Total</span><span>{fmt(order.totalAmount)}</span></div>
                          </div>
                          {order.shippingAddress && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Ship to</p>
                              <p className="text-xs text-muted-foreground">{order.shippingAddress}</p>
                            </div>
                          )}
                        </div>

                        {/* Production updates */}
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Production Updates</p>
                          {order.updates.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No updates posted yet</p>
                          ) : (
                            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                              {order.updates.map(u => (
                                <div key={u.id} className="rounded-lg border bg-card p-3 text-sm">
                                  {u.status && (
                                    <Badge className={cn("mb-1.5 text-[10px]", STATUS_COLORS[u.status] ?? "bg-muted")}>
                                      {u.status.replace("_"," ")}
                                    </Badge>
                                  )}
                                  <p>{u.message}</p>
                                  {u.imageUrl && (
                                    <a href={u.imageUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                      <Image className="h-3 w-3" aria-hidden />View production photo
                                    </a>
                                  )}
                                  <p className="mt-1 text-[10px] text-muted-foreground">{new Date(u.createdAt).toLocaleString()}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 3 — MY INVOICES                                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

function InvoicesTab() {
  const { toast } = useToast();
  const { data: invoices = [], isLoading } = useCustomerInvoices();
  const payInvoice = usePayInvoice();
  const [payingId, setPayingId] = useState<number | null>(null);

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { paymentMethod: "", paymentReference: "" },
  });

  const onPay = async (data: any) => {
    if (!payingId) return;
    try {
      await payInvoice.mutateAsync({ id: payingId, paymentMethod: data.paymentMethod, paymentReference: data.paymentReference || undefined });
      toast({ title: "Payment recorded", description: "Thank you! Your invoice is now marked as paid." });
      setPayingId(null); reset();
    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  const outstanding = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled").reduce((s,i) => s + i.totalAmount, 0);

  return (
    <div className="space-y-4">
      {outstanding > 0 && (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription>
            You have <strong>{fmt(outstanding)}</strong> outstanding balance across unpaid invoices.
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-14 text-muted-foreground">
          <FileText className="mb-3 h-10 w-10" />
          <p>No invoices yet</p>
          <p className="text-xs mt-1">Invoices will appear here once generated by our team</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map(inv => {
            const statusColor = INVOICE_STATUS_COLORS[inv.status] ?? "bg-muted";
            const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";
            return (
              <Card key={inv.id} className={cn("overflow-hidden", isOverdue && "border-red-200")}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-bold">{inv.invoiceNumber}</span>
                        <Badge className={cn("text-[11px]", statusColor)}>
                          {inv.status === "paid" ? "Paid" : inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </Badge>
                        {isOverdue && <Badge className="bg-red-100 text-red-700 text-[11px]">Overdue</Badge>}
                      </div>
                      <p className="text-sm">
                        {inv.dueDate && <span className="text-muted-foreground">Due {new Date(inv.dueDate).toLocaleDateString()}</span>}
                        {inv.paidAt  && <span className="ml-2 text-green-600 flex-inline items-center gap-1"><CheckCircle2 className="h-3 w-3 inline" /> Paid {new Date(inv.paidAt).toLocaleDateString()}</span>}
                      </p>
                      {inv.paymentMethod && <p className="mt-0.5 text-xs text-muted-foreground">Via {inv.paymentMethod}{inv.paymentReference && ` · Ref: ${inv.paymentReference}`}</p>}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xl font-bold tabular-nums">{fmt(inv.totalAmount)}</p>
                        {inv.discountAmount > 0 && <p className="text-xs text-green-600">Incl. {fmt(inv.discountAmount)} discount</p>}
                      </div>
                      {inv.status !== "paid" && inv.status !== "cancelled" && (
                        <Button onClick={() => setPayingId(inv.id)} className="shrink-0">
                          Pay now
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Payment dialog */}
      <Dialog open={!!payingId} onOpenChange={v => { if (!v) { setPayingId(null); reset(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onPay)} className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Please complete payment through your bank or payment processor first, then confirm the details here.
              </AlertDescription>
            </Alert>
            <div className="space-y-1">
              <Label>Payment method *</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1" {...register("paymentMethod", { required: true })}>
                <option value="">Select method…</option>
                <option>Bank Transfer</option>
                <option>Credit Card</option>
                <option>Debit Card</option>
                <option>Mobile Payment</option>
                <option>Cash</option>
                <option>Cheque</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Transaction reference / receipt no.</Label>
              <Input {...register("paymentReference")} placeholder="e.g. TXN-20240101-001" />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { setPayingId(null); reset(); }}>Cancel</Button>
              <Button type="submit" disabled={payInvoice.isPending}>Confirm payment</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function CustomerPortalPage() {
  const [activeTab, setActiveTab] = useState("browse");
  const [cart, setCart] = useState<CartItem[]>([]);
  const { data: orders = [] } = useCustomerOrders();
  const { data: invoices = [] } = useCustomerInvoices();

  const activeOrderCount   = orders.filter(o => !["delivered","cancelled"].includes(o.status)).length;
  const unpaidInvoiceCount = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled").length;

  return (
    <div className="space-y-5">
      <ProfileHeader cartCount={cart.reduce((s, i) => s + i.quantity, 0)} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="browse" className="relative gap-1.5">
            <ShoppingCart className="h-4 w-4" />Browse
            {cart.length > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground tabular-nums">{cart.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="orders" className="relative gap-1.5">
            <Package className="h-4 w-4" />My Orders
            {activeOrderCount > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground tabular-nums">{activeOrderCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="invoices" className="relative gap-1.5">
            <FileText className="h-4 w-4" />Invoices
            {unpaidInvoiceCount > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">{unpaidInvoiceCount}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse"   className="mt-4">
          <BrowseTab cart={cart} setCart={setCart} onOrderPlaced={() => setActiveTab("orders")} />
        </TabsContent>
        <TabsContent value="orders"   className="mt-4"><MyOrdersTab /></TabsContent>
        <TabsContent value="invoices" className="mt-4"><InvoicesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
