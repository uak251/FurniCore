import { useState, useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import {
    useSalesProductCategories,
    useSalesCatalogProducts,
    useUpdateSalesProduct,
    useProductManufacturingHistory,
} from "@/hooks/use-sales-manager";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Pencil, History } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PRODUCT_STATUS_OPTIONS = [
    { value: "AVAILABLE", label: "Available" },
    { value: "IN_SHOWROOM", label: "In Showroom" },
    { value: "IN_FACTORY", label: "In Factory" },
    { value: "WORK_IN_PROCESS", label: "Work in Process" },
];
const WIP_STAGE_OPTIONS = [
    { value: "WOOD_STRUCTURE", label: "Wood structure" },
    { value: "POSHISH", label: "Poshish" },
    { value: "POLISH", label: "Polish" },
    { value: "FINISHING", label: "Finishing" },
    { value: "READY", label: "Ready" },
];
const PRODUCT_STATUS_BADGE_SALES = {
    AVAILABLE: "bg-emerald-100 text-emerald-800",
    IN_SHOWROOM: "bg-sky-100 text-sky-800",
    IN_FACTORY: "bg-orange-100 text-orange-800",
    WORK_IN_PROCESS: "bg-violet-100 text-violet-800",
};

export function CatalogTab() {
    const { toast } = useToast();
    const [search, setSearch] = useState("");
    const [categoryId, setCategoryId] = useState("all");
    const [productStatusF, setProductStatusF] = useState("all");
    const [editProduct, setEditProduct] = useState(null);
    const [historyId, setHistoryId] = useState(null);
    const filters = useMemo(() => ({ search, categoryId, productStatus: productStatusF }), [search, categoryId, productStatusF]);
    const { data: categories = [] } = useSalesProductCategories();
    const { data: products = [], isLoading } = useSalesCatalogProducts(filters);
    const updateProduct = useUpdateSalesProduct();
    const { data: historyPayload } = useProductManufacturingHistory(historyId);
    const { register, handleSubmit, reset, control, watch } = useForm({
        defaultValues: {
            productStatus: "AVAILABLE",
            wipStage: "WOOD_STRUCTURE",
            wipProgressPercent: 0,
            wipDepartment: "",
        },
    });
    const formStatus = watch("productStatus");
    useEffect(() => {
        if (editProduct) {
            reset({
                productStatus: editProduct.productStatus ?? "AVAILABLE",
                wipStage: editProduct.wipStage ?? "WOOD_STRUCTURE",
                wipProgressPercent: editProduct.wipProgressPercent ?? 0,
                wipDepartment: editProduct.wipDepartment ?? "",
            });
        }
    }, [editProduct, reset]);
    const onSave = async (data) => {
        if (!editProduct) return;
        try {
            await updateProduct.mutateAsync({
                id: editProduct.id,
                productStatus: data.productStatus,
                wipStage: data.productStatus === "WORK_IN_PROCESS" ? data.wipStage : null,
                wipProgressPercent: data.productStatus === "WORK_IN_PROCESS" ? Number(data.wipProgressPercent) : null,
                wipDepartment: data.productStatus === "WORK_IN_PROCESS" ? (data.wipDepartment?.trim() || null) : null,
            });
            toast({ title: "Product updated" });
            setEditProduct(null);
        } catch (e) {
            toast({ variant: "destructive", title: "Could not save", description: e.message });
        }
    };
    return (
        <div className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Input
                    className="min-w-0 w-full sm:w-64"
                    placeholder="Search by name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="w-full sm:w-48">
                        <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                                {c.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={productStatusF} onValueChange={setProductStatusF}>
                    <SelectTrigger className="w-full sm:w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {PRODUCT_STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {isLoading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={`catalog-skeleton-${i}`} className="h-14 w-full" />
                    ))}
                </div>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>SKU</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>WIP</TableHead>
                                        <TableHead className="text-right">Price</TableHead>
                                        <TableHead />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {products.map((p) => {
                                        const st = p.productStatus ?? "AVAILABLE";
                                        const wip = st === "WORK_IN_PROCESS";
                                        const badge = PRODUCT_STATUS_BADGE_SALES[st] ?? "bg-muted";
                                        return (
                                            <TableRow key={p.id}>
                                                <TableCell className="max-w-[220px]">
                                                    <p className="font-medium leading-tight">{p.name}</p>
                                                    <p className="text-[10px] text-muted-foreground">{p.sku}</p>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                                                <TableCell className="text-sm">{p.categoryName ?? p.category}</TableCell>
                                                <TableCell>
                                                    <Badge className={cn("text-[11px]", badge)}>{p.productStatusLabel ?? st}</Badge>
                                                </TableCell>
                                                <TableCell className="min-w-[140px]">
                                                    {wip ? (
                                                        <>
                                                            <p className="text-[10px] text-muted-foreground">
                                                                {p.wipStageLabel ?? p.wipStage ?? "—"} · {p.wipProgressPercent ?? 0}%
                                                            </p>
                                                            <Progress value={p.wipProgressPercent ?? 0} className="mt-1 h-1.5" />
                                                        </>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold tabular-nums">{fmt(p.sellingPrice)}</TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1">
                                                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditProduct(p)}>
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7 w-7 px-0"
                                                            title="History"
                                                            onClick={() => setHistoryId(p.id)}
                                                        >
                                                            <History className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
            <Dialog open={!!editProduct} onOpenChange={(v) => { if (!v) setEditProduct(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5" />
                            Update product status
                        </DialogTitle>
                    </DialogHeader>
                    {editProduct && (
                        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
                            <p className="text-sm text-muted-foreground">{editProduct.name}</p>
                            <div className="space-y-1">
                                <Label>Operational status</Label>
                                <Controller
                                    name="productStatus"
                                    control={control}
                                    render={({ field }) => (
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PRODUCT_STATUS_OPTIONS.map((o) => (
                                                    <SelectItem key={o.value} value={o.value}>
                                                        {o.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>
                            {formStatus === "WORK_IN_PROCESS" && (
                                <>
                                    <div className="space-y-1">
                                        <Label>Manufacturing stage</Label>
                                        <Controller
                                            name="wipStage"
                                            control={control}
                                            render={({ field }) => (
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {WIP_STAGE_OPTIONS.map((o) => (
                                                            <SelectItem key={o.value} value={o.value}>
                                                                {o.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Progress %</Label>
                                        <Input type="number" min={0} max={100} {...register("wipProgressPercent", { valueAsNumber: true })} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Department (optional)</Label>
                                        <Input {...register("wipDepartment")} placeholder="e.g. polishing" />
                                    </div>
                                </>
                            )}
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setEditProduct(null)}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={updateProduct.isPending}>
                                    Save
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
            <Dialog open={historyId != null} onOpenChange={(v) => { if (!v) setHistoryId(null); }}>
                <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <History className="h-5 w-5" />
                            Manufacturing timeline
                        </DialogTitle>
                    </DialogHeader>
                    {historyPayload && (
                        <>
                            <p className="text-sm font-medium">
                                {historyPayload.productName} (#{historyPayload.productId})
                            </p>
                            <ul className="mt-3 space-y-2 text-sm">
                                {(historyPayload.events ?? []).length === 0 ? (
                                    <li className="text-muted-foreground">No events yet.</li>
                                ) : (
                                    historyPayload.events.map((ev) => (
                                        <li key={ev.id} className="rounded-md border p-2">
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(ev.createdAt).toLocaleString()} · {ev.eventType}
                                                {ev.toStatus && ` → ${ev.toStatus}`}
                                                {ev.toStage && ` / ${ev.toStage}`}
                                                {ev.toProgress != null && ` / ${ev.toProgress}%`}
                                                {ev.note && ` — ${ev.note}`}
                                            </div>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
