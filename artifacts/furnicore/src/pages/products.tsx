import { useState, useMemo, useEffect } from "react";
import { useListProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Package, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";

interface ProductForm {
  name: string;
  description: string;
  sku: string;
  category: string;
  sellingPrice: number;
  costPrice: number;
  stockQuantity: number;
  isActive: boolean;
}

const TABLE_ID = "products";

export default function ProductsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data: products, isLoading } = useListProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const { register, handleSubmit, reset, setValue, watch } = useForm<ProductForm>({
    defaultValues: { isActive: true },
  });
  const isActive = watch("isActive");

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortKey, sortDir, pageSize]);

  const rows = products ?? [];

  const sorted = useMemo(() => {
    return filterAndSortRows(rows, {
      search,
      match: (row: any, q: string) => {
        const qn = q.toLowerCase();
        const textMatch =
          !qn ||
          row.name.toLowerCase().includes(qn) ||
          String(row.sku ?? "").toLowerCase().includes(qn) ||
          String(row.category ?? "").toLowerCase().includes(qn);
        if (!textMatch) return false;
        if (statusFilter === "active") return row.isActive;
        if (statusFilter === "inactive") return !row.isActive;
        return true;
      },
      sortKey,
      sortDir,
      getSortValue: (row: any, key: string) => {
        switch (key) {
          case "sku":
            return String(row.sku ?? "");
          case "category":
            return String(row.category ?? "");
          case "sellingPrice":
            return Number(row.sellingPrice);
          case "costPrice":
            return Number(row.costPrice);
          case "stockQuantity":
            return Number(row.stockQuantity);
          case "margin": {
            const s = Number(row.sellingPrice);
            const c = Number(row.costPrice);
            return s > 0 ? (s - c) / s : 0;
          }
          default:
            return String(row.name ?? "");
        }
      },
    });
  }, [rows, search, statusFilter, sortKey, sortDir]);

  const { pageRows, total, totalPages, page: safePage } = useMemo(
    () => paginateRows(sorted, page, pageSize),
    [sorted, page, pageSize],
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const margin = (p: any) => {
    const s = Number(p.sellingPrice);
    const c = Number(p.costPrice);
    return c > 0 && s > 0 ? (((s - c) / s) * 100).toFixed(1) : "—";
  };

  const exportCsv = () => {
    const headers = [
      "name",
      "sku",
      "category",
      "costPrice",
      "sellingPrice",
      "marginPct",
      "stockQuantity",
      "isActive",
    ];
    const data = sorted.map((p: any) => ({
      name: p.name,
      sku: p.sku,
      category: p.category ?? "",
      costPrice: Number(p.costPrice),
      sellingPrice: Number(p.sellingPrice),
      marginPct: margin(p) === "—" ? "" : margin(p),
      stockQuantity: Number(p.stockQuantity),
      isActive: p.isActive ? "Yes" : "No",
    }));
    exportRowsToCsv(`furnicore-products-${new Date().toISOString().slice(0, 10)}`, headers, data);
    toast({ title: "Export started", description: `${data.length} rows exported.` });
  };

  const openCreate = () => {
    setEditItem(null);
    reset({
      name: "",
      description: "",
      sku: "",
      category: "",
      sellingPrice: 0,
      costPrice: 0,
      stockQuantity: 0,
      isActive: true,
    });
    setShowDialog(true);
  };

  const openEdit = (product: any) => {
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

  const onSubmit = async (data: ProductForm) => {
    try {
      if (editItem) {
        await updateProduct.mutateAsync({ id: editItem.id, data });
        toast({ title: "Product updated" });
      } else {
        await createProduct.mutateAsync({ data });
        toast({ title: "Product created" });
      }
      queryClient.invalidateQueries({ queryKey: ["listProducts"] });
      setShowDialog(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this product?")) return;
    try {
      await deleteProduct.mutateAsync({ id });
      toast({ title: "Product deleted" });
      queryClient.invalidateQueries({ queryKey: ["listProducts"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Manage your product catalog and pricing</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Add product
        </Button>
      </div>

      <TableToolbar
        id={TABLE_ID}
        entityLabel="products"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, SKU, or category…"
        filterLabel="Status"
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={[
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ]}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={[
          { value: "name", label: "Name" },
          { value: "sku", label: "SKU" },
          { value: "category", label: "Category" },
          { value: "sellingPrice", label: "Selling price" },
          { value: "costPrice", label: "Cost price" },
          { value: "stockQuantity", label: "Stock" },
          { value: "margin", label: "Margin %" },
        ]}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onExportCsv={exportCsv}
        exportDisabled={sorted.length === 0}
        resultsText={
          total === 0 ? "No matching products" : `Showing ${from}–${to} of ${total} matching products`
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="mb-3 h-10 w-10" aria-hidden />
              <p>No products match your filters</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Name</TableHead>
                      <TableHead scope="col">SKU</TableHead>
                      <TableHead scope="col">Category</TableHead>
                      <TableHead scope="col" className="text-right">
                        Cost
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Price
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Margin
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Stock
                      </TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col" className="text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.sku}</TableCell>
                        <TableCell className="text-muted-foreground">{p.category || "—"}</TableCell>
                        <TableCell className="text-right font-mono">${Number(p.costPrice).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">${Number(p.sellingPrice).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-green-600">{margin(p)}%</TableCell>
                        <TableCell className="text-right font-mono">{Number(p.stockQuantity)}</TableCell>
                        <TableCell>
                          <Badge variant={p.isActive ? "default" : "outline"}>
                            {p.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Edit ${p.name}`}
                              onClick={() => openEdit(p)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              aria-label={`Delete ${p.name}`}
                              onClick={() => handleDelete(p.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePaginationBar
                id={TABLE_ID}
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit product" : "Add product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="prod-name">Product name</Label>
                <Input id="prod-name" {...register("name", { required: true })} placeholder="e.g. Executive Oak Desk" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="prod-sku">SKU</Label>
                <Input id="prod-sku" {...register("sku", { required: true })} placeholder="DESK-OAK-001" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="prod-cat">Category</Label>
                <Input id="prod-cat" {...register("category")} placeholder="e.g. Desks" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="prod-cost">Cost price ($)</Label>
                <Input id="prod-cost" type="number" step="0.01" {...register("costPrice", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="prod-price">Selling price ($)</Label>
                <Input id="prod-price" type="number" step="0.01" {...register("sellingPrice", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="prod-stock">Stock quantity</Label>
                <Input id="prod-stock" type="number" {...register("stockQuantity", { valueAsNumber: true })} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={(v) => setValue("isActive", v)} id="prod-active" />
                <Label htmlFor="prod-active">Active</Label>
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="prod-desc">Description</Label>
                <Input id="prod-desc" {...register("description")} placeholder="Short product description" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
