import { ModuleInsightsDrawer } from "@/components/analytics/ModuleInsightsDrawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { LineChart } from "lucide-react";
import { ModulePageHeader } from "@/components/module/ModulePageHeader";
import { ModuleActionsMenu } from "@/components/module/ModuleActionsMenu";
import { ModuleTableState } from "@/components/module/ModuleTableState";
import { useAccountingPageModel } from "@/hooks/modules/useAccountingPageModel";

export default function AccountingPage() {
  const { format } = useCurrency();
  const { query, setQuery, type, setType, status, setStatus, rows, isLoading, isError, error, refetch } = useAccountingPageModel();

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Accounting"
        description="Cashbook overview with clean filters and readable financial status."
        actions={(
          <>
            <ModuleActionsMenu
              label="Actions"
              items={[
                {
                  label: "View analytics",
                  icon: LineChart,
                  onSelect: () => setInsightsOpen(true),
                },
              ]}
            />
            <ModuleInsightsDrawer
              moduleName="accounting"
              title="Accounting Analytics"
              reportId="accounting-overview"
              filters={{ type, status }}
              hideTrigger
              open={insightsOpen}
              onOpenChange={setInsightsOpen}
            />
          </>
        )}
      />

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Cashbook</CardTitle>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search description or category..."
              aria-label="Search transactions"
            />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">{String(error?.message ?? "Failed to load transactions.")}</p>
              <Button variant="outline" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : (
            <ModuleTableState isLoading={isLoading} isEmpty={rows.length === 0} emptyMessage="No transactions found.">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-muted-foreground">{tx.transactionDate?.slice(0, 10) || "—"}</TableCell>
                      <TableCell className="font-medium">{tx.description || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{tx.category || "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={tx.type === "income" ? "default" : "secondary"}
                          className={tx.type === "income" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                        >
                          {tx.type || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {tx.type === "expense" ? "-" : "+"}
                        {format(Number(tx.amount ?? 0))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{tx.status || "pending"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </ModuleTableState>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
