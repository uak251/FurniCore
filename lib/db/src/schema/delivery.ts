import { pgTable, serial, integer, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { supplierQuotesTable } from "./quotes";
import { usersTable } from "./users";

export const deliveryUpdatesTable = pgTable("delivery_updates", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id")
    .notNull()
    .references(() => supplierQuotesTable.id),
  status: varchar("status", { length: 50 }).notNull().default("preparing"),
  note: text("note"),
  estimatedDelivery: timestamp("estimated_delivery", { withTimezone: true }),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DeliveryUpdate = typeof deliveryUpdatesTable.$inferSelect;
