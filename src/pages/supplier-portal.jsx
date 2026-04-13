import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useSupplierMe, useSupplierQuotes, useSubmitQuote, useSupplierDeliveries, useAddDeliveryUpdate, usePatchDeliveryUpdate, useSupplierLedger, } from "@/hooks/use-supplier-portal";
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
import { NativeAnalyticsPanel } from "@/components/NativeAnalyticsPanel";
import { FileText, Plus, Truck, BarChart3, Building2, Star, TrendingUp, DollarSign, Clock, CheckCircle2, AlertTriangle, Pencil, Info, } from "lucide-react";
/* ─── Constants ─────────────────────────────────────────────────────────────── */
const QUOTE_STATUS_COLOR = {
    PENDING: "secondary",
    LOCKED: "outline",
    ADMIN_APPROVED: "default",
    PAID: "default",
};
const QUOTE_STATUS_LABEL = {
    PENDING: "Pending",
    LOCKED: "Under Review",
    ADMIN_APPROVED: "Approved",
    PAID: "Paid",
};
const DELIVERY_STATUS_COLOR = {
    preparing: "secondary",
    shipped: "outline",
    in_transit: "default",
    delivered: "default",
    delayed: "destructive",
};
const DELIVERY_STATUS_LABEL = {
    preparing: "Preparing",
    shipped: "Shipped",
    in_transit: "In Transit",
    delivered: "Delivered",
    delayed: "Delayed",
};
const DELIVERY_STATUSES = ["preparing", "shipped", "in_transit", "delivered", "delayed"];
/* ─── Sub-components ─────────────────────────────────────────────────────────── */
function SummaryCard({ icon: Icon, label, value, sub, color, }) {
    return (_jsx(Card, { children: _jsxs(CardContent, { className: "flex items-start gap-4 p-5", children: [_jsx("div", { className: `rounded-lg p-2 ${color ?? "bg-primary/10"}`, children: _jsx(Icon, { className: "h-5 w-5 text-primary" }) }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: label }), _jsx("p", { className: "text-xl font-bold tabular-nums", children: value }), sub && _jsx("p", { className: "text-xs text-muted-foreground", children: sub })] })] }) }));
}
function SubmitQuoteDialog({ open, onClose }) {
    const { toast } = useToast();
    const submitQuote = useSubmitQuote();
    const { register, handleSubmit, watch, reset } = useForm({
        defaultValues: { quantity: 1, unitPrice: 0 },
    });
    const quantity = watch("quantity");
    const unitPrice = watch("unitPrice");
    const total = (Number(quantity) || 0) * (Number(unitPrice) || 0);
    const onSubmit = async (data) => {
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
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    return (_jsx(Dialog, { open: open, onOpenChange: (v) => { if (!v) {
            reset();
            onClose();
        } }, children: _jsxs(DialogContent, { className: "max-w-lg", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { className: "flex items-center gap-2", children: [_jsx(FileText, { className: "h-5 w-5 text-primary", "aria-hidden": true }), "Submit Quotation"] }) }), _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "sq-desc", children: "Description *" }), _jsx(Input, { id: "sq-desc", placeholder: "e.g. Oak Lumber 2\u00D74 \u2013 Bulk Q3 Order", ...register("description", { required: true }) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "sq-qty", children: "Quantity *" }), _jsx(Input, { id: "sq-qty", type: "number", step: "0.01", min: "0.01", ...register("quantity", { valueAsNumber: true, required: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "sq-price", children: "Unit Price ($) *" }), _jsx(Input, { id: "sq-price", type: "number", step: "0.01", min: "0", ...register("unitPrice", { valueAsNumber: true, required: true }) })] })] }), _jsxs("div", { className: "flex items-center justify-between rounded-md bg-muted/50 px-4 py-2 text-sm", children: [_jsx("span", { className: "text-muted-foreground", children: "Total" }), _jsxs("span", { className: "font-semibold tabular-nums", children: ["$", total.toFixed(2)] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "sq-valid", children: "Valid Until (optional)" }), _jsx(Input, { id: "sq-valid", type: "date", ...register("validUntil") })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "sq-notes", children: "Notes (optional)" }), _jsx(Input, { id: "sq-notes", placeholder: "Lead time, terms\u2026", ...register("notes") })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => { reset(); onClose(); }, children: "Cancel" }), _jsx(Button, { type: "submit", disabled: submitQuote.isPending, children: "Submit Quote" })] })] })] }) }));
}
function AddDeliveryDialog({ open, onClose, quotes, prefillQuoteId, }) {
    const { toast } = useToast();
    const addUpdate = useAddDeliveryUpdate();
    const { register, handleSubmit, control, reset } = useForm({
        defaultValues: { quoteId: prefillQuoteId?.toString() ?? "", status: "preparing" },
    });
    const onSubmit = async (data) => {
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
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const eligibleQuotes = quotes.filter((q) => ["ADMIN_APPROVED", "PAID", "LOCKED"].includes(q.status));
    return (_jsx(Dialog, { open: open, onOpenChange: (v) => { if (!v) {
            reset();
            onClose();
        } }, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { className: "flex items-center gap-2", children: [_jsx(Truck, { className: "h-5 w-5 text-primary", "aria-hidden": true }), "Add Delivery Update"] }) }), _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Quote *" }), _jsx(Controller, { name: "quoteId", control: control, rules: { required: true }, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Select quote\u2026" }) }), _jsx(SelectContent, { children: eligibleQuotes.map((q) => (_jsxs(SelectItem, { value: q.id.toString(), children: ["#", q.id, " \u2014 ", q.description.slice(0, 40)] }, q.id))) })] })) }), eligibleQuotes.length === 0 && (_jsx("p", { className: "text-xs text-muted-foreground", children: "No approved/locked quotes available yet." }))] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Delivery Status *" }), _jsx(Controller, { name: "status", control: control, rules: { required: true }, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Select status\u2026" }) }), _jsx(SelectContent, { children: DELIVERY_STATUSES.map((s) => (_jsx(SelectItem, { value: s, children: DELIVERY_STATUS_LABEL[s] }, s))) })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "del-eta", children: "Estimated Delivery (optional)" }), _jsx(Input, { id: "del-eta", type: "date", ...register("estimatedDelivery") })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "del-note", children: "Note (optional)" }), _jsx(Input, { id: "del-note", placeholder: "Any remarks about shipment\u2026", ...register("note") })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => { reset(); onClose(); }, children: "Cancel" }), _jsx(Button, { type: "submit", disabled: addUpdate.isPending || eligibleQuotes.length === 0, children: "Add Update" })] })] })] }) }));
}
/* ─── Edit delivery dialog ───────────────────────────────────────────────────── */
function EditDeliveryDialog({ update, onClose, }) {
    const { toast } = useToast();
    const patchUpdate = usePatchDeliveryUpdate();
    const { register, handleSubmit, control, reset } = useForm({
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
    const onSubmit = async (data) => {
        if (!update)
            return;
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
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    return (_jsx(Dialog, { open: !!update, onOpenChange: (v) => { if (!v) {
            reset();
            onClose();
        } }, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Edit Delivery Update" }) }), _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Status *" }), _jsx(Controller, { name: "status", control: control, rules: { required: true }, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: DELIVERY_STATUSES.map((s) => (_jsx(SelectItem, { value: s, children: DELIVERY_STATUS_LABEL[s] }, s))) })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "edit-eta", children: "Estimated Delivery" }), _jsx(Input, { id: "edit-eta", type: "date", ...register("estimatedDelivery") })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "edit-note", children: "Note" }), _jsx(Input, { id: "edit-note", ...register("note") })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => { reset(); onClose(); }, children: "Cancel" }), _jsx(Button, { type: "submit", disabled: patchUpdate.isPending, children: "Save" })] })] })] }) }));
}
/* ─── Main portal page ───────────────────────────────────────────────────────── */
export default function SupplierPortalPage() {
    const { data: profile, isLoading: profileLoading, error: profileError } = useSupplierMe();
    const { data: quotes = [], isLoading: quotesLoading } = useSupplierQuotes();
    const { data: deliveries = [], isLoading: deliveriesLoading } = useSupplierDeliveries();
    const { data: ledger, isLoading: ledgerLoading } = useSupplierLedger();
    const [showSubmitQuote, setShowSubmitQuote] = useState(false);
    const [showAddDelivery, setShowAddDelivery] = useState(false);
    const [deliveryPrefillId, setDeliveryPrefillId] = useState();
    const [editDelivery, setEditDelivery] = useState(null);
    const [quoteSearch, setQuoteSearch] = useState("");
    const [ledgerSearch, setLedgerSearch] = useState("");
    const filteredQuotes = useMemo(() => quotes.filter((q) => q.description.toLowerCase().includes(quoteSearch.toLowerCase())), [quotes, quoteSearch]);
    const filteredLedger = useMemo(() => (ledger?.ledger ?? []).filter((r) => r.description.toLowerCase().includes(ledgerSearch.toLowerCase())), [ledger, ledgerSearch]);
    if (profileLoading) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsx(Skeleton, { className: "h-32 w-full" }), _jsx("div", { className: "grid grid-cols-2 gap-4 sm:grid-cols-4", children: [1, 2, 3, 4].map((i) => _jsx(Skeleton, { className: "h-24 w-full" }, i)) })] }));
    }
    if (profileError || !profile) {
        return (_jsxs("div", { className: "flex flex-col items-center justify-center gap-4 py-24 text-center", children: [_jsx(AlertTriangle, { className: "h-12 w-12 text-amber-500", "aria-hidden": true }), _jsxs("div", { children: [_jsx("p", { className: "text-xl font-semibold", children: "Supplier profile not linked" }), _jsxs("p", { className: "mt-2 max-w-sm text-sm text-muted-foreground", children: ["Your account is not yet linked to a supplier record. Please ask your FurniCore administrator to create a supplier entry with your email address (", _jsx("span", { className: "font-mono text-xs" }), ")."] })] }), _jsxs(Alert, { className: "max-w-md text-left", children: [_jsx(Info, { className: "h-4 w-4" }), _jsxs(AlertDescription, { children: ["Admin steps: Go to ", _jsx("strong", { children: "Suppliers" }), " module \u2192 create or edit a supplier \u2192 set the ", _jsx("strong", { children: "Email" }), " field to match your login email \u2192 save. Then refresh this page."] })] })] }));
    }
    /* ── Summary cards ─────────────────────────────────────────────── */
    const summary = ledger?.summary;
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Building2, { className: "h-6 w-6 text-primary", "aria-hidden": true }), _jsx("h1", { className: "text-2xl font-bold tracking-tight", children: profile.name }), profile.status === "active" ? (_jsx(Badge, { className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", children: "Active" })) : (_jsx(Badge, { variant: "secondary", children: profile.status }))] }), _jsxs("p", { className: "mt-0.5 text-sm text-muted-foreground", children: [profile.email, profile.phone ? ` · ${profile.phone}` : "", profile.rating !== null ? (_jsxs("span", { className: "ml-2 inline-flex items-center gap-0.5", children: [_jsx(Star, { className: "h-3.5 w-3.5 fill-amber-400 text-amber-400", "aria-hidden": true }), profile.rating, "/5"] })) : null] })] }), _jsxs("div", { className: "flex gap-2 sm:shrink-0", children: [_jsxs(Button, { onClick: () => setShowSubmitQuote(true), children: [_jsx(Plus, { className: "mr-1.5 h-4 w-4", "aria-hidden": true }), "Submit Quote"] }), _jsxs(Button, { variant: "outline", onClick: () => { setDeliveryPrefillId(undefined); setShowAddDelivery(true); }, children: [_jsx(Truck, { className: "mr-1.5 h-4 w-4", "aria-hidden": true }), "Add Delivery Update"] })] })] }), summary && (_jsxs("div", { className: "grid grid-cols-2 gap-3 sm:grid-cols-4", children: [_jsx(SummaryCard, { icon: FileText, label: "Total Quotes", value: summary.totalQuotes, color: "bg-blue-50 dark:bg-blue-900/20" }), _jsx(SummaryCard, { icon: DollarSign, label: "Total Value", value: `$${summary.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: "bg-purple-50 dark:bg-purple-900/20" }), _jsx(SummaryCard, { icon: CheckCircle2, label: "Paid", value: `$${summary.paidValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: "bg-green-50 dark:bg-green-900/20" }), _jsx(SummaryCard, { icon: Clock, label: "Pending", value: `$${summary.pendingValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: "bg-amber-50 dark:bg-amber-900/20" })] })), _jsxs(Tabs, { defaultValue: "quotes", children: [_jsxs(TabsList, { className: "w-full sm:w-auto", children: [_jsxs(TabsTrigger, { value: "quotes", className: "flex items-center gap-1.5", children: [_jsx(FileText, { className: "h-4 w-4", "aria-hidden": true }), "My Quotes"] }), _jsxs(TabsTrigger, { value: "deliveries", className: "flex items-center gap-1.5", children: [_jsx(Truck, { className: "h-4 w-4", "aria-hidden": true }), "Deliveries"] }), _jsxs(TabsTrigger, { value: "ledger", className: "flex items-center gap-1.5", children: [_jsx(BarChart3, { className: "h-4 w-4", "aria-hidden": true }), "Ledger"] })] }), _jsxs(TabsContent, { value: "quotes", className: "mt-4 space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsx(Input, { placeholder: "Search quotes\u2026", value: quoteSearch, onChange: (e) => setQuoteSearch(e.target.value), className: "max-w-xs" }), _jsxs(Button, { size: "sm", onClick: () => setShowSubmitQuote(true), children: [_jsx(Plus, { className: "mr-1.5 h-3.5 w-3.5", "aria-hidden": true }), "New Quote"] })] }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: quotesLoading ? (_jsx("div", { className: "space-y-3 p-6", children: [1, 2, 3].map((i) => _jsx(Skeleton, { className: "h-12 w-full" }, i)) })) : filteredQuotes.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground", children: [_jsx(FileText, { className: "h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No quotes yet" }), _jsx(Button, { size: "sm", variant: "outline", onClick: () => setShowSubmitQuote(true), children: "Submit your first quote" })] })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { scope: "col", children: "#" }), _jsx(TableHead, { scope: "col", children: "Description" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Qty" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Unit Price" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Total" }), _jsx(TableHead, { scope: "col", children: "Status" }), _jsx(TableHead, { scope: "col", children: "Valid Until" }), _jsx(TableHead, { scope: "col", children: "Actions" })] }) }), _jsx(TableBody, { children: filteredQuotes.map((q) => (_jsxs(TableRow, { children: [_jsxs(TableCell, { className: "font-mono text-xs text-muted-foreground", children: ["#", q.id] }), _jsx(TableCell, { className: "max-w-[200px] truncate font-medium", children: q.description }), _jsx(TableCell, { className: "text-right font-mono tabular-nums", children: q.quantity }), _jsxs(TableCell, { className: "text-right font-mono", children: ["$", q.unitPrice.toFixed(2)] }), _jsxs(TableCell, { className: "text-right font-mono font-semibold", children: ["$", q.totalPrice.toFixed(2)] }), _jsx(TableCell, { children: _jsx(Badge, { variant: QUOTE_STATUS_COLOR[q.status], className: q.status === "PAID" ? "bg-green-100 text-green-800" : "", children: QUOTE_STATUS_LABEL[q.status] ?? q.status }) }), _jsx(TableCell, { className: "text-xs text-muted-foreground", children: q.validUntil ? new Date(q.validUntil).toLocaleDateString() : "—" }), _jsx(TableCell, { children: ["ADMIN_APPROVED", "LOCKED"].includes(q.status) && (_jsxs(Button, { size: "sm", variant: "outline", onClick: () => {
                                                                        setDeliveryPrefillId(q.id);
                                                                        setShowAddDelivery(true);
                                                                    }, children: [_jsx(Truck, { className: "mr-1 h-3.5 w-3.5", "aria-hidden": true }), "Update Delivery"] })) })] }, q.id))) })] }) })) }) })] }), _jsxs(TabsContent, { value: "deliveries", className: "mt-4 space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Track and update delivery status for your approved quotes." }), _jsxs(Button, { size: "sm", onClick: () => { setDeliveryPrefillId(undefined); setShowAddDelivery(true); }, children: [_jsx(Plus, { className: "mr-1.5 h-3.5 w-3.5", "aria-hidden": true }), "Add Update"] })] }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: deliveriesLoading ? (_jsx("div", { className: "space-y-3 p-6", children: [1, 2, 3].map((i) => _jsx(Skeleton, { className: "h-12 w-full" }, i)) })) : deliveries.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground", children: [_jsx(Truck, { className: "h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No delivery updates yet" })] })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { scope: "col", children: "Quote" }), _jsx(TableHead, { scope: "col", children: "Delivery Status" }), _jsx(TableHead, { scope: "col", children: "Estimated Delivery" }), _jsx(TableHead, { scope: "col", children: "Note" }), _jsx(TableHead, { scope: "col", children: "Posted" }), _jsx(TableHead, { scope: "col" })] }) }), _jsx(TableBody, { children: deliveries.map((d) => (_jsxs(TableRow, { children: [_jsx(TableCell, { children: _jsxs("div", { className: "max-w-[160px]", children: [_jsx("p", { className: "truncate text-sm font-medium", children: d.quoteDescription }), _jsxs(Badge, { variant: QUOTE_STATUS_COLOR[d.quoteStatus], className: "mt-0.5 text-[10px]", children: ["Quote: ", QUOTE_STATUS_LABEL[d.quoteStatus] ?? d.quoteStatus] })] }) }), _jsx(TableCell, { children: _jsx(Badge, { variant: DELIVERY_STATUS_COLOR[d.status], className: d.status === "delivered"
                                                                        ? "bg-green-100 text-green-800"
                                                                        : d.status === "delayed"
                                                                            ? "bg-red-100 text-red-800"
                                                                            : "", children: DELIVERY_STATUS_LABEL[d.status] ?? d.status }) }), _jsx(TableCell, { className: "text-sm text-muted-foreground", children: d.estimatedDelivery
                                                                    ? new Date(d.estimatedDelivery).toLocaleDateString()
                                                                    : "—" }), _jsx(TableCell, { className: "max-w-[180px] truncate text-sm text-muted-foreground", children: d.note ?? "—" }), _jsx(TableCell, { className: "text-xs text-muted-foreground", children: new Date(d.createdAt).toLocaleDateString() }), _jsx(TableCell, { children: _jsx(Button, { size: "icon", variant: "ghost", onClick: () => setEditDelivery(d), "aria-label": "Edit delivery update", children: _jsx(Pencil, { className: "h-3.5 w-3.5", "aria-hidden": true }) }) })] }, d.id))) })] }) })) }) })] }), _jsxs(TabsContent, { value: "ledger", className: "mt-4 space-y-4", children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsxs("h2", { className: "flex items-center gap-2 font-semibold", children: [_jsx(TrendingUp, { className: "h-4 w-4 text-primary", "aria-hidden": true }), "Transaction Ledger"] }), _jsx("p", { className: "text-xs text-muted-foreground", children: "All quotes and their financial status \u2014 scoped to your account only." })] }), _jsx(Input, { placeholder: "Search ledger\u2026", value: ledgerSearch, onChange: (e) => setLedgerSearch(e.target.value), className: "max-w-xs" })] }), ledger && (_jsxs("div", { className: "grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-4", children: [_jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: "Approved (Pending Payment)" }), _jsxs("p", { className: "mt-0.5 text-lg font-bold text-amber-600 tabular-nums", children: ["$", ledger.summary.approvedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })] })] }), _jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: "Total Paid" }), _jsxs("p", { className: "mt-0.5 text-lg font-bold text-green-600 tabular-nums", children: ["$", ledger.summary.paidValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })] })] }), _jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: "Lifetime Total" }), _jsxs("p", { className: "mt-0.5 text-lg font-bold tabular-nums", children: ["$", ledger.summary.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })] })] })] })), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: ledgerLoading ? (_jsx("div", { className: "space-y-3 p-6", children: [1, 2, 3, 4, 5].map((i) => _jsx(Skeleton, { className: "h-12 w-full" }, i)) })) : filteredLedger.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground", children: [_jsx(BarChart3, { className: "h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No ledger entries yet" })] })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { scope: "col", children: "#" }), _jsx(TableHead, { scope: "col", children: "Description" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Qty" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Unit Price" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Total" }), _jsx(TableHead, { scope: "col", children: "Status" }), _jsx(TableHead, { scope: "col", children: "Date" }), _jsx(TableHead, { scope: "col", children: "Paid On" })] }) }), _jsx(TableBody, { children: filteredLedger.map((r) => (_jsxs(TableRow, { children: [_jsxs(TableCell, { className: "font-mono text-xs text-muted-foreground", children: ["#", r.id] }), _jsx(TableCell, { className: "max-w-[200px] truncate font-medium", children: r.description }), _jsx(TableCell, { className: "text-right font-mono tabular-nums", children: r.quantity }), _jsxs(TableCell, { className: "text-right font-mono", children: ["$", r.unitPrice.toFixed(2)] }), _jsxs(TableCell, { className: `text-right font-mono font-semibold ${r.status === "PAID"
                                                                    ? "text-green-600"
                                                                    : r.status === "ADMIN_APPROVED"
                                                                        ? "text-amber-600"
                                                                        : ""}`, children: ["$", r.totalPrice.toFixed(2)] }), _jsx(TableCell, { children: _jsx(Badge, { variant: QUOTE_STATUS_COLOR[r.status], className: r.status === "PAID" ? "bg-green-100 text-green-800" : "", children: QUOTE_STATUS_LABEL[r.status] ?? r.status }) }), _jsx(TableCell, { className: "text-xs text-muted-foreground", children: new Date(r.createdAt).toLocaleDateString() }), _jsx(TableCell, { className: "text-xs text-muted-foreground", children: r.paidAt ? new Date(r.paidAt).toLocaleDateString() : "—" })] }, r.id))) })] }) })) }) }), _jsxs(Card, { className: "border-dashed bg-muted/20", children: [_jsxs(CardHeader, { className: "pb-2", children: [_jsxs(CardTitle, { className: "flex items-center gap-2 text-sm font-medium", children: [_jsx(BarChart3, { className: "h-4 w-4 text-primary", "aria-hidden": true }), "Power BI Analytics (Optional)"] }), _jsx(CardDescription, { className: "text-xs", children: "An administrator can embed a Power BI report filtered to your supplier account. Once configured, an embedded dashboard will appear here showing advanced charts for your transaction trends." })] }), _jsx(CardContent, { children: _jsxs(Alert, { children: [_jsx(Info, { className: "h-4 w-4" }), _jsxs(AlertDescription, { className: "text-xs", children: ["Ask your FurniCore admin to set", " ", _jsx("code", { className: "rounded bg-muted px-1 py-0.5 font-mono text-[11px]", children: "POWERBI_SUPPLIER_LEDGER_REPORT_ID" }), " ", "in the environment and configure Row-Level Security in your Power BI workspace to filter by ", _jsxs("strong", { children: ["Supplier ID ", profile.id] }), "."] })] }) })] })] })] }), _jsx(SubmitQuoteDialog, { open: showSubmitQuote, onClose: () => setShowSubmitQuote(false) }), _jsx(AddDeliveryDialog, { open: showAddDelivery, onClose: () => { setShowAddDelivery(false); setDeliveryPrefillId(undefined); }, quotes: quotes, prefillQuoteId: deliveryPrefillId }), _jsx(EditDeliveryDialog, { update: editDelivery, onClose: () => setEditDelivery(null) })] }));
}
