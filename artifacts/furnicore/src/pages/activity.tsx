import { useState, useMemo, useEffect } from "react";
import { useListActivityLogs } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Package,
  Users,
  Truck,
  FileText,
  Hammer,
  Banknote,
  Receipt,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";
import { useToast } from "@/hooks/use-toast";

const MODULE_ICONS: Record<string, typeof Activity> = {
  products: Package,
  inventory: Package,
  suppliers: Truck,
  quotes: FileText,
  manufacturing: Hammer,
  hr: Users,
  employees: Users,
  payroll: Banknote,
  accounting: Receipt,
  users: Users,
  settings: Settings,
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-100",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100",
  LOCK: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100",
  APPROVE: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-100",
  PAY: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-100",
  LOGIN: "bg-gray-100 text-gray-800 dark:bg-muted dark:text-foreground",
  LOGOUT: "bg-gray-100 text-gray-800 dark:bg-muted dark:text-foreground",
};

const TABLE_ID = "activity";

const MODULE_OPTIONS = [
  { value: "all", label: "All modules" },
  { value: "products", label: "Products" },
  { value: "inventory", label: "Inventory" },
  { value: "suppliers", label: "Suppliers" },
  { value: "quotes", label: "Quotes" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "hr", label: "HR" },
  { value: "payroll", label: "Payroll" },
  { value: "accounting", label: "Accounting" },
  { value: "users", label: "Users" },
];

export default function ActivityPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const { data: logs, isLoading } = useListActivityLogs();

  useEffect(() => {
    setPage(1);
  }, [search, moduleFilter, sortKey, sortDir, pageSize]);

  const rows = logs ?? [];

  const sorted = useMemo(() => {
    return filterAndSortRows(rows, {
      search,
      match: (row: any, q: string) => {
        const qn = q.toLowerCase();
        const textMatch =
          !qn ||
          String(row.description ?? "").toLowerCase().includes(qn) ||
          String(row.userName ?? "").toLowerCase().includes(qn) ||
          String(row.action ?? "").toLowerCase().includes(qn);
        if (!textMatch) return false;
        if (moduleFilter === "all") return true;
        return String(row.module ?? "").toLowerCase() === moduleFilter;
      },
      sortKey,
      sortDir,
      getSortValue: (row: any, key: string) => {
        if (key === "createdAt") return new Date(row.createdAt).getTime();
        if (key === "module") return String(row.module ?? "");
        if (key === "action") return String(row.action ?? "");
        if (key === "userName") return String(row.userName ?? "");
        return String(row.description ?? "");
      },
    });
  }, [rows, search, moduleFilter, sortKey, sortDir]);

  const { pageRows, total, totalPages, page: safePage } = useMemo(
    () => paginateRows(sorted, page, pageSize),
    [sorted, page, pageSize],
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const exportCsv = () => {
    const headers = ["createdAt", "userName", "action", "module", "description"];
    const data = sorted.map((log: any) => ({
      createdAt: new Date(log.createdAt).toISOString(),
      userName: log.userName || "System",
      action: log.action,
      module: log.module,
      description: (log.description || "").replace(/\r?\n/g, " "),
    }));
    exportRowsToCsv(`furnicore-activity-${new Date().toISOString().slice(0, 10)}`, headers, data);
    toast({ title: "Export started", description: `${data.length} rows exported.` });
  };

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity log</h1>
        <p className="text-muted-foreground">Audit trail of system actions (filter, sort, export)</p>
      </div>

      <TableToolbar
        id={TABLE_ID}
        entityLabel="activity log"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search description, user, or action…"
        filterLabel="Module"
        filterValue={moduleFilter}
        onFilterChange={setModuleFilter}
        filterOptions={MODULE_OPTIONS}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={[
          { value: "createdAt", label: "Time" },
          { value: "module", label: "Module" },
          { value: "action", label: "Action" },
          { value: "userName", label: "User" },
          { value: "description", label: "Description" },
        ]}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onExportCsv={exportCsv}
        exportDisabled={sorted.length === 0}
        resultsText={
          total === 0 ? "No matching entries" : `Showing ${from}–${to} of ${total} matching entries`
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : pageRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Activity className="mb-4 h-12 w-12" aria-hidden />
          <p className="text-lg font-medium">No activity recorded</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2" aria-label="Activity entries" aria-busy={isLoading}>
            {pageRows.map((log: any) => {
              const Icon = MODULE_ICONS[log.module?.toLowerCase()] || Activity;
              const actionColor =
                ACTION_COLORS[log.action?.toUpperCase()] ||
                "bg-muted text-foreground";
              return (
                <li key={log.id}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"
                          aria-hidden
                        >
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={cn("text-xs font-medium", actionColor)}>{log.action}</Badge>
                            <Badge variant="outline" className="text-xs capitalize">
                              {log.module}
                            </Badge>
                            <span className="text-sm font-medium">{log.userName || "System"}</span>
                          </div>
                          <p className="mt-1 break-words text-sm text-muted-foreground">{log.description}</p>
                        </div>
                        <time
                          className="shrink-0 text-xs text-muted-foreground sm:text-right"
                          dateTime={log.createdAt}
                        >
                          {new Date(log.createdAt).toLocaleString()}
                        </time>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
          <TablePaginationBar
            id={TABLE_ID}
            page={safePage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
