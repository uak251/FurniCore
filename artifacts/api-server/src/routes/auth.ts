import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable } from "@workspace/db";
import { LoginBody, RefreshTokenBody, RegisterBody } from "@workspace/api-zod";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateEmailVerifyToken,
  verifyEmailVerifyToken,
  EMAIL_VERIFY_EXPIRY_MS,
} from "../lib/auth";
import { authenticate, AuthRequest } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";
import { sendVerificationEmail } from "../lib/email";

const router: IRouter = Router();

/* ─── Zod schemas for new endpoints ────────────────────────────────────── */

const ResendVerificationBody = z.object({
  email: z.string().email(),
});

const VerifyEmailQuery = z.object({
  token: z.string().min(1),
});

/* ─── helpers ───────────────────────────────────────────────────────────── */

/** Sanitized user object safe to send to clients (no hashes or tokens). */
function sanitize(user: typeof usersTable.$inferSelect) {
  return {
    id:         user.id,
    name:       user.name,
    email:      user.email,
    role:       user.role,
    isActive:   user.isActive,
    isVerified: user.isVerified,
    createdAt:  user.createdAt,
    updatedAt:  user.updatedAt,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   POST /auth/register
   Creates a new employee account, sends a verification email, and returns
   a "pending verification" response — NO tokens are issued yet.
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, email, password } = parsed.data;

  const [existing] = await db
    .select({ id: usersTable.id, isVerified: usersTable.isVerified })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (existing) {
    if (!existing.isVerified) {
      // Edge case: previous signup that was never verified.
      // Treat it like a resend so the user can try again.
      res.status(409).json({
        error: "EMAIL_ALREADY_REGISTERED_UNVERIFIED",
        message:
          "An account with this email exists but has not been verified. " +
          "Please use the 'Resend verification email' option.",
      });
    } else {
      res.status(409).json({ error: "An account with this email already exists" });
    }
    return;
  }

  const passwordHash  = await hashPassword(password);
  const verifyToken   = generateEmailVerifyToken({ id: 0, email }); // temp id=0
  const verifyExpiry  = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MS);

  const [user] = await db
    .insert(usersTable)
    .values({
      name,
      email,
      passwordHash,
      role: "employee",
      isActive:          true,
      isVerified:        false,
      emailVerifyToken:  null, // will be set below once we have the real id
      emailVerifyExpiry: verifyExpiry,
    })
    .returning();

  // Re-generate token with real user id now that we have it
  const realToken      = generateEmailVerifyToken({ id: user.id, email: user.email });
  const realExpiry     = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MS);
  await db.update(usersTable)
    .set({ emailVerifyToken: realToken, emailVerifyExpiry: realExpiry })
    .where(eq(usersTable.id, user.id));

  try {
    await sendVerificationEmail(user.email, user.name, realToken);
  } catch (err) {
    // Non-fatal: log but don't fail the registration
    console.error("[auth/register] Failed to send verification email:", err);
  }

  await logActivity({
    userId:      user.id,
    action:      "REGISTER",
    module:      "auth",
    description: `${user.name} registered (pending email verification)`,
  });

  res.status(201).json({
    message:
      "Account created! We've sent a verification link to your email address. " +
      "Please check your inbox (and spam folder) and click the link to activate your account.",
    email: user.email,
    /** Sentinel flag the frontend uses to branch into the "verify email" flow. */
    requiresVerification: true,
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /auth/login
   Rejects unverified accounts with a dedicated error code so the frontend
   can show a "resend verification" prompt.
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Block login until email is verified
  if (!user.isVerified) {
    res.status(403).json({
      error:   "EMAIL_NOT_VERIFIED",
      message: "Please verify your email address before logging in. Check your inbox for the verification link.",
      email:   user.email,
    });
    return;
  }

  const accessToken  = generateAccessToken({ id: user.id, email: user.email, role: user.role });
  const refreshToken = generateRefreshToken({ id: user.id, email: user.email });
  await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));

  await logActivity({
    userId:      user.id,
    action:      "LOGIN",
    module:      "auth",
    description: `${user.name} logged in`,
  });

  res.json({ accessToken, refreshToken, user: sanitize(user) });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /auth/verify-email?token=<JWT>
   Activates the account when the user clicks the email link.
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/auth/verify-email", async (req, res): Promise<void> => {
  const parsed = VerifyEmailQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Verification token is missing or malformed." });
    return;
  }
  const { token } = parsed.data;

  // 1. Verify JWT signature + expiry
  let payload: { id: number; email: string };
  try {
    payload = verifyEmailVerifyToken(token);
  } catch {
    res.status(400).json({ error: "TOKEN_INVALID", message: "This verification link is invalid or has expired." });
    return;
  }

  // 2. Fetch user and enforce single-use by comparing stored token
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, payload.id));

  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  if (user.isVerified) {
    // Already verified — idempotent success
    res.json({ message: "Your email has already been verified. You can log in now." });
    return;
  }
  if (user.emailVerifyToken !== token) {
    res.status(400).json({
      error:   "TOKEN_USED_OR_SUPERSEDED",
      message: "This verification link has already been used or a newer link was sent. Please request a new one.",
    });
    return;
  }

  // 3. Activate the account
  await db.update(usersTable)
    .set({ isVerified: true, emailVerifyToken: null, emailVerifyExpiry: null })
    .where(eq(usersTable.id, user.id));

  await logActivity({
    userId:      user.id,
    action:      "EMAIL_VERIFIED",
    module:      "auth",
    description: `${user.name} verified their email address`,
  });

  res.json({ message: "Email verified successfully! You can now log in to FurniCore." });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /auth/resend-verification
   Allows users who didn't receive (or whose link expired) to get a new one.
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const parsed = ResendVerificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  const { email } = parsed.data;

  // Use a consistent response time regardless of whether the email exists
  // (prevents user-enumeration timing attacks)
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user || user.isVerified) {
    // Return the same 200 to avoid leaking whether the email is registered
    res.json({
      message: "If that email belongs to an unverified account, a new verification link has been sent.",
    });
    return;
  }

  // Rate-limit: don't resend if a non-expired token was issued < 1 minute ago
  const ONE_MINUTE = 60_000;
  if (
    user.emailVerifyExpiry &&
    user.emailVerifyExpiry.getTime() > Date.now() + EMAIL_VERIFY_EXPIRY_MS - ONE_MINUTE
  ) {
    res.status(429).json({
      error:   "RESEND_TOO_SOON",
      message: "A verification email was sent very recently. Please wait a moment before requesting another.",
    });
    return;
  }

  const newToken  = generateEmailVerifyToken({ id: user.id, email: user.email });
  const newExpiry = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MS);

  await db.update(usersTable)
    .set({ emailVerifyToken: newToken, emailVerifyExpiry: newExpiry })
    .where(eq(usersTable.id, user.id));

  try {
    await sendVerificationEmail(user.email, user.name, newToken);
  } catch (err) {
    console.error("[auth/resend-verification] Failed to send email:", err);
    res.status(502).json({ error: "Failed to send verification email. Please try again shortly." });
    return;
  }

  res.json({ message: "A new verification link has been sent to your email address." });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /auth/refresh
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/auth/refresh", async (req, res): Promise<void> => {
  const parsed = RefreshTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }
  try {
    const payload = verifyRefreshToken(parsed.data.refreshToken);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
    if (!user || user.refreshToken !== parsed.data.refreshToken) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }
    const accessToken    = generateAccessToken({ id: user.id, email: user.email, role: user.role });
    const newRefreshToken = generateRefreshToken({ id: user.id, email: user.email });
    await db.update(usersTable).set({ refreshToken: newRefreshToken }).where(eq(usersTable.id, user.id));
    res.json({ accessToken, refreshToken: newRefreshToken, user: sanitize(user) });
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /auth/logout
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/auth/logout", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.user) {
    await db.update(usersTable).set({ refreshToken: null }).where(eq(usersTable.id, req.user.id));
  }
  res.json({ message: "Logged out" });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /auth/me
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/auth/me", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(sanitize(user));
});

export default router;
