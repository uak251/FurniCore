import { Router } from "express";
import { eq, count, sql, desc } from "drizzle-orm";
import { db, productsTable, inventoryTable, suppliersTable, supplierQuotesTable, employeesTable, manufacturingTasksTable, notificationsTable, activityLogsTable, transactionsTable, payrollTable, usersTable } from "@workspace/db";
import { authenticate } from "../middlewares/authenticate";
import { logger } from "../lib/logger";

/** Avoid 500 when a table is missing (migrations not applied); log once and use safe defaults. */
async function safeCount(fn, label) {
    try {
        const [row] = await fn();
        return Number(row?.count ?? 0);
    }
    catch (err) {
        logger.warn({ err: err?.message, label }, "dashboard_count_skipped");
        return 0;
    }
}
async function safeRows(fn, label) {
    try {
        return await fn();
    }
    catch (err) {
        logger.warn({ err: err?.message, label }, "dashboard_query_skipped");
        return [];
    }
}
async function safeSum(fn, label) {
    try {
        const rows = await fn();
        return Number(rows[0]?.total ?? 0);
    }
    catch (err) {
        logger.warn({ err: err?.message, label }, "dashboard_sum_skipped");
        return 0;
    }
}

const router = Router();
router.get("/dashboard/summary", authenticate, async (req, res) => {
    const totalProducts = await safeCount(() => db.select({ count: count() }).from(productsTable), "products");
    const totalInventoryItems = await safeCount(() => db.select({ count: count() }).from(inventoryTable), "inventory");
    const totalSuppliers = await safeCount(() => db.select({ count: count() }).from(suppliersTable), "suppliers");
    const activeSuppliers = await safeCount(() => db.select({ count: count() }).from(suppliersTable).where(eq(suppliersTable.status, "active")), "suppliers_active");
    const pendingQuotes = await safeCount(() => db.select({ count: count() }).from(supplierQuotesTable).where(eq(supplierQuotesTable.status, "PENDING")), "quotes_pending");
    const totalEmployees = await safeCount(() => db.select({ count: count() }).from(employeesTable).where(eq(employeesTable.isActive, true)), "employees");
    const activeManufacturingTasks = await safeCount(() => db.select({ count: count() }).from(manufacturingTasksTable).where(eq(manufacturingTasksTable.status, "in_progress")), "mfg_tasks");
    const inventoryItems = await safeRows(() => db.select().from(inventoryTable), "inventory_rows");
    const lowStockCount = inventoryItems.filter(i => Number(i.quantity) <= Number(i.reorderLevel)).length;
    const unreadNotifications = await safeCount(() => db.select({ count: count() }).from(notificationsTable)
        .where(eq(notificationsTable.userId, req.user.id)), "notifications_unread");
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyRevenue = await safeSum(() => db.select({ total: sql `COALESCE(SUM(amount), 0)` })
        .from(transactionsTable)
        .where(sql `type = 'income' AND transaction_date >= ${startOfMonth}`), "revenue_month");
    const monthlyExpenses = await safeSum(() => db.select({ total: sql `COALESCE(SUM(amount), 0)` })
        .from(transactionsTable)
        .where(sql `type = 'expense' AND transaction_date >= ${startOfMonth}`), "expense_month");
    const recentActivity = await safeRows(() => db.select({
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
        .limit(10), "activity_logs");
    res.json({
        totalProducts,
        totalInventoryItems,
        lowStockCount,
        totalSuppliers,
        activeSuppliers,
        pendingQuotes,
        totalEmployees,
        activeManufacturingTasks,
        monthlyRevenue,
        monthlyExpenses,
        unreadNotifications,
        recentActivity,
    });
});
router.get("/dashboard/financial-summary", authenticate, async (_req, res) => {
    const revenueResult = await db.select({ total: sql `COALESCE(SUM(amount), 0)` })
        .from(transactionsTable).where(eq(transactionsTable.type, "income"));
    const expenseResult = await db.select({ total: sql `COALESCE(SUM(amount), 0)` })
        .from(transactionsTable).where(eq(transactionsTable.type, "expense"));
    const pendingResult = await db.select({ total: sql `COALESCE(SUM(total_price), 0)` })
        .from(supplierQuotesTable).where(eq(supplierQuotesTable.status, "ADMIN_APPROVED"));
    const supplierPayablesResult = await db.select({ total: sql `COALESCE(SUM(total_price), 0)` })
        .from(supplierQuotesTable).where(sql `status IN ('PENDING','LOCKED','ADMIN_APPROVED')`);
    const payrollResult = await db.select({ total: sql `COALESCE(SUM(net_salary), 0)` })
        .from(payrollTable).where(eq(payrollTable.status, "approved"));
    const totalRevenue = Number(revenueResult[0]?.total ?? 0);
    const totalExpenses = Number(expenseResult[0]?.total ?? 0);
    // Build monthly breakdown for last 6 months
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const [rev] = await db.select({ total: sql `COALESCE(SUM(amount), 0)` })
            .from(transactionsTable).where(sql `type='income' AND transaction_date >= ${start} AND transaction_date <= ${end}`);
        const [exp] = await db.select({ total: sql `COALESCE(SUM(amount), 0)` })
            .from(transactionsTable).where(sql `type='expense' AND transaction_date >= ${start} AND transaction_date <= ${end}`);
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
router.get("/dashboard/pending-approvals", authenticate, async (_req, res) => {
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
router.get("/dashboard/manufacturing-overview", authenticate, async (_req, res) => {
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
