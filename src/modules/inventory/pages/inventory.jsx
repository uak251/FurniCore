import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser, useListSuppliers } from "@workspace/api-client-react";
import { Download, FileDown, ImagePlus, Images, LineChart, MoreHorizontal, Plus, Search, Upload } from "lucide-react";
import { ModuleInsightsDrawer } from "@/components/analytics/ModuleInsightsDrawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrency } from "@/lib/currency";
import { ModulePageHeader } from "@/components/module/ModulePageHeader";
import { ModuleTableState } from "@/components/module/ModuleTableState";
import { ModuleActionsMenu } from "@/components/module/ModuleActionsMenu";
import { useInventoryPageModel } from "@/hooks/modules/useInventoryPageModel";
import { apiOriginPrefix } from "@/lib/api-base";
import { getAuthToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  ModuleGallery,
  MODULE_GALLERY_DIALOG_BODY_CLASS,
  MODULE_GALLERY_DIALOG_CONTENT_CLASS,
  MODULE_GALLERY_DIALOG_HEADER_CLASS,
  MODULE_GALLERY_DIALOG_TITLE_CLASS,
  RecordAvatar,
  RecordImagePanel,
  useModuleImages,
} from "@/components/images";

const API_BASE = apiOriginPrefix();

export default function InventoryPage() {
    const { toast } = useToast();
  const { format } = useCurrency();
    const queryClient = useQueryClient();
    const { data: me } = useGetCurrentUser();
  const { data: suppliers = [] } = useListSuppliers();
  const canManageImages =
    me?.role === "admin"
    || me?.role === "manager"
    || me?.role === "sales_manager"
    || me?.role === "accountant"
    || me?.role === "inventory_manager";

  const { query, setQuery, typeFilter, setTypeFilter, inventory, rows, isLoading, isError, error, refetch } = useInventoryPageModel();
  const { data: allImages = [], isLoading: galleryImagesLoading } = useModuleImages("inventory");
  const [selectedIds, setSelectedIds] = useState([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDemandDialog, setShowDemandDialog] = useState(false);
  const [demandPlan, setDemandPlan] = useState([]);
    const [showGallery, setShowGallery] = useState(false);
  const [imagePanelItem, setImagePanelItem] = useState(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    type: "raw_material",
    unit: "pcs",
    quantity: "0",
    reorderLevel: "0",
    unitCost: "0",
  });
  const csvInputRef = useRef(null);

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${getAuthToken() ?? ""}`,
    }),
    [],
  );

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));
  const selectedRows = rows.filter((row) => selectedIds.includes(row.id));

  const clearSelection = () => setSelectedIds([]);
  const toggleSelect = (id, checked) => {
    setSelectedIds((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)));
  };
  const toggleSelectVisible = (checked) => {
    if (checked) {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...rows.map((r) => r.id)])));
      return;
    }
    const visible = new Set(rows.map((r) => r.id));
    setSelectedIds((prev) => prev.filter((id) => !visible.has(id)));
  };

  const exportInventoryCsv = async () => {
    const response = await fetch(`${API_BASE}/api/inventory/export-csv`, { headers: authHeaders });
    if (!response.ok) throw new Error("Failed to export inventory CSV.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-export-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = async () => {
    const response = await fetch(`${API_BASE}/api/inventory/template.csv`, { headers: authHeaders });
    if (!response.ok) throw new Error("Failed to download inventory template.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importInventoryCsv = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE}/api/inventory/import-csv`, {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json?.error || "Failed to import inventory CSV.");
    return json;
  };

  const createDemandFor = async (item) => {
    const qty = Math.max(1, Number(item.reorderLevel ?? 0) - Number(item.quantity ?? 0));
    const response = await fetch(`${API_BASE}/api/inventory/procurement-demand`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ inventoryItemId: item.id, quantityRequested: qty }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json?.error || `Demand creation failed for ${item.name}`);
  };

  const openBulkDemandDialog = () => {
    if (selectedRows.length === 0) return;
    setDemandPlan(
      selectedRows.map((item) => ({
        inventoryItemId: item.id,
        itemName: item.name,
        unit: item.unit,
        quantityRequested: String(Math.max(1, Number(item.reorderLevel ?? 0) - Number(item.quantity ?? 0))),
        supplierId: item.supplierId ? String(item.supplierId) : "",
        notes: "",
      })),
    );
    setShowDemandDialog(true);
  };

  const bulkCreateDemand = async () => {
    if (demandPlan.length === 0) return;
    setIsBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/inventory/procurement-demand/bulk`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          items: demandPlan.map((row) => ({
            inventoryItemId: row.inventoryItemId,
            quantityRequested: Number(row.quantityRequested),
            supplierId: row.supplierId ? Number(row.supplierId) : undefined,
            notes: row.notes || undefined,
          })),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Bulk demand creation failed.");
      toast({ title: "Bulk demand created", description: `${json?.created?.length ?? demandPlan.length} items sent to procurement.` });
      clearSelection();
      setShowDemandDialog(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Bulk demand failed", description: e?.message || "Try again." });
    } finally {
      setIsBusy(false);
    }
  };

  const uploadInventoryImages = async (itemId) => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.accept = "image/*";
    fileInput.onchange = async (ev) => {
      const files = Array.from(ev.target.files ?? []);
      if (files.length === 0) return;
      setIsBusy(true);
      const form = new FormData();
      files.forEach((file) => form.append("images", file));
      try {
        const response = await fetch(`${API_BASE}/api/images/inventory/${itemId}/bulk`, {
          method: "POST",
          headers: authHeaders,
          body: form,
        });
        if (!response.ok) throw new Error("Image upload failed.");
        toast({ title: "Images uploaded", description: `${files.length} image(s) attached.` });
        queryClient.invalidateQueries({ queryKey: ["images", "inventory"] });
        queryClient.invalidateQueries({ queryKey: ["images", "inventory", itemId] });
      } catch (e) {
        toast({ variant: "destructive", title: "Upload failed", description: e?.message || "Try again." });
      } finally {
        setIsBusy(false);
      }
    };
    fileInput.click();
  };

  const handleAddInventory = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/inventory`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newItem.name,
          type: newItem.type,
          unit: newItem.unit,
          quantity: Number(newItem.quantity),
          reorderLevel: Number(newItem.reorderLevel),
          unitCost: Number(newItem.unitCost),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Failed to add inventory item.");
      toast({ title: "Inventory item added", description: `${newItem.name} is now in stock.` });
      setShowAddDialog(false);
      setNewItem({ name: "", type: "raw_material", unit: "pcs", quantity: "0", reorderLevel: "0", unitCost: "0" });
      refetch();
    } catch (err) {
      toast({ variant: "destructive", title: "Add item failed", description: err?.message || "Try again." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Inventory"
        description="Track stock levels, valuation, and reorder risk in one place."
        actions={(
          <>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create inventory item</DialogTitle>
                </DialogHeader>
                <form className="space-y-3" onSubmit={handleAddInventory}>
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={newItem.name} onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} required />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Type</Label>
                      <Select value={newItem.type} onValueChange={(value) => setNewItem((p) => ({ ...p, type: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="raw_material">Raw material</SelectItem>
                          <SelectItem value="finished_goods">Finished goods</SelectItem>
                          <SelectItem value="work_in_progress">Work in progress</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Unit</Label>
                      <Input value={newItem.unit} onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))} required />
                    </div>
                    <div className="space-y-1">
                      <Label>Quantity</Label>
                      <Input type="number" min="0" value={newItem.quantity} onChange={(e) => setNewItem((p) => ({ ...p, quantity: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Reorder level</Label>
                      <Input type="number" min="0" value={newItem.reorderLevel} onChange={(e) => setNewItem((p) => ({ ...p, reorderLevel: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Unit cost</Label>
                    <Input type="number" min="0" step="0.01" value={newItem.unitCost} onChange={(e) => setNewItem((p) => ({ ...p, unitCost: e.target.value }))} />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Create item"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={showDemandDialog} onOpenChange={setShowDemandDialog}>
              <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Inventory demand plan</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Assign supplier and quantity per item, then create procurement demand in one action.
                  </p>
                  <div className="space-y-2">
                    {demandPlan.map((row, idx) => (
                      <div key={row.inventoryItemId} className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-12">
                        <div className="md:col-span-4">
                          <Label className="text-xs">Item</Label>
                          <p className="text-sm font-medium">{row.itemName}</p>
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Qty</Label>
                          <Input
                            type="number"
                            min="1"
                            value={row.quantityRequested}
                            onChange={(e) => setDemandPlan((prev) => prev.map((r, i) => (i === idx ? { ...r, quantityRequested: e.target.value } : r)))}
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-xs">Unit</Label>
                          <Input value={row.unit || "—"} disabled />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-xs">Supplier</Label>
                          <Select
                            value={row.supplierId || "__auto__"}
                            onValueChange={(value) => setDemandPlan((prev) => prev.map((r, i) => (i === idx ? { ...r, supplierId: value === "__auto__" ? "" : value } : r)))}
                          >
                            <SelectTrigger><SelectValue placeholder="Auto assign" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__auto__">Auto assign</SelectItem>
                              {suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-12">
                          <Label className="text-xs">Notes</Label>
                          <Input
                            value={row.notes}
                            onChange={(e) => setDemandPlan((prev) => prev.map((r, i) => (i === idx ? { ...r, notes: e.target.value } : r)))}
                            placeholder="Alternative / stock note for supplier"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDemandDialog(false)}>Cancel</Button>
                  <Button onClick={bulkCreateDemand} disabled={isBusy}>{isBusy ? "Creating..." : "Create inventory demand"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <ModuleActionsMenu
              label="Actions"
              items={[
                {
                  label: "Add inventory",
                  icon: Plus,
                  onSelect: () => setShowAddDialog(true),
                },
                {
                  label: "Image gallery",
                  icon: Images,
                  onSelect: () => setShowGallery(true),
                },
                {
                  label: "Import CSV",
                  icon: Upload,
                  onSelect: () => csvInputRef.current?.click(),
                },
                {
                  label: "Export CSV",
                  icon: Download,
                  onSelect: async () => {
                    try {
                      await exportInventoryCsv();
        }
        catch (e) {
                      toast({ variant: "destructive", title: "Export failed", description: e?.message });
                    }
                  },
                },
                {
                  label: "Download template",
                  icon: FileDown,
                  onSelect: async () => {
                    try {
                      await downloadTemplate();
        }
        catch (e) {
                      toast({ variant: "destructive", title: "Template failed", description: e?.message });
                    }
                  },
                },
                {
                  label: "View analytics",
                  icon: LineChart,
                  separatorBefore: true,
                  onSelect: () => setInsightsOpen(true),
                },
              ]}
            />
            <ModuleInsightsDrawer
              moduleName="inventory"
              title="Inventory Analytics"
              reportId="inventory-summary"
              filters={{ type: typeFilter }}
              hideTrigger
              open={insightsOpen}
              onOpenChange={setInsightsOpen}
            />
            <Dialog open={showGallery} onOpenChange={setShowGallery}>
              <DialogContent className={MODULE_GALLERY_DIALOG_CONTENT_CLASS}>
                <DialogHeader className={MODULE_GALLERY_DIALOG_HEADER_CLASS}>
                  <DialogTitle className={MODULE_GALLERY_DIALOG_TITLE_CLASS}>Inventory gallery</DialogTitle>
                </DialogHeader>
                <div className={MODULE_GALLERY_DIALOG_BODY_CLASS}>
                  <ModuleGallery
                    entityType="inventory"
                    isLoading={galleryImagesLoading}
                    images={allImages.filter((img) => inventory.some((row) => row.id === img.entityId))}
                    canDelete={canManageImages}
                    canUpload={canManageImages}
                    entityIds={inventory.map((row) => row.id)}
                    entityLabels={Object.fromEntries(inventory.map((row) => [row.id, row.name]))}
                    emptyListHint="No inventory items yet. Create items first."
                  />
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={imagePanelItem != null} onOpenChange={(open) => !open && setImagePanelItem(null)}>
              <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    Images — {imagePanelItem?.name ?? "Item"}
                  </DialogTitle>
                </DialogHeader>
                {imagePanelItem ? (
                  <RecordImagePanel
                    entityType="inventory"
                    entityId={imagePanelItem.id}
                    canUpload={canManageImages}
                    canDelete={canManageImages}
                  />
                ) : null}
              </DialogContent>
            </Dialog>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const result = await importInventoryCsv(file);
                  toast({ title: "Import complete", description: `${result?.created ?? 0} created, ${result?.updated ?? 0} updated.` });
                  refetch();
                } catch (err) {
                  toast({ variant: "destructive", title: "Import failed", description: err?.message || "Try again." });
                } finally {
                  e.target.value = "";
                }
              }}
            />
          </>
        )}
      />

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Inventory List</CardTitle>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search item or unit..."
                aria-label="Search inventory"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="raw_material">Raw material</SelectItem>
                <SelectItem value="finished_goods">Finished goods</SelectItem>
                <SelectItem value="work_in_progress">Work in progress</SelectItem>
              </SelectContent>
            </Select>
            <div className="md:col-span-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
              <span className="text-xs text-muted-foreground">
                Selected: {selectedRows.length}
              </span>
              <Button size="sm" variant="secondary" disabled={selectedRows.length === 0 || isBusy} onClick={openBulkDemandDialog}>
                Inventory demand
              </Button>
              <Button size="sm" variant="ghost" disabled={selectedRows.length === 0 || isBusy} onClick={clearSelection}>
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-4 sm:p-6">
              <Alert variant="destructive">
                <AlertTitle>Could not load inventory records</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    {error && typeof error === "object" && "message" in error
                      ? String(error.message)
                      : "Inventory API request failed."}
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : null}
          {!isError ? (
            <ModuleTableState isLoading={isLoading} isEmpty={rows.length === 0} emptyMessage="No inventory records found.">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox checked={allSelected} onCheckedChange={toggleSelectVisible} aria-label="Select all inventory rows" />
                      </TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">Image</span>
                      </TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="hidden md:table-cell">Type</TableHead>
                      <TableHead className="hidden md:table-cell">Unit</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="hidden text-right lg:table-cell">Reorder</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Unit cost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[52px] text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((item) => {
                      const qty = Number(item.quantity ?? 0);
                      const reorder = Number(item.reorderLevel ?? 0);
                      const status = qty <= 0 ? "out" : qty <= reorder ? "low" : "healthy";
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.includes(item.id)}
                              onCheckedChange={(checked) => toggleSelect(item.id, checked)}
                              aria-label={`Select ${item.name}`}
                            />
                          </TableCell>
                          <TableCell className="w-12">
                            <RecordAvatar entityType="inventory" entityId={item.id} className="h-9 w-9 sm:h-10 sm:w-10" />
                          </TableCell>
                          <TableCell className="max-w-[9rem] font-medium sm:max-w-[14rem] md:max-w-[18rem]">
                            <span className="line-clamp-2 break-words">{item.name}</span>
                          </TableCell>
                          <TableCell className="hidden capitalize text-muted-foreground md:table-cell">
                            {String(item.type ?? "").replaceAll("_", " ")}
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">{item.unit || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{qty.toLocaleString()}</TableCell>
                          <TableCell className="hidden text-right tabular-nums lg:table-cell">{reorder.toLocaleString()}</TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">{format(Number(item.unitCost ?? 0))}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                status === "out"
                                  ? "border-red-300 bg-red-100 text-red-700"
                                  : status === "low"
                                    ? "border-amber-300 bg-amber-100 text-amber-700"
                                    : "border-emerald-300 bg-emerald-100 text-emerald-700"
                              }
                            >
                              {status === "out" ? "Out of stock" : status === "low" ? "Low stock" : "Healthy"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" aria-label={`Actions for ${item.name}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[11rem]">
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    await createDemandFor(item);
                                    toast({ title: "Demand created", description: `${item.name} added to procurement demand.` });
                                  } catch (e) {
                                    toast({ variant: "destructive", title: "Demand failed", description: e?.message || "Try again." });
                                  }
                                }}>
                                  Create demand
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setImagePanelItem(item)}>
                                  <Images className="mr-2 h-4 w-4" />
                                  Manage images
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!canManageImages}
                                  onClick={() => canManageImages && uploadInventoryImages(item.id)}
                                >
                                  <ImagePlus className="mr-2 h-4 w-4" />
                                  Quick upload (bulk)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Need supplier quote for ${item.name}`)}`, "_blank")}>
                                  Contact supplier
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </ModuleTableState>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
