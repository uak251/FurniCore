/**
 * Seed demo manufacturing tasks, production orders, and QC remarks.
 *
 * Prerequisites: run seed-demo-users (worker + managers) and seed-demo-catalog (product SKUs).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-demo-manufacturing
 *
 * Data: scripts/data/demo-manufacturing.json
 * Idempotent: tasks keyed by [demo-seed:task:slug] in description;
 *             orders keyed by fixed orderNumber;
 *             QC keyed by [demo-seed:qc:slug] in remarks.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, like } from "drizzle-orm";
import {
  db,
  pool,
  manufacturingTasksTable,
  productionOrdersTable,
  qcRemarksTable,
  productsTable,
  usersTable,
  materialUsageTable,
  inventoryTable,
} from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TaskRow {
  seedSlug: string;
  title: string;
  description: string;
  productSku: string;
  assigneeEmail: string;
  status: string;
  priority: string;
  estimatedHours: number;
  actualHours: number | null;
  progress: number;
  dueDate: string;
  completedAt: string | null;
}

interface OrderRow {
  orderNumber: string;
  taskSeedSlug: string | null;
  productSku: string;
  quantity: number;
  targetDate: string;
  status: string;
  notes: string | null;
}

interface QcRow {
  seedSlug: string;
  taskSeedSlug: string;
  inspectorEmail: string;
  result: "pass" | "fail" | "hold";
  remarks: string;
  visibleToCustomer: boolean;
}

interface MaterialUsageRow {
  seedSlug: string;
  taskSeedSlug: string;
  inventoryItemName: string;
  quantityUsed: number;
  unit: string;
  notes: string | null;
}

interface Dataset {
  tasks: TaskRow[];
  productionOrders: OrderRow[];
  qcRemarks: QcRow[];
  materialUsages?: MaterialUsageRow[];
}

const data: Dataset = JSON.parse(
  readFileSync(join(__dirname, "../data/demo-manufacturing.json"), "utf-8"),
) as Dataset;

function taskMarker(slug: string): string {
  return `[demo-seed:task:${slug}]`;
}

function qcMarker(slug: string): string {
  return `[demo-seed:qc:${slug}]`;
}

function muMarker(slug: string): string {
  return `[demo-seed:mu:${slug}]`;
}

async function resolveProductId(sku: string): Promise<number | null> {
  const [p] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.sku, sku)).limit(1);
  return p?.id ?? null;
}

async function resolveUserId(email: string): Promise<number | null> {
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  return u?.id ?? null;
}

console.log("\nFurniCore — Seed demo manufacturing");
console.log(
  `  Tasks: ${data.tasks.length} · Orders: ${data.productionOrders.length} · QC: ${data.qcRemarks.length} · Material usage: ${data.materialUsages?.length ?? 0}\n`,
);

const taskIdBySlug = new Map<string, number>();

for (const t of data.tasks) {
  const marker = taskMarker(t.seedSlug);
  const productId = await resolveProductId(t.productSku);
  if (productId == null) {
    console.warn(`  [task] SKIP ${t.seedSlug} — product SKU not found: ${t.productSku}`);
    continue;
  }
  const assigneeId = await resolveUserId(t.assigneeEmail);
  if (assigneeId == null) {
    console.warn(`  [task] SKIP ${t.seedSlug} — user not found: ${t.assigneeEmail}`);
    continue;
  }

  const description = `${t.description.trim()}\n\n${marker}`;
  const dueDate = new Date(t.dueDate);
  const completedAt = t.completedAt ? new Date(t.completedAt) : null;

  const row = {
    productId,
    title: t.title,
    description,
    assigneeId,
    status: t.status,
    priority: t.priority,
    estimatedHours: String(t.estimatedHours),
    actualHours: t.actualHours != null ? String(t.actualHours) : null,
    progress: t.progress,
    dueDate,
    completedAt,
  };

  const [existing] = await db
    .select({ id: manufacturingTasksTable.id })
    .from(manufacturingTasksTable)
    .where(like(manufacturingTasksTable.description, `%${marker}%`))
    .limit(1);

  if (existing) {
    await db.update(manufacturingTasksTable).set(row).where(eq(manufacturingTasksTable.id, existing.id));
    taskIdBySlug.set(t.seedSlug, existing.id);
    console.log(`  [task] updated  ${t.seedSlug}`);
  } else {
    const [created] = await db.insert(manufacturingTasksTable).values(row).returning({ id: manufacturingTasksTable.id });
    taskIdBySlug.set(t.seedSlug, created.id);
    console.log(`  [task] created  ${t.seedSlug}`);
  }
}

for (const o of data.productionOrders) {
  const productId = await resolveProductId(o.productSku);
  if (productId == null) {
    console.warn(`  [order] SKIP ${o.orderNumber} — product SKU not found: ${o.productSku}`);
    continue;
  }

  const taskId = o.taskSeedSlug ? (taskIdBySlug.get(o.taskSeedSlug) ?? null) : null;
  if (o.taskSeedSlug && taskId == null) {
    console.warn(`  [order] SKIP ${o.orderNumber} — task slug not seeded: ${o.taskSeedSlug}`);
    continue;
  }

  const targetDate = new Date(o.targetDate);

  const row = {
    orderNumber: o.orderNumber,
    taskId,
    productId,
    quantity: o.quantity,
    targetDate,
    status: o.status,
    notes: o.notes,
    createdBy: null as number | null,
  };

  const [existing] = await db
    .select({ id: productionOrdersTable.id })
    .from(productionOrdersTable)
    .where(eq(productionOrdersTable.orderNumber, o.orderNumber))
    .limit(1);

  if (existing) {
    await db.update(productionOrdersTable).set(row).where(eq(productionOrdersTable.id, existing.id));
    console.log(`  [order] updated  ${o.orderNumber}`);
  } else {
    await db.insert(productionOrdersTable).values(row);
    console.log(`  [order] created  ${o.orderNumber}`);
  }
}

for (const q of data.qcRemarks) {
  const taskId = taskIdBySlug.get(q.taskSeedSlug);
  if (taskId == null) {
    console.warn(`  [qc] SKIP ${q.seedSlug} — task not found: ${q.taskSeedSlug}`);
    continue;
  }
  const inspectorId = await resolveUserId(q.inspectorEmail);
  if (inspectorId == null) {
    console.warn(`  [qc] SKIP ${q.seedSlug} — inspector not found: ${q.inspectorEmail}`);
    continue;
  }

  const remarks = `${q.remarks.trim()}\n\n${qcMarker(q.seedSlug)}`;
  const marker = qcMarker(q.seedSlug);

  const [existing] = await db
    .select({ id: qcRemarksTable.id })
    .from(qcRemarksTable)
    .where(like(qcRemarksTable.remarks, `%${marker}%`))
    .limit(1);

  const row = {
    taskId,
    inspectorId,
    result: q.result,
    remarks,
    visibleToCustomer: q.visibleToCustomer,
  };

  if (existing) {
    await db.update(qcRemarksTable).set(row).where(eq(qcRemarksTable.id, existing.id));
    console.log(`  [qc] updated  ${q.seedSlug} (${q.result})`);
  } else {
    await db.insert(qcRemarksTable).values(row);
    console.log(`  [qc] created  ${q.seedSlug} (${q.result})`);
  }
}

for (const mu of data.materialUsages ?? []) {
  const taskId = taskIdBySlug.get(mu.taskSeedSlug);
  if (taskId == null) {
    console.warn(`  [material_usage] SKIP ${mu.seedSlug} — task not found: ${mu.taskSeedSlug}`);
    continue;
  }
  const [inv] = await db
    .select({ id: inventoryTable.id, name: inventoryTable.name })
    .from(inventoryTable)
    .where(eq(inventoryTable.name, mu.inventoryItemName))
    .limit(1);
  if (inv == null) {
    console.warn(`  [material_usage] SKIP ${mu.seedSlug} — inventory not found: ${mu.inventoryItemName}`);
    continue;
  }
  const marker = muMarker(mu.seedSlug);
  const notes = mu.notes?.trim() ? `${mu.notes.trim()}\n\n${marker}` : marker;

  const [existing] = await db
    .select({ id: materialUsageTable.id })
    .from(materialUsageTable)
    .where(like(materialUsageTable.notes, `%${marker}%`))
    .limit(1);

  const row = {
    taskId,
    inventoryItemId: inv.id,
    materialName: inv.name,
    quantityUsed: String(mu.quantityUsed),
    unit: mu.unit,
    notes,
    loggedBy: null as number | null,
  };

  if (existing) {
    await db.update(materialUsageTable).set(row).where(eq(materialUsageTable.id, existing.id));
    console.log(`  [material_usage] updated  ${mu.seedSlug}`);
  } else {
    await db.insert(materialUsageTable).values(row);
    console.log(`  [material_usage] created  ${mu.seedSlug}`);
  }
}

console.log("\n  Done.\n");

await pool.end();
