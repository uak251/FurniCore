/**
 * Price approval workflows (customer-facing proposals) and COGM / standard cost.
 */
import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  numeric,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./users";
import { supplierQuotesTable } from "./quotes";
import { suppliersTable } from "./suppliers";
import { inventoryTable } from "./inventory";
import { manufacturingTasksTable } from "./manufacturing";

/** Sales-led price / discount change — requires Admin/Management approval. */
export const productPriceProposalsTable = pgTable("product_price_proposals", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  proposedSellingPrice: numeric("proposed_selling_price", { precision: 12, scale: 2 }).notNull(),
  proposedCompareAtPrice: numeric("proposed_compare_at_price", { precision: 12, scale: 2 }),
  discountPercentRequested: numeric("discount_percent_requested", { precision: 5, scale: 2 }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  notes: text("notes"),
  proposedByUserId: integer("proposed_by_user_id").references(() => usersTable.id),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Approved supplier unit rates (snapshot when quote workflow completes). */
export const supplierOfficialRatesTable = pgTable("supplier_official_rates", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
  inventoryItemId: integer("inventory_item_id").notNull().references(() => inventoryTable.id),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  sourceQuoteId: integer("source_quote_id").references(() => supplierQuotesTable.id),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Monthly standard cost baseline per finished product (COGM planning). */
export const productStandardCostsMonthlyTable = pgTable(
  "product_standard_costs_monthly",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => productsTable.id),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    materialStandard: numeric("material_standard", { precision: 12, scale: 2 }).notNull().default("0"),
    laborStandard: numeric("labor_standard", { precision: 12, scale: 2 }).notNull().default("0"),
    overheadStandard: numeric("overhead_standard", { precision: 12, scale: 2 }).notNull().default("0"),
    totalStandard: numeric("total_standard", { precision: 12, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("product_standard_costs_monthly_product_period_uid").on(t.productId, t.year, t.month)],
);

/** Stored variance snapshot (estimated vs actual) for reporting. */
export const cogmVarianceRecordsTable = pgTable("cogm_variance_records", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => productsTable.id),
  taskId: integer("task_id").references(() => manufacturingTasksTable.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  estimatedMaterial: numeric("estimated_material", { precision: 12, scale: 2 }).notNull().default("0"),
  actualMaterial: numeric("actual_material", { precision: 12, scale: 2 }).notNull().default("0"),
  estimatedLabor: numeric("estimated_labor", { precision: 12, scale: 2 }).notNull().default("0"),
  actualLabor: numeric("actual_labor", { precision: 12, scale: 2 }).notNull().default("0"),
  varianceAmount: numeric("variance_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  variancePercent: numeric("variance_percent", { precision: 8, scale: 2 }),
  remark: varchar("remark", { length: 32 }),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProductPriceProposalSchema = createInsertSchema(productPriceProposalsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ProductPriceProposal = typeof productPriceProposalsTable.$inferSelect;
