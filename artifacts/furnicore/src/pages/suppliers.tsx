import { useState } from "react";
import { useListSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Truck, Search, Pencil, Trash2, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";

interface SupplierForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
  status: string;
  rating: number;
}

export default function SuppliersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data: suppliers, isLoading } = useListSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const { register, handleSubmit, control, reset, setValue } = useForm<SupplierForm>({
    defaultValues: { status: "active", rating: 0 }
  });

  const filtered = (suppliers ?? []).filter((s: any) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.email && s.email.toLowerCase().includes(search.toLowerCase()))
  );

  const openCreate = () => {
    setEditItem(null);
    reset({ name: "", email: "", phone: "", address: "", contactPerson: "", status: "active", rating: 0 });
    setShowDialog(true);
  };

  const openEdit = (s: any) => {
    setEditItem(s);
    setValue("name", s.name);
    setValue("email", s.email || "");
    setValue("phone", s.phone || "");
    setValue("address", s.address || "");
    setValue("contactPerson", s.contactPerson || "");
    setValue("status", s.status);
    setValue("rating", Number(s.rating));
    setShowDialog(true);
  };

  const onSubmit = async (data: SupplierForm) => {
    try {
      if (editItem) {
        await updateSupplier.mutateAsync({ id: editItem.id, data });
        toast({ title: "Supplier updated" });
      } else {
        await createSupplier.mutateAsync({ data });
        toast({ title: "Supplier created" });
      }
      queryClient.invalidateQueries({ queryKey: ["listSuppliers"] });
      setShowDialog(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this supplier?")) return;
    try {
      await deleteSupplier.mutateAsync({ id });
      toast({ title: "Supplier deleted" });
      queryClient.invalidateQueries({ queryKey: ["listSuppliers"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground">Manage your supplier network</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Supplier
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Truck className="h-10 w-10 mb-3" />
              <p>No suppliers found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Contact</th>
                  <th className="px-6 py-3 font-medium">Phone</th>
                  <th className="px-6 py-3 font-medium">Rating</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((s: any) => (
                  <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.email}</div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{s.contactPerson || "—"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{s.phone || "—"}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-amber-500">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span className="text-sm font-medium">{Number(s.rating).toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={s.status === "active" ? "default" : "outline"} className="capitalize">{s.status}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Company Name</Label>
                <Input {...register("name", { required: true })} placeholder="WoodCraft Materials" />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" {...register("email")} placeholder="contact@supplier.com" />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input {...register("phone")} placeholder="+1-555-0100" />
              </div>
              <div className="space-y-1">
                <Label>Contact Person</Label>
                <Input {...register("contactPerson")} placeholder="John Smith" />
              </div>
              <div className="space-y-1">
                <Label>Rating (0-5)</Label>
                <Input type="number" min="0" max="5" step="0.1" {...register("rating", { valueAsNumber: true })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Address</Label>
                <Input {...register("address")} placeholder="123 Main St, City, State" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Status</Label>
                <Controller name="status" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="blacklisted">Blacklisted</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createSupplier.isPending || updateSupplier.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
