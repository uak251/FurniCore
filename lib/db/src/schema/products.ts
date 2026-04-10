import { pgTable, text, serial, timestamp, boolean, numeric, integer, varchar, smallint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productCategoriesTable } from "./product_categories";

/** Operational / merchandising status — independent of stock (products stay visible). */
export const PRODUCT_STATUSES = ["AVAILABLE", "IN_SHOWROOM", "IN_FACTORY", "WORK_IN_PROCESS"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Manufacturing line stages when status is WORK_IN_PROCESS. */
export const MANUFACTURING_STAGES = [
  "WOOD_STRUCTURE",
  "POSHISH",
  "POLISH",
  "FINISHING",
  "READY",
] as const;
export type ManufacturingStage = (typeof MANUFACTURING_STAGES)[number];

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sku: varchar("sku", { length: 100 }).notNull().unique(),
  /** Denormalized label — kept in sync with category row for legacy queries & CSV import. */
  category: varchar("category", { length: 100 }).notNull(),
  categoryId: integer("category_id").references(() => productCategoriesTable.id, { onDelete: "set null" }),
  productStatus: varchar("product_status", { length: 32 }).notNull().default("AVAILABLE"),
  wipStage: varchar("wip_stage", { length: 32 }),
  wipProgressPercent: smallint("wip_progress_percent"),
  wipDepartment: varchar("wip_department", { length: 120 }),
  sellingPrice: numeric("selling_price", { precision: 12, scale: 2 }).notNull(),
  /** Optional list / strike-through price for promotions. */
  compareAtPrice: numeric("compare_at_price", { precision: 12, scale: 2 }),
  costPrice: numeric("cost_price", { precision: 12, scale: 2 }).notNull(),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  /** Home “Hot selling” rail (lower = earlier). Null = not featured. */
  hotRank: integer("hot_rank"),
  /** Home “Most favourites” rail. */
  favouriteRank: integer("favourite_rank"),
  /** Average rating 0–5 for display (optional). */
  ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
