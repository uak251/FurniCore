import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from "react";
import { useListSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, useGetCurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecordAvatar, RecordImagePanel, ModuleGallery, useModuleImages, MODULE_GALLERY_DIALOG_BODY_CLASS, MODULE_GALLERY_DIALOG_CONTENT_CLASS, MODULE_GALLERY_DIALOG_HEADER_CLASS, MODULE_GALLERY_DIALOG_TITLE_CLASS, } from "@/components/images";
import { Plus, Truck, Pencil, Trash2, Star, Images } from "lucide-react";
import { ModuleActionsMenu } from "@/components/module/ModuleActionsMenu";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv } from "@/lib/table-helpers";
const TABLE_ID = "suppliers";
export default function SuppliersPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { data: me } = useGetCurrentUser();
    const canManageImages = me?.role === "admin" || me?.role === "manager" || me?.role === "accountant";
    const [showGallery, setShowGallery] = useState(false);
    const { data: allImages = [], isLoading: galleryImagesLoading } = useModuleImages("supplier");
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [sortKey, setSortKey] = useState("name");
    const [sortDir, setSortDir] = useState("asc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [showDialog, setShowDialog] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const { data: suppliers, isLoading } = useListSuppliers({
        status: statusFilter === "all" ? undefined : statusFilter,
    });
    const createSupplier = useCreateSupplier();
    const updateSupplier = useUpdateSupplier();
    const deleteSupplier = useDeleteSupplier();
    const { register, handleSubmit, control, reset, setValue } = useForm({
        defaultValues: { status: "active", rating: 0, portalPassword: "" },
    });
    useEffect(() => {
        setPage(1);
    }, [search, statusFilter, sortKey, sortDir, pageSize]);
    const rows = suppliers ?? [];
    const sorted = useMemo(() => {
        return filterAndSortRows(rows, {
            search,
            match: (row, q) => {
                const qn = q.toLowerCase();
                const textMatch = !qn ||
                    row.name.toLowerCase().includes(qn) ||
                    (row.email && row.email.toLowerCase().includes(qn)) ||
                    (row.phone && String(row.phone).toLowerCase().includes(qn));
                if (!textMatch)
                    return false;
                if (statusFilter === "all")
                    return true;
                return String(row.status).toLowerCase() === statusFilter;
            },
            sortKey,
            sortDir,
            getSortValue: (row, key) => {
                switch (key) {
                    case "rating":
                        return Number(row.rating);
                    case "status":
                        return String(row.status ?? "");
                    case "email":
                        return String(row.email ?? "");
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
        const headers = ["name", "email", "phone", "contactPerson", "rating", "status", "address"];
        const data = sorted.map((s) => ({
            name: s.name,
            email: s.email ?? "",
            phone: s.phone ?? "",
            contactPerson: s.contactPerson ?? "",
            rating: Number(s.rating),
            status: s.status,
            address: s.address ?? "",
        }));
        exportRowsToCsv(`furnicore-suppliers-${new Date().toISOString().slice(0, 10)}`, headers, data);
        toast({ title: "Export started", description: `${data.length} rows exported.` });
    };
    const openCreate = () => {
        setEditItem(null);
        reset({ name: "", email: "", phone: "", address: "", contactPerson: "", status: "active", rating: 0, portalPassword: "" });
        setShowDialog(true);
    };
    const openEdit = (s) => {
        setEditItem(s);
        setValue("name", s.name);
        setValue("email", s.email || "");
        setValue("phone", s.phone || "");
        setValue("address", s.address || "");
        setValue("contactPerson", s.contactPerson || "");
        setValue("status", supplierStatusNorm(s));
        setValue("rating", Number(s.rating));
        setValue("portalPassword", "");
        setShowDialog(true);
    };
    const onSubmit = async (data) => {
        try {
            if (editItem) {
                const { portalPassword: _omitPortal, ...updatePayload } = data;
                await updateSupplier.mutateAsync({ id: editItem.id, data: updatePayload });
                toast({ title: "Supplier updated" });
            }
            else {
                const created = await createSupplier.mutateAsync({ data });
                if (created?.portalUser?.created) {
                    toast({ title: "Supplier created", description: "Portal user (supplier role) created. They can sign in with this email and the password you set." });
                }
                else if (created?.portalUser?.reason === "EMAIL_IN_USE") {
                    toast({ title: "Supplier created", description: created.portalUser.message, variant: "destructive" });
                }
                else {
                    toast({ title: "Supplier created" });
                }
            }
            queryClient.invalidateQueries({ queryKey: ["listSuppliers"] });
            setShowDialog(false);
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const handleDelete = async (id) => {
        if (!confirm("Delete this supplier?"))
            return;
        try {
            await deleteSupplier.mutateAsync({ id });
            toast({ title: "Supplier deleted" });
            queryClient.invalidateQueries({ queryKey: ["listSuppliers"] });
        }
        catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };
    const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const to = Math.min(safePage * pageSize, total);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Suppliers" }), _jsx("p", { className: "text-muted-foreground", children: "Manage your supplier network" })] }), _jsx(ModuleActionsMenu, { label: "Actions", items: [
                { label: "Add supplier", icon: Plus, onSelect: () => openCreate() },
                { label: "Image gallery", icon: Images, separatorBefore: true, onSelect: () => setShowGallery(true) },
            ] })] }), _jsx(TableToolbar, { id: TABLE_ID, entityLabel: "suppliers", searchValue: search, onSearchChange: setSearch, searchPlaceholder: "Search by name, email, or phone\u2026", filterLabel: "Status", filterValue: statusFilter, onFilterChange: setStatusFilter, filterOptions: [
                    { value: "all", label: "All" },
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                    { value: "blacklisted", label: "Blacklisted" },
                ], sortKey: sortKey, onSortKeyChange: setSortKey, sortOptions: [
                    { value: "name", label: "Name" },
                    { value: "rating", label: "Rating" },
                    { value: "status", label: "Status" },
                    { value: "email", label: "Email" },
                ], sortDir: sortDir, onSortDirChange: setSortDir, pageSize: pageSize, onPageSizeChange: setPageSize, onExportCsv: exportCsv, exportDisabled: sorted.length === 0, resultsText: total === 0 ? "No matching suppliers" : `Showing ${from}–${to} of ${total} matching suppliers` }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: isLoading ? (_jsx("div", { className: "space-y-3 p-6", children: [1, 2, 3].map((i) => (_jsx(Skeleton, { className: "h-14 w-full" }, i))) })) : pageRows.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-muted-foreground", children: [_jsx(Truck, { className: "mb-3 h-10 w-10", "aria-hidden": true }), _jsx("p", { children: "No suppliers match your filters" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { scope: "col", className: "w-12" }), _jsx(TableHead, { scope: "col", children: "Name" }), _jsx(TableHead, { scope: "col", children: "Contact" }), _jsx(TableHead, { scope: "col", children: "Phone" }), _jsx(TableHead, { scope: "col", children: "Rating" }), _jsx(TableHead, { scope: "col", children: "Status" }), _jsx(TableHead, { scope: "col", className: "text-right", children: "Actions" })] }) }), _jsx(TableBody, { children: pageRows.map((s) => (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "w-12", children: _jsx(RecordAvatar, { entityType: "supplier", entityId: s.id, className: "h-9 w-9" }) }), _jsxs(TableCell, { children: [_jsx("div", { className: "font-medium", children: s.name }), _jsx("div", { className: "text-xs text-muted-foreground", children: s.email })] }), _jsx(TableCell, { className: "text-muted-foreground", children: s.contactPerson || "—" }), _jsx(TableCell, { className: "text-muted-foreground", children: s.phone || "—" }), _jsx(TableCell, { children: _jsxs("div", { className: "flex items-center gap-1 text-amber-500", children: [_jsx(Star, { className: "h-3.5 w-3.5 fill-current", "aria-hidden": true }), _jsx("span", { className: "text-sm font-medium tabular-nums", children: Number(s.rating).toFixed(1) })] }) }), _jsx(TableCell, { children: _jsx(Badge, { variant: s.status === "active" ? "default" : "outline", className: "capitalize", children: s.status }) }), _jsx(TableCell, { className: "text-right", children: _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx(Button, { size: "icon", variant: "ghost", "aria-label": `Edit ${s.name}`, onClick: () => openEdit(s), children: _jsx(Pencil, { className: "h-4 w-4" }) }), _jsx(Button, { size: "icon", variant: "ghost", className: "text-destructive", "aria-label": `Delete ${s.name}`, onClick: () => handleDelete(s.id), children: _jsx(Trash2, { className: "h-4 w-4" }) })] }) })] }, s.id))) })] }) }), _jsx(TablePaginationBar, { id: TABLE_ID, page: safePage, totalPages: totalPages, onPageChange: setPage })] })) }) }), _jsx(Dialog, { open: showDialog, onOpenChange: setShowDialog, children: _jsxs(DialogContent, { className: "max-w-lg max-h-[90vh] overflow-y-auto", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: editItem ? "Edit supplier" : "Add supplier" }) }), _jsxs(Tabs, { defaultValue: "details", children: [_jsxs(TabsList, { className: "mb-4", children: [_jsx(TabsTrigger, { value: "details", children: "Details" }), editItem && _jsx(TabsTrigger, { value: "images", children: "Images" })] }), _jsx(TabsContent, { value: "details", children: _jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "sup-name", children: "Company name" }), _jsx(Input, { id: "sup-name", ...register("name", { required: true }), placeholder: "WoodCraft Materials" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "sup-email", children: "Email" }), _jsx(Input, { id: "sup-email", type: "email", ...register("email"), placeholder: "contact@supplier.com (required for portal login)" })] }), !editItem && _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "sup-portal-pw", children: "Supplier portal password" }), _jsx(Input, { id: "sup-portal-pw", type: "password", autoComplete: "new-password", ...register("portalPassword"), placeholder: "Optional — creates a supplier user linked by email" }), _jsx("p", { className: "text-[11px] text-muted-foreground", children: "Must match portal email above. Supplier portal resolves this supplier by email." })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "sup-phone", children: "Phone" }), _jsx(Input, { id: "sup-phone", ...register("phone"), placeholder: "+1-555-0100" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "sup-contact", children: "Contact person" }), _jsx(Input, { id: "sup-contact", ...register("contactPerson"), placeholder: "John Smith" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx(Label, { htmlFor: "sup-rating", children: "Rating (0\u20135)" }), _jsx(Input, { id: "sup-rating", type: "number", min: "0", max: "5", step: "0.1", ...register("rating", { valueAsNumber: true }) })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { htmlFor: "sup-addr", children: "Address" }), _jsx(Input, { id: "sup-addr", ...register("address"), placeholder: "123 Main St, City, State" })] }), _jsxs("div", { className: "col-span-2 space-y-1", children: [_jsx(Label, { children: "Status" }), _jsx(Controller, { name: "status", control: control, render: ({ field }) => (_jsxs(Select, { value: field.value, onValueChange: field.onChange, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "active", children: "Active" }), _jsx(SelectItem, { value: "inactive", children: "Inactive" }), _jsx(SelectItem, { value: "blacklisted", children: "Blacklisted" })] })] })) })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", type: "button", onClick: () => setShowDialog(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: createSupplier.isPending || updateSupplier.isPending, children: "Save" })] })] }) }), editItem && (_jsx(TabsContent, { value: "images", children: _jsx(RecordImagePanel, { entityType: "supplier", entityId: editItem.id, canUpload: canManageImages, canDelete: canManageImages }) }))] })] }) }), _jsx(Dialog, { open: showGallery, onOpenChange: setShowGallery, children: _jsxs(DialogContent, { className: MODULE_GALLERY_DIALOG_CONTENT_CLASS, children: [_jsx(DialogHeader, { className: MODULE_GALLERY_DIALOG_HEADER_CLASS, children: _jsx(DialogTitle, { className: MODULE_GALLERY_DIALOG_TITLE_CLASS, children: "Supplier images & documents" }) }), _jsx("div", { className: MODULE_GALLERY_DIALOG_BODY_CLASS, children: _jsx(ModuleGallery, { entityType: "supplier", isLoading: galleryImagesLoading, images: allImages.filter((img) => (rows ?? []).some((s) => s.id === img.entityId)), canDelete: canManageImages, canUpload: canManageImages, entityIds: (rows ?? []).map((s) => s.id), entityLabels: Object.fromEntries((rows ?? []).map((s) => [s.id, s.name])), emptyListHint: "No suppliers found. Add suppliers first." }) })] }) })] }));
}
