/**
 * Seed demo suppliers and supplier quotes (price-lock workflow).
 *
 * Workflow (matches API routes /quotes/:id/lock|approve|pay):
 *   PENDING → LOCKED → ADMIN_APPROVED → PAID
 * The approve step stores status ADMIN_APPROVED (often shown as "Approved" in UI).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-demo-suppliers
 *
 * Data: scripts/data/demo-suppliers-quotes.json
 * Idempotent: suppliers upserted by email; quotes upserted via [demo-seed:q:slug] in notes.
 * Optional: links quotes to inventory rows when names match demo-catalog seed.
 *
 * DATABASE_URL: ../.env
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, like } from "drizzle-orm";
import { db, pool, suppliersTable, supplierQuotesTable, inventoryTable } from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SupplierRow {
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  contactPerson: string | null;
  status: string;
  rating: number;
}

interface QuoteRow {
  seedSlug: string;
  supplierEmail: string;
  inventoryItemName?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  status: "PENDING" | "LOCKED" | "ADMIN_APPROVED" | "PAID";
  validUntil: string | null;
  lockedAt?: string | null;
  approvedAt?: string | null;
  paidAt?: string | null;
  notes?: string | null;
  /** ERP workflow stage (default legacy = price-lock only) */
  workflowStage?: string | null;
  submittedForReviewAt?: string | null;
  requiresFinanceStep?: boolean;
}

interface Dataset {
  suppliers: SupplierRow[];
  quotes: QuoteRow[];
}

const data: Dataset = JSON.parse(
  readFileSync(join(__dirname, "../data/demo-suppliers-quotes.json"), "utf-8"),
) as Dataset;

function seedMarker(slug: string): string {
  return `[demo-seed:q:${slug}]`;
}

function combineNotes(base: string | null | undefined, slug: string): string {
  const m = seedMarker(slug);
  const parts = [base?.trim(), m].filter(Boolean);
  return parts.join("\n");
}

console.log("\nFurniCore — Seed demo suppliers & quotes");
console.log(`  Suppliers: ${data.suppliers.length}`);
console.log(`  Quotes:    ${data.quotes.length}\n`);

const supplierIdByEmail = new Map<string, number>();

for (const s of data.suppliers) {
  const [existing] = await db
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(eq(suppliersTable.email, s.email))
    .limit(1);

  const values = {
    name: s.name,
    email: s.email,
    phone: s.phone,
    address: s.address,
    contactPerson: s.contactPerson,
    status: s.status,
    rating: String(s.rating),
  };

  if (existing) {
    await db.update(suppliersTable).set(values).where(eq(suppliersTable.id, existing.id));
    supplierIdByEmail.set(s.email, existing.id);
    console.log(`  [supplier] updated  ${s.email}`);
  } else {
    const [created] = await db.insert(suppliersTable).values(values).returning({ id: suppliersTable.id });
    supplierIdByEmail.set(s.email, created.id);
    console.log(`  [supplier] created  ${s.email}`);
  }
}

for (const q of data.quotes) {
  const supplierId = supplierIdByEmail.get(q.supplierEmail);
  if (supplierId == null) {
    console.warn(`  [quote] SKIP ${q.seedSlug} — unknown supplier ${q.supplierEmail}`);
    continue;
  }

  let inventoryItemId: number | null = null;
  if (q.inventoryItemName) {
    const [inv] = await db
      .select({ id: inventoryTable.id })
      .from(inventoryTable)
      .where(eq(inventoryTable.name, q.inventoryItemName))
      .limit(1);
    inventoryItemId = inv?.id ?? null;
  }

  const qty = q.quantity;
  const unit = q.unitPrice;
  const totalPrice = String(Number((qty * unit).toFixed(2)));
  const marker = seedMarker(q.seedSlug);
  const notes = combineNotes(q.notes ?? null, q.seedSlug);

  const lockedAt = q.lockedAt ? new Date(q.lockedAt) : null;
  const approvedAt = q.approvedAt ? new Date(q.approvedAt) : null;
  const paidAt = q.paidAt ? new Date(q.paidAt) : null;
  const validUntil = q.validUntil ? new Date(q.validUntil) : null;

  const [existing] = await db
    .select({ id: supplierQuotesTable.id })
    .from(supplierQuotesTable)
    .where(like(supplierQuotesTable.notes, `%${marker}%`))
    .limit(1);

  const row = {
    supplierId,
    inventoryItemId,
    description: q.description,
    quantity: String(qty),
    unitPrice: String(unit),
    totalPrice,
    status: q.status,
    notes,
    validUntil,
    lockedAt,
    approvedAt,
    paidAt,
    workflowStage: q.workflowStage ?? "legacy",
    submittedForReviewAt: q.submittedForReviewAt ? new Date(q.submittedForReviewAt) : null,
    requiresFinanceStep: q.requiresFinanceStep ?? false,
  };

  if (existing) {
    await db.update(supplierQuotesTable).set(row).where(eq(supplierQuotesTable.id, existing.id));
    console.log(`  [quote]    updated  ${q.seedSlug} (${q.status})`);
  } else {
    await db.insert(supplierQuotesTable).values(row);
    console.log(`  [quote]    created  ${q.seedSlug} (${q.status})`);
  }
}

console.log("\n  Done.\n");

await pool.end();
