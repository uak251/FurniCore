import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { erpApi } from "@/lib/erp-api";
import { Boxes } from "lucide-react";

export default function InventoryUsagePage() {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);

    const q = useQuery({
        queryKey: ["erp-material-consumption", year, month],
        queryFn: () => erpApi(`/api/cogm/material-consumption?year=${year}&month=${month}`),
    });

    return (_jsxs("div", { className: "space-y-8", children: [
        _jsxs("div", { children: [
            _jsx("h1", { className: "text-2xl font-semibold tracking-tight", children: "Inventory usage" }),
            _jsx("p", { className: "text-muted-foreground mt-1 max-w-3xl", children: "Material consumption from manufacturing tasks completed in the selected calendar month (rolled up by inventory line)." }),
        ] }),
        _jsxs(Card, { children: [
            _jsxs(CardHeader, { children: [
                _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Boxes, { className: "h-5 w-5" }), "Consumption by period"] }),
                _jsx(CardDescription, { children: "Matches completed work orders with material usage lines." }),
            ] }),
            _jsxs(CardContent, { className: "space-y-4", children: [
                _jsxs("div", { className: "flex flex-wrap items-end gap-4", children: [
                    _jsxs("div", { className: "grid gap-1", children: [
                        _jsx(Label, { htmlFor: "iu-y", children: "Year" }),
                        _jsx(Input, { id: "iu-y", type: "number", value: year, onChange: (e) => setYear(Number(e.target.value)), className: "w-28" }),
                    ] }),
                    _jsxs("div", { className: "grid gap-1", children: [
                        _jsx(Label, { htmlFor: "iu-m", children: "Month" }),
                        _jsx(Input, { id: "iu-m", type: "number", min: 1, max: 12, value: month, onChange: (e) => setMonth(Number(e.target.value)), className: "w-24" }),
                    ] }),
                    _jsx(Button, { type: "button", variant: "secondary", onClick: () => q.refetch(), children: "Refresh" }),
                ] }),
                q.isLoading ? _jsx(Skeleton, { className: "h-40 w-full" }) : _jsxs(Table, { children: [
                    _jsx(TableHeader, { children: _jsxs(TableRow, { children: [
                        _jsx(TableHead, { children: "Material" }),
                        _jsx(TableHead, { className: "text-right", children: "Qty" }),
                        _jsx(TableHead, { children: "Unit" }),
                        _jsx(TableHead, { className: "text-right", children: "Tasks" }),
                    ] }) }),
                    _jsx(TableBody, { children: (q.data?.rows ?? []).length === 0 ? _jsx(TableRow, { children: _jsx(TableCell, { colSpan: 4, className: "text-muted-foreground", children: "No consumption — try February 2026 (Luna chair) or April 2026 (Harbor table demo)." }) }) : (q.data?.rows ?? []).map((r) => (_jsxs(TableRow, { children: [
                        _jsx(TableCell, { children: r.materialName }),
                        _jsx(TableCell, { className: "text-right tabular-nums", children: r.totalQty }),
                        _jsx(TableCell, { children: r.unit }),
                        _jsx(TableCell, { className: "text-right tabular-nums", children: r.tasks }),
                    ] }, `${r.inventoryItemId}-${r.materialName}`))) }),
                ] }),
            ] }),
        ] }),
    ] }));
}
