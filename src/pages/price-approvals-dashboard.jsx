import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { erpApi } from "@/lib/erp-api";
import { useCurrency } from "@/lib/currency";
import { Layers } from "lucide-react";
function normalizeRows(payload) {
    if (Array.isArray(payload))
        return payload;
    if (payload && typeof payload === "object") {
        if (Array.isArray(payload.data))
            return payload.data;
        if (Array.isArray(payload.items))
            return payload.items;
        if (Array.isArray(payload.rows))
            return payload.rows;
    }
    return [];
}

export default function PriceApprovalsDashboardPage() {
    const { toast } = useToast();
    const { format: fmtMoney } = useCurrency();
    const qc = useQueryClient();
    const { data: user } = useGetCurrentUser();
    const role = user?.role ?? "";
    const isPm = ["admin", "manager"].includes(role);
    const isFinance = ["admin", "accountant"].includes(role);
    const canApprovePrices = ["admin", "manager"].includes(role);

    const pmQ = useQuery({
        queryKey: ["erp-quotes", "pending_pm"],
        queryFn: () => erpApi("/api/quotes?workflow=pending_pm"),
    });
    const finQ = useQuery({
        queryKey: ["erp-quotes", "pending_finance"],
        queryFn: () => erpApi("/api/quotes?workflow=pending_finance"),
    });
    const proposalsQ = useQuery({
        queryKey: ["erp-price-proposals"],
        queryFn: () => erpApi("/api/price-proposals"),
    });
    const officialQ = useQuery({
        queryKey: ["erp-official-rates"],
        queryFn: () => erpApi("/api/quotes/official-rates"),
    });

    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectCtx, setRejectCtx] = useState({ type: "pm", id: null });
    const [rejectReason, setRejectReason] = useState("");
    const [rejectError, setRejectError] = useState("");

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ["erp-quotes"] });
        qc.invalidateQueries({ queryKey: ["erp-price-proposals"] });
        qc.invalidateQueries({ queryKey: ["erp-official-rates"] });
    };

    const pmApprove = useMutation({
        mutationFn: (id) => erpApi(`/api/quotes/${id}/workflow/pm-approve`, { method: "POST" }),
        onSuccess: () => { invalidate(); toast({ title: "Purchase manager decision recorded" }); },
        onError: (e) => toast({ title: "Failed", description: String(e.message), variant: "destructive" }),
    });
    const pmReject = useMutation({
        mutationFn: ({ id, reason }) => erpApi(`/api/quotes/${id}/workflow/pm-reject`, { method: "POST", body: JSON.stringify({ reason }) }),
        onSuccess: () => { invalidate(); setRejectOpen(false); toast({ title: "Quote rejected" }); },
        onError: (e) => toast({ title: "Failed", description: String(e.message), variant: "destructive" }),
    });
    const finApprove = useMutation({
        mutationFn: (id) => erpApi(`/api/quotes/${id}/workflow/finance-approve`, { method: "POST" }),
        onSuccess: () => { invalidate(); toast({ title: "Finance approved — official rate stored" }); },
        onError: (e) => toast({ title: "Failed", description: String(e.message), variant: "destructive" }),
    });
    const finReject = useMutation({
        mutationFn: ({ id, reason }) => erpApi(`/api/quotes/${id}/workflow/finance-reject`, { method: "POST", body: JSON.stringify({ reason }) }),
        onSuccess: () => { invalidate(); setRejectOpen(false); toast({ title: "Rejected by finance" }); },
        onError: (e) => toast({ title: "Failed", description: String(e.message), variant: "destructive" }),
    });
    const propApprove = useMutation({
        mutationFn: (id) => erpApi(`/api/price-proposals/${id}/approve`, { method: "POST" }),
        onSuccess: () => { invalidate(); toast({ title: "Customer price approved" }); },
        onError: (e) => toast({ title: "Failed", description: String(e.message), variant: "destructive" }),
    });
    const propReject = useMutation({
        mutationFn: ({ id, reason }) => erpApi(`/api/price-proposals/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
        onSuccess: () => { invalidate(); toast({ title: "Proposal rejected" }); },
        onError: (e) => toast({ title: "Failed", description: String(e.message), variant: "destructive" }),
    });

    const openReject = (type, id) => {
        setRejectCtx({ type, id });
        setRejectReason("");
        setRejectError("");
        setRejectOpen(true);
    };
    const confirmReject = () => {
        const reason = rejectReason.trim();
        if (!reason) {
            setRejectError("Please provide a rejection reason for audit trail.");
            return;
        }
        setRejectError("");
        if (rejectCtx.type === "pm")
            pmReject.mutate({ id: rejectCtx.id, reason });
        else if (rejectCtx.type === "fin")
            finReject.mutate({ id: rejectCtx.id, reason });
        else if (rejectCtx.type === "prop")
            propReject.mutate({ id: rejectCtx.id, reason });
    };
    const pmRows = normalizeRows(pmQ.data);
    const finRows = normalizeRows(finQ.data);
    const proposalRows = normalizeRows(proposalsQ.data);
    const officialRows = normalizeRows(officialQ.data);
    const pendingProps = proposalRows.filter((p) => p.status === "pending");
    const totalPending = pmRows.length + finRows.length + pendingProps.length;
    const canActOnAny = isPm || isFinance || canApprovePrices;

    return (_jsxs("div", { className: "space-y-8", children: [
        _jsxs("div", { children: [
            _jsx("h1", { className: "text-2xl font-semibold tracking-tight", children: "Price approval dashboard" }),
            _jsx("p", { className: "text-muted-foreground mt-1 max-w-3xl", children: "Purchase manager and finance steps for supplier quotes; admin/manager approval for customer-facing price proposals." }),
        ] }),
        _jsxs(Card, { className: "border-primary/30 bg-primary/5", children: [
            _jsx(CardHeader, { className: "pb-3", children: _jsx(CardTitle, { className: "text-base", children: "Action center" }) }),
            _jsxs(CardContent, { className: "flex flex-wrap items-center gap-2", children: [
                _jsxs(Badge, { variant: "secondary", children: ["Pending approvals: ", totalPending] }),
                _jsx(Badge, { variant: canActOnAny ? "default" : "secondary", children: canActOnAny ? "You can take action" : "Read-only access" }),
                _jsx(Button, { size: "sm", className: "ml-auto", onClick: () => {
                        const node = document.getElementById("customer-price-proposals");
                        node?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, children: "Review customer proposals" }),
            ] }),
        ] }),
        _jsxs("div", { className: "grid gap-6 lg:grid-cols-2", children: [
            _jsxs(Card, { children: [
                _jsxs(CardHeader, { children: [
                    _jsx(CardTitle, { children: "Supplier quotes — purchase manager" }),
                    _jsx(CardDescription, { children: "Awaiting PM review." }),
                ] }),
                _jsx(CardContent, { children: pmQ.isLoading ? _jsx(Skeleton, { className: "h-24 w-full" }) : _jsxs(Table, { children: [
                    _jsx(TableHeader, { children: _jsxs(TableRow, { children: [
                        _jsx(TableHead, { children: "ID" }),
                        _jsx(TableHead, { children: "Supplier" }),
                        _jsx(TableHead, { className: "text-right", children: "Total" }),
                        _jsx(TableHead, { className: "w-[180px]", children: "Actions" }),
                    ] }) }),
                    _jsx(TableBody, { children: pmRows.length === 0 ? _jsx(TableRow, { children: _jsx(TableCell, { colSpan: 4, className: "text-muted-foreground", children: "Queue empty" }) }) : pmRows.map((q) => (_jsxs(TableRow, { children: [
                        _jsx(TableCell, { children: q.id }),
                        _jsx(TableCell, { children: q.supplierName }),
                        _jsx(TableCell, { className: "text-right tabular-nums", children: fmtMoney(Number(q.totalPrice ?? 0)) }),
                        _jsx(TableCell, { children: isPm ? _jsxs("div", { className: "flex flex-wrap gap-2", children: [
                            _jsx(Button, { size: "sm", className: "min-w-[90px]", onClick: () => pmApprove.mutate(q.id), disabled: pmApprove.isPending, children: "Approve" }),
                            _jsx(Button, { size: "sm", variant: "outline", onClick: () => openReject("pm", q.id), children: "Reject" }),
                        ] }) : _jsx("span", { className: "text-muted-foreground text-sm", children: "PM only" }) }),
                    ] }, q.id))) }),
                ] }) }),
            ] }),
            _jsxs(Card, { children: [
                _jsxs(CardHeader, { children: [
                    _jsx(CardTitle, { children: "Supplier quotes — finance" }),
                    _jsx(CardDescription, { children: "High-value lines after PM approval." }),
                ] }),
                _jsx(CardContent, { children: finQ.isLoading ? _jsx(Skeleton, { className: "h-24 w-full" }) : _jsxs(Table, { children: [
                    _jsx(TableHeader, { children: _jsxs(TableRow, { children: [
                        _jsx(TableHead, { children: "ID" }),
                        _jsx(TableHead, { children: "Supplier" }),
                        _jsx(TableHead, { className: "text-right", children: "Total" }),
                        _jsx(TableHead, { className: "w-[180px]", children: "Actions" }),
                    ] }) }),
                    _jsx(TableBody, { children: finRows.length === 0 ? _jsx(TableRow, { children: _jsx(TableCell, { colSpan: 4, className: "text-muted-foreground", children: "Queue empty" }) }) : finRows.map((q) => (_jsxs(TableRow, { children: [
                        _jsx(TableCell, { children: q.id }),
                        _jsx(TableCell, { children: q.supplierName }),
                        _jsx(TableCell, { className: "text-right tabular-nums", children: fmtMoney(Number(q.totalPrice ?? 0)) }),
                        _jsx(TableCell, { children: isFinance ? _jsxs("div", { className: "flex flex-wrap gap-2", children: [
                            _jsx(Button, { size: "sm", className: "min-w-[90px]", onClick: () => finApprove.mutate(q.id), disabled: finApprove.isPending, children: "Approve" }),
                            _jsx(Button, { size: "sm", variant: "outline", onClick: () => openReject("fin", q.id), children: "Reject" }),
                        ] }) : _jsx("span", { className: "text-muted-foreground text-sm", children: "Finance only" }) }),
                    ] }, q.id))) }),
                ] }) }),
            ] }),
        ] }),
        _jsxs(Card, { id: "customer-price-proposals", children: [
            _jsxs(CardHeader, { children: [
                _jsx(CardTitle, { children: "Customer price proposals" }),
                _jsx(CardDescription, { children: "Sales-led selling price changes — management approval updates the catalog." }),
            ] }),
            _jsx(CardContent, { children: proposalsQ.isLoading ? _jsx(Skeleton, { className: "h-24 w-full" }) : _jsxs(Table, { children: [
                _jsx(TableHeader, { children: _jsxs(TableRow, { children: [
                    _jsx(TableHead, { children: "ID" }),
                    _jsx(TableHead, { children: "Product" }),
                    _jsx(TableHead, { className: "text-right", children: "Proposed" }),
                    _jsx(TableHead, { children: "Status" }),
                    _jsx(TableHead, { className: "w-[200px]", children: "Actions" }),
                ] }) }),
                _jsx(TableBody, { children: pendingProps.length === 0 ? _jsx(TableRow, { children: _jsx(TableCell, { colSpan: 5, className: "text-muted-foreground", children: "No pending proposals" }) }) : pendingProps.map((p) => (_jsxs(TableRow, { children: [
                    _jsx(TableCell, { children: p.id }),
                    _jsx(TableCell, { className: "tabular-nums", children: `#${p.productId}` }),
                    _jsx(TableCell, { className: "text-right tabular-nums", children: fmtMoney(Number(p.proposedSellingPrice ?? 0)) }),
                    _jsx(TableCell, { children: _jsx(Badge, { variant: "secondary", children: p.status }) }),
                    _jsx(TableCell, { children: canApprovePrices ? _jsxs("div", { className: "flex flex-wrap gap-2", children: [
                        _jsx(Button, { size: "sm", className: "min-w-[90px]", onClick: () => propApprove.mutate(p.id), disabled: propApprove.isPending, children: "Approve" }),
                        _jsx(Button, { size: "sm", variant: "outline", onClick: () => openReject("prop", p.id), children: "Reject" }),
                    ] }) : _jsx("span", { className: "text-muted-foreground text-sm", children: "Admin / manager" }) }),
                ] }, p.id))) }),
            ] }) }),
        ] }),
        _jsxs(Card, { children: [
            _jsxs(CardHeader, { children: [
                _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Layers, { className: "h-5 w-5" }), "Official supplier rates"] }),
                _jsx(CardDescription, { children: "Snapshots recorded when workflow-approved quotes complete." }),
            ] }),
            _jsx(CardContent, { children: officialQ.isLoading ? _jsx(Skeleton, { className: "h-20 w-full" }) : _jsxs(Table, { children: [
                _jsx(TableHeader, { children: _jsxs(TableRow, { children: [
                    _jsx(TableHead, { children: "Supplier" }),
                    _jsx(TableHead, { children: "Item" }),
                    _jsx(TableHead, { className: "text-right", children: "Unit price" }),
                    _jsx(TableHead, { children: "Effective" }),
                ] }) }),
                _jsx(TableBody, { children: officialRows.length === 0 ? _jsx(TableRow, { children: _jsx(TableCell, { colSpan: 4, className: "text-muted-foreground", children: "No official rates yet — approve workflow quotes to populate." }) }) : officialRows.map((r) => (_jsxs(TableRow, { children: [
                    _jsx(TableCell, { children: r.supplierName }),
                    _jsx(TableCell, { children: r.itemName }),
                    _jsx(TableCell, { className: "text-right tabular-nums", children: fmtMoney(Number(r.unitPrice ?? 0)) }),
                    _jsx(TableCell, { className: "text-sm text-muted-foreground", children: new Date(r.effectiveFrom).toLocaleString() }),
                ] }, r.id))) }),
            ] }) }),
        ] }),
        _jsx(Dialog, { open: rejectOpen, onOpenChange: setRejectOpen, children: _jsxs(DialogContent, { children: [
            _jsxs(DialogHeader, { children: [
                _jsx(DialogTitle, { children: "Rejection reason" }),
            ] }),
            _jsx(Textarea, { value: rejectReason, onChange: (e) => {
                    setRejectReason(e.target.value);
                    if (e.target.value.trim())
                        setRejectError("");
                }, placeholder: "Required for audit trail", className: "min-h-[100px]", "aria-invalid": Boolean(rejectError), "aria-describedby": "reject-reason-help reject-reason-error" }),
            _jsx("p", { id: "reject-reason-help", className: "text-xs text-muted-foreground", children: "Be specific. This reason is saved for compliance and audit checks." }),
            rejectError ? _jsx("p", { id: "reject-reason-error", className: "text-sm font-medium text-destructive", children: rejectError }) : null,
            _jsxs(DialogFooter, { children: [
                _jsx(Button, { variant: "outline", onClick: () => setRejectOpen(false), children: "Cancel" }),
                _jsx(Button, { variant: "destructive", onClick: confirmReject, disabled: !rejectReason.trim() || pmReject.isPending || finReject.isPending || propReject.isPending, children: "Confirm reject" }),
            ] }),
        ] }) }),
    ] }));
}
