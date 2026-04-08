import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useListNotifications, useMarkNotificationRead } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { socket, connectSocket, disconnectSocket } from "@/lib/socket";
import type { LowStockPayload } from "@/lib/socket";

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

const MAX_PREVIEW = 8;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: notifications, isLoading } = useListNotifications();
  const markRead = useMarkNotificationRead();

  // Real-time low-stock alerts via Socket.io
  useEffect(() => {
    connectSocket();

    const handleLowStock = (item: LowStockPayload) => {
      toast({
        variant: "destructive",
        title: "Low Stock Alert",
        description: `${item.name} — only ${item.quantity} ${item.quantity === 1 ? "unit" : "units"} remaining (reorder at ${item.reorderLevel}).`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    };

    socket.on("low-stock", handleLowStock);

    return () => {
      socket.off("low-stock", handleLowStock);
      disconnectSocket();
    };
  }, [queryClient, toast]);

  const list = notifications ?? [];
  const unreadCount = list.filter((n) => !n.isRead).length;
  const preview = list.slice(0, MAX_PREVIEW);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

  const handleMarkOne = async (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await markRead.mutateAsync({ id });
      invalidate();
    } catch {
      /* toast optional */
    }
  };

  const label =
    unreadCount === 0
      ? "Notifications, no unread messages"
      : `Notifications, ${unreadCount} unread`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative shrink-0"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
              aria-hidden
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(100vw-2rem,22rem)] p-0"
        align="end"
        sideOffset={8}
        id="notifications-popover"
      >
        <div className="border-b px-3 py-2">
          <h2 className="text-sm font-semibold leading-none">Notifications</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {isLoading
              ? "Loading…"
              : unreadCount === 0
                ? "You're all caught up"
                : `${unreadCount} unread`}
          </p>
        </div>
        <ScrollArea className="h-[min(320px,50vh)]">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading notifications…</p>
          ) : preview.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <ul className="divide-y" role="list">
              {preview.map((n) => {
                const Icon = TYPE_ICONS[n.type] || Info;
                const color = TYPE_COLORS[n.type] || "text-muted-foreground";
                return (
                  <li key={n.id}>
                    <div
                      className={cn(
                        "flex gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
                        !n.isRead && "bg-muted/40",
                      )}
                    >
                      <div className={cn("mt-0.5 shrink-0", color)} aria-hidden>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug line-clamp-2">{n.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {n.message}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <time
                            className="text-[10px] text-muted-foreground"
                            dateTime={n.createdAt}
                          >
                            {new Date(n.createdAt).toLocaleString()}
                          </time>
                          {!n.isRead && (
                            <button
                              type="button"
                              className="text-[10px] font-medium text-primary underline-offset-2 hover:underline"
                              onClick={(e) => handleMarkOne(n.id, e)}
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button variant="ghost" className="w-full justify-center text-sm" asChild>
            <Link href="/notifications" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
