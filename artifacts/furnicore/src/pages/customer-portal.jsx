import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Customer Portal — three tabs:
 *   Browse    — product catalog + cart + checkout
 *   My Orders — order list with production timeline + remarks/images
 *   Invoices  — invoice list + pay
 */
import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useCustomerProfile, useProductCatalog, useValidateDiscount, useCustomerOrders, usePlaceOrder, useCustomerInvoices, usePayInvoice, } from "@/hooks/use-customer-portal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Package, FileText, Minus, Plus, Trash2, CheckCircle2, Truck, Star, Image, Info, ChevronDown, ChevronUp, ShoppingBag, AlertTriangle, } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrowseCheckoutDialog } from "@/components/browse-checkout-dialog";
/* ─── Shared helpers ──────────────────────────────────────────────────────── */
const fmt = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ORDER_TIMELINE = [
    { key: "draft", label: "Order received", icon: ShoppingCart },
    { key: "confirmed", label: "Confirmed", icon: CheckCircle2 },
    { key: "in_production", label: "In Production", icon: Package },
    { key: "quality_check", label: "Quality Check", icon: Star },
    { key: "shipped", label: "Shipped", icon: Truck },
    { key: "delivered", label: "Delivered", icon: CheckCircle2 },
];
const STATUS_ORDER = ORDER_TIMELINE.map(s => s.key);
const STATUS_COLORS = {
    draft: "bg-slate-100 text-slate-600",
    confirmed: "bg-blue-100 text-blue-700",
    in_production: "bg-purple-100 text-purple-700",
    quality_check: "bg-amber-100 text-amber-700",
    shipped: "bg-teal-100 text-teal-700",
    delivered: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
};
const INVOICE_STATUS_COLORS = {
    draft: "bg-slate-100 text-slate-600",
    sent: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    overdue: "bg-red-100 text-red-700",
    cancelled: "bg-slate-100 text-slate-400",
};
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PROFILE HEADER                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */
function ProfileHeader({ cartCount }) {
    const { data: user } = useCustomerProfile();
    return (_jsxs(Card, { className: "overflow-hidden", children: [_jsx("div", { className: "h-1.5 bg-gradient-to-r from-primary/60 to-primary" }), _jsxs(CardContent, { className: "flex items-center gap-4 p-4", children: [_jsx("div", { className: "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary", children: user?.name?.slice(0, 2).toUpperCase() ?? "CU" }), _jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "font-semibold", children: user?.name ?? "—" }), _jsx("p", { className: "text-sm text-muted-foreground", children: user?.email })] }), cartCount > 0 && (_jsxs("div", { className: "flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary", children: [_jsx(ShoppingCart, { className: "h-4 w-4" }), cartCount, " item", cartCount !== 1 ? "s" : "", " in cart"] }))] })] }));
}
/** Post-checkout summary (order totals + ship-to) — uses API-enriched order payload. */
function OrderInvoiceDialog({ open, onOpenChange, order }) {
    if (!order)
        return null;
    return _jsx(Dialog, {
        open,
        onOpenChange,
        children: _jsxs(DialogContent, {
            className: "max-h-[90vh] max-w-2xl overflow-y-auto",
            children: [
                _jsx(DialogHeader, { children: _jsxs(DialogTitle, { className: "flex items-center gap-2", children: [_jsx(FileText, { className: "h-5 w-5" }), "Order confirmed"] }) }),
                _jsxs("div", {
                    className: "space-y-4 text-sm",
                    children: [
                        _jsxs("div", { className: "rounded-lg border bg-muted/30 p-3", children: [
                            _jsx("p", { className: "font-mono text-lg font-bold", children: order.orderNumber }),
                            _jsx("p", { className: "text-xs text-muted-foreground", children: new Date(order.createdAt).toLocaleString() }),
                        ] }),
                        _jsxs("div", {
                            className: "rounded-lg border divide-y",
                            children: [
                                ...order.items.map((it) => _jsxs("div", { className: "flex justify-between gap-2 px-3 py-2", children: [
                                    _jsxs("span", { className: "min-w-0", children: [it.productName, " × ", it.quantity] }),
                                    _jsx("span", { className: "font-mono tabular-nums shrink-0", children: fmt(it.lineTotal) }),
                                ] }, it.id)),
                                _jsxs("div", { className: "flex justify-between px-3 py-2 font-medium", children: [
                                    _jsx("span", { children: "Subtotal" }),
                                    _jsx("span", { children: fmt(order.subtotal) }),
                                ] }),
                                ...(order.discountAmount > 0
                                    ? [_jsxs("div", { className: "flex justify-between px-3 py-1 text-green-700", children: [
                                        _jsx("span", { children: "Discount" }),
                                        _jsx("span", { children: ["−", fmt(order.discountAmount)] }),
                                    ] })]
                                    : []),
                                ...(order.taxAmount > 0
                                    ? [_jsxs("div", { className: "flex justify-between px-3 py-1 text-muted-foreground", children: [
                                        _jsx("span", { children: "Tax" }),
                                        _jsx("span", { children: fmt(order.taxAmount) }),
                                    ] })]
                                    : []),
                                _jsxs("div", { className: "flex justify-between px-3 py-2 font-bold text-primary", children: [
                                    _jsx("span", { children: "Total" }),
                                    _jsx("span", { children: fmt(order.totalAmount) }),
                                ] }),
                            ],
                        }),
                        ...(order.shippingAddress
                            ? [_jsxs("div", { children: [
                                _jsx("p", { className: "text-xs font-semibold uppercase text-muted-foreground", children: "Ship to" }),
                                _jsx("p", { className: "whitespace-pre-wrap text-muted-foreground", children: order.shippingAddress }),
                            ] })]
                            : []),
                        _jsx("p", { className: "text-xs text-muted-foreground", children: "Keep this summary for your records. Track status under My Orders." }),
                    ],
                }),
                _jsx(DialogFooter, { children: _jsx(Button, { onClick: () => onOpenChange(false), children: "Done" }) }),
            ],
        }),
    });
}
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 1 — BROWSE & CHECKOUT                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
function BrowseTab({ cart, setCart, onOrderPlaced, }) {
    const { toast } = useToast();
    const { data: catalog = [], isLoading } = useProductCatalog();
    const placeOrder = usePlaceOrder();
    const [search, setSearch] = useState("");
    const [categoryF, setCategoryF] = useState("all");
    const [showCheckout, setShowCheckout] = useState(false);
    const [showOrderInvoice, setShowOrderInvoice] = useState(false);
    const [confirmedOrder, setConfirmedOrder] = useState(null);
    const [discountInput, setDiscountInput] = useState("");
    const [appliedDiscount, setAppliedDiscount] = useState(null);
    const subtotal = cart.reduce((s, item) => s + item.product.sellingPrice * item.quantity, 0);
    const discount = appliedDiscount?.discountAmount ?? 0;
    const total = Math.max(0, subtotal - discount);
    const { data: discountResult } = useValidateDiscount(discountInput, subtotal);
    const categories = useMemo(() => {
        const cats = new Set(catalog.map(p => p.category).filter((c) => !!c));
        return Array.from(cats).sort();
    }, [catalog]);
    const filtered = useMemo(() => {
        let r = catalog;
        if (search)
            r = r.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.description ?? "").toLowerCase().includes(search.toLowerCase()));
        if (categoryF !== "all")
            r = r.filter(p => p.category === categoryF);
        return r;
    }, [catalog, search, categoryF]);
    const addToCart = (product) => {
        setCart(prev => {
            const existing = prev.find(i => i.product.id === product.id);
            if (existing)
                return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
            return [...prev, { product, quantity: 1 }];
        });
    };
    const changeQty = (productId, delta) => {
        setCart(prev => prev
            .map(i => i.product.id === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
            .filter(i => i.quantity > 0));
    };
    const applyDiscount = () => {
        if (discountResult?.valid) {
            setAppliedDiscount({ code: discountInput.toUpperCase(), discountAmount: discountResult.discountAmount, description: discountResult.description });
            toast({ title: "Discount applied!", description: discountResult.description ?? `Saving ${fmt(discountResult.discountAmount)}` });
        }
        else if (discountResult) {
            toast({ variant: "destructive", title: "Invalid code", description: discountResult.reason });
        }
    };
    const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: { shippingAddress: "", notes: "" } });
    const onCheckout = async (data) => {
        if (cart.length === 0) {
            toast({ variant: "destructive", title: "Cart is empty" });
            return;
        }
        const shippingAddress = (data.shippingAddress ?? "").trim();
        try {
            const order = await placeOrder.mutateAsync({
                shippingAddress,
                notes: data.notes?.trim() || undefined,
                discountCode: appliedDiscount?.code,
                items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity })),
            });
            setConfirmedOrder(order);
            setShowOrderInvoice(true);
            setCart([]);
            setAppliedDiscount(null);
            setDiscountInput("");
            setShowCheckout(false);
            reset();
            onOrderPlaced();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Could not place order", description: e.message });
        }
    };
    const handleInvoiceDialogChange = (open) => {
        setShowOrderInvoice(open);
        if (!open)
            setConfirmedOrder(null);
    };
    const checkoutSubmitDisabled = placeOrder.isPending || cart.length === 0;
    const placeOrderButtonLabel = "Place order \u2014 " + fmt(total);
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx(Input, { className: "w-56", placeholder: "Search products\u2026", value: search, onChange: e => setSearch(e.target.value) }), _jsxs(Select, { value: categoryF, onValueChange: setCategoryF, children: [_jsx(SelectTrigger, { className: "w-40", children: _jsx(SelectValue, { placeholder: "Category" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "all", children: "All categories" }), categories.map(c => _jsx(SelectItem, { value: c, children: c }, c))] })] }), cart.length > 0 && (_jsxs(Button, { className: "ml-auto", onClick: () => setShowCheckout(true), children: [_jsx(ShoppingCart, { className: "mr-1.5 h-4 w-4" }), "Checkout (", cart.length, ") \u2014 ", fmt(total)] }))] }), isLoading ? (_jsx("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: [1, 2, 3, 4, 5, 6].map(i => _jsx(Skeleton, { className: "h-48 rounded-xl" }, i)) })) : filtered.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(Package, { className: "mb-3 h-10 w-10" }), _jsx("p", { children: "No products match your search" })] })) : (_jsx("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: filtered.map(product => {
                    const cartItem = cart.find(i => i.product.id === product.id);
                    return (_jsxs(Card, { className: "flex flex-col hover:shadow-md transition-shadow", children: [_jsx("div", { className: "flex h-32 items-center justify-center rounded-t-lg bg-gradient-to-br from-primary/5 to-primary/15", children: _jsx(Package, { className: "h-12 w-12 text-primary/40", "aria-hidden": true }) }), _jsxs(CardContent, { className: "flex flex-1 flex-col p-4", children: [_jsx(Badge, { variant: "outline", className: "mb-2 w-fit text-[10px]", children: product.category }), _jsx("p", { className: "font-semibold leading-tight", children: product.name }), product.description && _jsx("p", { className: "mt-1 line-clamp-2 text-xs text-muted-foreground", children: product.description }), _jsx("p", { className: "mt-auto pt-3 text-lg font-bold text-primary", children: fmt(product.sellingPrice) }), product.stockQuantity === 0 ? (_jsx("p", { className: "mt-1 text-xs font-medium text-red-600", children: "Out of stock" })) : (_jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: [product.stockQuantity, " in stock"] })), _jsx("div", { className: "mt-3", children: cartItem ? (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { size: "icon", variant: "outline", className: "h-8 w-8", onClick: () => changeQty(product.id, -1), children: _jsx(Minus, { className: "h-3.5 w-3.5" }) }), _jsx("span", { className: "w-8 text-center font-semibold tabular-nums", children: cartItem.quantity }), _jsx(Button, { size: "icon", variant: "outline", className: "h-8 w-8", onClick: () => changeQty(product.id, 1), children: _jsx(Plus, { className: "h-3.5 w-3.5" }) }), _jsx(Button, { size: "icon", variant: "ghost", className: "h-8 w-8 text-destructive ml-auto", onClick: () => setCart(prev => prev.filter(i => i.product.id !== product.id)), children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] })) : (_jsxs(Button, { className: "w-full", size: "sm", disabled: product.stockQuantity === 0, onClick: () => addToCart(product), children: [_jsx(Plus, { className: "mr-1.5 h-3.5 w-3.5" }), "Add to cart"] })) })] })] }, product.id));
                }) })), _jsx(BrowseCheckoutDialog, { open: showCheckout, onOpenChange: setShowCheckout, handleSubmit, onCheckout, cart, changeQty, subtotal, appliedDiscount, discountInput, setDiscountInput, applyDiscount, register, errors, checkoutSubmitDisabled, placeOrderButtonLabel, setShowCheckout, total, fmt }) ] }));  
}
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 2 — MY ORDERS                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */
function OrderTimeline({ order }) {
    const currentIdx = STATUS_ORDER.indexOf(order.status);
    return (_jsx("div", { className: "mt-3", children: _jsx("div", { className: "flex items-center gap-0", children: ORDER_TIMELINE.map((step, idx) => {
                const done = idx < currentIdx;
                const active = idx === currentIdx;
                const StepIcon = step.icon;
                return (_jsxs("div", { className: "flex flex-1 flex-col items-center text-center", children: [_jsxs("div", { className: "flex w-full items-center", children: [idx > 0 && _jsx("div", { className: cn("h-0.5 flex-1", done || active ? "bg-primary" : "bg-muted") }), _jsx("div", { className: cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors", done ? "border-primary bg-primary text-primary-foreground" :
                                        active ? "border-primary bg-primary/10 text-primary" :
                                            "border-muted bg-background text-muted-foreground"), children: _jsx(StepIcon, { className: "h-3.5 w-3.5", "aria-hidden": true }) }), idx < ORDER_TIMELINE.length - 1 && _jsx("div", { className: cn("h-0.5 flex-1", done ? "bg-primary" : "bg-muted") })] }), _jsx("p", { className: cn("mt-1 text-[9px] font-medium leading-tight", active ? "text-primary" : done ? "text-muted-foreground" : "text-muted-foreground/50"), children: step.label })] }, step.key));
            }) }) }));
}
function MyOrdersTab() {
    const { data: orders = [], isLoading } = useCustomerOrders();
    const [expandedId, setExpandedId] = useState(null);
    const [statusF, setStatusF] = useState("all");
    const filtered = useMemo(() => {
        if (statusF === "active")
            return orders.filter(o => !["delivered", "cancelled"].includes(o.status));
        if (statusF !== "all")
            return orders.filter(o => o.status === statusF);
        return orders;
    }, [orders, statusF]);
    return (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "flex gap-2", children: [
                    { value: "active", label: "Active" },
                    { value: "all", label: "All" },
                    { value: "delivered", label: "Delivered" },
                    { value: "cancelled", label: "Cancelled" },
                ].map(({ value, label }) => (_jsx(Button, { size: "sm", variant: statusF === value ? "default" : "outline", onClick: () => setStatusF(value), children: label }, value))) }), isLoading ? (_jsx("div", { className: "space-y-3", children: [1, 2, 3].map(i => _jsx(Skeleton, { className: "h-40 rounded-xl" }, i)) })) : filtered.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center rounded-xl border bg-card py-14 text-muted-foreground", children: [_jsx(ShoppingBag, { className: "mb-3 h-10 w-10" }), _jsx("p", { children: "No orders yet" }), _jsx("p", { className: "text-xs mt-1", children: "Browse the catalog to place your first order" })] })) : (_jsx("div", { className: "space-y-3", children: filtered.map(order => {
                    const isExp = expandedId === order.id;
                    const statusCfg = STATUS_COLORS[order.status] ?? "bg-muted text-muted-foreground";
                    return (_jsx(Card, { className: cn("overflow-hidden transition-shadow hover:shadow-sm", order.status === "cancelled" && "opacity-70"), children: _jsxs(CardContent, { className: "p-0", children: [_jsxs("button", { type: "button", className: "flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-muted/20 transition-colors", onClick: () => setExpandedId(isExp ? null : order.id), "aria-expanded": isExp, children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 mb-1", children: [_jsx("span", { className: "font-mono text-sm font-bold", children: order.orderNumber }), _jsx(Badge, { className: cn("text-[11px]", statusCfg), children: order.status.replace("_", " ") })] }), _jsxs("p", { className: "text-xs text-muted-foreground", children: [order.items.length, " item", order.items.length !== 1 ? "s" : "", " \u00B7 ", new Date(order.createdAt).toLocaleDateString(), order.estimatedDelivery && ` · Est. delivery ${new Date(order.estimatedDelivery).toLocaleDateString()}`] }), order.status !== "cancelled" && order.status !== "delivered" && (_jsx(OrderTimeline, { order: order }))] }), _jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [_jsx("p", { className: "text-lg font-bold tabular-nums", children: fmt(order.totalAmount) }), isExp ? _jsx(ChevronUp, { className: "h-4 w-4 text-muted-foreground" }) : _jsx(ChevronDown, { className: "h-4 w-4 text-muted-foreground" })] })] }), isExp && (_jsx("div", { className: "border-t bg-muted/10 px-4 pb-5 pt-3", children: _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsxs("div", { children: [_jsx("p", { className: "mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground", children: "Order Items" }), _jsxs("div", { className: "space-y-1 text-sm", children: [order.items.map(it => (_jsxs("div", { className: "flex justify-between", children: [_jsxs("span", { className: "text-sm", children: [it.productName, " \u00D7 ", it.quantity] }), _jsx("span", { className: "font-mono tabular-nums", children: fmt(it.lineTotal) })] }, it.id))), _jsx(Separator, { className: "my-1" }), order.discountAmount > 0 && (_jsxs("div", { className: "flex justify-between text-green-600 text-xs", children: [_jsxs("span", { children: ["Discount", order.discountCode && ` (${order.discountCode})`] }), _jsxs("span", { children: ["\u2212", fmt(order.discountAmount)] })] })), order.taxAmount > 0 && _jsxs("div", { className: "flex justify-between text-xs text-muted-foreground", children: [_jsx("span", { children: "Tax" }), _jsx("span", { children: fmt(order.taxAmount) })] }), _jsxs("div", { className: "flex justify-between font-semibold", children: [_jsx("span", { children: "Total" }), _jsx("span", { children: fmt(order.totalAmount) })] })] }), order.shippingAddress && (_jsxs("div", { className: "mt-3", children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1", children: "Ship to" }), _jsx("p", { className: "text-xs text-muted-foreground", children: order.shippingAddress })] }))] }), _jsxs("div", { children: [_jsx("p", { className: "mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground", children: "Production Updates" }), order.updates.length === 0 ? (_jsx("p", { className: "text-xs text-muted-foreground", children: "No updates posted yet" })) : (_jsx("div", { className: "space-y-2 max-h-52 overflow-y-auto pr-1", children: order.updates.map(u => (_jsxs("div", { className: "rounded-lg border bg-card p-3 text-sm", children: [u.status && (_jsx(Badge, { className: cn("mb-1.5 text-[10px]", STATUS_COLORS[u.status] ?? "bg-muted"), children: u.status.replace("_", " ") })), _jsx("p", { children: u.message }), u.imageUrl && (_jsxs("a", { href: u.imageUrl, target: "_blank", rel: "noreferrer", className: "mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline", children: [_jsx(Image, { className: "h-3 w-3", "aria-hidden": true }), "View production photo"] })), _jsx("p", { className: "mt-1 text-[10px] text-muted-foreground", children: new Date(u.createdAt).toLocaleString() })] }, u.id))) }))] })] }) }))] }) }, order.id));
                }) }))] }));
}
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 3 — MY INVOICES                                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */
function InvoicesTab() {
    const { toast } = useToast();
    const { data: invoices = [], isLoading } = useCustomerInvoices();
    const payInvoice = usePayInvoice();
    const [payingId, setPayingId] = useState(null);
    const { register, handleSubmit, reset } = useForm({
        defaultValues: { paymentMethod: "", paymentReference: "" },
    });
    const onPay = async (data) => {
        if (!payingId)
            return;
        try {
            await payInvoice.mutateAsync({ id: payingId, paymentMethod: data.paymentMethod, paymentReference: data.paymentReference || undefined });
            toast({ title: "Payment recorded", description: "Thank you! Your invoice is now marked as paid." });
            setPayingId(null);
            reset();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const outstanding = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled").reduce((s, i) => s + i.totalAmount, 0);
    return (_jsxs("div", { className: "space-y-4", children: [outstanding > 0 && (_jsxs(Alert, { className: "border-amber-200 bg-amber-50 dark:bg-amber-950/20", children: [_jsx(AlertTriangle, { className: "h-4 w-4 text-amber-600" }), _jsxs(AlertDescription, { children: ["You have ", _jsx("strong", { children: fmt(outstanding) }), " outstanding balance across unpaid invoices."] })] })), isLoading ? (_jsx("div", { className: "space-y-3", children: [1, 2].map(i => _jsx(Skeleton, { className: "h-24 w-full" }, i)) })) : invoices.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center rounded-xl border bg-card py-14 text-muted-foreground", children: [_jsx(FileText, { className: "mb-3 h-10 w-10" }), _jsx("p", { children: "No invoices yet" }), _jsx("p", { className: "text-xs mt-1", children: "Invoices will appear here once generated by our team" })] })) : (_jsx("div", { className: "space-y-3", children: invoices.map(inv => {
                    const statusColor = INVOICE_STATUS_COLORS[inv.status] ?? "bg-muted";
                    const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";
                    return (_jsx(Card, { className: cn("overflow-hidden", isOverdue && "border-red-200"), children: _jsx(CardContent, { className: "p-4", children: _jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 mb-1", children: [_jsx("span", { className: "font-mono text-sm font-bold", children: inv.invoiceNumber }), _jsx(Badge, { className: cn("text-[11px]", statusColor), children: inv.status === "paid" ? "Paid" : inv.status.charAt(0).toUpperCase() + inv.status.slice(1) }), isOverdue && _jsx(Badge, { className: "bg-red-100 text-red-700 text-[11px]", children: "Overdue" })] }), _jsxs("p", { className: "text-sm", children: [inv.dueDate && _jsxs("span", { className: "text-muted-foreground", children: ["Due ", new Date(inv.dueDate).toLocaleDateString()] }), inv.paidAt && _jsxs("span", { className: "ml-2 text-green-600 flex-inline items-center gap-1", children: [_jsx(CheckCircle2, { className: "h-3 w-3 inline" }), " Paid ", new Date(inv.paidAt).toLocaleDateString()] })] }), inv.paymentMethod && _jsxs("p", { className: "mt-0.5 text-xs text-muted-foreground", children: ["Via ", inv.paymentMethod, inv.paymentReference && ` · Ref: ${inv.paymentReference}`] })] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "text-right", children: [_jsx("p", { className: "text-xl font-bold tabular-nums", children: fmt(inv.totalAmount) }), inv.discountAmount > 0 && _jsxs("p", { className: "text-xs text-green-600", children: ["Incl. ", fmt(inv.discountAmount), " discount"] })] }), inv.status !== "paid" && inv.status !== "cancelled" && (_jsx(Button, { onClick: () => setPayingId(inv.id), className: "shrink-0", children: "Pay now" }))] })] }) }) }, inv.id));
                }) })), _jsx(Dialog, { open: !!payingId, onOpenChange: v => { if (!v) {
                    setPayingId(null);
                    reset();
                } }, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Record payment" }) }), _jsxs("form", { onSubmit: handleSubmit(onPay), className: "space-y-4", children: [_jsxs(Alert, { children: [_jsx(Info, { className: "h-4 w-4" }), _jsx(AlertDescription, { className: "text-sm", children: "Please complete payment through your bank or payment processor first, then confirm the details here." })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Payment method *" }), _jsxs("select", { className: "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1", ...register("paymentMethod", { required: true }), children: [_jsx("option", { value: "", children: "Select method\u2026" }), _jsx("option", { children: "Bank Transfer" }), _jsx("option", { children: "Credit Card" }), _jsx("option", { children: "Debit Card" }), _jsx("option", { children: "Mobile Payment" }), _jsx("option", { children: "Cash" }), _jsx("option", { children: "Cheque" })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Transaction reference / receipt no." }), _jsx(Input, { ...register("paymentReference"), placeholder: "e.g. TXN-20240101-001" })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => { setPayingId(null); reset(); }, children: "Cancel" }), _jsx(Button, { type: "submit", disabled: payInvoice.isPending, children: "Confirm payment" })] })] })] }) })] }));
}
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function CustomerPortalPage() {
    const [activeTab, setActiveTab] = useState("browse");
    const [cart, setCart] = useState([]);
    const { data: orders = [] } = useCustomerOrders();
    const { data: invoices = [] } = useCustomerInvoices();
    const activeOrderCount = orders.filter(o => !["delivered", "cancelled"].includes(o.status)).length;
    const unpaidInvoiceCount = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled").length;
    return (_jsxs("div", { className: "space-y-5", children: [_jsx(ProfileHeader, { cartCount: cart.reduce((s, i) => s + i.quantity, 0) }), _jsxs(Tabs, { value: activeTab, onValueChange: setActiveTab, children: [_jsxs(TabsList, { className: "w-full sm:w-auto", children: [_jsxs(TabsTrigger, { value: "browse", className: "relative gap-1.5", children: [_jsx(ShoppingCart, { className: "h-4 w-4" }), "Browse", cart.length > 0 && _jsx("span", { className: "ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground tabular-nums", children: cart.length })] }), _jsxs(TabsTrigger, { value: "orders", className: "relative gap-1.5", children: [_jsx(Package, { className: "h-4 w-4" }), "My Orders", activeOrderCount > 0 && _jsx("span", { className: "ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground tabular-nums", children: activeOrderCount })] }), _jsxs(TabsTrigger, { value: "invoices", className: "relative gap-1.5", children: [_jsx(FileText, { className: "h-4 w-4" }), "Invoices", unpaidInvoiceCount > 0 && _jsx("span", { className: "ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums", children: unpaidInvoiceCount })] })] }), _jsx(TabsContent, { value: "browse", className: "mt-4", children: _jsx(BrowseTab, { cart: cart, setCart: setCart, onOrderPlaced: () => setActiveTab("orders") }) }), _jsx(TabsContent, { value: "orders", className: "mt-4", children: _jsx(MyOrdersTab, {}) }), _jsx(TabsContent, { value: "invoices", className: "mt-4", children: _jsx(InvoicesTab, {}) })] })] }));
}
