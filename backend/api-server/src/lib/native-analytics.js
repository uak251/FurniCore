import { sql } from "drizzle-orm";
import {
  db,
  inventoryTable,
  transactionsTable,
  attendanceTable,
  customerOrdersTable,
  orderUpdatesTable,
  invoicesTable,
  usersTable,
  supplierQuotesTable,
  manufacturingTasksTable,
  notificationsTable,
  appSettingsTable,
  activityLogsTable,
} from "@workspace/db";
import { logger } from "./logger";

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastMonths(n = 6) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKey(d));
  }
  return out;
}

function varianceRemark(delta, tolerance = 0.01) {
  if (delta > tolerance) return "increased";
  if (delta < -tolerance) return "decreased";
  return "same";
}

async function safe(label, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ label, err: err?.message }, "native_analytics_query_failed");
    return fallback;
  }
}

export async function getInventoryAnalytics() {
  const items = await safe("inventory.items", () => db.select().from(inventoryTable), []);
  const quotes = await safe("inventory.quotes", () => db.select().from(supplierQuotesTable), []);
  const byType = {};
  let low = 0;
  let reorderVarianceTotal = 0;
  let reorderVarianceCount = 0;
  for (const i of items) {
    const t = i.type || "other";
    const qty = Number(i.quantity || 0);
    const reorder = Number(i.reorderLevel || 0);
    byType[t] = (byType[t] || 0) + qty;
    if (qty <= reorder) low += 1;
    if (reorder > 0) {
      reorderVarianceTotal += ((qty - reorder) / reorder) * 100;
      reorderVarianceCount += 1;
    }
  }
  const stockLevels = Object.entries(byType).map(([name, value]) => ({ name, value }));
  const reorderVariance = items.slice(0, 20).map((i) => {
    const qty = Number(i.quantity || 0);
    const reorder = Number(i.reorderLevel || 0);
    const variancePct = reorder > 0 ? +((((qty - reorder) / reorder) * 100).toFixed(2)) : 0;
    return {
      item: i.name,
      variancePct,
      remark: varianceRemark(variancePct),
    };
  });

  const months = lastMonths(6);
  const inflowOutflow = await safe(
    "inventory.inflowOutflow",
    async () => {
      const rows = await db.execute(sql`
        select to_char(created_at, 'YYYY-MM') as month,
               coalesce(sum(case when quantity::numeric > 0 then quantity::numeric else 0 end),0) as inflow,
               coalesce(sum(case when quantity::numeric < 0 then abs(quantity::numeric) else 0 end),0) as outflow
        from inventory
        where created_at >= now() - interval '6 months'
        group by 1
        order by 1
      `);
      const map = Object.fromEntries(rows.rows.map((r) => [r.month, { inflow: Number(r.inflow), outflow: Number(r.outflow) }]));
      return months.map((m) => ({ month: m, inflow: map[m]?.inflow ?? 0, outflow: map[m]?.outflow ?? 0 }));
    },
    months.map((m) => ({ month: m, inflow: 0, outflow: 0 })),
  );

  return {
    module: "inventory",
    charts: [
      { id: "stock-levels", type: "bar", title: "Stock Levels by Type", xKey: "name", yKeys: ["value"], data: stockLevels },
      { id: "inflow-outflow", type: "line", title: "Inventory Inflow vs Outflow", xKey: "month", yKeys: ["inflow", "outflow"], data: inflowOutflow },
      {
        id: "reorder-variance",
        type: "bar",
        title: "Reorder Variance with Supplier Action",
        xKey: "item",
        yKeys: ["variancePct"],
        data: reorderVariance,
        drillTo: { href: "/inventory", queryParam: "search", dataKey: "item" },
        actions: [
          { id: "contact-supplier", label: "Contact Supplier", tone: "secondary", confirm: "Open supplier contact workflow?" },
          { id: "reorder-now", label: "Reorder Now", tone: "default", confirm: "Create a reorder demand now?" },
        ],
      },
    ],
    kpis: [
      { label: "Items", value: items.length },
      { label: "Low Stock", value: low },
      { label: "Avg Reorder Variance %", value: reorderVarianceCount ? +(reorderVarianceTotal / reorderVarianceCount).toFixed(2) : 0 },
      { label: "Supplier Contact Candidates", value: quotes.filter((q) => !q.approvedAt).length },
    ],
  };
}

