import { Router, type IRouter } from "express";
import { eq, count, sql, desc } from "drizzle-orm";
import { db, productsTable, inventoryTable, suppliersTable, supplierQuotesTable, employeesTable, manufacturingTasksTable, notificationsTable, activityLogsTable, transactionsTable, payrollTable, usersTable } from "@workspace/db";
import { authenticate, AuthRequest } from "../middlewares/authenticate";

const router: IRouter = Router();

router.get("/dashboard/summary", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const [productCount] = await db.select({ count: count() }).from(productsTable);
  const [inventoryCount] = await db.select({ count: count() }).from(inventoryTable);
  const [supplierCount] = await db.select({ count: count() }).from(suppliersTable);
  const [activeSupplierCount] = await db.select({ count: count() }).from(suppliersTable).where(eq(suppliersTable.status, "active"));
  const [pendingQuoteCount] = await db.select({ count: count() }).from(supplierQuotesTable).where(eq(supplierQuotesTable.status, "PENDING"));
  const [employeeCount] = await db.select({ count: count() }).from(employeesTable).where(eq(employeesTable.isActive, true));
  const [activeTaskCount] = await db.select({ count: count() }).from(manufacturingTasksTable).where(eq(manufacturingTasksTable.status, "in_progress"));

  const inventoryItems = await db.select().from(inventoryTable);
  const lowStockCount = inventoryItems.filter(i => Number(i.quantity) <= Number(i.reorderLevel)).length;

  const [unreadNotifCount] = await db.select({ count: count() }).from(notificationsTable)
    .where(eq(notificationsTable.userId, req.user!.id));

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const revenueResult = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
    .from(transactionsTable)
    .where(sql`type = 'income' AND transaction_date >= ${startOfMonth}`);
  const expenseResult = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
    .from(transactionsTable)
    .where(sql`type = 'expense' AND transaction_date >= ${startOfMonth}`);

  const recentActivity = await db.select({
    id: activityLogsTable.id,
    userId: activityLogsTable.userId,
    action: activityLogsTable.action,
    module: activityLogsTable.module,
    description: activityLogsTable.description,
    oldData: activityLogsTable.oldData,
    newData: activityLogsTable.newData,
    createdAt: activityLogsTable.createdAt,
    userName: usersTable.name,
  })
  .from(activityLogsTable)
  .leftJoin(usersTable, eq(activityLogsTable.userId, usersTable.id))
  .orderBy(desc(activityLogsTable.createdAt))
  .limit(10);

  res.json({
    totalProducts: productCount.count,
    totalInventoryItems: inventoryCount.count,
    lowStockCount,
    totalSuppliers: supplierCount.count,
    activeSuppliers: activeSupplierCount.count,
    pendingQuotes: pendingQuoteCount.count,
    totalEmployees: employeeCount.count,
    activeManufacturingTasks: activeTaskCount.count,
    monthlyRevenue: Number(revenueResult[0]?.total ?? 0),
    monthlyExpenses: Number(expenseResult[0]?.total ?? 0),
    unreadNotifications: unreadNotifCount.count,
    recentActivity,
  });
});

router.get("/dashboard/financial-summary", authenticate, async (_req, res): Promise<void> => {
  const revenueResult = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
    .from(transactionsTable).where(eq(transactionsTable.type, "income"));
  const expenseResult = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
    .from(transactionsTable).where(eq(transactionsTable.type, "expense"));
  const pendingResult = await db.select({ total: sql<string>`COALESCE(SUM(total_price), 0)` })
    .from(supplierQuotesTable).where(eq(supplierQuotesTable.status, "ADMIN_APPROVED"));
  const supplierPayablesResult = await db.select({ total: sql<string>`COALESCE(SUM(total_price), 0)` })
    .from(supplierQuotesTable).where(sql`status IN ('PENDING','LOCKED','ADMIN_APPROVED')`);
  const payrollResult = await db.select({ total: sql<string>`COALESCE(SUM(net_salary), 0)` })
    .from(payrollTable).where(eq(payrollTable.status, "approved"));

  const totalRevenue = Number(revenueResult[0]?.total ?? 0);
  const totalExpenses = Number(expenseResult[0]?.total ?? 0);

  // Build monthly breakdown for last 6 months
  const months: { month: string; revenue: number; expenses: number; profit: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const [rev] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(transactionsTable).where(sql`type='income' AND transaction_date >= ${start} AND transaction_date <= ${end}`);
    const [exp] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(transactionsTable).where(sql`type='expense' AND transaction_date >= ${start} AND transaction_date <= ${end}`);
    const revenue = Number(rev?.total ?? 0);
    const expenses = Number(exp?.total ?? 0);
    months.push({ month: label, revenue, expenses, profit: revenue - expenses });
  }

  res.json({
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    pendingPayments: Number(pendingResult[0]?.total ?? 0),
    supplierPayables: Number(supplierPayablesResult[0]?.total ?? 0),
    payrollExpenses: Number(payrollResult[0]?.total ?? 0),
    monthlyBreakdown: months,
  });
});

router.get("/dashboard/pending-approvals", authenticate, async (_req, res): Promise<void> => {
  const pendingQuotes = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.status, "LOCKED"));
  const pendingPayroll = await db.select().from(payrollTable).where(eq(payrollTable.status, "draft"));

  const enrichedQuotes = await Promise.all(pendingQuotes.map(async (q) => {
    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, q.supplierId));
    return {
      ...q,
      supplierName: supplier?.name ?? "",
      itemName: null,
      quantity: Number(q.quantity),
      unitPrice: Number(q.unitPrice),
      totalPrice: Number(q.totalPrice),
      validUntil: q.validUntil?.toISOString() ?? null,
      lockedAt: q.lockedAt?.toISOString() ?? null,
      approvedAt: q.approvedAt?.toISOString() ?? null,
      paidAt: q.paidAt?.toISOString() ?? null,
    };
  }));

  const enrichedPayroll = await Promise.all(pendingPayroll.map(async (p) => {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, p.employeeId));
    return {
      ...p,
      employeeName: emp?.name ?? "",
      baseSalary: Number(p.baseSalary),
      bonus: Number(p.bonus),
      deductions: Number(p.deductions),
      netSalary: Number(p.netSalary),
      paidAt: p.paidAt?.toISOString() ?? null,
    };
  }));

  res.json({
    totalPending: enrichedQuotes.length + enrichedPayroll.length,
    pendingQuotes: enrichedQuotes,
    pendingPayroll: enrichedPayroll,
  });
});

router.get("/dashboard/manufacturing-overview", authenticate, async (_req, res): Promise<void> => {
  const tasks = await db.select().from(manufacturingTasksTable);
  const now = new Date();
  const pending = tasks.filter(t => t.status === "pending").length;
  const inProgress = tasks.filter(t => t.status === "in_progress").length;
  const completed = tasks.filter(t => t.status === "completed").length;
  const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== "completed").length;
  const avgProgress = tasks.length > 0 ? tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length : 0;

  const statusCounts = ["pending", "in_progress", "completed", "on_hold"].map(s => ({
    status: s,
    count: tasks.filter(t => t.status === s).length,
  }));

  res.json({
    totalTasks: tasks.length,
    pendingTasks: pending,
    inProgressTasks: inProgress,
    completedTasks: completed,
    overdueTasks: overdue,
    averageProgress: Math.round(avgProgress * 10) / 10,
    tasksByStatus: statusCounts,
  });
});

export default router;
