import { pgTable, serial, varchar, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Chart of Accounts — the master list of all ledger accounts.
 *
 * type values   : asset | liability | equity | income | expense
 * subtype       : current_asset | fixed_asset | current_liability | long_term_liability | …
 * normalBalance : debit (assets, expenses) | credit (liabilities, equity, income)
 */
export const chartOfAccountsTable = pgTable("chart_of_accounts", {
  id:            serial("id").primaryKey(),
  code:          varchar("code", { length: 20 }).notNull().unique(),
  name:          varchar("name", { length: 120 }).notNull(),
  type:          varchar("type", { length: 20 }).notNull(),
  subtype:       varchar("subtype", { length: 50 }),
  normalBalance: varchar("normal_balance", { length: 10 }).notNull(),
  parentId:      integer("parent_id"),
  description:   text("description"),
  isActive:      boolean("is_active").default(true),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type ChartOfAccount = typeof chartOfAccountsTable.$inferSelect;
export type InsertChartOfAccount = typeof chartOfAccountsTable.$inferInsert;
