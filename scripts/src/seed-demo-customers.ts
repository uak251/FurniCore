/**
 * Seed demo customers, orders, order progress updates, invoices, and payments.
 * Receivables (AR aging) are derived automatically by the API from invoices with
 * status 'sent' or 'overdue' — no separate table needed.
 *
 * Prerequisite: seed-demo-users should run first (no hard failure if skipped).
 * Optional:     seed-demo-catalog — if run, product_id will be resolved by SKU;
 *               otherwise order items are inserted with product_id = null.
 *
 * Idempotent:
 *   - Customers upserted by email.
 *   - Orders upserted by order_number (items + updates fully replaced on re-run).
 *   - Invoices upserted by invoice_number.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-demo-customers
 *
 * Data: scripts/data/demo-customers.json
 * DATABASE_URL: ../.env
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  customerOrdersTable,
  orderItemsTable,
  orderUpdatesTable,
  invoicesTable,
  productsTable,
} from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ── Types matching demo-customers.json ──────────────────────────────────── */

interface CustomerRow {
  name: string;
  email: string;
  role: string;
}

interface OrderItemRow {
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
}

interface OrderUpdateRow {
  message: string;
  status: string | null;
  visibleToCustomer: boolean;
}

interface OrderRow {
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  status: string;
  notes: string | null;
  shippingAddress: string | null;
  subtotal: number;
  discountCode: string | null;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  estimatedDelivery: string | null;
  items: OrderItemRow[];
  updates: OrderUpdateRow[];
}

interface InvoiceRow {
  invoiceNumber: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  status: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
}

interface DemoCustomersFile {
  customers: CustomerRow[];
  orders: OrderRow[];
  invoices: InvoiceRow[];
}

/* ── Load data ────────────────────────────────────────────────────────────── */

const data: DemoCustomersFile = JSON.parse(
  readFileSync(join(__dirname, "../data/demo-customers.json"), "utf-8"),
) as DemoCustomersFile;

console.log("\nFurniCore — Seed demo customers");
console.log(`  Customers:  ${data.customers.length}`);
console.log(`  Orders:     ${data.orders.length}`);
console.log(`  Invoices:   ${data.invoices.length}\n`);

const DEMO_PASSWORD = process.env["DEMO_USER_PASSWORD"] ?? "Demo@123456";
const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

/* ── 1. Upsert customers ─────────────────────────────────────────────────── */

const emailToUserId = new Map<string, number>();

for (const c of data.customers) {
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, c.email))
    .limit(1);

  if (existing) {
    await db
      .update(usersTable)
      .set({ name: c.name, role: c.role, passwordHash, isActive: true, isVerified: true })
      .where(eq(usersTable.id, existing.id));
    emailToUserId.set(c.email, existing.id);
    console.log(`  [customer] updated  ${c.email}`);
  } else {
    const [inserted] = await db
      .insert(usersTable)
      .values({ name: c.name, email: c.email, passwordHash, role: c.role, isActive: true, isVerified: true })
      .returning({ id: usersTable.id });
    emailToUserId.set(c.email, inserted.id);
    console.log(`  [customer] created  ${c.email}`);
  }
}

/* ── 2. Resolve product SKUs (optional — requires seed-demo-catalog) ─────── */

const allSkus = data.orders.flatMap((o) => o.items.map((i) => i.productSku)).filter(Boolean);
const productRows = allSkus.length
  ? await db
      .select({ id: productsTable.id, sku: productsTable.sku })
      .from(productsTable)
      .where(inArray(productsTable.sku, allSkus))
  : [];
const skuToProductId = new Map(productRows.map((r) => [r.sku, r.id]));

if (productRows.length === 0) {
  console.log("  [info] No catalog products resolved — order items will have product_id = null.");
} else {
  console.log(`  [info] Resolved ${productRows.length} product SKUs from catalog.\n`);
}

/* ── 3. Upsert orders, items, and progress updates ───────────────────────── */

const orderNumberToId = new Map<string, number>();