export async function getFinanceAnalytics() {
  const rows = await safe("finance.transactions", () => db.select().from(transactionsTable), []);
  const months = lastMonths(6);
  const byMonth = Object.fromEntries(months.map((m) => [m, { revenue: 0, expenses: 0 }]));
  for (const t of rows) {
    const m = monthKey(new Date(t.transactionDate));
    if (!byMonth[m]) continue;
    const amt = Number(t.amount || 0);
    if (t.type === "income") byMonth[m].revenue += amt;
    if (t.type === "expense") byMonth[m].expenses += amt;
  }
  const revVsExp = months.map((m) => ({ month: m, revenue: byMonth[m].revenue, expenses: byMonth[m].expenses }));

  const valuationRaw = await safe("finance.valuation", () => db.select().from(appSettingsTable), []);
  const method = valuationRaw.find((x) => x.key === "INVENTORY_VALUATION_METHOD")?.value || "WAC";
  const valuationMethods = [
    { method: "FIFO", score: method === "FIFO" ? 1 : 0 },
    { method: "LIFO", score: method === "LIFO" ? 1 : 0 },
    { method: "WAC", score: method === "WAC" ? 1 : 0 },
  ];

  return {
    module: "finance",
    charts: [
      {
        id: "rev-exp",
        type: "line",
        title: "Revenue vs Expenses",
        xKey: "month",
        yKeys: ["revenue", "expenses"],
        data: revVsExp,
        actions: [
          { id: "generate-report", label: "Generate Report", tone: "secondary", confirm: "Open finance report generation?" },
          { id: "approve-transaction", label: "Approve Transaction", tone: "default", confirm: "Go to transaction approval queue?" },
        ],
      },
      { id: "valuation", type: "bar", title: "Valuation Method", xKey: "method", yKeys: ["score"], data: valuationMethods },
    ],
    kpis: [{ label: "Current Valuation", value: method }],
  };
}

export async function getHrAnalytics() {
  const attendance = await safe("hr.attendance", () => db.select().from(attendanceTable), []);
  const tasks = await safe("hr.tasks", () => db.select().from(manufacturingTasksTable), []);

  const status = { present: 0, absent: 0, late: 0, half_day: 0 };
  attendance.forEach((a) => { if (status[a.status] !== undefined) status[a.status] += 1; });
  const attendanceData = Object.entries(status).map(([name, value]) => ({ name, value }));

  const prod = {};
  for (const t of tasks) {
    const who = t.assigneeId ? `user-${t.assigneeId}` : "unassigned";
    if (!prod[who]) prod[who] = { worker: who, completed: 0, inProgress: 0, efficiencyScore: 0, bonusPenaltyIndex: 0 };
    if (t.status === "completed") prod[who].completed += 1;
    if (t.status === "in_progress") prod[who].inProgress += 1;
    const est = Number(t.estimatedHours || 0);
    const actual = Number(t.actualHours || 0);
    if (est > 0 && actual > 0) {
      const efficiency = Math.max(0, Math.min(200, (est / actual) * 100));
      prod[who].efficiencyScore += efficiency;
      prod[who].bonusPenaltyIndex += efficiency >= 100 ? 1 : -1;
    }
  }
  const efficiencyData = Object.values(prod)
    .map((x) => ({
      worker: x.worker,
      efficiencyScore: +(x.completed > 0 ? x.efficiencyScore / x.completed : 0).toFixed(1),
      bonusPenaltyIndex: x.bonusPenaltyIndex,
    }))
    .slice(0, 12);

  return {
    module: "hr",
    charts: [
      { id: "attendance", type: "pie", title: "Attendance Distribution", xKey: "name", yKeys: ["value"], data: attendanceData },
      { id: "productivity", type: "bar", title: "Worker Productivity", xKey: "worker", yKeys: ["completed", "inProgress"], data: Object.values(prod).slice(0, 12) },
      {
        id: "labor-efficiency",
        type: "line",
        title: "Labor Efficiency Driving Payroll",
        xKey: "worker",
        yKeys: ["efficiencyScore", "bonusPenaltyIndex"],
        data: efficiencyData,
        actions: [
          { id: "adjust-payroll", label: "Adjust Payroll", tone: "default", confirm: "Open payroll adjustment workflow?" },
          { id: "allocate-bonus-penalty", label: "Allocate Bonus/Penalty", tone: "secondary", confirm: "Open bonus/penalty allocation?" },
        ],
      },
    ],
    kpis: [
      { label: "Attendance Records", value: attendance.length },
      { label: "Payroll Action Candidates", value: efficiencyData.filter((x) => x.bonusPenaltyIndex !== 0).length },
    ],
  };
}

