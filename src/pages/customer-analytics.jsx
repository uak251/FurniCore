import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCustomerInvoices, useCustomerOrders } from "@/hooks/use-customer-portal";
import { PackageCheck, ReceiptText, History, Gauge } from "lucide-react";
import { useCurrency } from "@/lib/currency";

export default function CustomerAnalyticsPage() {
  const { data: orders = [] } = useCustomerOrders();
  const { data: invoices = [] } = useCustomerInvoices();
  const { format: fmt } = useCurrency();

  const activeOrders = orders.filter((o) => !["delivered", "cancelled"].includes(o.status));
  const deliveredOrders = orders.filter((o) => o.status === "delivered");
  const inProgressOrders = orders.filter((o) => ["confirmed", "in_production", "quality_check", "shipped"].includes(o.status));
  const unpaidInvoices = invoices.filter((i) => !["paid", "cancelled"].includes(i.status));
  const outstandingAmount = unpaidInvoices.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="saas-grid-4">
        <AnalyticsCard
          icon={PackageCheck}
          title="Order Tracking"
          value={String(activeOrders.length)}
          helper="Active orders currently in progress"
        />
        <AnalyticsCard
          icon={ReceiptText}
          title="Payment Schedule"
          value={fmt(outstandingAmount)}
          helper={`${unpaidInvoices.length} unpaid invoice(s)`}
        />
        <AnalyticsCard
          icon={History}
          title="Order History"
          value={String(deliveredOrders.length)}
          helper="Completed orders"
        />
        <AnalyticsCard
          icon={Gauge}
          title="Work Status"
          value={String(inProgressOrders.length)}
          helper="Orders in production/shipping stages"
        />
      </div>

      <Card className="saas-surface">
        <CardHeader>
          <CardTitle className="text-lg">Order Tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active orders right now.</p>
          ) : (
            activeOrders.slice(0, 6).map((order) => (
              <div key={order.id} className="rounded-lg border bg-card p-3 transition hover:shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="max-w-full truncate font-mono text-sm font-semibold">{order.orderNumber}</p>
                  <Badge variant="secondary" className="capitalize">
                    {String(order.status).replace("_", " ")}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {order.items?.length ?? 0} item(s) · {new Date(order.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="saas-surface">
        <CardHeader>
          <CardTitle className="text-lg">Payment Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {unpaidInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">All invoices are settled.</p>
          ) : (
            unpaidInvoices.slice(0, 8).map((invoice) => (
              <div key={invoice.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="max-w-full truncate font-mono text-sm font-semibold">{invoice.invoiceNumber}</p>
                  <p className="font-semibold">{fmt(invoice.totalAmount)}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Due: {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "Not set"}
                </p>
              </div>
            ))
          )}
          <Separator />
          <p className="text-sm font-medium">Outstanding Total: {fmt(outstandingAmount)}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function AnalyticsCard({ icon: Icon, title, value, helper }) {
  return (
    <Card className="saas-surface saas-card-hover group border-border/70">
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
        <span className="rounded-lg bg-primary/10 p-2 text-primary transition group-hover:bg-primary/20">
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  );
}

