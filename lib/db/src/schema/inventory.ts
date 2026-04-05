import { pgTable, text, serial, timestamp, numeric, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("raw_material"),
  unit: varchar("unit", { length: 50 }).notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("0"),
  reorderLevel: numeric("reorder_level", { precision: 12, scale: 3 }).notNull().default("0"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type InventoryItem = typeof inventoryTable.$inferSelect;
