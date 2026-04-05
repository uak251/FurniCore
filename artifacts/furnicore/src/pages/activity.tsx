import { useListActivityLogs } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Package, Users, Truck, FileText, Hammer, Banknote, Receipt, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const MODULE_ICONS: Record<string, any> = {
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
  CREATE: "bg-green-100 text-green-800",
  UPDATE: "bg-blue-100 text-blue-800",
  DELETE: "bg-red-100 text-red-800",
  LOCK: "bg-amber-100 text-amber-800",
  APPROVE: "bg-purple-100 text-purple-800",
  PAY: "bg-teal-100 text-teal-800",
  LOGIN: "bg-gray-100 text-gray-800",
  LOGOUT: "bg-gray-100 text-gray-800",
};

export default function ActivityPage() {
  const { data: logs, isLoading } = useListActivityLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity Logs</h1>
        <p className="text-muted-foreground">Full audit trail of all system actions</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : (logs ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Activity className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">No activity recorded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(logs ?? []).map((log: any) => {
            const Icon = MODULE_ICONS[log.module?.toLowerCase()] || Activity;
            const actionColor = ACTION_COLORS[log.action?.toUpperCase()] || "bg-gray-100 text-gray-800";
            return (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-xs font-medium", actionColor)}>{log.action}</Badge>
                        <Badge variant="outline" className="text-xs capitalize">{log.module}</Badge>
                        <span className="text-sm font-medium">{log.userName || "System"}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">{log.description}</p>
                    </div>
                    <div className="text-xs text-muted-foreground flex-shrink-0 text-right">
                      {new Date(log.createdAt).toLocaleString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
