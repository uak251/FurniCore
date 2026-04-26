import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { verifyToken, TokenVerificationError } from "../lib/verifyToken";
import { hashToken, isTokenBlacklisted } from "../lib/tokenBlacklist";
import { db, usersTable } from "@workspace/db";
import { resolveRoleForToken } from "../lib/userRole.js";
function clientIp(req) {
    const x = req.headers["x-forwarded-for"];
    if (typeof x === "string" && x.length)
        return x.split(",")[0]?.trim() ?? "unknown";
    return req.socket?.remoteAddress ?? "unknown";
}
/**
 * Log failed auth attempts for security auditing (never log the raw token).
 */
function logInvalidTokenAttempt(req, reason, details) {
    logger.warn({
        event: "auth.invalid_token",
        reason,
        path: req.path,
        method: req.method,
        ip: clientIp(req),
        userAgent: req.headers["user-agent"],
        ...details,
    }, "Invalid or rejected bearer token");
}
/**
 * Verify JWT access token, optional revocation blacklist, then attach `req.user`.
 * Runs before protected routes — register immediately after global parsers / CORS.
 */
export async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        logInvalidTokenAttempt(req, "missing_bearer");
        res.status(401).json({ error: "Unauthorized", message: "No bearer token provided" });
        return;
    }
    const token = authHeader.slice(7);
    let payload;
    try {
        payload = verifyToken(token);
    }
    catch (e) {
        const code = e instanceof TokenVerificationError ? e.code : "INVALID_TOKEN";
        logInvalidTokenAttempt(req, "jwt_verify_failed", { code });
        res.status(401).json({
            error: "Unauthorized",
            message: e instanceof Error ? e.message : "Invalid or expired token",
        });
        return;
    }
    const blocked = await isTokenBlacklisted(hashToken(token));
    if (blocked) {
        logInvalidTokenAttempt(req, "token_blacklisted", { userId: payload.id });
        res.status(401).json({
            error: "Unauthorized",
            message: "Token has been revoked",
        });
        return;
    }
    // Align `req.user.role` with the database so `requireRole` matches `/auth/me`
    // (avoids 403 on customer portal when JWT was minted before a role change, or drift).
    try {
        const [row] = await db
            .select({ role: usersTable.role, isActive: usersTable.isActive, email: usersTable.email })
            .from(usersTable)
            .where(eq(usersTable.id, payload.id));
        if (!row) {
            logInvalidTokenAttempt(req, "user_missing", { userId: payload.id });
            res.status(401).json({ error: "Unauthorized", message: "User no longer exists" });
            return;
        }
        if (row.isActive === false) {
            logInvalidTokenAttempt(req, "user_inactive", { userId: payload.id });
            res.status(401).json({ error: "Unauthorized", message: "Account is disabled" });
            return;
        }
        const role = resolveRoleForToken(row.role);
        if (role !== payload.role) {
            logger.debug({ userId: payload.id, jwtRole: payload.role, dbRole: role }, "auth_role_aligned_from_db");
        }
        req.user = {
            id: payload.id,
            email: typeof payload.email === "string" ? payload.email : String(row.email ?? ""),
            role,
            sid: payload.sid,
        };
    }
    catch (err) {
        logger.warn({ errMessage: String(err?.message ?? err), userId: payload.id }, "auth_db_role_lookup_failed");
        req.user = payload;
    }
    next();
}
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ error: "Insufficient permissions" });
            return;
        }
        next();
    };
}
