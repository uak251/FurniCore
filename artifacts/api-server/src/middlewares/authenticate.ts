import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { verifyToken, TokenVerificationError } from "../lib/verifyToken";
import { hashToken, isTokenBlacklisted } from "../lib/tokenBlacklist";

export interface AuthRequest extends Request {
  user?: { id: number; email: string; role: string };
}

function clientIp(req: Request): string {
  const x = req.headers["x-forwarded-for"];
  if (typeof x === "string" && x.length) return x.split(",")[0]?.trim() ?? "unknown";
  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * Log failed auth attempts for security auditing (never log the raw token).
 */
function logInvalidTokenAttempt(
  req: Request,
  reason: string,
  details?: { userId?: number; code?: string },
): void {
  logger.warn(
    {
      event: "auth.invalid_token",
      reason,
      path: req.path,
      method: req.method,
      ip: clientIp(req),
      userAgent: req.headers["user-agent"],
      ...details,
    },
    "Invalid or rejected bearer token",
  );
}

/**
 * Verify JWT access token, optional revocation blacklist, then attach `req.user`.
 * Runs before protected routes — register immediately after global parsers / CORS.
 */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    logInvalidTokenAttempt(req, "missing_bearer");
    res.status(401).json({ error: "NO_TOKEN", message: "No bearer token provided" });
    return;
  }

  const token = authHeader.slice(7);

  let payload: { id: number; email: string; role: string };
  try {
    payload = verifyToken(token);
  } catch (e) {
    const code = e instanceof TokenVerificationError ? e.code : "INVALID_TOKEN";
    logInvalidTokenAttempt(req, "jwt_verify_failed", { code });
    res.status(401).json({
      error: "INVALID_TOKEN",
      message: e instanceof Error ? e.message : "Invalid or expired token",
    });
    return;
  }

  const blocked = await isTokenBlacklisted(hashToken(token));
  if (blocked) {
    logInvalidTokenAttempt(req, "token_blacklisted", { userId: payload.id });
    res.status(401).json({
      error: "INVALID_TOKEN",
      message: "Token has been revoked",
    });
    return;
  }

  req.user = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
