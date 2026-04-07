import { useState } from "react";
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
import { Plus, Package, Search, Pencil, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { BulkImportExport } from "@/components/BulkImportExport";

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

export default function ProductsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showBulk, setShowBulk]     = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data: products, isLoading } = useListProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const { register, handleSubmit, reset, setValue, watch } = useForm<ProductForm>({
    defaultValues: { isActive: true }
  });
  const isActive = watch("isActive");

  const filtered = (products ?? []).filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditItem(null);
    reset({ name: "", description: "", sku: "", category: "", sellingPrice: 0, costPrice: 0, stockQuantity: 0, isActive: true });
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

  const margin = (p: any) => {
    const s = Number(p.sellingPrice);
    const c = Number(p.costPrice);
    return c > 0 ? (((s - c) / s) * 100).toFixed(1) : "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Manage your product catalog and pricing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulk(true)}>
            <Upload className="mr-2 h-4 w-4" aria-hidden />
            Bulk import/export
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="h-10 w-10 mb-3" />
              <p>No products found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">SKU</th>
                  <th className="px-6 py-3 font-medium">Category</th>
                  <th className="px-6 py-3 font-medium">Cost</th>
                  <th className="px-6 py-3 font-medium">Price</th>
                  <th className="px-6 py-3 font-medium">Margin</th>
                  <th className="px-6 py-3 font-medium">Stock</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-4 font-medium">{p.name}</td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{p.sku}</td>
                    <td className="px-6 py-4 text-muted-foreground">{p.category || "—"}</td>
                    <td className="px-6 py-4 font-mono">${Number(p.costPrice).toFixed(2)}</td>
                    <td className="px-6 py-4 font-mono">${Number(p.sellingPrice).toFixed(2)}</td>
                    <td className="px-6 py-4 font-mono text-green-600">{margin(p)}%</td>
                    <td className="px-6 py-4 font-mono">{Number(p.stockQuantity)}</td>
                    <td className="px-6 py-4">
                      <Badge variant={p.isActive ? "default" : "outline"}>{p.isActive ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Bulk import/export dialog */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk Import / Export — Products</DialogTitle>
          </DialogHeader>
          <BulkImportExport
            module="Products"
            importEndpoint="/api/bulk/products/import"
            exportEndpoint="/api/bulk/products/export"
            exportFilename="products-export.csv"
            templateHeaders={["name", "sku", "category", "sellingPrice", "costPrice", "stockQuantity", "description", "isActive"]}
            templateSample={[
              ["Oak Executive Desk", "DESK-OAK-001", "Desks", "1200", "700", "15", "Solid oak executive desk", "true"],
              ["Steel Chair", "CHAIR-STL-002", "Chairs", "350", "180", "30", "Ergonomic steel frame chair", "true"],
            ]}
            onImported={() => queryClient.invalidateQueries({ queryKey: ["listProducts"] })}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Product Name</Label>
                <Input {...register("name", { required: true })} placeholder="e.g. Executive Oak Desk" />
              </div>
              <div className="space-y-1">
                <Label>SKU</Label>
                <Input {...register("sku", { required: true })} placeholder="DESK-OAK-001" />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Input {...register("category")} placeholder="e.g. Desks" />
              </div>
              <div className="space-y-1">
                <Label>Cost Price ($)</Label>
                <Input type="number" step="0.01" {...register("costPrice", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label>Selling Price ($)</Label>
                <Input type="number" step="0.01" {...register("sellingPrice", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label>Stock Quantity</Label>
                <Input type="number" {...register("stockQuantity", { valueAsNumber: true })} />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Switch checked={isActive} onCheckedChange={(v) => setValue("isActive", v)} />
                <Label>Active</Label>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description</Label>
                <Input {...register("description")} placeholder="Short product description" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
