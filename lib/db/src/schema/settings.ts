import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Key-value store for runtime application settings configurable by admin.
 * Supplements environment variables — DB values take precedence.
 *
 * Known keys (POWERBI_*):
 *   POWERBI_TENANT_ID, POWERBI_CLIENT_ID, POWERBI_CLIENT_SECRET,
 *   POWERBI_WORKSPACE_ID, POWERBI_REPORT_SUPPLIER_LEDGER, …
 */
export const appSettingsTable = pgTable("app_settings", {
  key:       varchar("key", { length: 120 }).primaryKey(),
  value:     text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type AppSetting = typeof appSettingsTable.$inferSelect;
