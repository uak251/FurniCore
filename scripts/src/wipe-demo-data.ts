/**
 * Remove FurniCore seed-all-demo data so you can load organic test data.
 *
 * Keeps:
 *   - Master admin (ADMIN_EMAIL from env, default admin@furnicore.com)
 *   - Chart of accounts and other non-demo reference data
 *
 * Deletes (in FK-safe order): activity/notifications, sales & accounting rows
 * tagged by demo seeds, manufacturing, HR/payroll, suppliers & quotes, catalog
 * inventory/products resolved from scripts/data demo JSON files, and all users
 * with email @furnicore.demo.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts wipe-demo
 *
 * DATABASE_URL: ../.env
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, like, or } from "drizzle-orm";
import {
  accrualsTable,
  activityLogsTable,
  attendanceTable,
  customerOrdersTable,
  db,
  deliveryUpdatesTable,
  employeesTable,
  inventoryTable,
  invoicesTable,
  journalEntriesTable,
  journalEntryLinesTable,
  manufacturingTasksTable,
  materialUsageTable,
  notificationsTable,
  orderItemsTable,
  orderUpdatesTable,
  payrollAdjustmentsTable,
  payrollTable,
  performanceReviewsTable,
  pool,
  productionOrdersTable,
  productsTable,
  qcRemarksTable,
  recordImagesTable,
  supplierQuotesTable,
  suppliersTable,
  transactionsTable,
  usersTable,
} from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ADMIN_EMAIL = (process.env["ADMIN_EMAIL"] ?? "admin@furnicore.com").trim().toLowerCase();

function loadJson<T>(name: string): T {
  const raw = readFileSync(join(__dirname, "../data", name), "utf-8");
  return JSON.parse(raw) as T;
}

/* ── Collect demo keys from the same JSON files the seed scripts use ─────── */

const catalog = loadJson<{
  rawMaterials: { name: string }[];
  finishedProducts: { sku: string }[];
}>("demo-catalog.json");

let customersJson: { orders?: { items?: { productSku?: string }[] }[] } = {};
try {
  customersJson = loadJson("demo-customers.json");
} catch {
  /* optional file */
}

const suppliersFile = loadJson<{ suppliers: { email: string }[] }>("demo-suppliers-quotes.json");

const hrFile = loadJson<{ employees: { email: string }[] }>("demo-hr-payroll.json");

const demoInventoryNames = catalog.rawMaterials.map((r) => r.name);
const demoProductSkus = new Set<string>();
for (const p of catalog.finishedProducts) demoProductSkus.add(p.sku);
for (const o of customersJson.orders ?? []) {
  for (const line of o.items ?? []) {
    if (line.productSku) demoProductSkus.add(line.productSku);
  }
}

const demoSupplierEmails = suppliersFile.suppliers.map((s) => s.email);
const demoEmployeeEmails = new Set(hrFile.employees.map((e) => e.email));

console.log("\nFurniCore — Wipe demo data");
console.log(`  Master admin preserved: ${ADMIN_EMAIL}`);
console.log(`  Inventory rows (by name): ${demoInventoryNames.length}`);
console.log(`  Product SKUs:               ${demoProductSkus.size}`);
console.log(`  Supplier emails:          ${demoSupplierEmails.length}`);
console.log(`  Employee emails:          ${demoEmployeeEmails.size}\n`);

const demoUserPattern = like(usersTable.email, "%@furnicore.demo");

const demoUserRows = await db.select({ id: usersTable.id }).from(usersTable).where(demoUserPattern);
const demoUserIds = demoUserRows.map((r) => r.id);

/* 1 — Activity & notifications (demo-tagged + rows owned by demo users) */

const delActSeed = await db
  .delete(activityLogsTable)
  .where(like(activityLogsTable.description, "[demo-seed:activity]%"))
  .returning({ id: activityLogsTable.id });
console.log(`  [activity_logs] removed ${delActSeed.length} (demo-seed prefix)`);

if (demoUserIds.length > 0) {
  const delActUser = await db
    .delete(activityLogsTable)
    .where(inArray(activityLogsTable.userId, demoUserIds))
    .returning({ id: activityLogsTable.id });
  console.log(`  [activity_logs] removed ${delActUser.length} (demo user ids)`);
}

const delNotifSeed = await db
  .delete(notificationsTable)
  .where(like(notificationsTable.message, "[demo-seed:notify]%"))
  .returning({ id: notificationsTable.id });