export async function getCustomerProfileAnalytics(context = {}) {
  const viewer = context?.user;
  const orders = await safe("customer.orders", () => db.select().from(customerOrdersTable), []);
  const invoices = await safe("customer.invoices", () => db.select().from(invoicesTable), []);
  const byStage = {};
  const stageProgress = {
    draft: 10,
    confirmed: 25,
    in_production: 55,
    quality_check: 75,
    shipped: 90,
    delivered: 100,
    cancelled: 0,
  };
  const paymentByStatus = {};

  const scopedOrders = viewer?.role === "customer"
    ? orders.filter((o) => o.customerId === viewer.id)
    : orders;
  const scopedOrderIds = new Set(scopedOrders.map((o) => o.id));
  const scopedInvoices = invoices.filter((inv) => inv.orderId && scopedOrderIds.has(inv.orderId));
  const allUpdates = await safe("customer.orderUpdates", () => db.select().from(orderUpdatesTable), []);
  const latestProgressByOrder = new Map();

  for (const o of scopedOrders) {
    const stage = o.status || "unknown";
    byStage[stage] = (byStage[stage] || 0) + 1;
  }
  for (const inv of scopedInvoices) {
    const s = inv.status || "unknown";
    paymentByStatus[s] = (paymentByStatus[s] || 0) + 1;
  }
  for (const u of allUpdates) {
    if (!scopedOrderIds.has(u.orderId))
      continue;
    const m = String(u.message || "").match(/\[Progress:(\d{1,3})%\]/);
    if (!m)
      continue;
    const current = latestProgressByOrder.get(u.orderId);
    if (!current || new Date(u.createdAt).getTime() > current.ts) {
      latestProgressByOrder.set(u.orderId, {
        progress: Math.max(0, Math.min(100, Number(m[1]))),
        ts: new Date(u.createdAt).getTime(),
      });
    }
  }
  const recentTracking = scopedOrders
    .slice(-20)
    .map((o, i) => {
      const createdAt = o?.createdAt ? new Date(o.createdAt) : null;
      const ageDays = createdAt && !Number.isNaN(createdAt.getTime())
        ? Math.max(0, Math.round((Date.now() - createdAt.getTime()) / 86400000))
        : 0;
      const estimatedDelivery = o?.estimatedDelivery ? new Date(o.estimatedDelivery) : null;
      const etaDays = estimatedDelivery && !Number.isNaN(estimatedDelivery.getTime())
        ? Math.round((estimatedDelivery.getTime() - Date.now()) / 86400000)
        : null;
      return {
        order: o.orderNumber || `ORD-${o.id ?? i + 1}`,
        progress: latestProgressByOrder.get(o.id)?.progress ?? (stageProgress[o.status] ?? 0),
        ageDays,
        etaDays: etaDays === null ? 0 : etaDays,
      };
    });
  const inProgress = scopedOrders.filter((o) => !["delivered", "cancelled"].includes(String(o.status || ""))).length;
  const delayed = scopedOrders.filter((o) => {
    if (!o?.estimatedDelivery || ["delivered", "cancelled"].includes(String(o.status || ""))) return false;
    const eta = new Date(o.estimatedDelivery);
    return !Number.isNaN(eta.getTime()) && eta.getTime() < Date.now();
  }).length;
  const pendingPaymentVerification = scopedInvoices.filter((inv) =>
    ["pending_verification", "sales_verified"].includes(String(inv.status || ""))).length;

  return {
    module: "customer-profile",
    charts: [
      {
        id: "order-stage-distribution",
        type: "pie",
        title: "Order Fulfillment Stages",
        xKey: "stage",
        yKeys: ["count"],
        data: Object.entries(byStage).map(([stage, count]) => ({ stage, count })),
      },
      {
        id: "payment-verification-pipeline",
        type: "bar",
        title: "Invoice Payment Pipeline",
        xKey: "status",
        yKeys: ["count"],
        data: Object.entries(paymentByStatus).map(([status, count]) => ({ status, count })),
      },
      {
        id: "product-tracking",
        type: "line",
        title: "Recent Order Tracking",
        xKey: "order",
        yKeys: ["progress", "ageDays", "etaDays"],
        data: recentTracking,
        actions: [
          { id: "track-product", label: "Track Product", tone: "secondary", confirm: "Open your active order tracking?" },
          { id: "view-satisfaction-survey", label: "View Satisfaction Survey", tone: "default", confirm: "Open delivered orders feedback context?" },
        ],
      },
    ],
    kpis: [
      { label: "Customer Orders", value: scopedOrders.length },
      { label: "Active Orders", value: inProgress },
      { label: "Delayed Orders", value: delayed },
      { label: "Payment Verifications Pending", value: pendingPaymentVerification },
    ],
  };
}

