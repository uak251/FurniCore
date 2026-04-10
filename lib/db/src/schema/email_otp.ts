import { pgTable, serial, varchar, text, timestamp } from "drizzle-orm/pg-core";

/** Email signup / verification OTP (hashed). One active row per email (latest wins). */
export const emailOtpChallengesTable = pgTable("email_otp_challenges", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  otpHash: text("otp_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailOtpChallenge = typeof emailOtpChallengesTable.$inferSelect;