console.log(`  [notifications] removed ${delNotifSeed.length} (demo-seed prefix)`);

if (demoUserIds.length > 0) {
  const delNotifUser = await db
    .delete(notificationsTable)
    .where(inArray(notificationsTable.userId, demoUserIds))
    .returning({ id: notificationsTable.id });
  console.log(`  [notifications] removed ${delNotifUser.length} (demo user ids)`);
}

/* 2 — Delivery updates tied to seeded supplier quotes */

const demoQuoteIds = await db
  .select({ id: supplierQuotesTable.id })
  .from(supplierQuotesTable)
  .where(like(supplierQuotesTable.notes, "%[demo-seed:q:%"));
const qids = demoQuoteIds.map((r) => r.id);
if (qids.length > 0) {
  const delDel = await db
    .delete(deliveryUpdatesTable)
    .where(inArray(deliveryUpdatesTable.quoteId, qids))
    .returning({ id: deliveryUpdatesTable.id });
  console.log(`  [delivery_updates] removed ${delDel.length}`);
}

/* 3 — Cash transactions & accruals tied to demo journal entries */

const delTx = await db
  .delete(transactionsTable)
  .where(like(transactionsTable.description, "[demo-seed:accounting]%"))
  .returning({ id: transactionsTable.id });
console.log(`  [transactions] removed ${delTx.length}`);

const demoJeIds = await db
  .select({ id: journalEntriesTable.id })
  .from(journalEntriesTable)
  .where(like(journalEntriesTable.entryNumber, "JE-DEMO-%"));

const jeIds = demoJeIds.map((r) => r.id);
if (jeIds.length > 0) {
  await db.delete(accrualsTable).where(
    or(inArray(accrualsTable.journalEntryId, jeIds), inArray(accrualsTable.reversalJeId, jeIds)),
  );
  console.log(`  [accruals] removed rows linked to JE-DEMO-*`);

  await db.delete(journalEntryLinesTable).where(inArray(journalEntryLinesTable.journalEntryId, jeIds));
  await db.delete(journalEntriesTable).where(inArray(journalEntriesTable.id, jeIds));
  console.log(`  [journal_entries] removed ${jeIds.length} (JE-DEMO-*)`);
} else {
  console.log(`  [journal_entries] none matched JE-DEMO-*`);
}

/* 4 — Customer sales (invoices → line items → orders) */

const delInv = await db
  .delete(invoicesTable)
  .where(like(invoicesTable.invoiceNumber, "INV-DEMO-%"))
  .returning({ id: invoicesTable.id });
console.log(`  [invoices] removed ${delInv.length}`);

const orderRows = await db
  .select({ id: customerOrdersTable.id })
  .from(customerOrdersTable)
  .where(like(customerOrdersTable.orderNumber, "ORD-DEMO-%"));
const orderIds = orderRows.map((r) => r.id);

if (orderIds.length > 0) {
  await db.delete(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds));
  await db.delete(orderUpdatesTable).where(inArray(orderUpdatesTable.orderId, orderIds));
  const delCo = await db
    .delete(customerOrdersTable)
    .where(inArray(customerOrdersTable.id, orderIds))
    .returning({ id: customerOrdersTable.id });
  console.log(`  [customer_orders] removed ${delCo.length} (ORD-DEMO-*)`);
} else {
  console.log(`  [customer_orders] none matched ORD-DEMO-*`);
}

/* 5 — Manufacturing: material usage → production orders → QC → tasks */

const demoTaskIds = await db
  .select({ id: manufacturingTasksTable.id })
  .from(manufacturingTasksTable)
  .where(like(manufacturingTasksTable.description, "%[demo-seed:task:%"));

const taskIds = demoTaskIds.map((r) => r.id);
if (taskIds.length > 0) {
  await db.delete(materialUsageTable).where(inArray(materialUsageTable.taskId, taskIds));
  console.log(`  [material_usage] cleared for demo tasks`);
}

await db.delete(productionOrdersTable).where(like(productionOrdersTable.orderNumber, "PO-DEMO-%"));
console.log(`  [production_orders] removed PO-DEMO-*`);

const delQc = await db
  .delete(qcRemarksTable)
  .where(like(qcRemarksTable.remarks, "%[demo-seed:qc:%"))
  .returning({ id: qcRemarksTable.id });
console.log(`  [qc_remarks] removed ${delQc.length}`);

