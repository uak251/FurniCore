import { pgTable, text, serial, timestamp, numeric, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";
import { inventoryTable } from "./inventory";

export const supplierQuotesTable = pgTable("supplier_quotes", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
  inventoryItemId: integer("inventory_item_id").references(() => inventoryTable.id),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("PENDING"),
  notes: text("notes"),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSupplierQuoteSchema = createInsertSchema(supplierQuotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupplierQuote = z.infer<typeof insertSupplierQuoteSchema>;
export type SupplierQuote = typeof supplierQuotesTable.$inferSelect;
