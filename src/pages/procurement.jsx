import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { erpApi } from "@/lib/erp-api";
import { useCurrency } from "@/lib/currency";
import { GitCompare } from "lucide-react";

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.rows)) return payload.rows;
  }
  return [];
}

function rateComparisonGroups(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.groups)) return payload.groups;
  if (Array.isArray(payload.data?.groups)) return payload.data.groups;
  return [];
}

const WF_LABEL = {
  legacy: "Legacy",
  draft: "Draft",
  pending_pm: "Pending PM",
  pending_finance: "Pending finance",
  approved: "Approved",
  rejected: "Rejected",
};

/** Quote lifecycle (lock/approve/pay) vs procurement workflow stage */
function supplyChainLabel(q) {
  const wf = q.workflowStage ?? "legacy";
  if (wf === "rejected") return "Rejected (workflow)";
  if (wf === "approved") return `Approved — quote ${String(q.status ?? "").toUpperCase()}`;
  if (wf === "pending_pm") return `PM review — quote ${String(q.status ?? "").toUpperCase()}`;
  if (wf === "pending_finance") return `Finance review — quote ${String(q.status ?? "").toUpperCase()}`;
  if (wf === "draft") return `Draft — quote ${String(q.status ?? "").toUpperCase()}`;
  return String(q.status ?? "—");
}

function workflowBadgeVariant(wf) {
  if (wf === "rejected") return "destructive";
  if (wf === "approved") return "default";
  if (wf === "pending_pm" || wf === "pending_finance") return "secondary";
  return "outline";
}