const delTasks = await db
  .delete(manufacturingTasksTable)
  .where(like(manufacturingTasksTable.description, "%[demo-seed:task:%"))
  .returning({ id: manufacturingTasksTable.id });
console.log(`  [manufacturing_tasks] removed ${delTasks.length}`);

/* 6 — HR: payroll → adjustments → performance → attendance → employees */

const demoEmployeeRows = await db
  .select({ id: employeesTable.id })
  .from(employeesTable)
  .where(inArray(employeesTable.email, [...demoEmployeeEmails]));

const empIds = demoEmployeeRows.map((r) => r.id);

if (empIds.length > 0) {
  await db.delete(payrollTable).where(inArray(payrollTable.employeeId, empIds));
  await db.delete(payrollAdjustmentsTable).where(inArray(payrollAdjustmentsTable.employeeId, empIds));
  await db.delete(performanceReviewsTable).where(inArray(performanceReviewsTable.employeeId, empIds));
  await db.delete(attendanceTable).where(inArray(attendanceTable.employeeId, empIds));
  await db.delete(employeesTable).where(inArray(employeesTable.id, empIds));
  console.log(`  [employees + payroll + …] removed ${empIds.length} demo employee(s)`);
} else {
  console.log(`  [employees] no rows matched demo-hr-payroll.json emails`);
}

/* 7 — Supplier quotes & suppliers from demo JSON */

const delQuotes = await db
  .delete(supplierQuotesTable)
  .where(like(supplierQuotesTable.notes, "%[demo-seed:q:%"))
  .returning({ id: supplierQuotesTable.id });
console.log(`  [supplier_quotes] removed ${delQuotes.length}`);

if (demoSupplierEmails.length > 0) {
  const delSup = await db
    .delete(suppliersTable)
    .where(inArray(suppliersTable.email, demoSupplierEmails))
    .returning({ id: suppliersTable.id });
  console.log(`  [suppliers] removed ${delSup.length}`);
}

/* 8 — Images for demo inventory / products, then catalog rows */

const invRows = await db
  .select({ id: inventoryTable.id })
  .from(inventoryTable)
  .where(inArray(inventoryTable.name, demoInventoryNames));
const invIds = invRows.map((r) => r.id);

const skuList = [...demoProductSkus];
const prodRows =
  skuList.length > 0
    ? await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(inArray(productsTable.sku, skuList))
    : [];
const prodIds = prodRows.map((r) => r.id);

if (invIds.length > 0) {
  await db
    .delete(recordImagesTable)
    .where(and(eq(recordImagesTable.entityType, "inventory"), inArray(recordImagesTable.entityId, invIds)));
}
if (prodIds.length > 0) {
  await db
    .delete(recordImagesTable)
    .where(and(eq(recordImagesTable.entityType, "product"), inArray(recordImagesTable.entityId, prodIds)));
}

/* Line items can reference demo SKUs on non–ORD-DEMO orders; clear FKs before products. */
if (prodIds.length > 0) {
  const removedLines = await db
    .delete(orderItemsTable)
    .where(inArray(orderItemsTable.productId, prodIds))
    .returning({ id: orderItemsTable.id });
  if (removedLines.length > 0) {
    console.log(`  [order_items] removed ${removedLines.length} line(s) linked to demo product id(s)`);
  }
}

if (invIds.length > 0) {
  const n = await db.delete(inventoryTable).where(inArray(inventoryTable.id, invIds)).returning({ id: inventoryTable.id });
  console.log(`  [inventory] removed ${n.length}`);
} else {
  console.log(`  [inventory] no matching names from demo-catalog.json`);
}

if (prodIds.length > 0) {
  const n = await db.delete(productsTable).where(inArray(productsTable.id, prodIds)).returning({ id: productsTable.id });
  console.log(`  [products] removed ${n.length}`);
} else {
  console.log(`  [products] no matching SKUs`);
}

/* 9 — Portal demo users (@furnicore.demo). Master admin is never @furnicore.demo. */

const wipeUsers = await db.delete(usersTable).where(demoUserPattern).returning({ email: usersTable.email });

console.log(`  [users] removed ${wipeUsers.length} @furnicore.demo account(s)`);
if (wipeUsers.length > 0) {
  for (const u of wipeUsers) console.log(`           - ${u.email}`);
}

console.log("\n  Done. Chart of accounts and master admin are unchanged.\n");

await pool.end();
