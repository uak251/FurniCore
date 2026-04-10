import { pgTable, serial, integer, varchar, text, timestamp, smallint } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { productsTable } from "./products";

/**
 * Append-only timeline for product status / manufacturing stage / progress changes.
 * Supports audit trail and customer-facing “confidence” in WIP visibility.
 */
export const productManufacturingEventsTable = pgTable("product_manufacturing_events", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 32 }).notNull(),
  fromStatus: varchar("from_status", { length: 32 }),
  toStatus: varchar("to_status", { length: 32 }),
  fromStage: varchar("from_stage", { length: 32 }),
  toStage: varchar("to_stage", { length: 32 }),
  fromProgress: smallint("from_progress"),
  toProgress: smallint("to_progress"),
  department: varchar("department", { length: 120 }),
  note: text("note"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductManufacturingEventRow = typeof productManufacturingEventsTable.$inferSelect;
