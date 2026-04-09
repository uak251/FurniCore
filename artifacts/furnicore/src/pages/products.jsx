import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useListProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useGetCurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Package, Search, Pencil, Trash2, Upload, Images } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { BulkImportExport } from "@/components/BulkImportExport";
import { useCurrency } from "@/lib/currency";
import { RecordAvatar, RecordImagePanel, ModuleGallery, useModuleImages, MODULE_GALLERY_DIALOG_BODY_CLASS, MODULE_GALLERY_DIALOG_CONTENT_CLASS, MODULE_GALLERY_DIALOG_HEADER_CLASS, MODULE_GALLERY_DIALOG_TITLE_CLASS, } from "@/components/images";
export default function ProductsPage() {
    const { toast } = useToast();
    const { format: formatCurrency } = useCurrency();
    const queryClient = useQueryClient();
    const { data: me } = useGetCurrentUser();
    const canManageImages = me?.role === "admin" || me?.role === "manager" || me?.role === "sales_manager" || me?.role === "accountant";
    const [search, setSearch] = useState("");
    const [showDialog, setShowDialog] = useState(false);
    const [showBulk, setShowBulk] = useState(false);
    const [showGallery, setShowGallery] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const { data: allImages = [], isLoading: galleryImagesLoading } = useModuleImages("product");
    const { data: products, isLoading } = useListProducts();
    const createProduct = useCreateProduct();
    const updateProduct = useUpdateProduct();
    const deleteProduct = useDeleteProduct();
    const { register, handleSubmit, reset, setValue, watch } = useForm({
        defaultValues: { isActive: true }
    });
    const isActive = watch("isActive");
    const filtered = (products ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()));
    const openCreate = () => {
        setEditItem(null);
        reset({ name: "", description: "", sku: "", category: "", sellingPrice: 0, costPrice: 0, stockQuantity: 0, isActive: true });
        setShowDialog(true);
    };
    const openEdit = (product) => {
        setEditItem(product);
        setValue("name", product.name);
        setValue("description", product.description || "");
        setValue("sku", product.sku);
        setValue("category", product.category || "");
        setValue("sellingPrice", Number(product.sellingPrice));
        setValue("costPrice", Number(product.costPrice));
        setValue("stockQuantity", Number(product.stockQuantity));
        setValue("isActive", product.isActive);
        setShowDialog(true);
    };
    const onSubmit = async (data) => {
        try {
            if (editItem) {
                await updateProduct.mutateAsync({ id: editItem.id, data });
                toast({ title: "Product updated" });
            }
            else {
                await createProduct.mutateAsync({ data });
                toast({ title: "Product created" });
            }
            queryClient.invalidateQueries({ queryKey: ["listProducts"] });
            setShowDialog(false);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const handleDelete = async (id) => {
        if (!confirm("Delete this product?"))
            return;
        try {
            await deleteProduct.mutateAsync({ id });
            toast({ title: "Product deleted" });
            queryClient.invalidateQueries({ queryKey: ["listProducts"] });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const margin = (p) => {
        const s = Number(p.sellingPrice);
        const c = Number(p.costPrice);
        return c > 0 ? (((s - c) / s) * 100).toFixed(1) : "—";
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Products" }), _jsx("p", { className: "text-muted-foreground", children: "Manage your product catalog and pricing" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs(Button, { variant: "outline", onClick: () => setShowGallery(true), children: [_jsx(Images, { className: "mr-2 h-4 w-4" }), "Gallery"] }), _jsxs(Button, { variant: "outline", onClick: () => setShowBulk(true), children: [_jsx(Upload, { className: "mr-2 h-4 w-4", "aria-hidden": true }), "Bulk import/export"] }), _jsxs(Button, { onClick: openCreate, children: [_jsx(Plus, { className: "mr-2 h-4 w-4" }), "Add Product"] })] })] }), _jsxs("div", { className: "relative", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }), _jsx(Input, { className: "pl-9", placeholder: "Search by name or SKU...", value: search, onChange: (e) => setSearch(e.target.value) })] }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: isLoading ? (_jsx("div", { className: "p-6 space-y-3", children: [1, 2, 3, 4].map((i) => _jsx(Skeleton, { className: "h-14 w-full" }, i)) })) : filtered.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(Package, { className: "h-10 w-10 mb-3" }), _jsx("p", { children: "No products found" })] })) : (_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "border-b", children: _jsxs("tr", { className: "text-left text-muted-foreground", children: [_jsx("th", { className: "px-4 py-3 font-medium w-12" }), _jsx("th", { className: "px-6 py-3 font-medium", children: "Name" }), _jsx("th", { className: "px-6 py-3 font-medium", children: "SKU" }), _jsx("th", { className: "px-6 py-3 font-medium", children: "Category" }), _jsx("th", { className: "px-6 py-3 font-medium", children: "Cost" }), _jsx("th", { className: "px-6 py-3 font-medium", children: "Price" }), _jsx("th", { className: "px-6 py-3 font-medium", children: "Margin" }), _jsx("th", { className: "px-6 py-3 font-medium", children: "Stock" }), _jsx("th", { className: "px-6 py-3 font-medium", children: "Status" }), _jsx("th", { className: "px-6 py-3 font-medium" })] }) }), _jsx("tbody", { className: "divide-y", children: filtered.map((p) => (_jsxs("tr", { className: "hover:bg-muted/40 transition-colors", children: [_jsx("td", { className: "px-4 py-3", children: _jsx(RecordAvatar, { entityType: "product", entityId: p.id, className: "h-10 w-10" }) }), _jsx("td", { className: "px-6 py-4 font-medium", children: p.name }), _jsx("td", { className: "px-6 py-4 font-mono text-xs text-muted-foreground", children: p.sku }), _jsx("td", { className: "px-6 py-4 text-muted-foreground", children: p.category || "—" }), _jsx("td", { className: "px-6 py-4 font-mono", children: formatCurrency(Number(p.costPrice)) }), _jsx("td", { className: "px-6 py-4 font-mono", children: formatCurrency(Number(p.sellingPrice)) }), _jsxs("td", { className: "px-6 py-4 font-mono text-green-600", children: [margin(p), "%"] }), _jsx("td", { className: "px-6 py-4 font-mono", children: Number(p.stockQuantity) }), _jsx("td", { className: "px-6 py-4", children: _jsx(Badge, { variant: p.isActive ? "default" : "outline", children: p.isActive ? "Active" : "Inactive" }) }), _jsx("td", { className: "px-6 py-4", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { size: "icon", variant: "ghost", onClick: () => openEdit(p), children: _jsx(Pencil, { className: "h-4 w-4" }) }), _jsx(Button, { size: "icon", variant: "ghost", className: "text-destructive", onClick: () => handleDelete(p.id), children: _jsx(Trash2, { className: "h-4 w-4" }) })] }) })] }, p.id))) })] })) }) }), _jsx(Dialog, { open: showBulk, onOpenChange: setShowBulk, children: _jsxs(DialogContent, { className: "max-w-3xl", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Bulk Import / Export \u2014 Products" }) }), _jsx(BulkImportExport, { module: "Products", importEndpoint: "/api/bulk/products/import", exportEndpoint: "/api/bulk/products/export", exportFilename: "products-export.csv", templateHeaders: ["name", "sku", "category", "sellingPrice", "costPrice", "stockQuantity", "description", "isActive"], templateSample: [
                                ["Oak Executive Desk", "DESK-OAK-001", "Desks", "1200", "700", "15", "Solid oak executive desk", "true"],
                                ["Steel Chair", "CHAIR-STL-002", "Chairs", "350", "180", "30", "Ergonomic steel frame chair", "true"],
                            ], onImported: () => queryClient.invalidateQueries({ queryKey: ["listProducts"] }) })] }) }), _jsx(Dialog, { open: showDialog, onOpenChange: setShowDialog, children: _jsxs(DialogContent, { className: "max-w-xl", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: editItem ? "Edit Product" : "Add Product" }) }), _jsxs(Tabs, { defaultValue: "details", children: [_jsxs(TabsList, { className: "mb-4", children: [_jsx(TabsTrigger, { value: "details", children: "Details" }), editItem && _jsx(TabsTrigger, { value: "images", children: "Images" })] }), _jsx(TabsContent, { value: "details", children: _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { children: "Product Name" }), _jsx(Input, { ...register("name", { required: true }), placeholder: "e.g. Executive Oak Desk" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "SKU" }), _jsx(Input, { ...register("sku", { required: true }), placeholder: "DESK-OAK-001" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Category" }), _jsx(Input, { ...register("category"), placeholder: "e.g. Desks" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Cost Price" }), _jsx(Input, { type: "number", step: "0.01", ...register("costPrice", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Selling Price" }), _jsx(Input, { type: "number", step: "0.01", ...register("sellingPrice", { valueAsNumber: true }) })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { children: "Stock Quantity" }), _jsx(Input, { type: "number", ...register("stockQuantity", { valueAsNumber: true }) })] }), _jsxs("div", { className: "flex items-center gap-2 mt-2", children: [_jsx(Switch, { checked: isActive, onCheckedChange: (v) => setValue("isActive", v) }), _jsx(Label, { children: "Active" })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { children: "Description" }), _jsx(Input, { ...register("description"), placeholder: "Short product description" })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowDialog(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: createProduct.isPending || updateProduct.isPending, children: "Save" })] })] }) }), editItem && (_jsx(TabsContent, { value: "images", children: _jsx(RecordImagePanel, { entityType: "product", entityId: editItem.id, canUpload: canManageImages, canDelete: canManageImages }) }))] })] }) }), _jsx(Dialog, { open: showGallery, onOpenChange: setShowGallery, children: _jsxs(DialogContent, { className: MODULE_GALLERY_DIALOG_CONTENT_CLASS, children: [_jsx(DialogHeader, { className: MODULE_GALLERY_DIALOG_HEADER_CLASS, children: _jsx(DialogTitle, { className: MODULE_GALLERY_DIALOG_TITLE_CLASS, children: "Products Gallery" }) }), _jsx("div", { className: MODULE_GALLERY_DIALOG_BODY_CLASS, children: _jsx(ModuleGallery, { entityType: "product", isLoading: galleryImagesLoading, images: allImages.filter((img) => (products ?? []).some((p) => p.id === img.entityId)), canDelete: canManageImages, canUpload: canManageImages, entityIds: (products ?? []).map((p) => p.id), entityLabels: Object.fromEntries((products ?? []).map((p) => [p.id, p.name])), emptyListHint: "No products found. Add products first." }) })] }) })] }));
}