export async function getSupplierAnalytics() {
  const quotes = await safe("supplier.quotes", () => db.select().from(supplierQuotesTable), []);
  const bySupplier = {};
  for (const q of quotes) {
    const key = `supplier-${q.supplierId}`;
    if (!bySupplier[key]) bySupplier[key] = { supplier: key, quotes: 0, avgUnitPrice: 0, _sum: 0 };
    bySupplier[key].quotes += 1;
    bySupplier[key]._sum += Number(q.unitPrice || 0);
  }
  const quoteComparison = Object.values(bySupplier).map((x) => ({ supplier: x.supplier, quotes: x.quotes, avgUnitPrice: x.quotes ? +(x._sum / x.quotes).toFixed(2) : 0 }));

  const deliveryTimeline = quotes.slice(-20).map((q, i) => ({
    quote: `Q-${q.id ?? i + 1}`,
    daysToApprove: q.approvedAt && q.createdAt ? Math.max(0, Math.round((new Date(q.approvedAt).getTime() - new Date(q.createdAt).getTime()) / 86400000)) : 0,
  }));
  const varianceBySupplier = Object.values(bySupplier).map((x) => {
    const avg = x.quotes ? x._sum / x.quotes : 0;
    const baseline = avg * 0.95;
    const deltaPct = baseline > 0 ? +((((avg - baseline) / baseline) * 100).toFixed(2)) : 0;
    return {
      supplier: x.supplier,
      variancePct: deltaPct,
      remark: varianceRemark(deltaPct),
      demandCreate: x.quotes < 2 ? 1 : 0,
    };
  });

  return {
    module: "supplier",
    charts: [
      {
        id: "quote-compare",
        type: "bar",
        title: "Quotation Comparison",
        xKey: "supplier",
        yKeys: ["avgUnitPrice"],
        data: quoteComparison,
        actions: [
          { id: "compare-rates", label: "Compare Rates", tone: "secondary", confirm: "Open supplier rate comparison?" },
          { id: "lock-price", label: "Lock Price", tone: "default", confirm: "Open price lock workflow?" },
        ],
      },
      { id: "delivery-timeline", type: "line", title: "Delivery / Approval Timeline", xKey: "quote", yKeys: ["daysToApprove"], data: deliveryTimeline },
      {
        id: "supplier-variance",
        type: "bar",
        title: "Supplier Rate Variance with Remarks",
        xKey: "supplier",
        yKeys: ["variancePct", "demandCreate"],
        data: varianceBySupplier,
        actions: [
          { id: "create-demand", label: "Create Demand", tone: "default", confirm: "Create procurement demand from variance insights?" },
          { id: "lock-price", label: "Lock Price", tone: "secondary", confirm: "Open supplier price lock workflow?" },
        ],
      },
    ],
    kpis: [
      { label: "Total Quotes", value: quotes.length },
      { label: "Demand Creation Candidates", value: varianceBySupplier.filter((x) => x.demandCreate === 1).length },
    ],
  };
}

