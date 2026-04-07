import { pgTable, serial, varchar, text, integer, numeric, date, timestamp } from "drizzle-orm/pg-core";

/**
 * Accruals — accrual-basis adjusting entries.
 *
 * type values:
 *   accrued_income    — revenue earned, cash not yet received
 *   accrued_expense   — cost incurred, cash not yet paid
 *   deferred_income   — cash received before revenue is earned
 *   deferred_expense  — cash paid before the expense period
 *
 * status values: pending | recognized | reversed
 *
 * relatedEntityType: customer | supplier | expense
 */
export const accrualsTable = pgTable("accruals", {
  id:                serial("id").primaryKey(),
  type:              varchar("type", { length: 30 }).notNull(),
  description:       text("description").notNull(),
  amount:            numeric("amount", { precision: 15, scale: 2 }).notNull(),
  accountId:         integer("account_id"),
  counterAccountId:  integer("counter_account_id"),
  accrualDate:       date("accrual_date").notNull(),
  recognitionDate:   date("recognition_date"),
  status:            varchar("status", { length: 20 }).default("pending"),
  relatedEntityType: varchar("related_entity_type", { length: 30 }),
  relatedEntityId:   integer("related_entity_id"),
  journalEntryId:    integer("journal_entry_id"),
  reversalJeId:      integer("reversal_je_id"),
  createdBy:         integer("created_by"),
  notes:             text("notes"),
  createdAt:         timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
});

export type Accrual       = typeof accrualsTable.$inferSelect;
export type InsertAccrual = typeof accrualsTable.$inferInsert;
