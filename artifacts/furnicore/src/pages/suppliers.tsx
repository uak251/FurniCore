import { useState, useMemo, useEffect } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Truck, Pencil, Trash2, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";

interface SupplierForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
  status: string;
  rating: number;
}

const TABLE_ID = "suppliers";

export default function SuppliersPage() {
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

  const { data: suppliers, isLoading } = useListSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const { register, handleSubmit, control, reset, setValue } = useForm<SupplierForm>({
    defaultValues: { status: "active", rating: 0 },
  });

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortKey, sortDir, pageSize]);

  const rows = suppliers ?? [];

  const sorted = useMemo(() => {
    return filterAndSortRows(rows, {
      search,
      match: (row: any, q: string) => {
        const qn = q.toLowerCase();
        const textMatch =
          !qn ||
          row.name.toLowerCase().includes(qn) ||
          (row.email && row.email.toLowerCase().includes(qn)) ||
          (row.phone && String(row.phone).toLowerCase().includes(qn));
        if (!textMatch) return false;
        if (statusFilter === "all") return true;
        return String(row.status).toLowerCase() === statusFilter;
      },
      sortKey,
      sortDir,
      getSortValue: (row: any, key: string) => {
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

  const { pageRows, total, totalPages, page: safePage } = useMemo(
    () => paginateRows(sorted, page, pageSize),
    [sorted, page, pageSize],
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const exportCsv = () => {
    const headers = ["name", "email", "phone", "contactPerson", "rating", "status", "address"];
    const data = sorted.map((s: any) => ({
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

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground">Manage your supplier network</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Add supplier
        </Button>
      </div>

      <TableToolbar
        id={TABLE_ID}
        entityLabel="suppliers"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, email, or phone…"
        filterLabel="Status"
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={[
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
          { value: "blacklisted", label: "Blacklisted" },
        ]}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={[
          { value: "name", label: "Name" },
          { value: "rating", label: "Rating" },
          { value: "status", label: "Status" },
          { value: "email", label: "Email" },
        ]}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onExportCsv={exportCsv}
        exportDisabled={sorted.length === 0}
        resultsText={
          total === 0 ? "No matching suppliers" : `Showing ${from}–${to} of ${total} matching suppliers`
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Truck className="mb-3 h-10 w-10" aria-hidden />
              <p>No suppliers match your filters</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Name</TableHead>
                      <TableHead scope="col">Contact</TableHead>
                      <TableHead scope="col">Phone</TableHead>
                      <TableHead scope="col">Rating</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col" className="text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.email}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{s.contactPerson || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{s.phone || "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-amber-500">
                            <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                            <span className="text-sm font-medium tabular-nums">{Number(s.rating).toFixed(1)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.status === "active" ? "default" : "outline"} className="capitalize">
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => openEdit(s)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              aria-label={`Delete ${s.name}`}
                              onClick={() => handleDelete(s.id)}
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
            <DialogTitle>{editItem ? "Edit supplier" : "Add supplier"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="sup-name">Company name</Label>
                <Input id="sup-name" {...register("name", { required: true })} placeholder="WoodCraft Materials" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-email">Email</Label>
                <Input id="sup-email" type="email" {...register("email")} placeholder="contact@supplier.com" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-phone">Phone</Label>
                <Input id="sup-phone" {...register("phone")} placeholder="+1-555-0100" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-contact">Contact person</Label>
                <Input id="sup-contact" {...register("contactPerson")} placeholder="John Smith" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-rating">Rating (0–5)</Label>
                <Input id="sup-rating" type="number" min="0" max="5" step="0.1" {...register("rating", { valueAsNumber: true })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="sup-addr">Address</Label>
                <Input id="sup-addr" {...register("address")} placeholder="123 Main St, City, State" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Status</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="blacklisted">Blacklisted</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSupplier.isPending || updateSupplier.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