export default function ProcurementPage() {
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();
  const qc = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const [selected, setSelected] = useState(() => new Set());

  const quotesQ = useQuery({
    queryKey: ["erp-quotes-all"],
    queryFn: () => erpApi("/api/quotes/workflow-queue"),
  });
  const comparisonQ = useQuery({
    queryKey: ["erp-quotes-rate-comparison"],
    queryFn: () => erpApi("/api/quotes/rate-comparison"),
  });

  const submitM = useMutation({
    mutationFn: (id) => erpApi(`/api/quotes/${id}/workflow/submit`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp-quotes-all"] });
      qc.invalidateQueries({ queryKey: ["erp-quotes-rate-comparison"] });
      toast({ title: "Submitted for purchase manager review" });
    },
    onError: (e) => toast({ title: "Submit failed", description: String(e.message), variant: "destructive" }),
  });

  const canSubmit = ["admin", "manager", "accountant", "employee", "inventory_manager", "sales_manager"].includes(role);

  const rows = normalizeRows(quotesQ.data);
  const wfRows = rows.filter((q) => q.workflowStage && q.workflowStage !== "legacy");
  const groups = rateComparisonGroups(comparisonQ.data);

  const draftSelectable = useMemo(
    () => wfRows.filter((q) => q.workflowStage === "draft" && canSubmit),
    [wfRows, canSubmit],
  );

  const toggleOne = (id, checked) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllDrafts = (checked) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(draftSelectable.map((q) => q.id)));
  };

  const bulkSubmit = async () => {
    const ids = [...selected].filter((id) => draftSelectable.some((q) => q.id === id));
    if (ids.length === 0) {
      toast({ title: "Nothing to submit", description: "Select draft quotes you are allowed to submit.", variant: "destructive" });
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await erpApi(`/api/quotes/${id}/workflow/submit`, { method: "POST" });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setSelected(new Set());
    await qc.invalidateQueries({ queryKey: ["erp-quotes-all"] });
    await qc.invalidateQueries({ queryKey: ["erp-quotes-rate-comparison"] });
    toast({
      title: "Bulk submit finished",
      description: `${ok} submitted${fail ? `, ${fail} failed` : ""}.`,
      variant: fail ? "destructive" : "default",
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Supplier quote management</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Create quotes under Quotes, then submit drafts into the approval path: Draft → Purchase manager → Finance
          (when required) → Approved. Demands from Inventory appear as draft workflow quotes. Rate comparison shows all
          bids per item; rejected workflow rows are labeled clearly and are not treated as active supply options.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" aria-hidden />
            Supplier rate comparison
          </CardTitle>
          <CardDescription>Grouped by inventory item — bidding and sourcing.</CardDescription>
        </CardHeader>
        <CardContent>
          {comparisonQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-6">
              {groups.map((g) => (
                <div key={g.inventoryItemId} className="rounded-lg border p-4">
                  <p className="font-medium">{g.itemName || `Item #${g.inventoryItemId}`}</p>
                  <div className="mt-2 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Supplier</TableHead>
                          <TableHead className="text-right">Unit price</TableHead>
                          <TableHead>Workflow</TableHead>
                          <TableHead>Supply chain status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.quotes.map((q) => {
                          const wf = q.workflowStage ?? "legacy";
                          return (
                            <TableRow key={q.id}>
                              <TableCell>{q.supplierName}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtMoney(Number(q.unitPrice ?? 0))}</TableCell>
                              <TableCell>
                                <Badge variant={workflowBadgeVariant(wf)}>{WF_LABEL[wf] ?? wf}</Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{supplyChainLabel(q)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comparable quotes with inventory items yet.</p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Workflow queue</CardTitle>
            <CardDescription>Draft and in-review supplier quotes (excludes legacy lock/approve flow).</CardDescription>
          </div>
          {canSubmit && draftSelectable.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => selectAllDrafts(true)}>
                Select all drafts
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => selectAllDrafts(false)}>
                Clear
              </Button>
              <Button type="button" size="sm" disabled={submitM.isPending || selected.size === 0} onClick={() => void bulkSubmit()}>
                Submit selected ({selected.size})
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {quotesQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div>
              <div className="space-y-2 md:hidden">
                {wfRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No workflow quotes yet — inventory demand or manual draft quotes will appear here.
                  </p>
                ) : (
                  wfRows.map((q) => (
                    <div key={q.id} className="space-y-2 rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        {q.workflowStage === "draft" && canSubmit ? (
                          <Checkbox
                            checked={selected.has(q.id)}
                            onCheckedChange={(c) => toggleOne(q.id, Boolean(c))}
                            aria-label={`Select quote ${q.id}`}
                          />
                        ) : (
                          <span className="w-6" />
                        )}
                        <p className="flex-1 font-medium">{q.supplierName}</p>
                        <Badge variant="secondary">{q.source === "inventory_demand" ? "Inventory demand" : "Manual quote"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Quote #{q.id} · {q.itemName ?? "—"}
                      </p>
                      <p className="text-sm">
                        Total: {fmtMoney(Number(q.totalPrice ?? 0))}
                      </p>
                      <Badge variant={q.workflowStage === "rejected" ? "destructive" : "outline"}>
                        {WF_LABEL[q.workflowStage] ?? q.workflowStage}
                      </Badge>
                      <p className="text-xs text-muted-foreground">{supplyChainLabel(q)}</p>
                      <div>
                        {q.workflowStage === "draft" && canSubmit ? (
                          <Button size="sm" disabled={submitM.isPending} onClick={() => submitM.mutate(q.id)}>
                            Submit
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {canSubmit ? <TableHead className="w-10" /> : null}
                      <TableHead>ID</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Supply status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="w-[140px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wfRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={canSubmit ? 9 : 8} className="text-muted-foreground">
                          No workflow quotes yet — inventory demand or manual draft quotes will appear here.
                        </TableCell>
                      </TableRow>
                    ) : (
                      wfRows.map((q) => (
                        <TableRow key={q.id}>
                          {canSubmit ? (
                            <TableCell>
                              {q.workflowStage === "draft" ? (
                                <Checkbox
                                  checked={selected.has(q.id)}
                                  onCheckedChange={(c) => toggleOne(q.id, Boolean(c))}
                                  aria-label={`Select quote ${q.id}`}
                                />
                              ) : null}
                            </TableCell>
                          ) : null}
                          <TableCell className="tabular-nums">{q.id}</TableCell>
                          <TableCell>{q.supplierName}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{q.itemName ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(Number(q.totalPrice ?? 0))}</TableCell>
                          <TableCell>
                            <Badge variant={q.workflowStage === "rejected" ? "destructive" : "outline"}>
                              {WF_LABEL[q.workflowStage] ?? q.workflowStage}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[220px] text-xs text-muted-foreground">{supplyChainLabel(q)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{q.source === "inventory_demand" ? "Inventory demand" : "Manual quote"}</Badge>
                          </TableCell>
                          <TableCell>
                            {q.workflowStage === "draft" && canSubmit ? (
                              <Button size="sm" disabled={submitM.isPending} onClick={() => submitM.mutate(q.id)}>
                                Submit
                              </Button>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