for (const order of data.orders) {
  const customerId = emailToUserId.get(order.customerEmail) ?? null;

  const orderValues = {
    orderNumber:       order.orderNumber,
    customerId,
    customerName:      order.customerName,
    customerEmail:     order.customerEmail,
    status:            order.status,
    notes:             order.notes ?? null,
    shippingAddress:   order.shippingAddress ?? null,
    subtotal:          String(order.subtotal),
    discountCode:      order.discountCode ?? null,
    discountAmount:    String(order.discountAmount),
    taxRate:           String(order.taxRate),
    taxAmount:         String(order.taxAmount),
    totalAmount:       String(order.totalAmount),
    estimatedDelivery: order.estimatedDelivery ? new Date(order.estimatedDelivery) : null,
  };

  const [existing] = await db
    .select({ id: customerOrdersTable.id })
    .from(customerOrdersTable)
    .where(eq(customerOrdersTable.orderNumber, order.orderNumber))
    .limit(1);

  let orderId: number;

  if (existing) {
    await db.update(customerOrdersTable).set(orderValues).where(eq(customerOrdersTable.id, existing.id));
    await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, existing.id));
    await db.delete(orderUpdatesTable).where(eq(orderUpdatesTable.orderId, existing.id));
    orderId = existing.id;
    console.log(`  [order]    updated  ${order.orderNumber}  (${order.status})`);
  } else {
    const [inserted] = await db
      .insert(customerOrdersTable)
      .values(orderValues)
      .returning({ id: customerOrdersTable.id });
    orderId = inserted.id;
    console.log(`  [order]    created  ${order.orderNumber}  (${order.status})`);
  }

  orderNumberToId.set(order.orderNumber, orderId);

  if (order.items.length) {
    await db.insert(orderItemsTable).values(
      order.items.map((item) => ({
        orderId,
        productId:      skuToProductId.get(item.productSku) ?? null,
        productName:    item.productName,
        productSku:     item.productSku || null,
        quantity:       item.quantity,
        unitPrice:      String(item.unitPrice),
        discountPercent: String(item.discountPercent),
        lineTotal:      String(item.lineTotal),
      })),
    );
  }

  if (order.updates.length) {
    await db.insert(orderUpdatesTable).values(
      order.updates.map((u) => ({
        orderId,
        message:           u.message,
        status:            u.status ?? null,
        visibleToCustomer: u.visibleToCustomer,
        createdBy:         null,
      })),
    );
    console.log(`    → ${order.updates.length} progress update(s)`);
  }
}

/* ── 4. Upsert invoices ───────────────────────────────────────────────────── */

console.log();

for (const inv of data.invoices) {
  const orderId    = orderNumberToId.get(inv.orderNumber) ?? null;
  const customerId = emailToUserId.get(inv.customerEmail) ?? null;

  const invoiceValues = {
    invoiceNumber:    inv.invoiceNumber,
    orderId,
    customerId,
    customerName:     inv.customerName,
    customerEmail:    inv.customerEmail,
    status:           inv.status,
    subtotal:         String(inv.subtotal),
    discountAmount:   String(inv.discountAmount),
    taxAmount:        String(inv.taxAmount),
    totalAmount:      String(inv.totalAmount),
    dueDate:          inv.dueDate    ? new Date(inv.dueDate)  : null,
    paidAt:           inv.paidAt     ? new Date(inv.paidAt)   : null,
    paymentMethod:    inv.paymentMethod    ?? null,
    paymentReference: inv.paymentReference ?? null,
    notes:            inv.notes            ?? null,
    createdBy:        null,
  };

  const [existing] = await db
    .select({ id: invoicesTable.id })
    .from(invoicesTable)
    .where(eq(invoicesTable.invoiceNumber, inv.invoiceNumber))
    .limit(1);

  if (existing) {
    const { invoiceNumber: _, ...updateValues } = invoiceValues;
    await db.update(invoicesTable).set(updateValues).where(eq(invoicesTable.id, existing.id));
    console.log(`  [invoice]  updated  ${inv.invoiceNumber}  (${inv.status})`);
  } else {
    await db.insert(invoicesTable).values(invoiceValues);
    console.log(`  [invoice]  created  ${inv.invoiceNumber}  (${inv.status})`);
  }
}

console.log(`
  Summary
  ───────────────────────────────────────────────────────
  Customers  : ${data.customers.length} (role=customer, password=${DEMO_PASSWORD})
  Orders     : ${data.orders.length} — statuses: draft, confirmed, in_production, quality_check, shipped, delivered, cancelled
  Invoices   : ${data.invoices.length} — paid ×2, sent ×2, overdue ×1, draft ×2, cancelled ×1
  Receivables: Auto-derived from invoices (sent + overdue) via GET /sales-manager/receivables
  Progress   : Order updates visible in customer portal GET /customer-portal/orders/:id

  See demo-customers.json → meta.reportMapping for endpoint details.
`);

await pool.end();
