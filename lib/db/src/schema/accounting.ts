import { pgTable, text, serial, timestamp, numeric, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  reference: varchar("reference", { length: 100 }),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  status: varchar("status", { length: 50 }).notNull().default("completed"),
  transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