export async function getProductionAnalytics() {
  const tasks = await safe("production.tasks", () => db.select().from(manufacturingTasksTable), []);
  const quotes = await safe("production.quotes", () => db.select().from(supplierQuotesTable), []);
  const statusMap = {};
  tasks.forEach((t) => { statusMap[t.status || "unknown"] = (statusMap[t.status || "unknown"] || 0) + 1; });
  const progress = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

  const liveRate = quotes.length
    ? quotes.reduce((s, q) => s + Number(q.unitPrice || 0), 0) / quotes.length
    : 0;
  const defects = tasks.map((t) => ({ task: `#${t.id}`, defectRate: t.status === "completed" ? 0 : t.status === "on_hold" ? 20 : 8 })).slice(0, 20);
  const perUnitCost = tasks.slice(0, 20).map((t) => {
    const actual = Math.max(1, Number(t.actualHours || 0));
    const estimated = Math.max(1, Number(t.estimatedHours || 0));
    const unitCost = +((actual * 12 + liveRate) / Math.max(1, estimated)).toFixed(2);
    return {
      task: `#${t.id}`,
      unitCost,
      liveRate: +liveRate.toFixed(2),
      workerEfficiency: +((estimated / actual) * 100).toFixed(1),
    };
  });
  const workerSuggestion = tasks
    .filter((t) => t.assigneeId)
    .slice(0, 20)
    .map((t) => {
      const est = Math.max(1, Number(t.estimatedHours || 0));
      const actual = Math.max(1, Number(t.actualHours || 0));
      const score = +((est / actual) * 100).toFixed(1);
      return {
        worker: `user-${t.assigneeId}`,
        score,
        suggested: score >= 95 ? 1 : 0,
      };
    });

  return {
    module: "production",
    charts: [
      { id: "progress", type: "bar", title: "Progress Tracking", xKey: "status", yKeys: ["count"], data: progress },
      { id: "defects", type: "line", title: "Defect Rate Estimate", xKey: "task", yKeys: ["defectRate"], data: defects },
      { id: "per-unit-cost", type: "line", title: "Per-Unit Cost vs Live Purchase Rates", xKey: "task", yKeys: ["unitCost", "liveRate"], data: perUnitCost },
      {
        id: "worker-suggestion",
        type: "bar",
        title: "Worker Assignment Suggestion",
        xKey: "worker",
        yKeys: ["score", "suggested"],
        data: workerSuggestion,
        actions: [
          { id: "assign-worker", label: "Assign Worker", tone: "secondary", confirm: "Open worker assignment workflow?" },
          { id: "log-qc-check", label: "Log QC Check", tone: "default", confirm: "Open quality control logging?" },
        ],
      },
    ],
    kpis: [
      { label: "Tasks", value: tasks.length },
      { label: "Avg Live Purchase Rate", value: +liveRate.toFixed(2) },
    ],
  };
}

export async function getNotificationsAnalytics() {
  const list = await safe("notifications.list", () => db.select().from(notificationsTable), []);
  const logs = await safe("notifications.logs", () => db.select().from(activityLogsTable), []);
  const byType = {};
  let resolved = 0;
  let pending = 0;
  list.forEach((n) => {
    byType[n.type || "info"] = (byType[n.type || "info"] || 0) + 1;
    if (n.isRead) resolved += 1; else pending += 1;
  });
  const governance = logs.reduce(
    (acc, l) => {
      const action = String(l.action || "").toLowerCase();
      const desc = String(l.description || "").toLowerCase();
      if (action.includes("approve") || desc.includes("approval")) acc.approvals += 1;
      if (desc.includes("variance")) acc.varianceActions += 1;
      return acc;
    },
    { approvals: 0, varianceActions: 0 },
  );
  return {
    module: "notifications",
    charts: [
      { id: "alert-frequency", type: "bar", title: "Alert Frequency", xKey: "type", yKeys: ["count"], data: Object.entries(byType).map(([type, count]) => ({ type, count })) },
      { id: "resolved-pending", type: "pie", title: "Resolved vs Pending", xKey: "state", yKeys: ["value"], data: [{ state: "resolved", value: resolved }, { state: "pending", value: pending }] },
      {
        id: "governance-actions",
        type: "bar",
        title: "Governance Actions Logged",
        xKey: "action",
        yKeys: ["count"],
        data: [{ action: "approvals", count: governance.approvals }, { action: "variance", count: governance.varianceActions }],
        actions: [
          { id: "resolve-alert", label: "Resolve Alert", tone: "default", confirm: "Open unresolved alerts?" },
          { id: "view-audit-log", label: "View Audit Log", tone: "secondary", confirm: "Open governance audit logs?" },
        ],
      },
    ],
    kpis: [
      { label: "Notifications", value: list.length },
      { label: "Approvals Logged", value: governance.approvals },
      { label: "Variance Actions", value: governance.varianceActions },
    ],
  };
}

