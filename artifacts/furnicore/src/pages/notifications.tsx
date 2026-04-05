import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, any> = {
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
  error: AlertTriangle,
};

const TYPE_COLORS: Record<string, string> = {
  warning: "text-amber-500",
  info: "text-blue-500",
  success: "text-green-500",
  error: "text-destructive",
};

export default function NotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listNotifications"] });

  const unreadCount = (notifications ?? []).filter((n: any) => !n.isRead).length;

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">{unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}` : "All caught up"}</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAll} disabled={markAll.isPending}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark All Read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : (notifications ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Bell className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">No notifications</p>
          <p className="text-sm">You're all caught up!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(notifications ?? []).map((n: any) => {
            const Icon = TYPE_ICONS[n.type] || Info;
            const color = TYPE_COLORS[n.type] || "text-muted-foreground";
            return (
              <Card
                key={n.id}
                className={cn("cursor-pointer transition-colors", !n.isRead && "border-l-4 border-l-primary bg-muted/30")}
                onClick={() => !n.isRead && handleMarkRead(n.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5 flex-shrink-0", color)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className={cn("text-sm font-semibold", !n.isRead && "text-foreground")}>{n.title}</h3>
                        {!n.isRead && <Badge className="flex-shrink-0" variant="default">New</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                      <p className="text-xs text-muted-foreground/70 mt-1.5">
                        {new Date(n.createdAt).toLocaleString()}
                        {!n.isRead && <span className="ml-2 text-primary">· Click to mark as read</span>}
                      </p>
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
