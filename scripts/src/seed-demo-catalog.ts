/**
 * Seed demo raw materials (wood, fabric, nails, polish) and finished products
 * (tables, chairs, sofas). Idempotent: updates by inventory name and product SKU.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-demo-catalog
 *
 * Source data: scripts/data/demo-catalog.json (CSV mirrors in same folder).
 * imagePlaceholder fields are documentation only — not persisted (no column in DB).
 *
 * DATABASE_URL: ../.env
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db, pool, inventoryTable, productsTable } from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RawMaterialRow {
  name: string;
  type: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
  unitCost: number;
  imagePlaceholder?: string;
}

interface ProductRow {
  name: string;
  sku: string;
  category: string;
  sellingPrice: number;
  costPrice: number;
  stockQuantity: number;
  description: string;
  imagePlaceholder?: string;
}

interface CatalogFile {
  rawMaterials: RawMaterialRow[];
  finishedProducts: ProductRow[];
}

const catalog: CatalogFile = JSON.parse(
  readFileSync(join(__dirname, "../data/demo-catalog.json"), "utf-8"),
) as CatalogFile;

console.log("\nFurniCore — Seed demo catalog");
console.log(`  Raw materials: ${catalog.rawMaterials.length}`);
console.log(`  Products:      ${catalog.finishedProducts.length}\n`);

for (const row of catalog.rawMaterials) {
  const [existing] = await db
    .select({ id: inventoryTable.id })
    .from(inventoryTable)
    .where(eq(inventoryTable.name, row.name))
    .limit(1);

  const values = {
    name: row.name,
    type: row.type,
    unit: row.unit,
    quantity: String(row.quantity),
    reorderLevel: String(row.reorderLevel),
    unitCost: String(row.unitCost),
  };

  if (existing) {
    await db.update(inventoryTable).set(values).where(eq(inventoryTable.id, existing.id));
    console.log(`  [inventory] updated  ${row.name.slice(0, 48)}…`);
  } else {
    await db.insert(inventoryTable).values(values);
    console.log(`  [inventory] created  ${row.name.slice(0, 48)}…`);
  }
}

for (const row of catalog.finishedProducts) {
  const [existing] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.sku, row.sku))
    .limit(1);

  const values = {
    name: row.name,
    sku: row.sku,
    category: row.category,
    sellingPrice: String(row.sellingPrice),
    costPrice: String(row.costPrice),
    stockQuantity: row.stockQuantity,
    description: row.description,
    isActive: true,
  };

  if (existing) {
    await db.update(productsTable).set(values).where(eq(productsTable.id, existing.id));
    console.log(`  [product]   updated  ${row.sku}`);
  } else {
    await db.insert(productsTable).values(values);
    console.log(`  [product]   created  ${row.sku}`);
  }
}

console.log("\n  Done. Image placeholders live in demo-catalog.json / CSVs only.\n");

await pool.end();
