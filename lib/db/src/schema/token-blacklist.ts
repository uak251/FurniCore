import { pgTable, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Revoked access tokens (logout, password change, admin revoke).
 * Rows can be purged when expires_at is in the past (token would be invalid anyway).
 */
export const tokenBlacklistTable = pgTable("token_blacklist", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  reason: varchar("reason", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TokenBlacklistRow = typeof tokenBlacklistTable.$inferSelect;
