import { Search } from "lucide-react";
import { ModuleInsightsDrawer } from "@/components/analytics/ModuleInsightsDrawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrency } from "@/lib/currency";
import { ModulePageHeader } from "@/components/module/ModulePageHeader";
import { ModuleTableState } from "@/components/module/ModuleTableState";
import { useInventoryPageModel } from "@/hooks/modules/useInventoryPageModel";

export default function InventoryPage() {
  const { format } = useCurrency();
  const { query, setQuery, typeFilter, setTypeFilter, rows, isLoading, isError, error, refetch } = useInventoryPageModel();

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Inventory"
        description="Track stock levels, valuation, and reorder risk in one place."
        actions={(
          <ModuleInsightsDrawer
            moduleName="inventory"
            title="Inventory Analytics"
            reportId="inventory-summary"
            filters={{ type: typeFilter }}
          />
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
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Reorder</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((item) => {
                      const qty = Number(item.quantity ?? 0);
                      const reorder = Number(item.reorderLevel ?? 0);
                      const status = qty <= 0 ? "out" : qty <= reorder ? "low" : "healthy";
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="capitalize text-muted-foreground">{String(item.type ?? "").replaceAll("_", " ")}</TableCell>
                          <TableCell className="text-muted-foreground">{item.unit || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{qty.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{reorder.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{format(Number(item.unitCost ?? 0))}</TableCell>
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
