/**
 * Analytics aligned with ERP deck: supplier rate variance, supplier comparison,
 * worker efficiency by product, suggested assignee heuristic.
 */
import { Router } from "express";
import { eq, and, isNotNull, asc, desc } from "drizzle-orm";
import { z } from "zod";
import {
    db,
    supplierQuotesTable,
    suppliersTable,
    inventoryTable,
    manufacturingTasksTable,
    productsTable,
    usersTable,
    materialUsageTable,
} from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";

const router = Router();
const deckStaff = requireRole("admin", "manager", "accountant", "sales_manager", "inventory_manager", "employee");

function remarkForDelta(prev, next) {
    if (next > prev)
        return "increased";
    if (next < prev)
        return "decreased";
    return "same";
}

/** 09 — Compare consecutive quotes per supplier + inventory line (unit price variance). */
router.get("/analytics/deck/supplier-rate-variance", authenticate, deckStaff, async (_req, res) => {
    const rows = await db
        .select()
        .from(supplierQuotesTable)
        .where(isNotNull(supplierQuotesTable.inventoryItemId))
        .orderBy(asc(supplierQuotesTable.supplierId), asc(supplierQuotesTable.inventoryItemId), asc(supplierQuotesTable.createdAt));
    const groups = new Map();
    for (const q of rows) {
        const key = `${q.supplierId}:${q.inventoryItemId}`;
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(q);
    }
    const out = [];
    for (const [, list] of groups) {
        if (list.length < 2)
            continue;
        const prev = list[list.length - 2];
        const curr = list[list.length - 1];
        const prevUnit = Number(prev.unitPrice);
        const currUnit = Number(curr.unitPrice);
        const delta = currUnit - prevUnit;
        const pct = prevUnit !== 0 ? (delta / prevUnit) * 100 : null;
        const [supList, invList] = await Promise.all([
            db.select({ name: suppliersTable.name }).from(suppliersTable).where(eq(suppliersTable.id, curr.supplierId)),
            db.select({ name: inventoryTable.name }).from(inventoryTable).where(eq(inventoryTable.id, curr.inventoryItemId)),
        ]);
        const sup = supList[0];
        const inv = invList[0];
        out.push({
            supplierId: curr.supplierId,
            supplierName: sup?.name ?? "",
            inventoryItemId: curr.inventoryItemId,
            inventoryItemName: inv?.name ?? "",
            previousQuoteId: prev.id,
            currentQuoteId: curr.id,
            previousUnitPrice: prevUnit,
            currentUnitPrice: currUnit,
            varianceAmount: +delta.toFixed(4),
            variancePercent: pct != null ? +pct.toFixed(2) : null,
            remark: remarkForDelta(prevUnit, currUnit),
            previousCreatedAt: prev.createdAt.toISOString(),
            currentCreatedAt: curr.createdAt.toISOString(),
        });
    }
    out.sort((a, b) => b.currentCreatedAt.localeCompare(a.currentCreatedAt));
    res.json({ rows: out });
});

/** 05 — Latest quoted unit price per supplier for one inventory item (rate comparison). */
router.get("/analytics/deck/supplier-comparison", authenticate, deckStaff, async (req, res) => {
    const parsed = z.object({ inventoryItemId: z.coerce.number().int().positive() }).safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({ error: "inventoryItemId is required" });
        return;
    }
    const { inventoryItemId } = parsed.data;
    const quotes = await db
        .select()
        .from(supplierQuotesTable)
        .where(eq(supplierQuotesTable.inventoryItemId, inventoryItemId))
        .orderBy(desc(supplierQuotesTable.createdAt));
    const latestBySupplier = new Map();
    for (const q of quotes) {
        if (!latestBySupplier.has(q.supplierId))
            latestBySupplier.set(q.supplierId, q);
    }
    const rows = [];
    for (const q of latestBySupplier.values()) {
        const [sup] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, q.supplierId));
        rows.push({
            supplierId: q.supplierId,
            supplierName: sup?.name ?? "",
            quoteId: q.id,
            unitPrice: Number(q.unitPrice),
            status: q.status,
            rating: sup?.rating != null ? Number(sup.rating) : null,
            createdAt: q.createdAt.toISOString(),
        });
    }
    rows.sort((a, b) => a.unitPrice - b.unitPrice);
    res.json({ inventoryItemId, rows });
});

