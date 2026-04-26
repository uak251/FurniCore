import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { verifyToken } from "./verifyToken";
import { getAccessExpiresIn, getRefreshExpiresIn } from "./sessionPolicy";
export { verifyToken, TokenVerificationError } from "./verifyToken";
const ACCESS_SECRET = process.env.SESSION_SECRET || "furnicore_access_secret_2024";
const REFRESH_SECRET = (process.env.SESSION_SECRET || "furnicore_refresh_secret_2024") + "_refresh";
/**
 * Separate secret for email-verification tokens.
 * Must be different from the access-token secret so that a verification
 * token cannot be used as a bearer token (and vice-versa).
 */
const EMAIL_VERIFY_SECRET = process.env.EMAIL_VERIFY_SECRET || "furnicore_email_verify_2024";
/** Verification links expire after 15 minutes. */
export const EMAIL_VERIFY_EXPIRY_MS = 15 * 60 * 1000;
export function hashPassword(password) {
    return bcrypt.hash(password, 12);
}
/**
 * Compare password to stored bcrypt hash. Never throws: invalid args or
 * malformed hashes yield `false` (treat as wrong password) instead of 500s.
 */
export function comparePassword(password, hash) {
    const pwd = typeof password === "string" ? password : String(password ?? "");
    if (typeof hash !== "string" || hash.length === 0) {
        return Promise.resolve(false);
    }
    return bcrypt.compare(pwd, hash).catch(() => false);
}
export function generateAccessToken(payload) {
    return jwt.sign(payload, ACCESS_SECRET, { expiresIn: getAccessExpiresIn() });
}
export function generateRefreshToken(payload) {
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn: getRefreshExpiresIn() });
}
export function verifyAccessToken(token) {
    return verifyToken(token);
}
export function verifyRefreshToken(token) {
    return jwt.verify(token, REFRESH_SECRET);
}
/**
 * Generate a short-lived JWT for email verification.
 * The `purpose` claim ensures this token cannot be used as an access token.
 */
export function generateEmailVerifyToken(payload) {
    return jwt.sign({ ...payload, purpose: "email-verify" }, EMAIL_VERIFY_SECRET, { expiresIn: "15m" });
}
/**
 * Verify and decode an email-verification token.
 * Throws if the token is invalid, expired, or has the wrong purpose.
 */
export function verifyEmailVerifyToken(token) {
    const decoded = jwt.verify(token, EMAIL_VERIFY_SECRET);
    if (decoded.purpose !== "email-verify") {
        throw new Error("Invalid token purpose");
    }
    return { id: decoded.id, email: decoded.email };
}
