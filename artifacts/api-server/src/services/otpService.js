/**
 * Email OTP for customer signup verification (6-digit, bcrypt-hashed, 5-minute TTL).
 */
import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, emailOtpChallengesTable } from "@workspace/db";
import { hashPassword, comparePassword } from "../lib/auth.js";

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MS = 5 * 60 * 1000;

export function generateOtpDigits() {
  const n = randomInt(0, 1_000_000);
  return String(n).padStart(OTP_LENGTH, "0");
}

/** Replace any prior OTP for this email, store new hash + expiry. */
export async function saveOtpChallenge(emailNorm, plainOtp) {
  const otpHash = await hashPassword(plainOtp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  await db.delete(emailOtpChallengesTable).where(eq(emailOtpChallengesTable.email, emailNorm));
  await db.insert(emailOtpChallengesTable).values({
    email: emailNorm,
    otpHash,
    expiresAt,
  });
}

export async function verifyOtpChallenge(emailNorm, plainOtp) {
  const [row] = await db
    .select()
    .from(emailOtpChallengesTable)
    .where(eq(emailOtpChallengesTable.email, emailNorm))
    .limit(1);
  if (!row) return { ok: false, reason: "NO_OTP" };
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(emailOtpChallengesTable).where(eq(emailOtpChallengesTable.id, row.id));
    return { ok: false, reason: "EXPIRED" };
  }
  const match = await comparePassword(plainOtp, row.otpHash);
  if (!match) return { ok: false, reason: "INVALID" };
  await db.delete(emailOtpChallengesTable).where(eq(emailOtpChallengesTable.id, row.id));
  return { ok: true };
}
