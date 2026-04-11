/**
 * COGM: monthly standard costs + variance snapshots (estimated vs actual).
 */
import { Router } from "express";
import { eq, and, gte, lte, desc, isNotNull, inArray } from "drizzle-orm";
import { z } from "zod";
import {
    db,
    productStandardCostsMonthlyTable,
    cogmVarianceRecordsTable,
    manufacturingTasksTable,
    materialUsageTable,
    inventoryTable,
    appSettingsTable,
} from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";

const router = Router();
const staff = requireRole("admin", "manager", "accountant", "inventory_manager", "employee");

async function getLaborRate() {
    const [s] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "LABOR_HOURLY_RATE"));
    const n = s?.value != null ? Number(s.value) : 18;
    return Number.isFinite(n) ? n : 18;
}

router.get("/cogm/standard-costs", authenticate, staff, async (req, res) => {
    const y = z.coerce.number().int().min(2000).max(2100).safeParse(req.query.year);
    const m = z.coerce.number().int().min(1).max(12).safeParse(req.query.month);
    const cond = [];
    if (y.success)
        cond.push(eq(productStandardCostsMonthlyTable.year, y.data));
    if (m.success)
        cond.push(eq(productStandardCostsMonthlyTable.month, m.data));
    const rows = cond.length
        ? await db.select().from(productStandardCostsMonthlyTable).where(and(...cond))
        : await db.select().from(productStandardCostsMonthlyTable);
    res.json(rows.map((r) => ({
        ...r,
        materialStandard: Number(r.materialStandard),
        laborStandard: Number(r.laborStandard),
        overheadStandard: Number(r.overheadStandard),
        totalStandard: Number(r.totalStandard),
    })));
});

const UpsertStd = z.object({
    productId: z.number().int().positive(),
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    materialStandard: z.number().nonnegative(),
    laborStandard: z.number().nonnegative(),
    overheadStandard: z.number().nonnegative(),
    notes: z.string().optional(),
});

router.post("/cogm/standard-costs", authenticate, requireRole("admin", "manager", "accountant"), async (req, res) => {
    const parsed = UpsertStd.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const d = parsed.data;
    const total = d.materialStandard + d.laborStandard + d.overheadStandard;
    const [existing] = await db
        .select()
        .from(productStandardCostsMonthlyTable)
        .where(
            and(
                eq(productStandardCostsMonthlyTable.productId, d.productId),
                eq(productStandardCostsMonthlyTable.year, d.year),
                eq(productStandardCostsMonthlyTable.month, d.month),
            ),
        );
    const payload = {
        materialStandard: String(d.materialStandard.toFixed(2)),
        laborStandard: String(d.laborStandard.toFixed(2)),
        overheadStandard: String(d.overheadStandard.toFixed(2)),
        totalStandard: String(total.toFixed(2)),
        notes: d.notes ?? null,
    };
    const row = existing
        ? (await db
            .update(productStandardCostsMonthlyTable)
            .set(payload)
            .where(eq(productStandardCostsMonthlyTable.id, existing.id))
            .returning())[0]
        : (await db
            .insert(productStandardCostsMonthlyTable)
            .values({
                productId: d.productId,
                year: d.year,
                month: d.month,
                ...payload,
                createdBy: req.user?.id ?? null,
            })
            .returning())[0];
    res.status(201).json({
        ...row,
        materialStandard: Number(row.materialStandard),
        laborStandard: Number(row.laborStandard),
        overheadStandard: Number(row.overheadStandard),
        totalStandard: Number(row.totalStandard),
    });
});

router.get("/cogm/variance-records", authenticate, staff, async (req, res) => {
    const y = z.coerce.number().int().safeParse(req.query.year);
    const m = z.coerce.number().int().safeParse(req.query.month);
    const cond = [];
    if (y.success)
        cond.push(eq(cogmVarianceRecordsTable.year, y.data));
    if (m.success)
        cond.push(eq(cogmVarianceRecordsTable.month, m.data));
    const rows = cond.length
        ? await db.select().from(cogmVarianceRecordsTable).where(and(...cond)).orderBy(desc(cogmVarianceRecordsTable.computedAt))
        : await db.select().from(cogmVarianceRecordsTable).orderBy(desc(cogmVarianceRecordsTable.computedAt));
    res.json(rows.map((r) => ({
        ...r,
        estimatedMaterial: Number(r.estimatedMaterial),
        actualMaterial: Number(r.actualMaterial),
        estimatedLabor: Number(r.estimatedLabor),
        actualLabor: Number(r.actualLabor),
        varianceAmount: Number(r.varianceAmount),
        variancePercent: r.variancePercent != null ? Number(r.variancePercent) : null,
    })));
});