/** 07 — Completed tasks: hours by product + worker (efficiency comparison). */
router.get("/analytics/deck/worker-product-efficiency", authenticate, deckStaff, async (_req, res) => {
    const tasks = await db
        .select({
            task: manufacturingTasksTable,
            productName: productsTable.name,
            workerName: usersTable.name,
        })
        .from(manufacturingTasksTable)
        .leftJoin(productsTable, eq(manufacturingTasksTable.productId, productsTable.id))
        .leftJoin(usersTable, eq(manufacturingTasksTable.assigneeId, usersTable.id))
        .where(
            and(
                eq(manufacturingTasksTable.status, "completed"),
                isNotNull(manufacturingTasksTable.productId),
                isNotNull(manufacturingTasksTable.assigneeId),
            ),
        );
    const map = new Map();
    for (const { task, productName, workerName } of tasks) {
        const key = `${task.productId}:${task.assigneeId}`;
        if (!map.has(key)) {
            map.set(key, {
                productId: task.productId,
                productName: productName ?? "",
                assigneeId: task.assigneeId,
                workerName: workerName ?? "",
                taskCount: 0,
                totalEstimatedHours: 0,
                totalActualHours: 0,
            });
        }
        const agg = map.get(key);
        agg.taskCount += 1;
        agg.totalEstimatedHours += Number(task.estimatedHours ?? 0);
        agg.totalActualHours += Number(task.actualHours ?? 0);
    }
    const rows = [...map.values()].map((r) => ({
        ...r,
        avgActualHoursPerTask: r.taskCount ? +(r.totalActualHours / r.taskCount).toFixed(2) : 0,
        efficiencyRatio:
            r.totalEstimatedHours > 0 ? +(r.totalActualHours / r.totalEstimatedHours).toFixed(3) : null,
    }));
    rows.sort((a, b) => a.productName.localeCompare(b.productName) || a.workerName.localeCompare(b.workerName));
    res.json({ rows });
});

/** 06 — Heuristic: workers with lowest average actual hours on completed tasks for this product. */
router.get("/analytics/deck/suggested-workers", authenticate, deckStaff, async (req, res) => {
    const parsed = z.object({ productId: z.coerce.number().int().positive() }).safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({ error: "productId is required" });
        return;
    }
    const { productId } = parsed.data;
    const tasks = await db
        .select()
        .from(manufacturingTasksTable)
        .where(
            and(
                eq(manufacturingTasksTable.productId, productId),
                eq(manufacturingTasksTable.status, "completed"),
                isNotNull(manufacturingTasksTable.assigneeId),
            ),
        );
    const byWorker = new Map();
    for (const t of tasks) {
        const id = t.assigneeId;
        if (!byWorker.has(id))
            byWorker.set(id, { assigneeId: id, hours: [], count: 0 });
        const w = byWorker.get(id);
        w.count += 1;
        w.hours.push(Number(t.actualHours ?? t.estimatedHours ?? 0));
    }
    const ranked = [];
    for (const w of byWorker.values()) {
        const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, w.assigneeId));
        const sum = w.hours.reduce((s, h) => s + h, 0);
        const avg = w.hours.length ? sum / w.hours.length : 0;
        ranked.push({
            assigneeId: w.assigneeId,
            workerName: user?.name ?? "",
            completedTasks: w.count,
            avgHoursPerTask: +avg.toFixed(2),
        });
    }
    ranked.sort((a, b) => a.avgHoursPerTask - b.avgHoursPerTask || b.completedTasks - a.completedTasks);
    res.json({ productId, suggestions: ranked.slice(0, 8) });
});

/** 10 — Rough COGM proxy: material usage cost (qty × inventory unit cost at time of query) per completed task. */
router.get("/analytics/deck/task-material-cost", authenticate, deckStaff, async (_req, res) => {
    const usages = await db
        .select({
            usage: materialUsageTable,
            unitCost: inventoryTable.unitCost,
            itemName: inventoryTable.name,
        })
        .from(materialUsageTable)
        .leftJoin(inventoryTable, eq(materialUsageTable.inventoryItemId, inventoryTable.id));
    const byTask = new Map();
    for (const { usage, unitCost, itemName } of usages) {
        const tid = usage.taskId;
        if (!byTask.has(tid))
            byTask.set(tid, { taskId: tid, lines: [], totalMaterialCost: 0 });
        const uc = unitCost != null ? Number(unitCost) : 0;
        const qty = Number(usage.quantityUsed);
        const lineCost = qty * uc;
        byTask.get(tid).lines.push({
            materialName: usage.materialName,
            inventoryItemName: itemName,
            quantityUsed: qty,
            unitCost: uc,
            lineCost: +lineCost.toFixed(2),
        });
        byTask.get(tid).totalMaterialCost += lineCost;
    }
    const rows = [...byTask.values()].map((r) => ({
        taskId: r.taskId,
        totalMaterialCost: +r.totalMaterialCost.toFixed(2),
        lines: r.lines,
    }));
    res.json({ rows, note: "Uses current inventory unit cost as live-rate proxy; historical COGM variance needs cost snapshots." });
});

export default router;
