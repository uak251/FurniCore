import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { useListProducts, useGetCurrentUser } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSalesOverview, useSalesOrders, useCreateSalesOrder, useUpdateSalesOrder, useAddOrderUpdate, useUploadOrderUpdateImage, useSalesInvoices, useGenerateInvoice, useUpdateInvoice, useUploadInvoicePdf, useSalesDiscounts, useCreateDiscount, useUpdateDiscount, useDeleteDiscount, useSalesReceivables, } from "@/hooks/use-sales-manager";
import { CatalogTab } from "./sales-catalog-tab";
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
import { ShoppingCart, FileText, Tag, BarChart3, TrendingUp, Plus, Pencil, Trash2, CheckCircle2, ChevronDown, ChevronUp, AlertTriangle, DollarSign, Image, Package, Upload, } from "lucide-react";
import { cn } from "@/lib/utils";
/* ─── Shared helpers ──────────────────────────────────────────────────────── */
const fmt = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ORDER_STATUS_CONFIG = {
    draft: { label: "Draft", color: "bg-slate-100 text-slate-700" },
    confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700" },
    in_production: { label: "In Production", color: "bg-purple-100 text-purple-700" },
    quality_check: { label: "Quality Check", color: "bg-amber-100 text-amber-700" },
    shipped: { label: "Shipped", color: "bg-teal-100 text-teal-700" },
    delivered: { label: "Delivered", color: "bg-green-100 text-green-700" },
    cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
};
const INVOICE_STATUS_CONFIG = {
    draft: { label: "Draft", color: "bg-slate-100 text-slate-600" },
    sent: { label: "Sent", color: "bg-blue-100 text-blue-700" },
    pending_verification: { label: "Awaiting verification", color: "bg-amber-100 text-amber-700" },
    sales_verified: { label: "Sales verified", color: "bg-cyan-100 text-cyan-700" },
    paid: { label: "Paid", color: "bg-green-100 text-green-700" },
    overdue: { label: "Overdue", color: "bg-red-100 text-red-700" },
    cancelled: { label: "Cancelled", color: "bg-slate-100 text-slate-500" },
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/* ─── KPI card ────────────────────────────────────────────────────────────── */
function Kpi({ icon: Icon, label, value, sub, accent }) {
    return (_jsx(Card, { children: _jsxs(CardContent, { className: "flex items-start gap-4 p-5", children: [_jsx("div", { className: cn("rounded-lg p-2", accent ?? "bg-primary/10"), children: _jsx(Icon, { className: "h-5 w-5 text-primary" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-xs text-muted-foreground", children: label }), _jsx("p", { className: "text-xl font-bold", children: value }), sub && _jsx("p", { className: "text-xs text-muted-foreground", children: sub })] })] }) }));
}
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 1 — OVERVIEW                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */
function OverviewTab({ onTabChange }) {
    const { data, isLoading } = useSalesOverview();
    if (isLoading)
        return _jsx("div", { className: "space-y-3", children: [1, 2, 3].map(i => _jsx(Skeleton, { className: "h-24 w-full" }, i)) });
    if (!data)
        return null;
    const statusOrder = ["confirmed", "in_production", "quality_check", "shipped", "delivered"];
    const totalActive = statusOrder.reduce((s, k) => s + (data.ordersByStatus[k] ?? 0), 0);
    return (_jsxs("div", { className: "space-y-6 min-w-0", children: [_jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", children: [_jsx(Kpi, { icon: DollarSign, label: "MTD Revenue", value: fmt(data.mtdRevenue), sub: `Total: ${fmt(data.totalRevenue)}`, accent: "bg-green-50 dark:bg-green-950/20" }), _jsx(Kpi, { icon: ShoppingCart, label: "MTD Orders", value: String(data.mtdOrders), sub: `Total: ${data.totalOrders}`, accent: "bg-blue-50 dark:bg-blue-950/20" }), _jsx(Kpi, { icon: FileText, label: "Outstanding AR", value: fmt(data.outstandingAR), sub: "unpaid invoices", accent: "bg-amber-50 dark:bg-amber-950/20" }), _jsx(Kpi, { icon: AlertTriangle, label: "Overdue Invoices", value: String(data.overdueCount), sub: "require follow-up", accent: "bg-red-50 dark:bg-red-950/20" })] }), _jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-2", children: _jsx(CardTitle, { className: "text-sm font-semibold", children: "Order Pipeline" }) }), _jsx(CardContent, { className: "space-y-2", children: statusOrder.map(status => {
                            const count = data.ordersByStatus[status] ?? 0;
                            const pct = totalActive > 0 ? (count / totalActive) * 100 : 0;
                            const cfg = ORDER_STATUS_CONFIG[status];
                            return (_jsxs("div", { className: "flex min-w-0 flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-3", children: [_jsx(Badge, { className: cn("w-fit shrink-0 justify-center text-[11px] sm:w-28", cfg.color), children: cfg.label }), _jsx(Progress, { value: pct, className: "h-2 w-full min-w-0 sm:flex-1" }), _jsx("span", { className: "shrink-0 text-right font-semibold tabular-nums sm:w-6", children: count })] }, status));
                        }) })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between pb-2", children: [_jsx(CardTitle, { className: "text-sm font-semibold", children: "Recent Orders" }), _jsx(Button, { size: "sm", variant: "ghost", className: "text-xs", onClick: () => onTabChange("orders"), children: "View all" })] }), _jsx(CardContent, { className: "p-0", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "Order" }), _jsx(TableHead, { children: "Customer" }), _jsx(TableHead, { className: "text-right", children: "Total" }), _jsx(TableHead, { children: "Status" })] }) }), _jsx(TableBody, { children: data.recentOrders.map(o => {
                                        const cfg = ORDER_STATUS_CONFIG[o.status] ?? { label: o.status, color: "bg-muted" };
                                        return (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "font-mono text-xs", children: o.orderNumber }), _jsxs(TableCell, { children: [o.customerName, _jsx("br", {}), _jsx("span", { className: "text-xs text-muted-foreground", children: o.customerEmail })] }), _jsx(TableCell, { className: "text-right font-semibold", children: fmt(o.totalAmount) }), _jsx(TableCell, { children: _jsx(Badge, { className: cn("text-[11px]", cfg.color), children: cfg.label }) })] }, o.id));
                                    }) })] }) })] })] }));
}
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 2 — ORDERS                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */
function OrdersTab() {
    const { toast } = useToast();
    const { data: orders = [], isLoading } = useSalesOrders();
    const { data: products = [] } = useListProducts();
    const createOrder = useCreateSalesOrder();
    const updateOrder = useUpdateSalesOrder();
    const addUpdate = useAddOrderUpdate();
    const [search, setSearch] = useState("");
    const [statusF, setStatusF] = useState("all");
    const [showCreate, setShowCreate] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [updateOrderId, setUpdateOrderId] = useState(null);
    const filtered = useMemo(() => {
        let r = orders;
        if (search)
            r = r.filter(o => o.orderNumber.toLowerCase().includes(search.toLowerCase()) || o.customerName.toLowerCase().includes(search.toLowerCase()) || o.customerEmail.toLowerCase().includes(search.toLowerCase()));
        if (statusF !== "all")
            r = r.filter(o => o.status === statusF);
        return r;
    }, [orders, search, statusF]);
    // Create order form
    const [cartLines, setCartLines] = useState([]);
    const { register: creg, handleSubmit: cSubmit, control: cCtrl, reset: cReset } = useForm({
        defaultValues: { customerName: "", customerEmail: "", shippingAddress: "", notes: "", discountCode: "", taxRate: 0 },
    });
    const addCartLine = (pid) => {
        const p = products.find((x) => x.id === pid);
        if (!p)
            return;
        setCartLines(prev => {
            const existing = prev.find(l => l.productId === pid);
            if (existing)
                return prev.map(l => l.productId === pid ? { ...l, quantity: l.quantity + 1 } : l);
            return [...prev, { productId: pid, name: p.name, price: Number(p.sellingPrice), quantity: 1, discountPercent: 0 }];
        });
    };
    const removeCartLine = (pid) => setCartLines(prev => prev.filter(l => l.productId !== pid));
    const cartSubtotal = cartLines.reduce((s, l) => s + l.price * l.quantity * (1 - l.discountPercent / 100), 0);
    const onCreateSubmit = async (data) => {
        if (cartLines.length === 0) {
            toast({ variant: "destructive", title: "Add at least one product" });
            return;
        }
        try {
            await createOrder.mutateAsync({ ...data, taxRate: Number(data.taxRate), items: cartLines.map(l => ({ productId: l.productId, quantity: l.quantity, discountPercent: l.discountPercent })) });
            toast({ title: "Order created" });
            setShowCreate(false);
            cReset();
            setCartLines([]);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const handleStatusChange = async (id, status) => {
        try {
            await updateOrder.mutateAsync({ id, status });
            toast({ title: "Status updated" });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    return (_jsxs("div", { className: "space-y-4 min-w-0", children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center", children: [_jsx(Input, { className: "min-w-0 w-full sm:w-60", placeholder: "Search by name or order #\u2026", value: search, onChange: e => setSearch(e.target.value) }), _jsxs(Select, { value: statusF, onValueChange: setStatusF, children: [_jsx(SelectTrigger, { className: "w-full sm:w-40", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "all", children: "All statuses" }), Object.entries(ORDER_STATUS_CONFIG).map(([k, v]) => _jsx(SelectItem, { value: k, children: v.label }, k))] })] }), _jsxs(Button, { onClick: () => setShowCreate(true), className: "w-full sm:ml-auto sm:w-auto", children: [_jsx(Plus, { className: "mr-1.5 h-4 w-4" }), "New order"] })] }), isLoading ? _jsx("div", { className: "space-y-2", children: [1, 2, 3].map(i => _jsx(Skeleton, { className: "h-16 w-full" }, i)) }) : (_jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { className: "w-8" }), _jsx(TableHead, { children: "Order #" }), _jsx(TableHead, { children: "Customer" }), _jsx(TableHead, { className: "text-right", children: "Total" }), _jsx(TableHead, { children: "Status" }), _jsx(TableHead, { children: "Date" }), _jsx(TableHead, { children: "Actions" })] }) }), _jsx(TableBody, { children: filtered.map(o => {
                                        const cfg = ORDER_STATUS_CONFIG[o.status] ?? { label: o.status, color: "bg-muted" };
                                        const isExp = expandedId === o.id;
                                        return (_jsxs(_Fragment, { children: [_jsxs(TableRow, { className: cn(isExp && "border-b-0 bg-muted/20"), children: [_jsx(TableCell, { children: _jsx(Button, { size: "icon", variant: "ghost", className: "h-6 w-6", onClick: () => setExpandedId(isExp ? null : o.id), children: isExp ? _jsx(ChevronUp, { className: "h-3.5 w-3.5" }) : _jsx(ChevronDown, { className: "h-3.5 w-3.5" }) }) }), _jsxs(TableCell, { className: "font-mono text-xs", children: [o.orderNumber, o.paymentPlanRequestedAt && _jsx(Badge, { variant: "secondary", className: "ml-2 align-middle text-[10px]", children: "Payment plan" })] }), _jsxs(TableCell, { children: [_jsx("p", { className: "font-medium", children: o.customerName }), _jsx("p", { className: "text-xs text-muted-foreground", children: o.customerEmail })] }), _jsx(TableCell, { className: "text-right font-semibold tabular-nums", children: fmt(o.totalAmount) }), _jsx(TableCell, { children: _jsxs(Select, { value: o.status, onValueChange: v => handleStatusChange(o.id, v), children: [_jsx(SelectTrigger, { className: "h-7 min-w-0 w-full max-w-[11rem] text-xs sm:w-36", children: _jsx(Badge, { className: cn("text-[11px]", cfg.color), children: cfg.label }) }), _jsx(SelectContent, { children: Object.entries(ORDER_STATUS_CONFIG).map(([k, v]) => _jsx(SelectItem, { value: k, children: v.label }, k)) })] }) }), _jsx(TableCell, { className: "text-xs text-muted-foreground", children: new Date(o.createdAt).toLocaleDateString() }), _jsx(TableCell, { children: _jsxs(Button, { size: "sm", variant: "outline", className: "h-7 text-xs", onClick: () => setUpdateOrderId(o.id), children: [_jsx(Image, { className: "mr-1 h-3.5 w-3.5" }), "Update"] }) })] }, o.id), isExp && (_jsx(TableRow, { className: "bg-muted/10 hover:bg-muted/10", children: _jsx(TableCell, { colSpan: 7, className: "px-4 pb-4 pt-0", children: _jsxs("div", { className: "grid gap-4 pt-2 sm:grid-cols-2", children: [_jsxs("div", { children: [_jsxs("p", { className: "mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground", children: ["Items (", o.items.length, ")"] }), _jsxs("div", { className: "space-y-1 text-sm", children: [o.items.map(it => (_jsxs("div", { className: "flex justify-between", children: [_jsxs("span", { children: [it.productName, " \u00D7 ", it.quantity, it.discountPercent > 0 && _jsxs("span", { className: "ml-1 text-green-600", children: ["\u2212", it.discountPercent, "%"] })] }), _jsx("span", { className: "font-mono tabular-nums", children: fmt(it.lineTotal) })] }, it.id))), _jsx(Separator, { className: "my-1" }), o.discountAmount > 0 && _jsxs("div", { className: "flex justify-between text-green-600", children: [_jsx("span", { children: "Discount" }), _jsxs("span", { children: ["\u2212", fmt(o.discountAmount)] })] }), o.taxAmount > 0 && _jsxs("div", { className: "flex justify-between text-muted-foreground", children: [_jsxs("span", { children: ["Tax (", o.taxRate, "%)"] }), _jsx("span", { children: fmt(o.taxAmount) })] }), _jsxs("div", { className: "flex justify-between font-semibold", children: [_jsx("span", { children: "Total" }), _jsx("span", { children: fmt(o.totalAmount) })] })] })] }), _jsxs("div", { children: [_jsx("p", { className: "mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground", children: "Production Updates" }), o.updates.length === 0 ? _jsx("p", { className: "text-xs text-muted-foreground", children: "No updates yet" }) : (_jsx("div", { className: "space-y-1 max-h-48 overflow-y-auto text-xs", children: o.updates.map(u => (_jsxs("div", { className: "rounded-md border p-2", children: [u.status && _jsx(Badge, { className: cn("mb-1 text-[10px]", ORDER_STATUS_CONFIG[u.status]?.color ?? "bg-muted"), children: u.status }), _jsx("p", { children: u.message }), u.imageUrl && _jsxs("a", { href: u.imageUrl, target: "_blank", rel: "noreferrer", className: "mt-1 flex items-center gap-1 text-primary hover:underline", children: [_jsx(Image, { className: "h-3 w-3" }), "Photo"] }), _jsx("p", { className: "mt-0.5 text-muted-foreground", children: new Date(u.createdAt).toLocaleString() })] }, u.id))) })), o.shippingAddress && _jsxs(_Fragment, { children: [_jsx("p", { className: "mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground", children: "Ship to" }), _jsx("p", { className: "text-xs", children: o.shippingAddress })] })] })] }) }) }, `${o.id}-detail`))] }));
                                    }) })] }) }) }) })), _jsx(Dialog, { open: showCreate, onOpenChange: v => { if (!v) {
                    setShowCreate(false);
                    cReset();
                    setCartLines([]);
                } }, children: _jsxs(DialogContent, { className: "max-h-[90vh] max-w-3xl overflow-y-auto", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Create customer order" }) }), _jsxs("form", { onSubmit: cSubmit(onCreateSubmit), className: "space-y-5", children: [_jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Customer name *" }), _jsx(Input, { ...creg("customerName", { required: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Customer email *" }), _jsx(Input, { type: "email", ...creg("customerEmail", { required: true }) })] }), _jsxs("div", { className: "space-y-1 sm:col-span-2", children: [_jsx(Label, { children: "Shipping address *" }), _jsx(Textarea, { rows: 2, ...creg("shippingAddress", { required: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Discount code" }), _jsx(Input, { ...creg("discountCode"), placeholder: "SAVE10" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Tax rate (%)" }), _jsx(Input, { type: "number", step: "0.01", min: 0, max: 100, ...creg("taxRate", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1 sm:col-span-2", children: [_jsx(Label, { children: "Notes" }), _jsx(Textarea, { rows: 2, ...creg("notes") })] })] }), _jsxs("div", { children: [_jsx("p", { className: "mb-2 text-sm font-semibold", children: "Products" }), _jsx("div", { className: "mb-3 flex flex-wrap gap-2", children: products.map((p) => (_jsxs(Button, { type: "button", size: "sm", variant: "outline", onClick: () => addCartLine(p.id), children: [_jsx(Plus, { className: "mr-1 h-3 w-3" }), p.name, " (", fmt(Number(p.sellingPrice)), ")"] }, p.id))) }), cartLines.length > 0 && (_jsxs("div", { className: "rounded-lg border divide-y text-sm", children: [cartLines.map(l => (_jsxs("div", { className: "flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2", children: [_jsx("span", { className: "min-w-0 flex-1", children: l.name }), _jsx(Input, { type: "number", min: 1, value: l.quantity, onChange: e => setCartLines(prev => prev.map(x => x.productId === l.productId ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x)), className: "h-7 w-16 text-xs" }), _jsx("span", { className: "w-8 text-center text-muted-foreground", children: "@" }), _jsx("span", { className: "w-20 text-right font-mono tabular-nums", children: fmt(l.price) }), _jsx(Input, { type: "number", min: 0, max: 100, value: l.discountPercent, onChange: e => setCartLines(prev => prev.map(x => x.productId === l.productId ? { ...x, discountPercent: Number(e.target.value) } : x)), placeholder: "Disc%", className: "h-7 w-16 text-xs" }), _jsx("span", { className: "w-20 text-right font-semibold tabular-nums", children: fmt(l.price * l.quantity * (1 - l.discountPercent / 100)) }), _jsx(Button, { type: "button", size: "icon", variant: "ghost", className: "h-6 w-6 text-destructive", onClick: () => removeCartLine(l.productId), children: _jsx(Trash2, { className: "h-3 w-3" }) })] }, l.productId))), _jsxs("div", { className: "flex justify-between px-3 py-2 font-semibold", children: [_jsx("span", { children: "Subtotal" }), _jsx("span", { className: "font-mono", children: fmt(cartSubtotal) })] })] }))] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => { setShowCreate(false); cReset(); setCartLines([]); }, children: "Cancel" }), _jsx(Button, { type: "submit", disabled: createOrder.isPending, children: "Create order" })] })] })] }) }), updateOrderId && (_jsx(AddUpdateDialog, { orderId: updateOrderId, onClose: () => setUpdateOrderId(null), addUpdate: addUpdate, toast: toast }))] }));
}
function AddUpdateDialog({ orderId, onClose, addUpdate, toast }) {
    const uploadOrderUpdateImage = useUploadOrderUpdateImage();
    const [imageFile, setImageFile] = useState(null);
    const { register, handleSubmit, reset } = useForm({ defaultValues: { message: "", status: "", imageUrl: "", visibleToCustomer: true } });
    const onSubmit = async (data) => {
        try {
            let uploadedImageUrl = data.imageUrl || undefined;
            if (imageFile) {
                const uploaded = await uploadOrderUpdateImage.mutateAsync({ orderId, file: imageFile });
                uploadedImageUrl = uploaded?.imageUrl || uploadedImageUrl;
            }
            await addUpdate.mutateAsync({ orderId, message: data.message, status: data.status || undefined, imageUrl: uploadedImageUrl, visibleToCustomer: data.visibleToCustomer });
            toast({ title: "Update added" });
            onClose();
            setImageFile(null);
            reset();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    return (_jsx(Dialog, { open: true, onOpenChange: v => { if (!v)
            onClose(); }, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Add production update" }) }), _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Message *" }), _jsx(Textarea, { rows: 3, ...register("message", { required: true }), placeholder: "What happened with this order\u2026" })] }), _jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Status change (optional)" }), _jsxs("select", { className: "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", ...register("status"), children: [_jsx("option", { value: "", children: "No change" }), Object.entries(ORDER_STATUS_CONFIG).map(([k, v]) => _jsx("option", { value: k, children: v.label }, k))] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Image URL (optional)" }), _jsx(Input, { ...register("imageUrl"), placeholder: "https://\u2026" })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Upload progress image (optional)" }), _jsx(Input, { type: "file", accept: "image/*", onChange: (e) => setImageFile(e.target.files?.[0] ?? null) }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Attach production photo from Sales/Production manager portal." })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { type: "checkbox", id: "vis", ...register("visibleToCustomer"), defaultChecked: true, className: "h-4 w-4 rounded" }), _jsx(Label, { htmlFor: "vis", children: "Visible to customer" })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: onClose, children: "Cancel" }), _jsx(Button, { type: "submit", disabled: addUpdate.isPending || uploadOrderUpdateImage.isPending, children: "Post update" })] })] })] }) }));
}
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 3 — INVOICES                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */
function InvoicesTab() {
    const { toast } = useToast();
    const { data: currentUser } = useGetCurrentUser();
    const { data: invoices = [], isLoading } = useSalesInvoices();
    const { data: orders = [] } = useSalesOrders();
    const generateInvoice = useGenerateInvoice();
    const updateInvoice = useUpdateInvoice();
    const uploadInvoicePdf = useUploadInvoicePdf();
    const [statusF, setStatusF] = useState("all");
    const [showGen, setShowGen] = useState(false);
    const { register: greg, handleSubmit: gSubmit, reset: gReset } = useForm({ defaultValues: { orderId: 0, dueDate: "", notes: "", taxRate: 0 } });
    const filtered = useMemo(() => {
        if (statusF === "all")
            return invoices;
        return invoices.filter(i => i.status === statusF);
    }, [invoices, statusF]);
    const onGenerate = async (data) => {
        try {
            await generateInvoice.mutateAsync({ orderId: Number(data.orderId), dueDate: data.dueDate || undefined, notes: data.notes || undefined, taxRate: Number(data.taxRate) || undefined });
            toast({ title: "Invoice generated" });
            setShowGen(false);
            gReset();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const salesVerify = async (inv) => {
        try {
            await updateInvoice.mutateAsync({ id: inv.id, status: "sales_verified" });
            toast({ title: "Sales verification done", description: "Accounts can now confirm payment and close invoice." });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const accountMarkPaid = async (inv) => {
        try {
            await updateInvoice.mutateAsync({ id: inv.id, status: "paid" });
            toast({ title: "Payment posted", description: "Invoice is marked paid by accounts." });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const rejectPayment = async (inv) => {
        try {
            await updateInvoice.mutateAsync({ id: inv.id, status: "sent" });
            toast({ title: "Verification rejected", description: "Customer can resubmit payment details." });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const uploadPdf = async (inv) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/pdf";
        input.onchange = async (ev) => {
            const file = ev.target.files?.[0];
            if (!file)
                return;
            try {
                await uploadInvoicePdf.mutateAsync({ id: inv.id, file });
                toast({ title: "Invoice PDF uploaded" });
            }
            catch (e) {
                toast({ variant: "destructive", title: "Upload failed", description: e.message });
            }
        };
        input.click();
    };
    const role = currentUser?.role ?? "";
    const canSalesVerify = ["admin", "manager", "sales_manager"].includes(role);
    const canAccountsPost = ["admin", "accountant"].includes(role);
    return (_jsxs("div", { className: "space-y-4 min-w-0", children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center", children: [_jsxs(Select, { value: statusF, onValueChange: setStatusF, children: [_jsx(SelectTrigger, { className: "w-full sm:w-36", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "all", children: "All" }), Object.entries(INVOICE_STATUS_CONFIG).map(([k, v]) => _jsx(SelectItem, { value: k, children: v.label }, k))] })] }), _jsxs(Button, { className: "w-full sm:ml-auto sm:w-auto", onClick: () => setShowGen(true), children: [_jsx(Plus, { className: "mr-1.5 h-4 w-4" }), "Generate invoice"] })] }), isLoading ? _jsx(Skeleton, { className: "h-48 w-full" }) : (_jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "Invoice #" }), _jsx(TableHead, { children: "Customer" }), _jsx(TableHead, { className: "text-right", children: "Amount" }), _jsx(TableHead, { children: "Due Date" }), _jsx(TableHead, { children: "Status" }), _jsx(TableHead, { children: "Actions" })] }) }), _jsx(TableBody, { children: filtered.map(inv => {
                                        const cfg = INVOICE_STATUS_CONFIG[inv.status] ?? { label: inv.status, color: "bg-muted" };
                                        const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";
                                    return (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "font-mono text-xs", children: inv.invoiceNumber }), _jsxs(TableCell, { children: [_jsx("p", { className: "font-medium", children: inv.customerName }), _jsx("p", { className: "text-xs text-muted-foreground", children: inv.customerEmail }), inv.paymentMethod && _jsxs("p", { className: "text-xs text-muted-foreground", children: ["Via ", inv.paymentMethod, inv.paymentReference ? ` · Ref: ${inv.paymentReference}` : ""] }), inv.paymentProofUrl && _jsx("a", { href: inv.paymentProofUrl, target: "_blank", rel: "noreferrer", className: "text-xs text-primary hover:underline", children: "View payment proof" })] }), _jsx(TableCell, { className: "text-right font-semibold tabular-nums", children: fmt(inv.totalAmount) }), _jsxs(TableCell, { className: cn("text-sm", isOverdue && "font-semibold text-red-600"), children: [inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—", isOverdue && " (Overdue)"] }), _jsx(TableCell, { children: _jsx(Badge, { className: cn("text-[11px]", cfg.color), children: cfg.label }) }), _jsx(TableCell, { children: _jsxs("div", { className: "flex flex-wrap gap-1", children: [inv.status === "pending_verification" && canSalesVerify && (_jsxs(_Fragment, { children: [_jsxs(Button, { size: "sm", variant: "outline", className: "h-7 text-xs", onClick: () => salesVerify(inv), children: [_jsx(CheckCircle2, { className: "mr-1 h-3.5 w-3.5" }), "Sales verify"] }), _jsx(Button, { size: "sm", variant: "outline", className: "h-7 text-xs", onClick: () => rejectPayment(inv), children: "Reject / Request re-submit" })] })), inv.status === "sales_verified" && canAccountsPost && (_jsxs(Button, { size: "sm", variant: "outline", className: "h-7 text-xs", onClick: () => accountMarkPaid(inv), children: [_jsx(CheckCircle2, { className: "mr-1 h-3.5 w-3.5" }), "Accounts mark paid"] })), inv.status === "draft" && (_jsx(Button, { size: "sm", variant: "outline", className: "h-7 text-xs", onClick: () => updateInvoice.mutateAsync({ id: inv.id, status: "sent" }).then(() => toast({ title: "Invoice sent" })).catch((e) => toast({ variant: "destructive", title: "Error", description: e.message })), children: "Send" })), _jsxs(Button, { size: "sm", variant: "outline", className: "h-7 text-xs", onClick: () => uploadPdf(inv), children: [_jsx(Upload, { className: "mr-1 h-3.5 w-3.5" }), "Upload PDF"] }), inv.pdfUrl && (_jsx("a", { href: inv.pdfUrl, target: "_blank", rel: "noreferrer", className: "inline-flex h-7 items-center rounded-md border px-2 text-xs hover:bg-muted", children: "Open PDF" }))] }) })] }, inv.id));
                                    }) })] }) }) }) })), _jsx(Dialog, { open: showGen, onOpenChange: setShowGen, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Generate invoice from order" }) }), _jsxs("form", { onSubmit: gSubmit(onGenerate), className: "space-y-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Order *" }), _jsxs("select", { className: "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1", ...greg("orderId", { required: true, valueAsNumber: true }), children: [_jsx("option", { value: 0, children: "Select order\u2026" }), orders.filter(o => o.status !== "cancelled").map(o => _jsxs("option", { value: o.id, children: [o.orderNumber, " \u2014 ", o.customerName, " (", fmt(o.totalAmount), ")"] }, o.id))] })] }), _jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Due date" }), _jsx(Input, { type: "datetime-local", ...greg("dueDate") })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Tax rate (%)" }), _jsx(Input, { type: "number", step: "0.01", ...greg("taxRate", { valueAsNumber: true }) })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Notes" }), _jsx(Textarea, { ...greg("notes") })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowGen(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: generateInvoice.isPending, children: "Generate" })] })] })] }) })] }));
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
    const [editDisc, setEditDisc] = useState(null);
    const { register, handleSubmit, control, reset } = useForm({
        defaultValues: { code: "", description: "", type: "percentage", value: 10, minOrderAmount: 0, maxUses: null, expiresAt: "", isActive: true },
    });
    const openCreate = () => { setEditDisc(null); reset(); setShowDialog(true); };
    const openEdit = (d) => {
        setEditDisc(d);
        reset({ code: d.code, description: d.description ?? "", type: d.type, value: d.value, minOrderAmount: d.minOrderAmount, maxUses: d.maxUses, expiresAt: d.expiresAt ? d.expiresAt.slice(0, 16) : "", isActive: d.isActive });
        setShowDialog(true);
    };
    const onSubmit = async (data) => {
        const minOrder = Number.isFinite(Number(data.minOrderAmount)) ? Number(data.minOrderAmount) : 0;
        const maxU = data.maxUses;
        const maxUsesPayload = (() => {
            if (maxU === "" || maxU === null || maxU === undefined)
                return null;
            const n = Number(maxU);
            if (Number.isNaN(n) || n < 1)
                return null;
            return Math.floor(n);
        })();
        const expiresPayload = data.expiresAt && String(data.expiresAt).trim() !== "" ? data.expiresAt : null;
        try {
            if (editDisc) {
                await updateDiscount.mutateAsync({
                    id: editDisc.id,
                    ...data,
                    value: Number(data.value),
                    minOrderAmount: minOrder,
                    maxUses: maxUsesPayload,
                    expiresAt: expiresPayload,
                });
                toast({ title: "Discount updated" });
            }
            else {
                await createDiscount.mutateAsync({
                    ...data,
                    value: Number(data.value),
                    minOrderAmount: minOrder,
                    maxUses: maxUsesPayload,
                    expiresAt: expiresPayload,
                });
                toast({ title: "Discount created" });
            }
            setShowDialog(false);
            reset();
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const handleDelete = async (id) => {
        if (!confirm("Delete this discount?"))
            return;
        try {
            await deleteDiscount.mutateAsync(id);
            toast({ title: "Deleted" });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    return (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "flex justify-end", children: _jsxs(Button, { onClick: openCreate, children: [_jsx(Plus, { className: "mr-1.5 h-4 w-4" }), "New discount"] }) }), isLoading ? _jsx(Skeleton, { className: "h-48 w-full" }) : (_jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "Code" }), _jsx(TableHead, { children: "Type" }), _jsx(TableHead, { children: "Value" }), _jsx(TableHead, { children: "Min Order" }), _jsx(TableHead, { children: "Uses" }), _jsx(TableHead, { children: "Expires" }), _jsx(TableHead, { children: "Active" }), _jsx(TableHead, { children: "Actions" })] }) }), _jsx(TableBody, { children: discounts.map(d => (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "font-mono font-bold", children: d.code }), _jsx(TableCell, { children: _jsx(Badge, { variant: "outline", children: d.type }) }), _jsx(TableCell, { className: "tabular-nums", children: d.type === "percentage" ? `${d.value}%` : fmt(d.value) }), _jsx(TableCell, { className: "tabular-nums", children: d.minOrderAmount > 0 ? fmt(d.minOrderAmount) : "—" }), _jsxs(TableCell, { className: "tabular-nums", children: [d.usedCount, d.maxUses ? ` / ${d.maxUses}` : ""] }), _jsx(TableCell, { className: "text-xs text-muted-foreground", children: d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : "Never" }), _jsx(TableCell, { children: _jsx(Badge, { className: d.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600", children: d.isActive ? "Active" : "Inactive" }) }), _jsx(TableCell, { children: _jsxs("div", { className: "flex gap-1", children: [_jsx(Button, { size: "icon", variant: "ghost", className: "h-7 w-7", onClick: () => openEdit(d), children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) }), _jsx(Button, { size: "icon", variant: "ghost", className: "h-7 w-7 text-destructive", onClick: () => handleDelete(d.id), children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }) })] }, d.id))) })] }) }) })), _jsx(Dialog, { open: showDialog, onOpenChange: v => { if (!v)
                    setShowDialog(false); }, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: editDisc ? "Edit discount" : "New discount" }) }), _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Code *" }), _jsx(Input, { ...register("code", { required: true }), className: "uppercase", placeholder: "SAVE20" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Type *" }), _jsx(Controller, { name: "type", control: control, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "percentage", children: "Percentage" }), _jsx(SelectItem, { value: "fixed", children: "Fixed amount" })] })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Value" }), _jsx(Input, { type: "number", step: "0.01", ...register("value", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Min order amount" }), _jsx(Input, { type: "number", step: "0.01", ...register("minOrderAmount", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Max uses (blank = unlimited)" }), _jsx(Input, { type: "number", ...register("maxUses", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Expires at" }), _jsx(Input, { type: "datetime-local", ...register("expiresAt") })] }), _jsxs("div", { className: "space-y-1 sm:col-span-2", children: [_jsx(Label, { children: "Description" }), _jsx(Input, { ...register("description") })] }), _jsxs("div", { className: "flex items-center gap-2 sm:col-span-2", children: [_jsx(Controller, { name: "isActive", control: control, render: ({ field }) => _jsx(Switch, { checked: field.value, onCheckedChange: field.onChange }) }), _jsx(Label, { children: "Active" })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowDialog(false), children: "Cancel" }), _jsx(Button, { type: "submit", children: "Save" })] })] })] }) })] }));
}
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 5 — RECEIVABLES                                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */
function ReceivablesTab() {
    const { data, isLoading } = useSalesReceivables();
    if (isLoading)
        return _jsx(Skeleton, { className: "h-48 w-full" });
    if (!data)
        return null;
    const bucketRows = [
        { key: "current", label: "Current (not yet due)", color: "text-green-600" },
        { key: "days30", label: "1–30 days overdue", color: "text-amber-600" },
        { key: "days60", label: "31–60 days overdue", color: "text-orange-600" },
        { key: "days90", label: "61–90 days overdue", color: "text-red-600" },
        { key: "over90", label: ">90 days overdue", color: "text-red-800" },
    ];
    return (_jsxs("div", { className: "space-y-6 min-w-0", children: [_jsx("div", { className: "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5", children: bucketRows.map(({ key, label, color }) => (_jsxs("div", { className: "rounded-lg border bg-card p-3 text-center", children: [_jsx("p", { className: "text-[10px] text-muted-foreground leading-snug", children: label }), _jsx("p", { className: cn("text-lg font-bold tabular-nums mt-1", color), children: fmt(data.buckets[key]) })] }, key))) }), _jsxs("div", { className: "flex flex-col gap-2 rounded-lg bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5", children: [_jsx("span", { className: "font-semibold", children: "Total Outstanding" }), _jsx("span", { className: "text-xl font-bold tabular-nums text-primary", children: fmt(data.totalOutstanding) })] }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "Invoice #" }), _jsx(TableHead, { children: "Customer" }), _jsx(TableHead, { className: "text-right", children: "Amount" }), _jsx(TableHead, { children: "Due Date" }), _jsx(TableHead, { children: "Age" }), _jsx(TableHead, { children: "Bucket" })] }) }), _jsx(TableBody, { children: data.invoices.map(inv => {
                                    const bucketCfg = bucketRows.find(b => b.key === inv.bucket) ?? bucketRows[0];
                                    return (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "font-mono text-xs", children: inv.invoiceNumber }), _jsxs(TableCell, { children: [_jsx("p", { className: "font-medium", children: inv.customerName }), _jsx("p", { className: "text-xs text-muted-foreground", children: inv.customerEmail })] }), _jsx(TableCell, { className: "text-right font-semibold tabular-nums", children: fmt(inv.totalAmount) }), _jsx(TableCell, { className: "text-sm", children: inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "No due date" }), _jsx(TableCell, { className: cn("tabular-nums font-medium", bucketCfg.color), children: inv.ageDays > 0 ? `${inv.ageDays}d` : "—" }), _jsx(TableCell, { children: _jsx(Badge, { className: cn("text-[10px]", inv.ageDays > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"), children: bucketCfg.label.split(" ")[0] }) })] }, inv.id));
                                }) })] }) }) })] }));
}
/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
const SALES_TAB_IDS = ["overview", "catalog", "orders", "invoices", "discounts", "receivables"];
export default function SalesPage() {
    const [loc] = useLocation();
    const [activeTab, setActiveTab] = useState("overview");
    useEffect(() => {
        const search = typeof window !== "undefined" ? window.location.search : "";
        const q = new URLSearchParams(search);
        const t = q.get("tab");
        if (t && SALES_TAB_IDS.includes(t))
            setActiveTab(t);
    }, [loc]);
    return (_jsxs("div", { className: "space-y-6 min-w-0", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold tracking-tight sm:text-3xl", children: "Sales Manager" }), _jsx("p", { className: "text-sm text-muted-foreground sm:text-base", children: "Catalog \u00B7 Orders \u00B7 Invoices \u00B7 Discounts \u00B7 Receivables" })] }), _jsxs(Tabs, { value: activeTab, onValueChange: setActiveTab, className: "min-w-0", children: [_jsxs(TabsList, { className: "flex h-auto w-full flex-wrap gap-1 overflow-x-auto sm:w-auto sm:flex-nowrap", children: [_jsxs(TabsTrigger, { value: "overview", className: "gap-1.5", children: [_jsx(BarChart3, { className: "h-4 w-4" }), "Overview"] }), _jsxs(TabsTrigger, { value: "catalog", className: "gap-1.5", children: [_jsx(Package, { className: "h-4 w-4" }), "Catalog"] }), _jsxs(TabsTrigger, { value: "orders", className: "gap-1.5", children: [_jsx(ShoppingCart, { className: "h-4 w-4" }), "Orders"] }), _jsxs(TabsTrigger, { value: "invoices", className: "gap-1.5", children: [_jsx(FileText, { className: "h-4 w-4" }), "Invoices"] }), _jsxs(TabsTrigger, { value: "discounts", className: "gap-1.5", children: [_jsx(Tag, { className: "h-4 w-4" }), "Discounts"] }), _jsxs(TabsTrigger, { value: "receivables", className: "gap-1.5", children: [_jsx(TrendingUp, { className: "h-4 w-4" }), "Receivables"] })] }), _jsx(TabsContent, { value: "overview", className: "mt-4", children: _jsx(OverviewTab, { onTabChange: setActiveTab }) }), _jsx(TabsContent, { value: "catalog", className: "mt-4", children: _jsx(CatalogTab, {}) }), _jsx(TabsContent, { value: "orders", className: "mt-4", children: _jsx(OrdersTab, {}) }), _jsx(TabsContent, { value: "invoices", className: "mt-4", children: _jsx(InvoicesTab, {}) }), _jsx(TabsContent, { value: "discounts", className: "mt-4", children: _jsx(DiscountsTab, {}) }), _jsx(TabsContent, { value: "receivables", className: "mt-4", children: _jsx(ReceivablesTab, {}) })] })] }));
}
