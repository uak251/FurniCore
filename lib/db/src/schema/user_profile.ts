import { pgTable, integer, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Extended customer/staff profile (1:1 with users). */
export const userProfilesTable = pgTable("user_profiles", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  fullName: varchar("full_name", { length: 255 }),
  country: varchar("country", { length: 120 }),
  cityRegion: varchar("city_region", { length: 120 }),
  /** Explicit override; null = use locality-based default (country + Accept-Language). */
  preferredCurrency: varchar("preferred_currency", { length: 3 }),
  timezone: varchar("timezone", { length: 80 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserProfileRow = typeof userProfilesTable.$inferSelect;
