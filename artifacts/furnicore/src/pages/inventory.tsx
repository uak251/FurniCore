import { useState, useMemo, useEffect } from "react";
import {
  useListInventory,
  useGetLowStockItems,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
} from "@workspace/api-client-react";
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
import { AlertTriangle, Plus, Package, Pencil, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";
import { BulkImportExport } from "@/components/BulkImportExport";
import { ModuleAnalyticsPanel } from "@/components/ModuleAnalyticsPanel";
import { useCurrency } from "@/lib/currency";

interface InventoryFormData {
  name: string;
  type: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
  unitCost: number;
}

const TABLE_ID = "inventory";

export default function InventoryPage() {
  const { toast } = useToast();
  const { format: formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showDialog, setShowDialog] = useState(false);
  const [showBulk, setShowBulk]     = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data: inventory, isLoading } = useListInventory();
  const { data: lowStock } = useGetLowStockItems();
  const createItem = useCreateInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const deleteItem = useDeleteInventoryItem();

  const { register, handleSubmit, control, reset, setValue } = useForm<InventoryFormData>();

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortKey, sortDir, pageSize]);

  const rows = inventory ?? [];

  const sorted = useMemo(() => {
    return filterAndSortRows(rows, {
      search,
      match: (row: any, q: string) => {
        const qn = q.toLowerCase();
        const textMatch =
          row.name.toLowerCase().includes(qn) ||
          String(row.type ?? "").toLowerCase().includes(qn) ||
          String(row.unit ?? "").toLowerCase().includes(qn);
        if (!textMatch) return false;
        const qty = Number(row.quantity);
        const reorder = Number(row.reorderLevel);
        const low = qty <= reorder;
        if (statusFilter === "low") return low;
        if (statusFilter === "ok") return !low;
        return true;
      },
      sortKey,
      sortDir,
      getSortValue: (row: any, key: string) => {
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

  const { pageRows, total, totalPages, page: safePage } = useMemo(
    () => paginateRows(sorted, page, pageSize),
    [sorted, page, pageSize],
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const exportCsv = () => {
    const headers = ["name", "type", "unit", "quantity", "reorderLevel", "unitCost", "status"];
    const data = sorted.map((item: any) => {
      const qty = Number(item.quantity);
      const reorder = Number(item.reorderLevel);
      const low = qty <= reorder;
      return {
        name: item.name,
        type: item.type,
        unit: item.unit,
        quantity: qty,
        reorderLevel: reorder,
        unitCost: Number(item.unitCost),
        status: low ? "Low stock" : "OK",
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

  const openEdit = (item: any) => {
    setEditItem(item);
    setValue("name", item.name);
    setValue("type", item.type);
    setValue("unit", item.unit);
    setValue("quantity", Number(item.quantity));
    setValue("reorderLevel", Number(item.reorderLevel));
    setValue("unitCost", Number(item.unitCost));
    setShowDialog(true);
  };

  const onSubmit = async (data: InventoryFormData) => {
    try {
      if (editItem) {
        await updateItem.mutateAsync({ id: editItem.id, data });
        toast({ title: "Item updated successfully" });
      } else {
        await createItem.mutateAsync({ data });
        toast({ title: "Item created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: ["listInventory"] });
      setShowDialog(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this inventory item?")) return;
    try {
      await deleteItem.mutateAsync({ id });
      toast({ title: "Item deleted" });
      queryClient.invalidateQueries({ queryKey: ["listInventory"] });
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
          <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">Manage raw materials and stock levels</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulk(true)}>
            <Upload className="mr-2 h-4 w-4" aria-hidden />
            Bulk import/export
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Add item
          </Button>
        </div>
      </div>

      {lowStock && lowStock.length > 0 && (
        <div
          className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-destructive"
          role="status"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          <p className="text-sm font-medium">
            {lowStock.length} item(s) below reorder level:{" "}
            <span className="break-words">{lowStock.map((i: any) => i.name).join(", ")}</span>
          </p>
        </div>
      )}

      <TableToolbar
        id={TABLE_ID}
        entityLabel="inventory"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, type, or unit…"
        filterLabel="Stock status"
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={[
          { value: "all", label: "All items" },
          { value: "low", label: "Low stock" },
          { value: "ok", label: "OK" },
        ]}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={[
          { value: "name", label: "Name" },
          { value: "type", label: "Type" },
          { value: "quantity", label: "Quantity" },
          { value: "reorderLevel", label: "Reorder at" },
          { value: "unitCost", label: "Unit cost" },
        ]}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onExportCsv={exportCsv}
        exportDisabled={sorted.length === 0}
        resultsText={
          total === 0
            ? "No matching items"
            : `Showing ${from}–${to} of ${total} matching items`
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
              <p>No inventory items match your filters</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto" id={`${TABLE_ID}-table`}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Name</TableHead>
                      <TableHead scope="col">Type</TableHead>
                      <TableHead scope="col">Unit</TableHead>
                      <TableHead scope="col" className="text-right">
                        Quantity
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Reorder at
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Unit cost
                      </TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col" className="w-[100px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((item: any) => {
                      const qty = Number(item.quantity);
                      const reorder = Number(item.reorderLevel);
                      const low = qty <= reorder;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="capitalize text-muted-foreground">
                            {String(item.type ?? "").replace(/_/g, " ")}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {qty.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {reorder.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatCurrency(Number(item.unitCost))}
                          </TableCell>
                          <TableCell>
                            <Badge variant={low ? "destructive" : "secondary"}>
                              {low ? "Low stock" : "OK"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Edit ${item.name}`}
                                onClick={() => openEdit(item)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive"
                                aria-label={`Delete ${item.name}`}
                                onClick={() => handleDelete(item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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

      {/* ── Bulk import/export dialog ──────────────────────────────── */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk Import / Export — Raw Materials</DialogTitle>
          </DialogHeader>
          <BulkImportExport
            module="Inventory"
            importEndpoint="/api/bulk/inventory/import"
            exportEndpoint="/api/bulk/inventory/export"
            exportFilename="inventory-export.csv"
            templateHeaders={["name", "type", "unit", "quantity", "reorderLevel", "unitCost"]}
            templateSample={[
              ["Oak Wood", "raw_material", "kg", "500", "100", "2.50"],
              ["Steel Bolts", "raw_material", "units", "2000", "500", "0.05"],
            ]}
            onImported={() => queryClient.invalidateQueries({ queryKey: ["listInventory"] })}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit inventory item" : "Add inventory item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="inv-name">Name</Label>
                <Input id="inv-name" {...register("name", { required: true })} placeholder="Item name" />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="raw_material">Raw material</SelectItem>
                        <SelectItem value="finished_goods">Finished goods</SelectItem>
                        <SelectItem value="work_in_progress">Work in progress</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inv-unit">Unit</Label>
                <Input id="inv-unit" {...register("unit", { required: true })} placeholder="e.g. kg, units" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inv-qty">Quantity</Label>
                <Input
                  id="inv-qty"
                  type="number"
                  step="0.01"
                  {...register("quantity", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inv-reorder">Reorder level</Label>
                <Input
                  id="inv-reorder"
                  type="number"
                  step="0.01"
                  {...register("reorderLevel", { valueAsNumber: true })}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="inv-cost">Unit cost ($)</Label>
                <Input
                  id="inv-cost"
                  type="number"
                  step="0.01"
                  {...register("unitCost", { valueAsNumber: true })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createItem.isPending || updateItem.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Analytics panel ─────────────────────────────────────────── */}
      <ModuleAnalyticsPanel
        module="inventory"
        reportId="inventory-analysis"
        title="Inventory Analytics"
      />
    </div>
  );
}
