import { pgTable, serial, varchar, text, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";

/**
 * Journal Entries — the source records for double-entry bookkeeping.
 *
 * status values : draft | posted | reversed
 * referenceType : transaction | accrual | manual | invoice | payroll
 *
 * A posted entry is immutable; it may only be corrected by a reversal entry.
 */
export const journalEntriesTable = pgTable("journal_entries", {
  id:            serial("id").primaryKey(),
  entryNumber:   varchar("entry_number", { length: 25 }).notNull().unique(),
  date:          date("date").notNull(),
  description:   text("description"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId:   integer("reference_id"),
  status:        varchar("status", { length: 20 }).default("draft"),
  createdBy:     integer("created_by"),
  postedAt:      timestamp("posted_at", { withTimezone: true }),
  notes:         text("notes"),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
});

/**
 * Journal Entry Lines — individual debit/credit sides of an entry.
 * For every posted entry: SUM(debit) must equal SUM(credit).
 */
export const journalEntryLinesTable = pgTable("journal_entry_lines", {
  id:             serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").notNull(),
  accountId:      integer("account_id").notNull(),
  description:    text("description"),
  debit:          numeric("debit",  { precision: 15, scale: 2 }).default("0"),
  credit:         numeric("credit", { precision: 15, scale: 2 }).default("0"),
});

export type JournalEntry     = typeof journalEntriesTable.$inferSelect;
export type InsertJournalEntry = typeof journalEntriesTable.$inferInsert;
export type JournalEntryLine = typeof journalEntryLinesTable.$inferSelect;
export type InsertJournalEntryLine = typeof journalEntryLinesTable.$inferInsert;
