import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useListInventory, useGetLowStockItems, useCreateInventoryItem, useUpdateInventoryItem, useDeleteInventoryItem, useGetCurrentUser, } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, Plus, Package, Pencil, Trash2, Upload, Images, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv } from "@/lib/table-helpers";
import { BulkImportExport } from "@/components/BulkImportExport";
import { ModuleInsightsDrawer } from "@/components/analytics/ModuleInsightsDrawer";
import { useCurrency } from "@/lib/currency";
import { RecordAvatar, RecordImagePanel, ModuleGallery, useModuleImages, MODULE_GALLERY_DIALOG_BODY_CLASS, MODULE_GALLERY_DIALOG_CONTENT_CLASS, MODULE_GALLERY_DIALOG_HEADER_CLASS, MODULE_GALLERY_DIALOG_TITLE_CLASS, } from "@/components/images";
import { apiOriginPrefix } from "@/lib/api-base";
const TABLE_ID = "inventory";
export default function InventoryPage() {
    const { toast } = useToast();
    const [location] = useLocation();
    const { format: formatCurrency } = useCurrency();
    const queryClient = useQueryClient();
    const { data: me } = useGetCurrentUser();
    const canManageImages = me?.role === "admin" || me?.role === "manager" || me?.role === "inventory_manager";
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [sortKey, setSortKey] = useState("name");
    const [sortDir, setSortDir] = useState("asc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [showDialog, setShowDialog] = useState(false);
    const [showBulk, setShowBulk] = useState(false);
    const [showGallery, setShowGallery] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const { data: allImages = [], isLoading: galleryImagesLoading } = useModuleImages("inventory");
    const API_BASE = apiOriginPrefix();
    const { data: valuation } = useQuery({
        queryKey: ["inventory-valuation"],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/api/inventory/valuation`, {
                headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
            });
            if (!res.ok)
                return null;
            return res.json();
        },
        staleTime: 60_000,
    });
    const { data: inventory, isLoading } = useListInventory();
    const { data: lowStock } = useGetLowStockItems();
    const createItem = useCreateInventoryItem();
    const updateItem = useUpdateInventoryItem();
    const deleteItem = useDeleteInventoryItem();
    const { register, handleSubmit, control, reset, setValue } = useForm();
    useEffect(() => {
        const query = location.split("?")[1] ?? "";
        const params = new URLSearchParams(query);
        if (params.get("filter") === "low-stock") {
            setStatusFilter("low");
        }
    }, [location]);
    useEffect(() => {
        setPage(1);
    }, [search, statusFilter, sortKey, sortDir, pageSize]);
    const rows = inventory ?? [];
    const sorted = useMemo(() => {
        return filterAndSortRows(rows, {
            search,
            match: (row, q) => {
                const qn = q.toLowerCase();
                const textMatch = row.name.toLowerCase().includes(qn) ||
                    String(row.type ?? "").toLowerCase().includes(qn) ||
                    String(row.unit ?? "").toLowerCase().includes(qn);
                if (!textMatch)
                    return false;
                const qty = Number(row.quantity);
                const reorder = Number(row.reorderLevel);
                const out = qty <= 0;
                const low = !out && qty <= reorder;
                if (statusFilter === "low")
                    return low;
                if (statusFilter === "in")
                    return !low && !out;
                if (statusFilter === "out")
                    return out;
                return true;
            },
            sortKey,
            sortDir,
            getSortValue: (row, key) => {
                switch (key) {
                    case "quantity":
                        return Number(row.quantity);
                    case "reorderLevel":
                        return Number(row.reorderLevel);
                    case "unitCost":
                        return Number(row.unitCost);
                    case "type":
                        return String(row.type ?? "");
                    default:
                        return String(row.name ?? "");
                }
            },
        });
    }, [rows, search, statusFilter, sortKey, sortDir]);
    const { pageRows, total, totalPages, page: safePage } = useMemo(() => paginateRows(sorted, page, pageSize), [sorted, page, pageSize]);
    useEffect(() => {
        if (safePage !== page)
            setPage(safePage);
    }, [safePage, page]);
    const exportCsv = () => {
        const headers = ["name", "type", "unit", "quantity", "reorderLevel", "unitCost", "status"];
        const data = sorted.map((item) => {
            const qty = Number(item.quantity);
            const reorder = Number(item.reorderLevel);
            const out = qty <= 0;
            const low = !out && qty <= reorder;
            return {
                name: item.name,
                type: item.type,
                unit: item.unit,
                quantity: qty,
                reorderLevel: reorder,
                unitCost: Number(item.unitCost),
                status: out ? "Out of stock" : low ? "Low stock" : "In stock",
            };
        });
        exportRowsToCsv(`furnicore-inventory-${new Date().toISOString().slice(0, 10)}`, headers, data);
        toast({ title: "Export started", description: `${data.length} rows exported.` });
    };
    const openCreate = () => {
        setEditItem(null);
        reset({ name: "", type: "raw_material", unit: "", quantity: 0, reorderLevel: 0, unitCost: 0 });
        setShowDialog(true);
    };
    const openEdit = (item) => {
        setEditItem(item);
        setValue("name", item.name);
        setValue("type", item.type);
        setValue("unit", item.unit);
        setValue("quantity", Number(item.quantity));
        setValue("reorderLevel", Number(item.reorderLevel));
        setValue("unitCost", Number(item.unitCost));
        setShowDialog(true);
    };
    const onSubmit = async (data) => {
        try {
            if (editItem) {
                await updateItem.mutateAsync({ id: editItem.id, data });
                toast({ title: "Item updated successfully" });
            }
            else {
                await createItem.mutateAsync({ data });
                toast({ title: "Item created successfully" });
            }
            queryClient.invalidateQueries({ queryKey: ["listInventory"] });
            setShowDialog(false);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const handleDelete = async (id) => {
        if (!confirm("Delete this inventory item?"))
            return;
        try {
            await deleteItem.mutateAsync({ id });
            toast({ title: "Item deleted" });
            queryClient.invalidateQueries({ queryKey: ["listInventory"] });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const to = Math.min(safePage * pageSize, total);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Inventory" }), _jsx("p", { className: "text-muted-foreground", children: "Manage raw materials and stock levels" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(ModuleInsightsDrawer, { moduleName: "inventory", title: "Inventory Analytics", reportId: "inventory-analysis", filters: { stock: statusFilter } }), _jsxs(Button, { variant: "outline", onClick: () => setShowGallery(true), children: [_jsx(Images, { className: "mr-2 h-4 w-4" }), "Gallery"] }), _jsxs(Button, { variant: "outline", onClick: () => setShowBulk(true), children: [_jsx(Upload, { className: "mr-2 h-4 w-4", "aria-hidden": true }), "Bulk import/export"] }), _jsxs(Button, { onClick: openCreate, children: [_jsx(Plus, { className: "mr-2 h-4 w-4", "aria-hidden": true }), "Add item"] })] })] }), lowStock && lowStock.length > 0 && (_jsxs("div", { className: "flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-destructive", role: "status", children: [_jsx(AlertTriangle, { className: "h-5 w-5 shrink-0", "aria-hidden": true }), _jsxs("p", { className: "text-sm font-medium", children: [lowStock.length, " item(s) below reorder level:", " ", _jsx("span", { className: "break-words", children: lowStock.map((i) => i.name).join(", ") })] })] })), valuation && (_jsx(Card, { className: "border-primary/20 bg-primary/5", children: _jsx(CardHeader, { className: "py-3 px-4", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(TrendingUp, { className: "h-4 w-4 text-primary", "aria-hidden": true }), _jsxs(CardTitle, { className: "text-sm font-semibold", children: ["Total Inventory Value:", " ", _jsx("span", { className: "text-primary", children: formatCurrency(valuation.totalValue) })] }), _jsxs("span", { className: "ml-auto text-xs text-muted-foreground font-normal", children: ["Method: ", _jsx("span", { className: "font-semibold", children: valuation.method })] })] }) }) })), _jsx(TableToolbar, { id: TABLE_ID, entityLabel: "inventory", searchValue: search, onSearchChange: setSearch, searchPlaceholder: "Search by name, type, or unit\u2026", filterLabel: "Stock status", filterValue: statusFilter, onFilterChange: setStatusFilter, filterOptions: [
                    { value: "all", label: "All items" },
                    { value: "low", label: "Low stock" },
                    { value: "in", label: "In stock" },
                    { value: "out", label: "Out of stock" },
                ], sortKey: sortKey, onSortKeyChange: setSortKey, sortOptions: [
                    { value: "name", label: "Name" },
                    { value: "type", label: "Type" },
                    { value: "quantity", label: "Quantity" },
                    { value: "reorderLevel", label: "Reorder at" },
                    { value: "unitCost", label: "Unit cost" },
                ], sortDir: sortDir, onSortDirChange: setSortDir, pageSize: pageSize, onPageSizeChange: setPageSize, onExportCsv: exportCsv, exportDisabled: sorted.length === 0, resultsText: total === 0
                    ? "No matching items"
                    : `Showing ${from}–${to} of ${total} matching items` }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: isLoading ? (_jsx("div", { className: "space-y-3 p-6", children: [1, 2, 3, 4].map((i) => (_jsx(Skeleton, { className: "h-14 w-full" }, i))) })) : pageRows.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(Package, { className: "mb-3 h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No inventory items match your filters" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "space-y-3 p-3 md:hidden", children: pageRows.map((item) => {
                                                const qty = Number(item.quantity);
                                                const reorder = Number(item.reorderLevel);
                                                const out = qty <= 0;
                                                const low = !out && qty <= reorder;
                                                const statusText = out ? "Out of stock" : low ? "Low stock" : "In stock";
                                                const statusClass = out
                                                    ? "bg-destructive/10 text-destructive border-destructive/30"
                                                    : low
                                                        ? "bg-amber-100 text-amber-800 border-amber-300"
                                                        : "bg-emerald-100 text-emerald-800 border-emerald-300";
                                                return (_jsxs(Card, { className: "border-border/70", children: [_jsxs(CardContent, { className: "space-y-3 p-4", children: [_jsxs("div", { className: "flex items-start gap-3", children: [_jsx(RecordAvatar, { entityType: "inventory", entityId: item.id, className: "h-10 w-10" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate font-semibold", children: item.name }), _jsxs("p", { className: "text-xs text-muted-foreground capitalize", children: [String(item.type ?? "").replace(/_/g, " "), " · ", item.unit] })] }), _jsx(Badge, { variant: "outline", className: statusClass, children: statusText })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2 text-sm", children: [_jsxs("p", { className: "text-muted-foreground", children: ["Quantity: ", _jsx("span", { className: "font-medium text-foreground", children: qty.toLocaleString() })] }), _jsxs("p", { className: "text-muted-foreground", children: ["Reorder: ", _jsx("span", { className: "font-medium text-foreground", children: reorder.toLocaleString() })] }), _jsxs("p", { className: "col-span-2 text-muted-foreground", children: ["Unit Cost: ", _jsx("span", { className: "font-medium text-foreground", children: formatCurrency(Number(item.unitCost)) })] })] }), _jsxs("div", { className: "flex justify-end gap-2 border-t pt-2", children: [_jsx(Button, { size: "sm", variant: "outline", className: "touch-target", onClick: () => openEdit(item), children: "Edit" }), _jsx(Button, { size: "sm", variant: "outline", className: "touch-target text-destructive", onClick: () => handleDelete(item.id), children: "Delete" })] })] })] }, item.id));
                                            }) }), _jsx("div", { className: "hidden overflow-x-auto md:block", id: `${TABLE_ID}-table`, children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { scope: "col", className: "w-12" }), _jsx(TableHead, { scope: "col", children: "Name" }), _jsx(TableHead, { scope: "col", children: "Type" }), _jsx(TableHead, { scope: "col", children: "Unit" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Quantity" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Reorder at" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Unit cost" }), _jsx(TableHead, { scope: "col", children: "Status" }), _jsx(TableHead, { scope: "col", className: "w-[100px] text-right", children: "Actions" })] }) }), _jsx(TableBody, { children: pageRows.map((item) => {
                                                const qty = Number(item.quantity);
                                                const reorder = Number(item.reorderLevel);
                                                const out = qty <= 0;
                                                const low = !out && qty <= reorder;
                                                const statusText = out ? "Out of stock" : low ? `Low Stock: ${qty.toLocaleString()} remaining` : `${qty.toLocaleString()} in stock`;
                                                const statusClass = out
                                                    ? "bg-destructive/10 text-destructive border-destructive/30"
                                                    : low
                                                        ? "bg-amber-100 text-amber-800 border-amber-300"
                                                        : "bg-emerald-100 text-emerald-800 border-emerald-300";
                                                return (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "px-3 py-2", children: _jsx(RecordAvatar, { entityType: "inventory", entityId: item.id, className: "h-9 w-9" }) }), _jsx(TableCell, { className: "font-medium", children: item.name }), _jsx(TableCell, { className: "capitalize text-muted-foreground", children: String(item.type ?? "").replace(/_/g, " ") }), _jsx(TableCell, { className: "text-muted-foreground", children: item.unit }), _jsx(TableCell, { className: "text-right font-mono tabular-nums", children: qty.toLocaleString() }), _jsx(TableCell, { className: "text-right font-mono tabular-nums", children: reorder.toLocaleString() }), _jsx(TableCell, { className: "text-right font-mono tabular-nums", children: formatCurrency(Number(item.unitCost)) }), _jsx(TableCell, { children: _jsx(Badge, { variant: "outline", className: statusClass, children: statusText }) }), _jsx(TableCell, { className: "text-right", children: _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx(Button, { size: "icon", variant: "ghost", "aria-label": `Edit ${item.name}`, onClick: () => openEdit(item), children: _jsx(Pencil, { className: "h-4 w-4" }) }), _jsx(Button, { size: "icon", variant: "ghost", className: "text-destructive", "aria-label": `Delete ${item.name}`, onClick: () => handleDelete(item.id), children: _jsx(Trash2, { className: "h-4 w-4" }) })] }) })] }, item.id));
                                            }) })] }) }), _jsx(TablePaginationBar, { id: TABLE_ID, page: safePage, totalPages: totalPages, onPageChange: setPage })] })) }) }), _jsx(Dialog, { open: showBulk, onOpenChange: setShowBulk, children: _jsxs(DialogContent, { className: "max-w-3xl", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Bulk Import / Export \u2014 Raw Materials" }) }), _jsx(BulkImportExport, { module: "Inventory", importEndpoint: "/api/bulk/inventory/import", exportEndpoint: "/api/bulk/inventory/export", exportFilename: "inventory-export.csv", templateHeaders: ["name", "type", "unit", "quantity", "reorderLevel", "unitCost"], templateSample: [
                                ["Oak Wood", "raw_material", "kg", "500", "100", "2.50"],
                                ["Steel Bolts", "raw_material", "units", "2000", "500", "0.05"],
                            ], onImported: () => queryClient.invalidateQueries({ queryKey: ["listInventory"] }) })] }) }), _jsx(Dialog, { open: showDialog, onOpenChange: setShowDialog, children: _jsxs(DialogContent, { className: "max-w-xl", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: editItem ? "Edit inventory item" : "Add inventory item" }) }), _jsxs(Tabs, { defaultValue: "details", children: [_jsxs(TabsList, { className: "mb-4", children: [_jsx(TabsTrigger, { value: "details", children: "Details" }), editItem && _jsx(TabsTrigger, { value: "images", children: "Images" })] }), _jsx(TabsContent, { value: "details", children: _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "inv-name", children: "Name" }), _jsx(Input, { id: "inv-name", ...register("name", { required: true }), placeholder: "Item name" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Type" }), _jsx(Controller, { name: "type", control: control, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "raw_material", children: "Raw material" }), _jsx(SelectItem, { value: "finished_goods", children: "Finished goods" }), _jsx(SelectItem, { value: "work_in_progress", children: "Work in progress" })] })] })) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "inv-unit", children: "Unit" }), _jsx(Input, { id: "inv-unit", ...register("unit", { required: true }), placeholder: "e.g. kg, units" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "inv-qty", children: "Quantity" }), _jsx(Input, { id: "inv-qty", type: "number", step: "0.01", ...register("quantity", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "inv-reorder", children: "Reorder level" }), _jsx(Input, { id: "inv-reorder", type: "number", step: "0.01", ...register("reorderLevel", { valueAsNumber: true }) })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "inv-cost", children: "Unit cost" }), _jsx(Input, { id: "inv-cost", type: "number", step: "0.01", ...register("unitCost", { valueAsNumber: true }) })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowDialog(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: createItem.isPending || updateItem.isPending, children: "Save" })] })] }) }), editItem && (_jsx(TabsContent, { value: "images", children: _jsx(RecordImagePanel, { entityType: "inventory", entityId: editItem.id, canUpload: canManageImages, canDelete: canManageImages }) }))] })] }) }), _jsx(Dialog, { open: showGallery, onOpenChange: setShowGallery, children: _jsxs(DialogContent, { className: MODULE_GALLERY_DIALOG_CONTENT_CLASS, children: [_jsx(DialogHeader, { className: MODULE_GALLERY_DIALOG_HEADER_CLASS, children: _jsx(DialogTitle, { className: MODULE_GALLERY_DIALOG_TITLE_CLASS, children: "Raw Materials Gallery" }) }), _jsx("div", { className: MODULE_GALLERY_DIALOG_BODY_CLASS, children: _jsx(ModuleGallery, { entityType: "inventory", isLoading: galleryImagesLoading, images: allImages.filter((img) => (inventory ?? []).find((i) => i.id === img.entityId && i.type === "raw_material")), canDelete: canManageImages, canUpload: canManageImages, entityIds: (inventory ?? []).filter((i) => i.type === "raw_material").map((i) => i.id), entityLabels: Object.fromEntries((inventory ?? []).map((i) => [i.id, i.name])), emptyListHint: "No raw materials found. Add inventory items first." }) })] }) })] }));
}
