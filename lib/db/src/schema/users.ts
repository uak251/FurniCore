import { pgTable, text, serial, timestamp, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 50 }).notNull().default("employee"),
  isActive: boolean("is_active").notNull().default(true),
  /**
   * Whether the user has clicked the link in their verification email.
   * Self-registered accounts start as false; admin-created accounts start as true.
   * Login is blocked until this is true.
   */
  isVerified: boolean("is_verified").notNull().default(false),
  /** The JWT verification token last sent to the user's inbox (single-use). */
  emailVerifyToken: text("email_verify_token"),
  /** UTC expiry of emailVerifyToken — mirrors the JWT exp claim for fast DB queries. */
  emailVerifyExpiry: timestamp("email_verify_expiry", { withTimezone: true }),
  refreshToken: text("refresh_token"),
  /** JSON array of extra module permissions granted by admin, e.g. '["hr","payroll"]' */
  permissions: text("permissions"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
