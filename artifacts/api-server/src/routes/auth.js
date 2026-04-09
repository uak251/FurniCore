import { Router } from "express";
import { unlink } from "fs/promises";
import { join } from "path";
import multer from "multer";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable } from "@workspace/db";
import { LoginBody, RefreshTokenBody, RegisterBody } from "@workspace/api-zod";
import { hashPassword, comparePassword, generateAccessToken, generateRefreshToken, verifyRefreshToken, generateEmailVerifyToken, verifyEmailVerifyToken, EMAIL_VERIFY_EXPIRY_MS, } from "../lib/auth";
import { getAccessExpiresInSeconds, getSessionDurationPreset } from "../lib/sessionPolicy.js";
import { authenticate } from "../middlewares/authenticate";
import { revokeAccessToken } from "../lib/tokenBlacklist";
import { logger } from "../lib/logger";
import { logActivity } from "../lib/activityLogger";
import { sendVerificationEmail, emailEnabled } from "../lib/email";
import { THEME_IDS } from "../lib/themeCatalog";
import { uploadProfileAvatar } from "../middlewares/upload.js";
import { UPLOADS_ROOT } from "../uploadsRoot.js";
const router = Router();
/** Multer wrapper — returns 400 JSON on filter/size errors. */
function runUpload(mw) {
    return (req, res, next) => {
        mw(req, res, (err) => {
            if (!err)
                return next();
            if (err instanceof multer.MulterError) {
                res.status(400).json({ error: "MULTER_ERROR", message: err.message });
                return;
            }
            if (err instanceof Error) {
                res.status(400).json({ error: "UPLOAD_ERROR", message: err.message });
                return;
            }
            next(err);
        });
    };
}
/** Safe unlink only for files stored under `uploads/profile/`. */
function diskPathFromProfilePublicUrl(publicPath) {
    if (!publicPath?.startsWith("/uploads/profile/"))
        return null;
    return join(UPLOADS_ROOT, publicPath.replace(/^\/uploads\//, ""));
}
/** Public: current session duration preset and access-token TTL (for clients / UI). */
router.get("/auth/session-policy", (_req, res) => {
    res.json({
        sessionDuration: getSessionDurationPreset(),
        accessExpiresIn: getAccessExpiresInSeconds(),
    });
});
/* ─── Zod schemas for new endpoints ────────────────────────────────────── */
const ResendVerificationBody = z.object({
    email: z.string().email(),
});
const VerifyEmailQuery = z.object({
    token: z.string().min(1),
});
/* ─── helpers ───────────────────────────────────────────────────────────── */
/** Sanitized user object safe to send to clients (no hashes or tokens). */
function sanitize(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        isVerified: user.isVerified,
        dashboardTheme: user.dashboardTheme ?? null,
        phone: user.phone ?? null,
        profileImageUrl: user.profileImageUrl ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}
/* ═══════════════════════════════════════════════════════════════════════════
   POST /auth/register
   Creates a new employee account, sends a verification email, and returns
   a "pending verification" response — NO tokens are issued yet.
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/auth/register", async (req, res, next) => {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
        return;
    }
    const { name, email, password } = parsed.data;
    try {
        const [existing] = await db
            .select({ id: usersTable.id, role: usersTable.role, isVerified: usersTable.isVerified })
            .from(usersTable)
            .where(eq(usersTable.email, email));
        if (existing) {
            // Staff/non-customer account — self-registration is not allowed for this email.
            if (existing.role !== "customer") {
                res.status(409).json({
                    error: "EMAIL_IS_STAFF_ACCOUNT",
                    message: "This email address is already registered to a staff account. " +
                        "Please sign in directly, or use a different email address to create a customer account.",
                });
                return;
            }
            if (!existing.isVerified) {
                res.status(409).json({
                    error: "EMAIL_ALREADY_REGISTERED_UNVERIFIED",
                    message: "A customer account with this email exists but has not been verified. " +
                        "Please use the 'Resend verification email' option.",
                });
                return;
            }
            res.status(409).json({
                error: "EMAIL_ALREADY_REGISTERED",
                message: "A customer account with this email already exists. Try signing in instead.",
            });
            return;
        }
        const passwordHash = await hashPassword(password);
        // When email is disabled (dev/staging), auto-verify so accounts are immediately usable.
        if (!emailEnabled) {
            const [user] = await db
                .insert(usersTable)
                .values({ name, email, passwordHash, role: "customer", isActive: true, isVerified: true })
                .returning();
            await logActivity({
                userId: user.id,
                action: "REGISTER",
                module: "auth",
                description: `${user.name} registered as customer (auto-verified, email disabled)`,
            });
            const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
            const refreshToken = generateRefreshToken({ id: user.id, email: user.email });
            await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));
            res.status(201).json({
                message: "Account created successfully! You are now signed in.",
                email: user.email,
                requiresVerification: false,
                accessToken,
                refreshToken,
                accessExpiresIn: getAccessExpiresInSeconds(),
                user: sanitize(user),
            });
            return;
        }
        // Email is enabled: create unverified account and send verification link.
        const verifyExpiry = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MS);
        const [user] = await db
            .insert(usersTable)
            .values({
            name,
            email,
            passwordHash,
            role: "customer",
            isActive: true,
            isVerified: false,
            emailVerifyToken: null,
            emailVerifyExpiry: verifyExpiry,
        })
            .returning();
        const realToken = generateEmailVerifyToken({ id: user.id, email: user.email });
        const realExpiry = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MS);
        await db.update(usersTable)
            .set({ emailVerifyToken: realToken, emailVerifyExpiry: realExpiry })
            .where(eq(usersTable.id, user.id));
        try {
            await sendVerificationEmail(user.email, user.name, realToken);
        }
        catch (mailErr) {
            console.error("[auth/register] Failed to send verification email:", mailErr);
        }
        await logActivity({
            userId: user.id,
            action: "REGISTER",
            module: "auth",
            description: `${user.name} registered as customer (pending email verification)`,
        });
        res.status(201).json({
            message: "Account created! A verification link has been sent to your email address. " +
                "Please check your inbox (and spam folder) and click the link to activate your account.",
            email: user.email,
            requiresVerification: true,
        });
    }
    catch (err) {
        next(err);
    }
});
/* ═══════════════════════════════════════════════════════════════════════════
   POST /auth/login
   Rejects unverified accounts with a dedicated error code so the frontend
   can show a "resend verification" prompt.
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/auth/login", async (req, res) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const { email, password } = parsed.data;
    const emailNorm = email.trim().toLowerCase();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, emailNorm));
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
            error: "EMAIL_NOT_VERIFIED",
            message: "Please verify your email address before logging in. Check your inbox for the verification link.",
            email: user.email,
        });
        return;
    }
    const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = generateRefreshToken({ id: user.id, email: user.email });
    await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));
    await logActivity({
        userId: user.id,
        action: "LOGIN",
        module: "auth",
        description: `${user.name} logged in`,
    });
    res.json({
        accessToken,
        refreshToken,
        accessExpiresIn: getAccessExpiresInSeconds(),
        user: sanitize(user),
    });
});
/* ═══════════════════════════════════════════════════════════════════════════
   GET /auth/verify-email?token=<JWT>
   Activates the account when the user clicks the email link.
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/auth/verify-email", async (req, res) => {
    const parsed = VerifyEmailQuery.safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({ error: "Verification token is missing or malformed." });
        return;
    }
    const { token } = parsed.data;
    // 1. Verify JWT signature + expiry
    let payload;
    try {
        payload = verifyEmailVerifyToken(token);
    }
    catch {
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
            error: "TOKEN_USED_OR_SUPERSEDED",
            message: "This verification link has already been used or a newer link was sent. Please request a new one.",
        });
        return;
    }
    // 3. Activate the account
    await db.update(usersTable)
        .set({ isVerified: true, emailVerifyToken: null, emailVerifyExpiry: null })
        .where(eq(usersTable.id, user.id));
    await logActivity({
        userId: user.id,
        action: "EMAIL_VERIFIED",
        module: "auth",
        description: `${user.name} verified their email address`,
    });
    res.json({ message: "Email verified successfully! You can now log in to FurniCore." });
});
/* ═══════════════════════════════════════════════════════════════════════════
   POST /auth/resend-verification
   Allows users who didn't receive (or whose link expired) to get a new one.
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/auth/resend-verification", async (req, res) => {
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
    if (user.emailVerifyExpiry &&
        user.emailVerifyExpiry.getTime() > Date.now() + EMAIL_VERIFY_EXPIRY_MS - ONE_MINUTE) {
        res.status(429).json({
            error: "RESEND_TOO_SOON",
            message: "A verification email was sent very recently. Please wait a moment before requesting another.",
        });
        return;
    }
    const newToken = generateEmailVerifyToken({ id: user.id, email: user.email });
    const newExpiry = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MS);
    await db.update(usersTable)
        .set({ emailVerifyToken: newToken, emailVerifyExpiry: newExpiry })
        .where(eq(usersTable.id, user.id));
    try {
        await sendVerificationEmail(user.email, user.name, newToken);
    }
    catch (err) {
        console.error("[auth/resend-verification] Failed to send email:", err);
        res.status(502).json({ error: "Failed to send verification email. Please try again shortly." });
        return;
    }
    res.json({ message: "A new verification link has been sent to your email address." });
});
/* ═══════════════════════════════════════════════════════════════════════════
   POST /auth/refresh
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/auth/refresh", async (req, res) => {
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
        const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
        const newRefreshToken = generateRefreshToken({ id: user.id, email: user.email });
        await db.update(usersTable).set({ refreshToken: newRefreshToken }).where(eq(usersTable.id, user.id));
        res.json({
            accessToken,
            refreshToken: newRefreshToken,
            accessExpiresIn: getAccessExpiresInSeconds(),
            user: sanitize(user),
        });
    }
    catch {
        res.status(401).json({ error: "Invalid or expired refresh token" });
    }
});
/* ═══════════════════════════════════════════════════════════════════════════
   POST /auth/logout
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/auth/logout", authenticate, async (req, res) => {
    const authHeader = req.headers.authorization;
    const rawAccess = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (req.user && rawAccess) {
        try {
            await revokeAccessToken(rawAccess, req.user.id, "logout");
        }
        catch (err) {
            logger.error({ err, userId: req.user.id }, "logout_token_blacklist_failed");
        }
    }
    if (req.user) {
        await db.update(usersTable).set({ refreshToken: null }).where(eq(usersTable.id, req.user.id));
    }
    res.json({ message: "Logged out" });
});
/* ═══════════════════════════════════════════════════════════════════════════
   GET /auth/me
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/auth/me", authenticate, async (req, res) => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    res.json(sanitize(user));
});
router.post("/auth/me/avatar", authenticate, runUpload(uploadProfileAvatar), async (req, res, next) => {
    if (!req.file) {
        res.status(400).json({ error: "NO_FILE", message: 'Expected multipart field "image" (JPEG, PNG, WebP, or GIF, max 2 MB).' });
        return;
    }
    try {
        const [existing] = await db
            .select({ profileImageUrl: usersTable.profileImageUrl })
            .from(usersTable)
            .where(eq(usersTable.id, req.user.id));
        const oldDisk = existing?.profileImageUrl
            ? diskPathFromProfilePublicUrl(existing.profileImageUrl)
            : null;
        const publicUrl = `/uploads/profile/${req.file.filename}`;
        const [user] = await db
            .update(usersTable)
            .set({ profileImageUrl: publicUrl })
            .where(eq(usersTable.id, req.user.id))
            .returning();
        if (!user) {
            await unlink(req.file.path).catch(() => { });
            res.status(404).json({ error: "User not found" });
            return;
        }
        if (oldDisk) {
            await unlink(oldDisk).catch(() => { });
        }
        await logActivity({
            userId: req.user.id,
            action: "UPDATE",
            module: "profile",
            description: "Uploaded profile avatar",
        });
        res.json(sanitize(user));
    }
    catch (err) {
        if (req.file?.path) {
            await unlink(req.file.path).catch(() => { });
        }
        next(err);
    }
});
router.delete("/auth/me/avatar", authenticate, async (req, res, next) => {
    try {
        const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
        if (!existing) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        const oldDisk = existing.profileImageUrl
            ? diskPathFromProfilePublicUrl(existing.profileImageUrl)
            : null;
        const [user] = await db
            .update(usersTable)
            .set({ profileImageUrl: null })
            .where(eq(usersTable.id, req.user.id))
            .returning();
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        if (oldDisk) {
            await unlink(oldDisk).catch(() => { });
        }
        await logActivity({
            userId: req.user.id,
            action: "UPDATE",
            module: "profile",
            description: "Removed profile avatar",
        });
        res.json(sanitize(user));
    }
    catch (err) {
        next(err);
    }
});
/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /auth/me/theme  — MUST be registered before PATCH /auth/me (Express 5 path matching)
   ═══════════════════════════════════════════════════════════════════════════ */
const PatchThemeBody = z.object({
    themeId: z
        .string()
        .nullable()
        .refine((v) => v === null || THEME_IDS.includes(v), { message: "Invalid theme id" }),
});
router.patch("/auth/me/theme", authenticate, async (req, res, next) => {
    const parsed = PatchThemeBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
        return;
    }
    const themeId = parsed.data.themeId;
    try {
        const [user] = await db
            .update(usersTable)
            .set({ dashboardTheme: themeId === null ? null : themeId })
            .where(eq(usersTable.id, req.user.id))
            .returning();
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        await logActivity({ userId: req.user?.id, action: "UPDATE", module: "preferences", description: `Set dashboard theme to ${themeId ?? "portal default"}` });
        res.json(sanitize(user));
    }
    catch (err) {
        next(err);
    }
});
const PatchProfileBody = z
    .object({
    name: z.string().min(2).max(255).optional(),
    phone: z.union([z.string().max(40), z.null()]).optional(),
    profileImageUrl: z.union([z.string().max(2048), z.null()]).optional(),
})
    .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required" });
const profileImageUrlSchema = z
    .union([z.null(), z.literal(""), z.string().trim().url().max(2048)]);
router.patch("/auth/me", authenticate, async (req, res, next) => {
    const raw = PatchProfileBody.safeParse(req.body);
    if (!raw.success) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: raw.error.message });
        return;
    }
    const body = raw.data;
    const updates = {};
    if (body.name !== undefined)
        updates.name = body.name.trim();
    if (body.phone !== undefined) {
        updates.phone = body.phone === null || body.phone === ""
            ? null
            : body.phone.trim() || null;
    }
    if (body.profileImageUrl !== undefined) {
        const v = body.profileImageUrl;
        const [prevRow] = await db
            .select({ profileImageUrl: usersTable.profileImageUrl })
            .from(usersTable)
            .where(eq(usersTable.id, req.user.id));
        const prevPath = prevRow?.profileImageUrl
            ? diskPathFromProfilePublicUrl(prevRow.profileImageUrl)
            : null;
        if (v === null || v === "") {
            updates.profileImageUrl = null;
            if (prevPath) {
                await unlink(prevPath).catch(() => { });
            }
        }
        else {
            const urlParsed = profileImageUrlSchema.safeParse(v.trim());
            if (!urlParsed.success) {
                res.status(400).json({ error: "VALIDATION_ERROR", message: "profileImageUrl must be a valid URL" });
                return;
            }
            updates.profileImageUrl = urlParsed.data;
            if (prevPath) {
                await unlink(prevPath).catch(() => { });
            }
        }
    }
    try {
        const [user] = await db
            .update(usersTable)
            .set(updates)
            .where(eq(usersTable.id, req.user.id))
            .returning();
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        await logActivity({
            userId: req.user.id,
            action: "UPDATE",
            module: "profile",
            description: "Updated profile (name / phone / avatar)",
        });
        res.json(sanitize(user));
    }
    catch (err) {
        next(err);
    }
});
export default router;
