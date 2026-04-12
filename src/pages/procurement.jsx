import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { erpApi } from "@/lib/erp-api";
import { GitCompare } from "lucide-react";

const WF_LABEL = {
    legacy: "Legacy",
    draft: "Draft",
    pending_pm: "Pending PM",
    pending_finance: "Pending finance",
    approved: "Approved",
    rejected: "Rejected",
};

export default function ProcurementPage() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data: user } = useGetCurrentUser();
    const role = user?.role ?? "";

    const quotesQ = useQuery({
        queryKey: ["erp-quotes-all"],
        queryFn: () => erpApi("/api/quotes"),
    });
    const comparisonQ = useQuery({
        queryKey: ["erp-quotes-rate-comparison"],
        queryFn: () => erpApi("/api/quotes/rate-comparison"),
    });

    const submitM = useMutation({
        mutationFn: (id) => erpApi(`/api/quotes/${id}/workflow/submit`, { method: "POST" }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["erp-quotes-all"] });
            toast({ title: "Submitted for purchase manager review" });
        },
        onError: (e) => toast({ title: "Submit failed", description: String(e.message), variant: "destructive" }),
    });

    const canSubmit = ["admin", "manager", "accountant", "employee", "inventory_manager", "sales_manager"].includes(role);

    const rows = quotesQ.data ?? [];
    const wfRows = rows.filter((q) => q.workflowStage && q.workflowStage !== "legacy");

    return (_jsxs("div", { className: "space-y-8", children: [
        _jsxs("div", { children: [
            _jsx("h1", { className: "text-2xl font-semibold tracking-tight", children: "Supplier quote management" }),
            _jsx("p", { className: "text-muted-foreground mt-1 max-w-3xl", children: "Create quotes under Quotes, then submit drafts into the approval workflow. Inventory line items enable rate comparison across suppliers." }),
        ] }),
        _jsxs(Card, { children: [
            _jsxs(CardHeader, { children: [
                _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(GitCompare, { className: "h-5 w-5" }), "Supplier rate comparison"] }),
                _jsx(CardDescription, { children: "Grouped by inventory item — use for bidding and sourcing decisions." }),
            ] }),
            _jsx(CardContent, { children: comparisonQ.isLoading ? (_jsx(Skeleton, { className: "h-32 w-full" })) : (_jsx("div", { className: "space-y-6", children: (comparisonQ.data?.groups ?? []).map((g) => (_jsxs("div", { className: "rounded-lg border p-4", children: [
                _jsx("p", { className: "font-medium", children: g.itemName || `Item #${g.inventoryItemId}` }),
                _jsxs(Table, { children: [
                    _jsx(TableHeader, { children: _jsxs(TableRow, { children: [
                        _jsx(TableHead, { children: "Supplier" }),
                        _jsx(TableHead, { className: "text-right", children: "Unit price" }),
                        _jsx(TableHead, { children: "Workflow" }),
                        _jsx(TableHead, { children: "Status" }),
                    ] }) }),
                    _jsx(TableBody, { children: g.quotes.map((q) => (_jsxs(TableRow, { children: [
                        _jsx(TableCell, { children: q.supplierName }),
                        _jsx(TableCell, { className: "text-right tabular-nums", children: `$${Number(q.unitPrice).toFixed(2)}` }),
                        _jsx(TableCell, { children: _jsx(Badge, { variant: "secondary", children: q.workflowStage ?? "legacy" }) }),
                        _jsx(TableCell, { className: "text-muted-foreground text-sm", children: q.status }),
                    ] }, q.id))) }),
                ] }),
            ] }, g.inventoryItemId))) })) }),
        ] }),
        _jsxs(Card, { children: [
            _jsxs(CardHeader, { children: [
                _jsx(CardTitle, { children: "Workflow queue" }),
                _jsx(CardDescription, { children: "Draft and in-review supplier quotes (excludes legacy lock/approve flow)." }),
            ] }),
            _jsx(CardContent, { children: quotesQ.isLoading ? (_jsx(Skeleton, { className: "h-40 w-full" })) : (_jsxs(Table, { children: [
                _jsx(TableHeader, { children: _jsxs(TableRow, { children: [
                    _jsx(TableHead, { children: "ID" }),
                    _jsx(TableHead, { children: "Supplier" }),
                    _jsx(TableHead, { children: "Item" }),
                    _jsx(TableHead, { className: "text-right", children: "Total" }),
                    _jsx(TableHead, { children: "Stage" }),
                    _jsx(TableHead, { className: "w-[140px]", children: "Action" }),
                ] }) }),
                _jsx(TableBody, { children: wfRows.length === 0 ? (_jsx(TableRow, { children: _jsx(TableCell, { colSpan: 6, className: "text-muted-foreground", children: "No workflow quotes yet — seed data includes draft and pending_pm examples." }) })) : wfRows.map((q) => (_jsxs(TableRow, { children: [
                    _jsx(TableCell, { className: "tabular-nums", children: q.id }),
                    _jsx(TableCell, { children: q.supplierName }),
                    _jsx(TableCell, { className: "max-w-[200px] truncate", children: q.itemName ?? "—" }),
                    _jsx(TableCell, { className: "text-right tabular-nums", children: `$${Number(q.totalPrice).toFixed(2)}` }),
                    _jsx(TableCell, { children: _jsx(Badge, { variant: q.workflowStage === "rejected" ? "destructive" : "outline", children: WF_LABEL[q.workflowStage] ?? q.workflowStage }) }),
                    _jsx(TableCell, { children: q.workflowStage === "draft" && canSubmit ? (_jsx(Button, { size: "sm", disabled: submitM.isPending, onClick: () => submitM.mutate(q.id), children: "Submit" })) : "—" }),
                ] }, q.id))) }),
            ] })) }),
        ] }),
    ] }));
}