/** Compute variance rows for completed tasks in a calendar month */
router.post("/cogm/compute-monthly", authenticate, requireRole("admin", "manager", "accountant"), async (req, res) => {
    const parsed = z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "year and month required" });
        return;
    }
    const { year, month } = parsed.data;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const laborRate = await getLaborRate();
    await db.delete(cogmVarianceRecordsTable).where(and(eq(cogmVarianceRecordsTable.year, year), eq(cogmVarianceRecordsTable.month, month)));
    const tasks = await db
        .select()
        .from(manufacturingTasksTable)
        .where(
            and(
                eq(manufacturingTasksTable.status, "completed"),
                isNotNull(manufacturingTasksTable.completedAt),
                gte(manufacturingTasksTable.completedAt, start),
                lte(manufacturingTasksTable.completedAt, end),
            ),
        );
    const out = [];
    for (const task of tasks) {
        if (!task.productId)
            continue;
        const [std] = await db
            .select()
            .from(productStandardCostsMonthlyTable)
            .where(
                and(
                    eq(productStandardCostsMonthlyTable.productId, task.productId),
                    eq(productStandardCostsMonthlyTable.year, year),
                    eq(productStandardCostsMonthlyTable.month, month),
                ),
            );
        const usages = await db
            .select({ u: materialUsageTable, uc: inventoryTable.unitCost })
            .from(materialUsageTable)
            .leftJoin(inventoryTable, eq(materialUsageTable.inventoryItemId, inventoryTable.id))
            .where(eq(materialUsageTable.taskId, task.id));
        let actualMaterial = 0;
        for (const { u, uc } of usages) {
            const cost = Number(u.quantityUsed) * Number(uc ?? 0);
            actualMaterial += cost;
        }
        const actualLabor = Number(task.actualHours ?? task.estimatedHours ?? 0) * laborRate;
        const estimatedMaterial = std ? Number(std.materialStandard) : 0;
        const estimatedLabor = std ? Number(std.laborStandard) : Number(task.estimatedHours ?? 0) * laborRate;
        const est = estimatedMaterial + estimatedLabor;
        const act = actualMaterial + actualLabor;
        const variance = act - est;
        const pct = est !== 0 ? (variance / est) * 100 : null;
        let remark = "same";
        if (variance > 0.01)
            remark = "increased";
        else if (variance < -0.01)
            remark = "decreased";
        const [rec] = await db
            .insert(cogmVarianceRecordsTable)
            .values({
                productId: task.productId,
                taskId: task.id,
                year,
                month,
                estimatedMaterial: String(estimatedMaterial.toFixed(2)),
                actualMaterial: String(actualMaterial.toFixed(2)),
                estimatedLabor: String(estimatedLabor.toFixed(2)),
                actualLabor: String(actualLabor.toFixed(2)),
                varianceAmount: String(variance.toFixed(2)),
                variancePercent: pct != null ? String(pct.toFixed(2)) : null,
                remark,
            })
            .returning();
        out.push(rec);
    }
    res.status(201).json({ computed: out.length, records: out });
});

/** Inventory consumption (material usage) tied to tasks completed in period */
router.get("/cogm/material-consumption", authenticate, staff, async (req, res) => {
    const y = z.coerce.number().int().safeParse(req.query.year);
    const m = z.coerce.number().int().safeParse(req.query.month);
    if (!y.success || !m.success) {
        res.status(400).json({ error: "year and month query params required" });
        return;
    }
    const year = y.data;
    const month = m.data;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const tasks = await db
        .select({ id: manufacturingTasksTable.id })
        .from(manufacturingTasksTable)
        .where(
            and(
                eq(manufacturingTasksTable.status, "completed"),
                isNotNull(manufacturingTasksTable.completedAt),
                gte(manufacturingTasksTable.completedAt, start),
                lte(manufacturingTasksTable.completedAt, end),
            ),
        );
    const taskIds = tasks.map((t) => t.id);
    if (taskIds.length === 0) {
        res.json({ year, month, rows: [] });
        return;
    }
    const usages = await db
        .select({
            inventoryItemId: materialUsageTable.inventoryItemId,
            materialName: materialUsageTable.materialName,
            quantityUsed: materialUsageTable.quantityUsed,
            unit: materialUsageTable.unit,
            taskId: materialUsageTable.taskId,
        })
        .from(materialUsageTable)
        .where(inArray(materialUsageTable.taskId, taskIds));
    const agg = new Map();
    for (const u of usages) {
        const key = `${u.inventoryItemId ?? "x"}:${u.materialName}`;
        if (!agg.has(key))
            agg.set(key, {
                inventoryItemId: u.inventoryItemId,
                materialName: u.materialName,
                unit: u.unit,
                totalQty: 0,
                taskIds: new Set(),
            });
        const a = agg.get(key);
        a.totalQty += Number(u.quantityUsed);
        a.taskIds.add(u.taskId);
    }
    const rows = [...agg.values()].map((r) => ({
        inventoryItemId: r.inventoryItemId,
        materialName: r.materialName,
        unit: r.unit,
        totalQty: +r.totalQty.toFixed(3),
        tasks: r.taskIds.size,
    }));
    res.json({ year, month, rows });
});

export default router;
