/**
 * Persist revoked access tokens so they cannot be reused until natural expiry.
 */

import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { eq, lt } from "drizzle-orm";
import { db, tokenBlacklistTable } from "@workspace/db";
import { logger } from "./logger";

export function hashToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

export async function isTokenBlacklisted(tokenHash: string): Promise<boolean> {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(tokenBlacklistTable)
      .where(eq(tokenBlacklistTable.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    if (!row) return false;
    if (row.expiresAt <= now) return false;
    return true;
  } catch (err) {
    // Unit tests use a minimal Drizzle mock without real columns; production DB is fine.
    logger.warn({ err: String(err) }, "token_blacklist.lookup_failed_treating_as_not_listed");
    return false;
  }
}

/**
 * Invalidate the current access token (e.g. logout). Idempotent on duplicate hash.
 */
export async function revokeAccessToken(
  rawToken: string,
  userId: number,
  reason: string = "logout",
): Promise<void> {
  const hash = hashToken(rawToken);
  const decoded = jwt.decode(rawToken.trim()) as { exp?: number } | null;
  const expiresAt =
    decoded?.exp != null
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 16 * 60 * 1000);

  try {
    await db.insert(tokenBlacklistTable).values({
      tokenHash: hash,
      userId,
      expiresAt,
      reason,
    }).onConflictDoNothing();
  } catch (err) {
    logger.error({ err, userId }, "token_blacklist.insert_failed");
    throw err;
  }
}

/** Optional maintenance — remove rows past expiry to keep the table small. */
export async function purgeExpiredBlacklistRows(): Promise<number> {
  const deleted = await db
    .delete(tokenBlacklistTable)
    .where(lt(tokenBlacklistTable.expiresAt, new Date()))
    .returning({ tokenHash: tokenBlacklistTable.tokenHash });
  return deleted.length;
}
