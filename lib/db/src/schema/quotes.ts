import { pgTable, text, serial, timestamp, numeric, integer, varchar, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";
import { inventoryTable } from "./inventory";
import { usersTable } from "./users";

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
  /**
   * ERP workflow: draft → submitted → pm_review → finance_review (optional) → approved | rejected
   * Legacy quotes use workflow_stage null/legacy and old status values only.
   */
  workflowStage: varchar("workflow_stage", { length: 32 }).default("legacy"),
  submittedForReviewAt: timestamp("submitted_for_review_at", { withTimezone: true }),
  submittedByUserId: integer("submitted_by_user_id").references(() => usersTable.id),
  pmReviewedAt: timestamp("pm_reviewed_at", { withTimezone: true }),
  pmReviewerId: integer("pm_reviewer_id").references(() => usersTable.id),
  pmDecision: varchar("pm_decision", { length: 20 }),
  financeReviewedAt: timestamp("finance_reviewed_at", { withTimezone: true }),
  financeReviewerId: integer("finance_reviewer_id").references(() => usersTable.id),
  financeDecision: varchar("finance_decision", { length: 20 }),
  requiresFinanceStep: boolean("requires_finance_step").notNull().default(false),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSupplierQuoteSchema = createInsertSchema(supplierQuotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupplierQuote = z.infer<typeof insertSupplierQuoteSchema>;
export type SupplierQuote = typeof supplierQuotesTable.$inferSelect;
