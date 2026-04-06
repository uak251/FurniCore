import { useState, useMemo, useEffect } from "react";
import {
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { TableToolbar } from "@/components/data-table/TableToolbar";
import { TablePaginationBar } from "@/components/data-table/TablePaginationBar";
import { filterAndSortRows, paginateRows, exportRowsToCsv, type SortDir } from "@/lib/table-helpers";

const TYPE_ICONS: Record<string, typeof Info> = {
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
  error: AlertTriangle,
};

const TYPE_COLORS: Record<string, string> = {
  warning: "text-amber-500",
  info: "text-blue-500",
  success: "text-green-600",
  error: "text-destructive",
};

const TABLE_ID = "notifications";

export default function NotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [readFilter, setReadFilter] = useState("all");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: notifications, isLoading } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

  useEffect(() => {
    setPage(1);
  }, [search, readFilter, sortKey, sortDir, pageSize]);

  const rows = notifications ?? [];

  const sorted = useMemo(() => {
    return filterAndSortRows(rows, {
      search,
      match: (row: any, q: string) => {
        const qn = q.toLowerCase();
        const textMatch =
          !qn ||
          String(row.title ?? "").toLowerCase().includes(qn) ||
          String(row.message ?? "").toLowerCase().includes(qn);
        if (!textMatch) return false;
        if (readFilter === "unread") return !row.isRead;
        if (readFilter === "read") return row.isRead;
        return true;
      },
      sortKey,
      sortDir,
      getSortValue: (row: any, key: string) => {
        if (key === "createdAt") return new Date(row.createdAt).getTime();
        if (key === "title") return String(row.title ?? "");
        if (key === "type") return String(row.type ?? "");
        return row.isRead ? 1 : 0;
      },
    });
  }, [rows, search, readFilter, sortKey, sortDir]);

  const { pageRows, total, totalPages, page: safePage } = useMemo(
    () => paginateRows(sorted, page, pageSize),
    [sorted, page, pageSize],
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const unreadCount = rows.filter((n) => !n.isRead).length;

  const handleMarkRead = async (id: number) => {
    try {
      await markRead.mutateAsync({ id });
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAll.mutateAsync();
      toast({ title: "All notifications marked as read" });
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const exportCsv = () => {
    const headers = ["title", "message", "type", "isRead", "createdAt"];
    const data = sorted.map((n: any) => ({
      title: n.title,
      message: (n.message || "").replace(/\r?\n/g, " "),
      type: n.type,
      isRead: n.isRead ? "Yes" : "No",
      createdAt: new Date(n.createdAt).toISOString(),
    }));
    exportRowsToCsv(`furnicore-notifications-${new Date().toISOString().slice(0, 10)}`, headers, data);
    toast({ title: "Export started", description: `${data.length} rows exported.` });
  };

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground" role="status">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
              : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAll} disabled={markAll.isPending}>
            <CheckCheck className="mr-2 h-4 w-4" aria-hidden />
            Mark all read
          </Button>
        )}
      </div>

      <TableToolbar
        id={TABLE_ID}
        entityLabel="notifications"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search title or message…"
        filterLabel="Read status"
        filterValue={readFilter}
        onFilterChange={setReadFilter}
        filterOptions={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread only" },
          { value: "read", label: "Read only" },
        ]}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={[
          { value: "createdAt", label: "Date" },
          { value: "title", label: "Title" },
          { value: "type", label: "Type" },
          { value: "isRead", label: "Read status" },
        ]}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onExportCsv={exportCsv}
        exportDisabled={sorted.length === 0}
        resultsText={
          total === 0
            ? "No matching notifications"
            : `Showing ${from}–${to} of ${total} matching notifications`
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : pageRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Bell className="mb-4 h-12 w-12" aria-hidden />
          <p className="text-lg font-medium">No notifications</p>
          <p className="text-sm">You&apos;re all caught up.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2" aria-label="Notification list">
            {pageRows.map((n: any) => {
              const Icon = TYPE_ICONS[n.type] || Info;
              const color = TYPE_COLORS[n.type] || "text-muted-foreground";
              return (
                <li key={n.id}>
                  <Card
                    className={cn(
                      "transition-colors",
                      !n.isRead && "border-l-4 border-l-primary bg-muted/30",
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={cn("mt-0.5 shrink-0", color)} aria-hidden>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2
                              className={cn(
                                "text-sm font-semibold",
                                !n.isRead ? "text-foreground" : "text-muted-foreground",
                              )}
                            >
                              {n.title}
                            </h2>
                            {!n.isRead && (
                              <Badge className="shrink-0" variant="default">
                                New
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <time className="text-xs text-muted-foreground/80" dateTime={n.createdAt}>
                              {new Date(n.createdAt).toLocaleString()}
                            </time>
                            {!n.isRead && (
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-xs"
                                onClick={() => handleMarkRead(n.id)}
                              >
                                Mark as read
                              </Button>
                            )}
                          </div>
                        </div>
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
