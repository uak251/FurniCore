import { pgTable, serial, varchar, text, timestamp } from "drizzle-orm/pg-core";

/** Optional cache for FX API responses (Frankfurter-compatible JSON). */
export const currencyRatesCacheTable = pgTable("currency_rates_cache", {
  id: serial("id").primaryKey(),
  baseCurrency: varchar("base_currency", { length: 3 }).notNull().unique(),
  ratesJson: text("rates_json").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});
