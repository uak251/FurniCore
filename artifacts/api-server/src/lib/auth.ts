import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { verifyToken, type AccessTokenPayload } from "./verifyToken";

export { verifyToken, TokenVerificationError, type AccessTokenPayload } from "./verifyToken";

const ACCESS_SECRET  = process.env.SESSION_SECRET || "furnicore_access_secret_2024";
const REFRESH_SECRET = (process.env.SESSION_SECRET || "furnicore_refresh_secret_2024") + "_refresh";
/**
 * Separate secret for email-verification tokens.
 * Must be different from the access-token secret so that a verification
 * token cannot be used as a bearer token (and vice-versa).
 */
const EMAIL_VERIFY_SECRET = process.env.EMAIL_VERIFY_SECRET || "furnicore_email_verify_2024";

const ACCESS_EXPIRY       = "15m";
const REFRESH_EXPIRY      = "7d";
/** Verification links expire after 15 minutes. */
export const EMAIL_VERIFY_EXPIRY_MS = 15 * 60 * 1000;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: { id: number; email: string; role: string }): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function generateRefreshToken(payload: { id: number; email: string }): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return verifyToken(token);
}

export function verifyRefreshToken(token: string): { id: number; email: string } {
  return jwt.verify(token, REFRESH_SECRET) as { id: number; email: string };
}

/**
 * Generate a short-lived JWT for email verification.
 * The `purpose` claim ensures this token cannot be used as an access token.
 */
export function generateEmailVerifyToken(payload: { id: number; email: string }): string {
  return jwt.sign(
    { ...payload, purpose: "email-verify" },
    EMAIL_VERIFY_SECRET,
    { expiresIn: "15m" },
  );
}

/**
 * Verify and decode an email-verification token.
 * Throws if the token is invalid, expired, or has the wrong purpose.
 */
export function verifyEmailVerifyToken(token: string): { id: number; email: string } {
  const decoded = jwt.verify(token, EMAIL_VERIFY_SECRET) as {
    id: number;
    email: string;
    purpose: string;
  };
  if (decoded.purpose !== "email-verify") {
    throw new Error("Invalid token purpose");
  }
  return { id: decoded.id, email: decoded.email };
}
