/**
 * Production Manager schema extensions.
 *
 * Three new tables are added alongside the existing manufacturing_tasks table:
 *
 *   production_orders  — formal work orders linking a product + quantity to a task
 *   qc_remarks         — Quality Control inspection records per task; optionally
 *                        exposed to customers via visibleToCustomer flag
 *   material_usage     — tracks raw-material consumption per task
 *
 * After adding this file run:
 *   pnpm --filter @workspace/db run push
 */

import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  integer,
  boolean,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { manufacturingTasksTable } from "./manufacturing";
import { productsTable } from "./products";
import { inventoryTable } from "./inventory";
import { usersTable } from "./users";

// ─── Production Orders ────────────────────────────────────────────────────────

export const productionOrdersTable = pgTable("production_orders", {
  id: serial("id").primaryKey(),
  /** Auto-generated: PO-YYYYMMDD-XXXX */
  orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
  /** Optional link to a manufacturing task on the floor */
  taskId: integer("task_id").references(() => manufacturingTasksTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  quantity: integer("quantity").notNull().default(1),
  targetDate: timestamp("target_date", { withTimezone: true }),
  /** planned | in_production | quality_check | completed | cancelled */
  status: varchar("status", { length: 50 }).notNull().default("planned"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProductionOrderSchema = createInsertSchema(productionOrdersTable).omit({
  id: true,
  orderNumber: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProductionOrder = z.infer<typeof insertProductionOrderSchema>;
export type ProductionOrder = typeof productionOrdersTable.$inferSelect;

// ─── QC Remarks ───────────────────────────────────────────────────────────────

export const qcRemarksTable = pgTable("qc_remarks", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => manufacturingTasksTable.id),
  inspectorId: integer("inspector_id").references(() => usersTable.id),
  /** pass | fail | hold */
  result: varchar("result", { length: 20 }).notNull(),
  remarks: text("remarks").notNull(),
  /** When true the remark is returned by the public /qc-remarks/public endpoint */
  visibleToCustomer: boolean("visible_to_customer").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertQcRemarkSchema = createInsertSchema(qcRemarksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertQcRemark = z.infer<typeof insertQcRemarkSchema>;
export type QcRemark = typeof qcRemarksTable.$inferSelect;

// ─── Material Usage ───────────────────────────────────────────────────────────

export const materialUsageTable = pgTable("material_usage", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => manufacturingTasksTable.id),
  /** Optional link to an inventory item (for cross-referencing stock) */
  inventoryItemId: integer("inventory_item_id").references(() => inventoryTable.id),
  /** Free-text name (filled automatically from inventoryItem if linked) */
  materialName: varchar("material_name", { length: 255 }).notNull(),
  quantityUsed: numeric("quantity_used", { precision: 12, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  notes: text("notes"),
  loggedBy: integer("logged_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMaterialUsageSchema = createInsertSchema(materialUsageTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMaterialUsage = z.infer<typeof insertMaterialUsageSchema>;
export type MaterialUsage = typeof materialUsageTable.$inferSelect;
