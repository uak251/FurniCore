import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { erpApi } from "@/lib/erp-api";
import { RefreshCw } from "lucide-react";

export default function CogmReportsPage() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);

    const stdQ = useQuery({
        queryKey: ["erp-cogm-standard", year, month],
        queryFn: () => erpApi(`/api/cogm/standard-costs?year=${year}&month=${month}`),
    });
    const varQ = useQuery({
        queryKey: ["erp-cogm-variance", year, month],
        queryFn: () => erpApi(`/api/cogm/variance-records?year=${year}&month=${month}`),
    });

    const computeM = useMutation({
        mutationFn: () => erpApi("/api/cogm/compute-monthly", { method: "POST", body: JSON.stringify({ year, month }) }),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ["erp-cogm-variance"] });
            toast({ title: "Variance computed", description: `${data.computed ?? 0} task rows` });
        },
        onError: (e) => toast({ title: "Compute failed", description: String(e.message), variant: "destructive" }),
    });

    return (_jsxs("div", { className: "space-y-8", children: [
        _jsxs("div", { children: [
            _jsx("h1", { className: "text-2xl font-semibold tracking-tight", children: "COGM & variance" }),
            _jsx("p", { className: "text-muted-foreground mt-1 max-w-3xl", children: "Monthly standard cost baseline vs actual material and labor from completed manufacturing tasks. Recompute after posting standard costs or finishing work orders." }),
        ] }),
        _jsxs(Card, { children: [
            _jsx(CardHeader, { children: _jsx(CardTitle, { children: "Period" }) }),
            _jsx(CardContent, { className: "flex flex-wrap items-end gap-4", children: _jsxs("div", { className: "grid gap-2", children: [
                _jsxs("div", { className: "flex gap-4", children: [
                    _jsxs("div", { className: "grid gap-1", children: [
                        _jsx(Label, { htmlFor: "cogm-y", children: "Year" }),
                        _jsx(Input, { id: "cogm-y", type: "number", value: year, onChange: (e) => setYear(Number(e.target.value)), className: "w-28" }),
                    ] }),
                    _jsxs("div", { className: "grid gap-1", children: [
                        _jsx(Label, { htmlFor: "cogm-m", children: "Month" }),
                        _jsx(Input, { id: "cogm-m", type: "number", min: 1, max: 12, value: month, onChange: (e) => setMonth(Number(e.target.value)), className: "w-24" }),
                    ] }),
                ] }),
                _jsx(Button, { onClick: () => computeM.mutate(), disabled: computeM.isPending, children: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(RefreshCw, { className: "h-4 w-4" }), "Recompute variance"] }) }),
            ] }) }),
        ] }),
        _jsxs(Card, { children: [
            _jsxs(CardHeader, { children: [
                _jsx(CardTitle, { children: "Monthly standard cost (baseline)" }),
                _jsx(CardDescription, { children: "Set via seed or admin API; used as estimated side for variance." }),
            ] }),
            _jsx(CardContent, { children: stdQ.isLoading ? _jsx(Skeleton, { className: "h-24 w-full" }) : _jsxs(Table, { children: [
                _jsx(TableHeader, { children: _jsxs(TableRow, { children: [
                    _jsx(TableHead, { children: "Product ID" }),
                    _jsx(TableHead, { className: "text-right", children: "Material" }),
                    _jsx(TableHead, { className: "text-right", children: "Labor" }),
                    _jsx(TableHead, { className: "text-right", children: "Overhead" }),
                    _jsx(TableHead, { className: "text-right", children: "Total" }),
                ] }) }),
                _jsx(TableBody, { children: (stdQ.data ?? []).length === 0 ? _jsx(TableRow, { children: _jsx(TableCell, { colSpan: 5, className: "text-muted-foreground", children: "No standard cost rows for this month" }) }) : (stdQ.data ?? []).map((r) => (_jsxs(TableRow, { children: [
                    _jsx(TableCell, { children: r.productId }),
                    _jsx(TableCell, { className: "text-right tabular-nums", children: r.materialStandard?.toFixed?.(2) ?? r.materialStandard }),
                    _jsx(TableCell, { className: "text-right tabular-nums", children: r.laborStandard?.toFixed?.(2) ?? r.laborStandard }),
                    _jsx(TableCell, { className: "text-right tabular-nums", children: r.overheadStandard?.toFixed?.(2) ?? r.overheadStandard }),
                    _jsx(TableCell, { className: "text-right tabular-nums", children: r.totalStandard?.toFixed?.(2) ?? r.totalStandard }),
                ] }, r.id))) }),
            ] }) }),
        ] }),
        _jsxs(Card, { children: [
            _jsxs(CardHeader, { children: [
                _jsx(CardTitle, { children: "Variance records" }),
                _jsx(CardDescription, { children: "Estimated (standard) vs actual material and labor per completed task." }),
            ] }),
            _jsx(CardContent, { children: varQ.isLoading ? _jsx(Skeleton, { className: "h-32 w-full" }) : _jsxs("div", { className: "overflow-x-auto", children: [_jsxs(Table, { children: [
                _jsx(TableHeader, { children: _jsxs(TableRow, { children: [
                    _jsx(TableHead, { children: "Task" }),
                    _jsx(TableHead, { children: "Product" }),
                    _jsx(TableHead, { className: "text-right", children: "Var. $" }),
                    _jsx(TableHead, { className: "text-right", children: "Var. %" }),
                    _jsx(TableHead, { children: "Note" }),
                ] }) }),
                _jsx(TableBody, { children: (varQ.data ?? []).length === 0 ? _jsx(TableRow, { children: _jsx(TableCell, { colSpan: 5, className: "text-muted-foreground", children: "Run recompute for the period, or complete tasks with material usage in that month." }) }) : (varQ.data ?? []).map((r) => (_jsxs(TableRow, { children: [
                    _jsx(TableCell, { children: r.taskId }),
                    _jsx(TableCell, { children: r.productId }),
                    _jsx(TableCell, { className: "text-right tabular-nums", children: Number(r.varianceAmount).toFixed(2) }),
                    _jsx(TableCell, { className: "text-right tabular-nums", children: r.variancePercent != null ? `${Number(r.variancePercent).toFixed(1)}%` : "—" }),
                    _jsx(TableCell, { children: r.remark }),
                ] }, r.id))) }),
            ] }), _jsx("p", { className: "text-muted-foreground text-sm mt-4", children: "Power BI and GL posting hooks can consume these rows from the database in a later iteration." })] }) }),
        ] }),
    ] }));
}
