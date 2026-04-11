/**
 * Access JWT verification — single place for signature + expiry checks.
 * Used by HTTP middleware and by `verifyAccessToken` in auth.ts.
 */
import jwt from "jsonwebtoken";
const ACCESS_SECRET = process.env.SESSION_SECRET || "furnicore_access_secret_2024";
export class TokenVerificationError extends Error {
    code;
    cause;
    constructor(message, code, cause) {
        super(message);
        this.code = code;
        this.cause = cause;
        this.name = "TokenVerificationError";
    }
}
function isPayload(v) {
    return typeof v === "object" && v !== null
        && typeof v.id === "number"
        && typeof v.email === "string"
        && typeof v.role === "string";
}
/**
 * Verify a FurniCore access JWT (signature + exp). Throws {@link TokenVerificationError} on failure.
 */
export function verifyToken(token) {
    const trimmed = typeof token === "string" ? token.trim() : "";
    if (!trimmed) {
        throw new TokenVerificationError("Missing token", "MALFORMED");
    }
    try {
        const decoded = jwt.verify(trimmed, ACCESS_SECRET);
        if (!isPayload(decoded)) {
            throw new TokenVerificationError("Invalid access token payload", "INVALID_TOKEN");
        }
        return { id: decoded.id, email: decoded.email, role: decoded.role };
    }
    catch (e) {
        if (e instanceof TokenVerificationError)
            throw e;
        if (e instanceof jwt.TokenExpiredError) {
            throw new TokenVerificationError("Token expired", "INVALID_TOKEN", e);
        }
        if (e instanceof jwt.JsonWebTokenError) {
            throw new TokenVerificationError("Invalid token", "INVALID_TOKEN", e);
        }
        throw new TokenVerificationError("Invalid token", "INVALID_TOKEN", e);
    }
}
