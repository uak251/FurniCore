/**
 * Monthly standard costs + demo price proposal for COGM / approval dashboards.
 *
 * Prerequisites: seed-demo-catalog (products), seed-demo-users (sales_manager).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-demo-cogm
 */

import { and, eq } from "drizzle-orm";
import {
  db,
  pool,
  productsTable,
  productStandardCostsMonthlyTable,
  productPriceProposalsTable,
  usersTable,
} from "@workspace/db";

const STANDARD_ROWS: {
  sku: string;
  year: number;
  month: number;
  material: number;
  labor: number;
  overhead: number;
}[] = [
  { sku: "SKU-TBL-HARBOR-6-OAK", year: 2026, month: 4, material: 420, labor: 195, overhead: 45 },
  { sku: "SKU-CHR-LUNA-ARM", year: 2026, month: 2, material: 88, labor: 52, overhead: 11 },
  { sku: "SKU-DESK-SUMMIT-WAL", year: 2026, month: 4, material: 310, labor: 140, overhead: 35 },
];

console.log("\nFurniCore — Seed demo COGM / price proposals\n");

for (const s of STANDARD_ROWS) {
  const [p] = await db.select().from(productsTable).where(eq(productsTable.sku, s.sku)).limit(1);
  if (!p) {
    console.warn(`  [standard cost] SKIP — product SKU not found: ${s.sku}`);
    continue;
  }
  const total = s.material + s.labor + s.overhead;
  const [existing] = await db
    .select({ id: productStandardCostsMonthlyTable.id })
    .from(productStandardCostsMonthlyTable)
    .where(
      and(
        eq(productStandardCostsMonthlyTable.productId, p.id),
        eq(productStandardCostsMonthlyTable.year, s.year),
        eq(productStandardCostsMonthlyTable.month, s.month),
      ),
    )
    .limit(1);

  const payload = {
    materialStandard: String(s.material.toFixed(2)),
    laborStandard: String(s.labor.toFixed(2)),
    overheadStandard: String(s.overhead.toFixed(2)),
    totalStandard: String(total.toFixed(2)),
    notes: "[demo-seed:standard-cost]",
  };

  if (existing) {
    await db.update(productStandardCostsMonthlyTable).set(payload).where(eq(productStandardCostsMonthlyTable.id, existing.id));
    console.log(`  [standard cost] updated  ${s.sku} ${s.year}-${String(s.month).padStart(2, "0")}`);
  } else {
    await db.insert(productStandardCostsMonthlyTable).values({
      productId: p.id,
      year: s.year,
      month: s.month,
      ...payload,
      createdBy: null,
    });
    console.log(`  [standard cost] created  ${s.sku} ${s.year}-${String(s.month).padStart(2, "0")}`);
  }
}

const [luna] = await db.select().from(productsTable).where(eq(productsTable.sku, "SKU-CHR-LUNA-ARM")).limit(1);
const [sales] = await db.select().from(usersTable).where(eq(usersTable.email, "priya.nair@furnicore.demo")).limit(1);

if (luna && sales) {
  const [pending] = await db
    .select({ id: productPriceProposalsTable.id })
    .from(productPriceProposalsTable)
    .where(and(eq(productPriceProposalsTable.productId, luna.id), eq(productPriceProposalsTable.status, "pending")))
    .limit(1);

  if (!pending) {
    const base = Number(luna.sellingPrice);
    const proposed = +(base * 0.92).toFixed(2);
    await db.insert(productPriceProposalsTable).values({
      productId: luna.id,
      proposedSellingPrice: String(proposed.toFixed(2)),
      proposedCompareAtPrice: luna.compareAtPrice != null ? String(Number(luna.compareAtPrice).toFixed(2)) : null,
      discountPercentRequested: "8.00",
      status: "pending",
      notes: "[demo-seed:price-proposal-luna] Spring promo — manager approval",
      proposedByUserId: sales.id,
    });
    console.log("  [price proposal] created  Luna armchair (pending)");
  } else {
    console.log("  [price proposal] skip     Luna armchair (pending already exists)");
  }
} else {
  console.warn("  [price proposal] SKIP — product or sales_manager user missing");
}

console.log("\n  Done.\n");

await pool.end();
