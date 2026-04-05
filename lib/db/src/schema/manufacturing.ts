import { pgTable, text, serial, timestamp, numeric, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const manufacturingTasksTable = pgTable("manufacturing_tasks", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => productsTable.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  assigneeId: integer("assignee_id").references(() => usersTable.id),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  priority: varchar("priority", { length: 50 }).notNull().default("medium"),
  estimatedHours: numeric("estimated_hours", { precision: 6, scale: 2 }),
  actualHours: numeric("actual_hours", { precision: 6, scale: 2 }),
  progress: integer("progress").notNull().default(0),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertManufacturingTaskSchema = createInsertSchema(manufacturingTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertManufacturingTask = z.infer<typeof insertManufacturingTaskSchema>;
export type ManufacturingTask = typeof manufacturingTasksTable.$inferSelect;
