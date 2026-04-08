/**
 * Access JWT verification — single place for signature + expiry checks.
 * Used by HTTP middleware and by `verifyAccessToken` in auth.ts.
 */

import jwt, { type JwtPayload } from "jsonwebtoken";

const ACCESS_SECRET = process.env.SESSION_SECRET || "furnicore_access_secret_2024";

export interface AccessTokenPayload {
  id: number;
  email: string;
  role: string;
}

export class TokenVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_TOKEN" | "MALFORMED",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TokenVerificationError";
  }
}

function isPayload(v: JwtPayload | string | null): v is JwtPayload & AccessTokenPayload {
  return typeof v === "object" && v !== null
    && typeof (v as AccessTokenPayload).id === "number"
    && typeof (v as AccessTokenPayload).email === "string"
    && typeof (v as AccessTokenPayload).role === "string";
}

/**
 * Verify a FurniCore access JWT (signature + exp). Throws {@link TokenVerificationError} on failure.
 */
export function verifyToken(token: string): AccessTokenPayload {
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (!trimmed) {
    throw new TokenVerificationError("Missing token", "MALFORMED");
  }
  try {
    const decoded = jwt.verify(trimmed, ACCESS_SECRET) as JwtPayload;
    if (!isPayload(decoded)) {
      throw new TokenVerificationError("Invalid access token payload", "INVALID_TOKEN");
    }
    return { id: decoded.id, email: decoded.email, role: decoded.role };
  } catch (e) {
    if (e instanceof TokenVerificationError) throw e;
    if (e instanceof jwt.TokenExpiredError) {
      throw new TokenVerificationError("Token expired", "INVALID_TOKEN", e);
    }
    if (e instanceof jwt.JsonWebTokenError) {
      throw new TokenVerificationError("Invalid token", "INVALID_TOKEN", e);
    }
    throw new TokenVerificationError("Invalid token", "INVALID_TOKEN", e);
  }
}