export async function getSettingsAnalytics() {
  const logs = await safe("settings.activity", () => db.select().from(activityLogsTable), []);
  const users = await safe("settings.users", () => db.select().from(usersTable), []);
  const byModule = {};
  logs.forEach((l) => { byModule[l.module || "unknown"] = (byModule[l.module || "unknown"] || 0) + 1; });
  return {
    module: "settings",
    charts: [
      { id: "system-usage", type: "bar", title: "System Usage by Module", xKey: "module", yKeys: ["events"], data: Object.entries(byModule).map(([module, events]) => ({ module, events })) },
    ],
    kpis: [
      { label: "Users", value: users.length },
      { label: "Activity Events", value: logs.length },
    ],
  };
}

export async function getProcurementAnalytics() {
  const base = await getSupplierAnalytics();
  const quotes = await safe("procurement.quotes", () => db.select().from(supplierQuotesTable), []);
  const lockFlow = quotes.slice(-20).map((q, i) => ({
    quote: `Q-${q.id ?? i + 1}`,
    locked: q.lockedAt ? 1 : 0,
    approved: q.approvedAt ? 1 : 0,
    notify: q.status === "pending_finance" || q.status === "pending_pm" ? 1 : 0,
  }));
  return {
    module: "procurement",
    charts: [
      ...base.charts,
      {
        id: "price-lock-workflow",
        type: "bar",
        title: "Price-Lock Approval Workflow",
        xKey: "quote",
        yKeys: ["locked", "approved", "notify"],
        data: lockFlow,
        actions: [
          { id: "create-demand", label: "Create Demand", tone: "default", confirm: "Create a demand request?" },
          { id: "approve-quote", label: "Approve Quote", tone: "secondary", confirm: "Jump to quote approvals?" },
        ],
      },
    ],
    kpis: [...base.kpis, { label: "Approval Queue", value: lockFlow.filter((x) => x.notify === 1).length }],
  };
}

export async function getPayrollAnalytics() {
  const hr = await getHrAnalytics();
  return {
    module: "payroll",
    charts: hr.charts.filter((c) => ["labor-efficiency", "productivity"].includes(c.id)),
    kpis: hr.kpis,
  };
}

export async function getAccountingAnalytics() {
  const finance = await getFinanceAnalytics();
  const variance = (finance.charts.find((c) => c.id === "rev-exp")?.data ?? []).map((r) => {
    const revenue = Number(r.revenue || 0);
    const expenses = Number(r.expenses || 0);
    const delta = revenue - expenses;
    const deltaPct = revenue > 0 ? +((delta / revenue) * 100).toFixed(2) : 0;
    return { month: r.month, variancePct: deltaPct, remark: varianceRemark(deltaPct) };
  });
  return {
    module: "accounting",
    charts: [
      ...finance.charts,
      {
        id: "manufacturing-variance",
        type: "line",
        title: "Cost of Goods Variance with Remarks",
        xKey: "month",
        yKeys: ["variancePct"],
        data: variance,
        actions: [
          { id: "generate-report", label: "Generate Report", tone: "secondary", confirm: "Open accounting report generation?" },
          { id: "approve-transaction", label: "Approve Transaction", tone: "default", confirm: "Open transaction approvals?" },
        ],
      },
    ],
    kpis: finance.kpis,
  };
}

export async function getCustomerAnalytics(context = {}) {
  const customer = await getCustomerProfileAnalytics(context);
  return {
    module: "customer",
    charts: customer.charts,
    kpis: customer.kpis,
  };
}

export async function getAdminAnalytics() {
  const settings = await getSettingsAnalytics();
  const notifications = await getNotificationsAnalytics();
  return {
    module: "admin",
    charts: [...settings.charts, ...notifications.charts.filter((c) => c.id === "governance-actions")],
    kpis: [...settings.kpis, ...notifications.kpis.filter((k) => k.label.includes("Variance") || k.label.includes("Approvals"))],
  };
}

export const nativeAnalyticsHandlers = {
  inventory: getInventoryAnalytics,
  procurement: getProcurementAnalytics,
  finance: getFinanceAnalytics,
  accounting: getAccountingAnalytics,
  hr: getHrAnalytics,
  payroll: getPayrollAnalytics,
  customer: getCustomerAnalytics,
  "customer-profile": getCustomerProfileAnalytics,
  supplier: getSupplierAnalytics,
  production: getProductionAnalytics,
  notifications: getNotificationsAnalytics,
  admin: getAdminAnalytics,
  settings: getSettingsAnalytics,
};
