import { Router } from "express";
import { unlink } from "fs/promises";
import { join } from "path";
import { appendFile, mkdir } from "fs/promises";
import { randomBytes, createHash } from "node:crypto";
import multer from "multer";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import {
    authSessionsTable,
    db,
    emailOtpChallengesTable,
    trustedDevicesTable,
    twoFactorBackupCodesTable,
    usersTable,
} from "@workspace/db";
import { LoginBody, RefreshTokenBody, RegisterBody } from "@workspace/api-zod";
import { hashPassword, comparePassword, generateAccessToken, generateRefreshToken, verifyRefreshToken, verifyEmailVerifyToken, } from "../../../lib/auth";
import { getAccessExpiresInSeconds, getSessionDurationPreset } from "../../../lib/sessionPolicy.js";
import { authenticate } from "../../../middlewares/authenticate";
import { revokeAccessToken } from "../../../lib/tokenBlacklist";
import { logger } from "../../../lib/logger";
import { resolveRoleForToken } from "../../../lib/userRole.js";
import { logActivity } from "../../../lib/activityLogger";
import { sendOtpEmail, emailEnabled } from "../../../lib/email";
import { generateOtpDigits, saveOtpChallenge, verifyOtpChallenge } from "../../../services/otpService.js";
import { THEME_IDS } from "../../../lib/themeCatalog";
import { uploadProfileAvatar } from "../../../middlewares/upload.js";
import { UPLOADS_ROOT } from "../../../uploadsRoot.js";
import { decryptSecret, encryptSecret, generateTotpSecret, verifyTotpToken } from "../../../lib/totp.js";
const router = Router();
const AUTH_ERROR_LOG = join(process.cwd(), "logs", "auth-errors.log");
const TFA_CHALLENGE_SECRET = String(process.env.SESSION_SECRET || "furnicore-2fa-secret");
const TRUSTED_DEVICE_SECRET = `${String(process.env.SESSION_SECRET || "furnicore-device-secret")}:trusted-device`;
const TFA_CHALLENGE_TTL = "10m";
const TRUSTED_DEVICE_TTL_DAYS = Math.max(7, Math.min(30, Number(process.env.TRUSTED_DEVICE_TTL_DAYS || 30)));
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
const loginAttempts = new Map();
const REQUIRED_AUTH_USER_COLUMNS = [
    "email",
    "password_hash",
    "is_active",
    "is_verified",
    "totp_enabled",
    "totp_secret_enc",
];
let authSchemaCheckedAtMs = 0;
let authSchemaValid = false;

function bumpLoginAttempt(bucketKey) {
    const now = Date.now();
    const bucket = loginAttempts.get(bucketKey) ?? { count: 0, lockUntil: 0, last: now };
    if (bucket.lockUntil > now) {
        return { locked: true, retryAfterMs: bucket.lockUntil - now };
    }
    if (now - bucket.last > 5 * 60 * 1000) {
        bucket.count = 0;
    }
    bucket.count += 1;
    bucket.last = now;
    if (bucket.count >= 8) {
        bucket.lockUntil = now + 5 * 60 * 1000;
    }
    loginAttempts.set(bucketKey, bucket);
    return { locked: bucket.lockUntil > now, retryAfterMs: Math.max(0, bucket.lockUntil - now) };
}
function clearLoginAttempt(bucketKey) {
    loginAttempts.delete(bucketKey);
}
function getLoginAttemptCount(bucketKey) {
    const bucket = loginAttempts.get(bucketKey);
    if (!bucket)
        return 0;
    if (Date.now() - bucket.last > 5 * 60 * 1000)
        return 0;
    return bucket.count;
}
function isAdminRole(roleRaw) {
    return String(roleRaw || "").trim().toLowerCase() === "admin";
}
function signChallengeToken(payload) {
    return jwt.sign({ ...payload, purpose: "auth-2fa-challenge" }, TFA_CHALLENGE_SECRET, { expiresIn: TFA_CHALLENGE_TTL });
}
function verifyChallengeToken(token) {
    const decoded = jwt.verify(String(token || ""), TFA_CHALLENGE_SECRET);
    if (!decoded || decoded.purpose !== "auth-2fa-challenge") {
        throw new Error("Invalid challenge token");
    }
    return decoded;
}
function createPasswordResetToken() {
    return randomBytes(32).toString("hex");
}
function hashResetToken(token) {
    return createHash("sha256").update(String(token || "")).digest("hex");
}
function hashOpaqueToken(value) {
    return createHash("sha256").update(String(value || "")).digest("hex");
}
function nowPlusDays(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
function toDeviceName(deviceNameRaw, userAgentRaw) {
    const fromClient = String(deviceNameRaw || "").trim();
    if (fromClient)
        return fromClient.slice(0, 120);
    const ua = String(userAgentRaw || "").trim();
    if (!ua)
        return "Unknown device";
    return ua.slice(0, 120);
}
function clientIp(req) {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) {
        return xff.split(",")[0]?.trim() || "unknown";
    }
    return req.socket?.remoteAddress || "unknown";
}
function signTrustedDeviceToken(payload) {
    return jwt.sign({ ...payload, purpose: "trusted-device" }, TRUSTED_DEVICE_SECRET, { expiresIn: `${TRUSTED_DEVICE_TTL_DAYS}d` });
}
function verifyTrustedDeviceToken(token) {
    const decoded = jwt.verify(String(token || ""), TRUSTED_DEVICE_SECRET);
    if (!decoded || decoded.purpose !== "trusted-device") {
        throw new Error("Invalid trusted device token");
    }
    return decoded;
}
function generateBackupCodes() {
    const out = [];
    for (let i = 0; i < 10; i += 1) {
        const raw = randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
        out.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
    }
    return out;
}
function normalizeBackupCode(input) {
    return String(input || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
async function createSessionForUser(user, context = {}) {
    const sessionId = randomBytes(16).toString("hex");
    const roleForToken = resolveRoleForToken(user.role);
    const accessToken = generateAccessToken({ id: user.id, email: user.email, role: roleForToken, sid: sessionId });
    const refreshToken = generateRefreshToken({ id: user.id, email: user.email, sid: sessionId });
    await db.insert(authSessionsTable).values({
        userId: user.id,
        sessionId,
        refreshTokenHash: hashOpaqueToken(refreshToken),
        trustedDeviceId: context.trustedDeviceId || null,
        deviceName: toDeviceName(context.deviceName, context.userAgent),
        userAgent: context.userAgent || null,
        ipAddress: context.ipAddress || null,
        lastActiveAt: new Date(),
        expiresAt: nowPlusDays(30),
    });
    await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));
    return {
        accessToken,
        refreshToken,
        accessExpiresIn: getAccessExpiresInSeconds(),
        user: sanitize(user),
    };
}
async function ensureAuthUserSchema() {
    const now = Date.now();
    if (authSchemaValid && now - authSchemaCheckedAtMs < 60_000) {
        return true;
    }
    const result = await db.execute(sql`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'users'
    `);
    const rows = Array.isArray(result?.rows)
        ? result.rows
        : Array.isArray(result)
          ? result
          : [];
    const columns = new Set(rows.map((r) => String(r.column_name || "")));
    const missing = REQUIRED_AUTH_USER_COLUMNS.filter((c) => !columns.has(c));
    if (missing.length > 0) {
        logger.error({ missing }, "users_schema_missing_required_auth_columns");
        authSchemaCheckedAtMs = now;
        authSchemaValid = false;
        return false;
    }
    authSchemaCheckedAtMs = now;
    authSchemaValid = true;
    return true;
}
function isSafeAuthUserRow(user) {
    return Boolean(user)
        && typeof user.email === "string"
        && typeof user.passwordHash === "string"
        && typeof user.isActive === "boolean"
        && typeof user.isVerified === "boolean";
}
async function createTrustedDevice(user, context = {}) {
    const deviceId = randomBytes(16).toString("hex");
    const token = signTrustedDeviceToken({ uid: user.id, did: deviceId });
    await db.insert(trustedDevicesTable).values({
        userId: user.id,
        deviceId,
        tokenHash: hashOpaqueToken(token),
        deviceName: toDeviceName(context.deviceName, context.userAgent),
        userAgent: context.userAgent || null,
        ipAddress: context.ipAddress || null,
        expiresAt: nowPlusDays(TRUSTED_DEVICE_TTL_DAYS),
        lastUsedAt: new Date(),
    });
    return { token, deviceId };
}
async function validateTrustedDeviceForUser(userId, token) {
    if (!token)
        return null;
    let decoded;
    try {
        decoded = verifyTrustedDeviceToken(token);
    }
    catch {
        return null;
    }
    if (Number(decoded.uid) !== Number(userId) || !decoded.did) {
        return null;
    }
    const [row] = await db
        .select()
        .from(trustedDevicesTable)
        .where(and(eq(trustedDevicesTable.userId, userId), eq(trustedDevicesTable.deviceId, String(decoded.did))));
    if (!row || row.revokedAt || !row.expiresAt || row.expiresAt.getTime() < Date.now()) {
        return null;
    }
    if (row.tokenHash !== hashOpaqueToken(token)) {
        return null;
    }
    await db
        .update(trustedDevicesTable)
        .set({ lastUsedAt: new Date(), ipAddress: row.ipAddress })
        .where(eq(trustedDevicesTable.id, row.id));
    return row;
}
function isDatabaseUnavailable(err) {
    const msg = String(err?.message ?? "");
    const causeMsg = String(err?.cause?.message ?? "");
    const code = String(err?.code ?? "");
    return /ECONNREFUSED|connect ECONNREFUSED|ENOTFOUND|ETIMEDOUT|57P01|53300|57P03|08006|08003|Connection terminated|the database system is (starting up|shutting down)/i.test(`${msg} ${causeMsg} ${code}`);
}
function hasAuthEnvMisconfiguration() {
    const sessionSecret = String(process.env.SESSION_SECRET || "");
    const jwtSecret = String(process.env.JWT_SECRET || "");
    const dbUrl = String(process.env.DATABASE_URL || "");
    const hasCoreSecrets = sessionSecret.trim().length >= 16 || jwtSecret.trim().length >= 16;
    return !hasCoreSecrets || dbUrl.trim().length === 0;
}
function sanitizeDbErrorMessage(err) {
    const message = String(err?.message || "");
    if (!message)
        return "Database query failed";
    if (message.length > 500)
        return `${message.slice(0, 500)}...`;
    return message;
}
function safeDecryptTotpSecret(encrypted, context = {}) {
    try {
        return decryptSecret(encrypted);
    }
    catch (err) {
        logger.error({
            errMessage: err?.message || String(err),
            errStack: err?.stack || null,
            context,
        }, "totp_secret_decrypt_failed");
        return "";
    }
}
async function writeAuthErrorLog(context, err) {
    try {
        await mkdir(join(process.cwd(), "logs"), { recursive: true });
        const line = JSON.stringify({
            at: new Date().toISOString(),
            ...context,
            error: err?.message || String(err),
        });
        await appendFile(AUTH_ERROR_LOG, `${line}\n`, "utf8");
    }
    catch {
        // non-fatal logging path
    }
}
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
const VerifyOtpBody = z.object({
    email: z.string().email(),
    code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
const VerifyTotpBody = z.object({
    challengeToken: z.string().min(10),
    otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit OTP").optional(),
    backupCode: z.string().min(8).max(32).optional(),
}).refine((v) => Boolean(v.otp) || Boolean(v.backupCode), {
    message: "Enter OTP or backup code",
});
const SetupTotpBody = z.object({
    setupToken: z.string().min(10),
});
const VerifyTotpSetupBody = z.object({
    setupToken: z.string().min(10),
    otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit OTP"),
});
const ForgotPasswordBody = z.object({
    email: z.string().email(),
});
const ResetPasswordBody = z.object({
    token: z.string().min(20),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
});
const DisableTwoFactorBody = z.object({
    otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit OTP"),
});
const LoginBodyEnhanced = LoginBody.extend({
    /** Coerce empty / corrupt localStorage values so login body validation never 400s. */
    rememberedDeviceToken: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.string().min(20).optional()),
    rememberDevice: z.boolean().optional(),
    deviceName: z.string().max(120).optional(),
    otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit OTP").optional(),
});
const RevokeSessionBody = z.object({
    sessionId: z.string().min(8),
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
        totpEnabled: Boolean(user.totpEnabled),
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
    const { name, password } = parsed.data;
    const email = parsed.data.email.trim().toLowerCase();
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
            const session = await createSessionForUser(user, {
                deviceName: "Auto-verified signup",
            });
            res.status(201).json({
                message: "Account created successfully! You are now signed in.",
                email: user.email,
                requiresVerification: false,
                ...session,
            });
            return;
        }
        // Email is enabled: create unverified account and send 6-digit OTP (5-minute TTL).
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
            emailVerifyExpiry: null,
        })
            .returning();
        const otp = generateOtpDigits();
        await saveOtpChallenge(email, otp);
        try {
            await sendOtpEmail(user.email, user.name, otp);
        }
        catch (mailErr) {
            console.error("[auth/register] Failed to send OTP email:", mailErr);
        }
        await logActivity({
            userId: user.id,
            action: "REGISTER",
            module: "auth",
            description: `${user.name} registered as customer (pending OTP verification)`,
        });
        res.status(201).json({
            message: "Account created! Enter the 6-digit code sent to your email to activate your account.",
            email: user.email,
            requiresVerification: true,
            verificationMethod: "otp",
        });
    }
    catch (err) {
        if (isDatabaseUnavailable(err)) {
            res.status(503).json({
                error: "AUTH_DB_UNAVAILABLE",
                message: "Authentication service is temporarily unavailable. Please try again shortly.",
            });
            return;
        }
        next(err);
    }
});
/* ═══════════════════════════════════════════════════════════════════════════
   POST /auth/verify-otp
   Completes customer signup after 6-digit email OTP.
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/auth/verify-otp", async (req, res, next) => {
    const parsed = VerifyOtpBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
        return;
    }
    const emailNorm = parsed.data.email.trim().toLowerCase();
    const code = parsed.data.code;
    try {
        const [user] = await db.select().from(usersTable).where(eq(usersTable.email, emailNorm));
        if (!user || user.role !== "customer") {
            res.status(400).json({ error: "INVALID_REQUEST", message: "No pending verification for this email." });
            return;
        }
        if (user.isVerified) {
            res.json({ message: "Email is already verified. You can sign in.", alreadyVerified: true });
            return;
        }
        const check = await verifyOtpChallenge(emailNorm, code);
        if (!check.ok) {
            const msg =
                check.reason === "EXPIRED"
                    ? "Code expired. Request a new one from the sign-in page."
                    : check.reason === "NO_OTP"
                      ? "No verification code found. Register again or resend a code."
                      : "Invalid code.";
            res.status(400).json({ error: "OTP_INVALID", message: msg });
            return;
        }
        await db
            .update(usersTable)
            .set({ isVerified: true, emailVerifyToken: null, emailVerifyExpiry: null })
            .where(eq(usersTable.id, user.id));
        await logActivity({
            userId: user.id,
            action: "EMAIL_VERIFIED",
            module: "auth",
            description: `${user.name} verified email with OTP`,
        });
        res.json({ message: "Email verified. You can sign in now." });
    } catch (err) {
        next(err);
    }
});
/* ═══════════════════════════════════════════════════════════════════════════
   POST /auth/login
   Rejects unverified accounts with a dedicated error code so the frontend
   can show a "resend verification" prompt.
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/auth/login", async (req, res) => {
    const validationErrorResponse = () => ({ message: "Email or username and password are required" });
    const invalidCredentialsResponse = () => ({ message: "Invalid credentials" });
    const invalidOtpResponse = () => ({ message: "Invalid OTP" });
    const parsed = LoginBodyEnhanced.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(validationErrorResponse());
        return;
    }
    const { email, password, rememberedDeviceToken, rememberDevice, deviceName, otp } = parsed.data;
    const identifierRaw = String(email || "").trim();
    const identifierNorm = identifierRaw.toLowerCase();
    const isEmailIdentifier = identifierNorm.includes("@");
    if (!identifierNorm || !password || !String(password).trim()) {
        res.status(400).json(validationErrorResponse());
        return;
    }
    if (hasAuthEnvMisconfiguration()) {
        logger.error({
            route: "/auth/login",
            hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
            hasSessionSecret: String(process.env.SESSION_SECRET || "").trim().length >= 16,
            hasJwtSecret: String(process.env.JWT_SECRET || "").trim().length >= 16,
        }, "auth_env_misconfiguration");
        res.status(503).json({
            error: "AUTH_CONFIG_ERROR",
            message: "Authentication service is misconfigured. Please contact administrator.",
        });
        return;
    }
    const requestIp = clientIp(req);
    const requestUserAgent = String(req.headers["user-agent"] || "");
    try {
        const schemaOk = await ensureAuthUserSchema();
        if (!schemaOk) {
            res.status(503).json({
                error: "AUTH_SCHEMA_INVALID",
                message: "Authentication schema is incomplete. Run migrations and try again.",
            });
            return;
        }
        const hasUsernameColumn = Object.prototype.hasOwnProperty.call(usersTable, "username");
        const usernameColumn = hasUsernameColumn ? usersTable.username : usersTable.name;
        const [user] = await db
            .select()
            .from(usersTable)
            .where(isEmailIdentifier
            ? eq(usersTable.email, identifierNorm)
            : or(eq(usernameColumn, identifierRaw), eq(usernameColumn, identifierNorm)));
        if (user && !isSafeAuthUserRow(user)) {
            logger.error({
                route: "/auth/login",
                identifier: identifierNorm,
                hasEmail: typeof user.email === "string",
                hasPasswordHash: typeof user.passwordHash === "string",
                hasIsActive: typeof user.isActive === "boolean",
                hasIsVerified: typeof user.isVerified === "boolean",
            }, "auth_user_row_shape_invalid");
            res.status(503).json({
                error: "AUTH_USER_RECORD_INVALID",
                message: "User record is missing required authentication fields.",
            });
            return;
        }
        if (!user || !user.isActive) {
            res.status(401).json(invalidCredentialsResponse());
            return;
        }
        const valid = await comparePassword(password, user.passwordHash);
        if (!valid) {
            const attempt = bumpLoginAttempt(`pwd:${identifierNorm}`);
            if (attempt.locked) {
                res.status(429).json({
                    error: "TOO_MANY_ATTEMPTS",
                    message: "Too many login attempts. Please wait a few minutes and try again.",
                });
                return;
            }
            res.status(401).json(invalidCredentialsResponse());
            return;
        }
        // Customer self-signup: block until verified. Staff accounts can always sign in
        // so bootstrap/admin users are not locked out if the DB row is inconsistent.
        if (!user.isVerified && user.role === "customer") {
            res.status(403).json({
                error: "EMAIL_NOT_VERIFIED",
                message: "Please verify your email address before logging in. Check your inbox for the verification link.",
                email: user.email,
            });
            return;
        }
        const failedAttemptCount = getLoginAttemptCount(`pwd:${identifierNorm}`);
        const shouldRequireEmailOtp = !isAdminRole(user.role)
            && !user.totpEnabled
            && failedAttemptCount >= 3
            && emailEnabled;
        if (shouldRequireEmailOtp) {
            const challengeToken = signChallengeToken({
                id: user.id,
                email: user.email,
                mode: "email-otp",
                rememberDevice: Boolean(rememberDevice),
                deviceName: toDeviceName(deviceName, requestUserAgent),
            });
            const loginOtp = generateOtpDigits();
            await saveOtpChallenge(user.email, loginOtp);
            try {
                await sendOtpEmail(user.email, user.name, loginOtp);
            }
            catch (mailErr) {
                logger.error({
                    route: "/auth/login",
                    userId: user.id,
                    errMessage: mailErr?.message || String(mailErr),
                }, "login_email_otp_send_failed");
                res.status(502).json({
                    error: "OTP_DELIVERY_FAILED",
                    message: "Could not send OTP email. Please try again.",
                });
                return;
            }
            res.json({
                requires2FA: true,
                requiresTwoFactor: true,
                mode: "email-otp",
                challengeToken,
                message: "OTP sent to your email",
            });
            return;
        }
        clearLoginAttempt(`pwd:${identifierNorm}`);
        if (user.totpEnabled) {
            const trusted = await validateTrustedDeviceForUser(user.id, rememberedDeviceToken);
            if (trusted) {
                const session = await createSessionForUser(user, {
                    trustedDeviceId: trusted.deviceId,
                    deviceName: trusted.deviceName,
                    userAgent: requestUserAgent,
                    ipAddress: requestIp,
                });
                await logActivity({
                    userId: user.id,
                    action: "LOGIN",
                    module: "auth",
                    description: `${user.name} logged in from trusted device`,
                });
                res.json({
                    ...session,
                    token: session.accessToken,
                    trustedDeviceAccepted: true,
                });
                return;
            }
            const secretBase32 = safeDecryptTotpSecret(user.totpSecretEnc, { route: "/auth/login", userId: user.id });
            if (!secretBase32) {
                res.status(503).json({
                    error: "OTP_NOT_CONFIGURED",
                    message: "Two-factor authentication is enabled but not configured correctly. Contact administrator.",
                });
                return;
            }
            if (!otp) {
                const challengeToken = signChallengeToken({
                    id: user.id,
                    email: user.email,
                    mode: "verify",
                    rememberDevice: Boolean(rememberDevice),
                    deviceName: toDeviceName(deviceName, requestUserAgent),
                });
                res.json({
                    requires2FA: true,
                    requiresTwoFactor: true,
                    mode: "verify",
                    challengeToken,
                    message: "OTP is required to complete sign-in.",
                });
                return;
            }
            const validOtp = verifyTotpToken(secretBase32, otp);
            if (!validOtp) {
                logger.warn({
                    route: "/auth/login",
                    userId: user.id,
                    email: user.email,
                }, "totp_verification_failed");
                res.status(401).json(invalidOtpResponse());
                return;
            }
            logger.info({
                route: "/auth/login",
                userId: user.id,
                email: user.email,
            }, "totp_verification_succeeded");
            const session = await createSessionForUser(user, {
                deviceName: toDeviceName(deviceName, requestUserAgent),
                userAgent: requestUserAgent,
                ipAddress: requestIp,
            });
            let trustedDeviceToken = null;
            if (rememberDevice) {
                const trustedDevice = await createTrustedDevice(user, {
                    deviceName: toDeviceName(deviceName, requestUserAgent),
                    userAgent: requestUserAgent,
                    ipAddress: requestIp,
                });
                trustedDeviceToken = trustedDevice.token;
            }
            res.json({
                ...session,
                token: session.accessToken,
                trustedDeviceToken,
            });
            return;
        }
        const session = await createSessionForUser(user, {
            deviceName: toDeviceName(deviceName, requestUserAgent),
            userAgent: requestUserAgent,
            ipAddress: requestIp,
        });
        await logActivity({
            userId: user.id,
            action: "LOGIN",
            module: "auth",
            description: `${user.name} logged in`,
        });
        res.json({
            ...session,
            token: session.accessToken,
        });
    }
    catch (err) {
        await writeAuthErrorLog({ route: "/auth/login", identifier: identifierNorm }, err);
        if (isDatabaseUnavailable(err)) {
            res.status(503).json({
                error: "AUTH_DB_UNAVAILABLE",
                message: "Authentication service is temporarily unavailable. Please try again shortly.",
            });
            return;
        }
        logger.error({
            identifier: identifierNorm,
            errMessage: err?.message || String(err),
            errStack: err?.stack || null,
            errCause: err?.cause ? String(err.cause?.message || err.cause) : null,
        }, "auth_login_failed");
        if (/Failed query|column .* does not exist|relation .* does not exist|does not exist/i.test(String(err?.message || ""))) {
            res.status(500).json({
                message: "Something went wrong",
                error: sanitizeDbErrorMessage(err),
            });
            return;
        }
        res.status(500).json({
            message: "Something went wrong",
            error: err?.message || "AUTH_LOGIN_FAILED",
        });
    }
});
router.post("/auth/2fa/setup", async (req, res) => {
    const parsed = SetupTotpBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
        return;
    }
    try {
        const payload = verifyChallengeToken(parsed.data.setupToken);
        if (payload.mode !== "setup") {
            res.status(400).json({ error: "INVALID_CHALLENGE", message: "Invalid setup token." });
            return;
        }
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
        if (!user) {
            res.status(404).json({ error: "USER_NOT_FOUND" });
            return;
        }
        const secret = generateTotpSecret(user.email);
        const encrypted = encryptSecret(secret.base32);
        await db.update(usersTable).set({ totpTempSecretEnc: encrypted }).where(eq(usersTable.id, user.id));
        const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
        res.json({
            success: true,
            data: {
                qrDataUrl,
                manualKey: secret.base32,
                setupToken: parsed.data.setupToken,
            },
            message: "Scan the QR code in Google Authenticator and verify with a 6-digit code.",
        });
    }
    catch {
        res.status(401).json({ error: "INVALID_CHALLENGE", message: "Setup token expired. Please sign in again." });
    }
});
router.post("/auth/2fa/verify-setup", async (req, res) => {
    const parsed = VerifyTotpSetupBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
        return;
    }
    try {
        const payload = verifyChallengeToken(parsed.data.setupToken);
        if (payload.mode !== "setup") {
            res.status(400).json({ error: "INVALID_CHALLENGE", message: "Invalid setup token." });
            return;
        }
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
        const secretBase32 = safeDecryptTotpSecret(user?.totpTempSecretEnc, { route: "/auth/2fa/verify-setup", userId: payload.id });
        if (!user || !secretBase32) {
            res.status(400).json({ error: "SETUP_NOT_READY", message: "Start setup again to continue." });
            return;
        }
        const attempt = bumpLoginAttempt(`totp-setup:${user.id}`);
        if (attempt.locked) {
            res.status(429).json({ error: "TOO_MANY_ATTEMPTS", message: "Too many OTP attempts. Please wait and retry." });
            return;
        }
        const valid = verifyTotpToken(secretBase32, parsed.data.otp);
        if (!valid) {
            logger.warn({ route: "/auth/2fa/verify-setup", userId: user.id }, "totp_verify_setup_failed");
            res.status(401).json({ error: "OTP_INVALID", message: "Invalid OTP" });
            return;
        }
        clearLoginAttempt(`totp-setup:${user.id}`);
        await db
            .update(usersTable)
            .set({ totpEnabled: true, totpSecretEnc: user.totpTempSecretEnc, totpTempSecretEnc: null })
            .where(eq(usersTable.id, user.id));
        const session = await createSessionForUser({ ...user, totpEnabled: true }, {
            deviceName: payload.deviceName,
            userAgent: String(req.headers["user-agent"] || ""),
            ipAddress: clientIp(req),
        });
        let trustedDeviceToken = null;
        if (payload.rememberDevice) {
            const trusted = await createTrustedDevice(user, {
                deviceName: payload.deviceName,
                userAgent: String(req.headers["user-agent"] || ""),
                ipAddress: clientIp(req),
            });
            trustedDeviceToken = trusted.token;
        }
        res.json({
            ...session,
            trustedDeviceToken,
        });
    }
    catch (err) {
        logger.warn({
            route: "/auth/2fa/verify-setup",
            errMessage: err?.message || String(err),
        }, "totp_verify_setup_rejected");
        res.status(401).json({ error: "INVALID_CHALLENGE", message: "Setup token expired. Please sign in again." });
    }
});
router.post("/auth/2fa/verify", async (req, res) => {
    const parsed = VerifyTotpBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
        return;
    }
    try {
        const payload = verifyChallengeToken(parsed.data.challengeToken);
        if (payload.mode === "email-otp") {
            if (!parsed.data.otp) {
                res.status(400).json({ error: "VALIDATION_ERROR", message: "Enter the 6-digit OTP" });
                return;
            }
            const [userById] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
            if (!userById || !userById.isActive) {
                res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid credentials" });
                return;
            }
            const otpCheck = await verifyOtpChallenge(String(payload.email || ""), parsed.data.otp);
            if (!otpCheck.ok) {
                const message = otpCheck.reason === "EXPIRED" ? "OTP expired" : "Invalid OTP";
                res.status(401).json({ error: "OTP_INVALID", message });
                return;
            }
            const session = await createSessionForUser(userById, {
                deviceName: payload.deviceName,
                userAgent: String(req.headers["user-agent"] || ""),
                ipAddress: clientIp(req),
            });
            let trustedDeviceToken = null;
            if (payload.rememberDevice) {
                const trusted = await createTrustedDevice(userById, {
                    deviceName: payload.deviceName,
                    userAgent: String(req.headers["user-agent"] || ""),
                    ipAddress: clientIp(req),
                });
                trustedDeviceToken = trusted.token;
            }
            await logActivity({
                userId: userById.id,
                action: "LOGIN_EMAIL_OTP",
                module: "auth",
                description: `${userById.email} signed in with email OTP`,
            });
            res.json({
                ...session,
                trustedDeviceToken,
            });
            return;
        }
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
        const secretBase32 = safeDecryptTotpSecret(user?.totpSecretEnc, { route: "/auth/2fa/verify", userId: payload.id });
        if (!user || !user.totpEnabled || !secretBase32) {
            res.status(401).json({ error: "OTP_NOT_ENABLED", message: "Two-factor authentication is not configured." });
            return;
        }
        if (parsed.data.backupCode) {
            const attempt = bumpLoginAttempt(`backup:${user.id}`);
            if (attempt.locked) {
                res.status(429).json({ error: "TOO_MANY_ATTEMPTS", message: "Too many backup code attempts. Please wait and retry." });
                return;
            }
            const normalized = normalizeBackupCode(parsed.data.backupCode);
            const [codeRow] = await db
                .select()
                .from(twoFactorBackupCodesTable)
                .where(and(eq(twoFactorBackupCodesTable.userId, user.id), eq(twoFactorBackupCodesTable.codeHash, hashOpaqueToken(normalized)), isNull(twoFactorBackupCodesTable.consumedAt)))
                .limit(1);
            if (!codeRow) {
                res.status(400).json({ error: "BACKUP_CODE_INVALID", message: "Invalid backup code." });
                return;
            }
            await db
                .update(twoFactorBackupCodesTable)
                .set({ consumedAt: new Date() })
                .where(eq(twoFactorBackupCodesTable.id, codeRow.id));
            clearLoginAttempt(`backup:${user.id}`);
            await logActivity({
                userId: user.id,
                action: "LOGIN_BACKUP_CODE",
                module: "auth",
                description: `${user.email} signed in with a backup code`,
            });
        }
        else {
            const attempt = bumpLoginAttempt(`totp:${user.id}`);
            if (attempt.locked) {
                res.status(429).json({ error: "TOO_MANY_ATTEMPTS", message: "Too many OTP attempts. Please wait and retry." });
                return;
            }
            const valid = verifyTotpToken(secretBase32, parsed.data.otp);
            if (!valid) {
                logger.warn({ route: "/auth/2fa/verify", userId: user.id }, "totp_verification_failed");
                res.status(401).json({ error: "OTP_INVALID", message: "Invalid OTP" });
                return;
            }
            clearLoginAttempt(`totp:${user.id}`);
        }
        const session = await createSessionForUser(user, {
            deviceName: payload.deviceName,
            userAgent: String(req.headers["user-agent"] || ""),
            ipAddress: clientIp(req),
        });
        let trustedDeviceToken = null;
        if (payload.rememberDevice) {
            const trusted = await createTrustedDevice(user, {
                deviceName: payload.deviceName,
                userAgent: String(req.headers["user-agent"] || ""),
                ipAddress: clientIp(req),
            });
            trustedDeviceToken = trusted.token;
        }
        res.json({
            ...session,
            trustedDeviceToken,
        });
    }
    catch (err) {
        logger.warn({
            route: "/auth/2fa/verify",
            errMessage: err?.message || String(err),
        }, "totp_verify_rejected");
        res.status(401).json({ error: "INVALID_CHALLENGE", message: "OTP challenge expired. Sign in again." });
    }
});
router.get("/auth/2fa/status", authenticate, async (req, res) => {
    const [user] = await db.select({ totpEnabled: usersTable.totpEnabled }).from(usersTable).where(eq(usersTable.id, req.user.id));
    res.json({ enabled: Boolean(user?.totpEnabled) });
});
router.post("/auth/2fa/setup-authenticated", authenticate, async (req, res) => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (!user) {
        res.status(404).json({ error: "USER_NOT_FOUND" });
        return;
    }
    const setupToken = signChallengeToken({ id: user.id, email: user.email, mode: "setup" });
    const secret = generateTotpSecret(user.email);
    const encrypted = encryptSecret(secret.base32);
    await db.update(usersTable).set({ totpTempSecretEnc: encrypted }).where(eq(usersTable.id, user.id));
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    res.json({
        success: true,
        data: {
            qrDataUrl,
            manualKey: secret.base32,
            setupToken,
        },
    });
});
router.post("/auth/2fa/disable", authenticate, async (req, res) => {
    const parsed = DisableTwoFactorBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
        return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    const secretBase32 = safeDecryptTotpSecret(user?.totpSecretEnc, { route: "/auth/2fa/disable", userId: req.user.id });
    if (!user || !secretBase32 || !user.totpEnabled) {
        res.status(400).json({ error: "OTP_NOT_ENABLED", message: "Two-factor authentication is not enabled." });
        return;
    }
    const valid = verifyTotpToken(secretBase32, parsed.data.otp);
    if (!valid) {
        logger.warn({ route: "/auth/2fa/disable", userId: user.id }, "totp_disable_verification_failed");
        res.status(401).json({ error: "OTP_INVALID", message: "Invalid OTP" });
        return;
    }
    await db
        .update(usersTable)
        .set({ totpEnabled: false, totpSecretEnc: null, totpTempSecretEnc: null })
        .where(eq(usersTable.id, user.id));
    await db.delete(twoFactorBackupCodesTable).where(eq(twoFactorBackupCodesTable.userId, user.id));
    await db
        .update(trustedDevicesTable)
        .set({ revokedAt: new Date() })
        .where(and(eq(trustedDevicesTable.userId, user.id), isNull(trustedDevicesTable.revokedAt)));
    res.json({ success: true, message: "Two-factor authentication disabled." });
});
router.get("/auth/2fa/backup-codes/status", authenticate, async (req, res) => {
    const rows = await db
        .select()
        .from(twoFactorBackupCodesTable)
        .where(and(eq(twoFactorBackupCodesTable.userId, req.user.id), isNull(twoFactorBackupCodesTable.consumedAt)));
    res.json({ remaining: rows.length });
});
router.post("/auth/2fa/backup-codes/regenerate", authenticate, async (req, res) => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (!user || !user.totpEnabled) {
        res.status(400).json({ error: "OTP_NOT_ENABLED", message: "Enable two-factor authentication first." });
        return;
    }
    const codes = generateBackupCodes();
    await db.delete(twoFactorBackupCodesTable).where(eq(twoFactorBackupCodesTable.userId, req.user.id));
    await db.insert(twoFactorBackupCodesTable).values(codes.map((code) => ({
        userId: req.user.id,
        codeHash: hashOpaqueToken(normalizeBackupCode(code)),
    })));
    await logActivity({
        userId: req.user.id,
        action: "GENERATE_BACKUP_CODES",
        module: "auth",
        description: "Regenerated 2FA backup recovery codes",
    });
    res.json({ codes, generatedAt: new Date().toISOString() });
});
router.get("/auth/sessions", authenticate, async (req, res) => {
    const rows = await db
        .select()
        .from(authSessionsTable)
        .where(and(eq(authSessionsTable.userId, req.user.id), isNull(authSessionsTable.revokedAt), gt(authSessionsTable.expiresAt, new Date())))
        .orderBy(desc(authSessionsTable.lastActiveAt));
    res.json({
        sessions: rows.map((s) => ({
            sessionId: s.sessionId,
            deviceName: s.deviceName || "Unknown device",
            userAgent: s.userAgent || "",
            ipAddress: s.ipAddress || "",
            lastActiveAt: s.lastActiveAt,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
            current: Boolean(req.user.sid) && s.sessionId === req.user.sid,
        })),
    });
});
router.post("/auth/sessions/revoke", authenticate, async (req, res) => {
    const parsed = RevokeSessionBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
        return;
    }
    const [session] = await db
        .select()
        .from(authSessionsTable)
        .where(and(eq(authSessionsTable.userId, req.user.id), eq(authSessionsTable.sessionId, parsed.data.sessionId)));
    if (!session) {
        res.status(404).json({ error: "SESSION_NOT_FOUND" });
        return;
    }
    await db
        .update(authSessionsTable)
        .set({ revokedAt: new Date() })
        .where(eq(authSessionsTable.id, session.id));
    if (session.trustedDeviceId) {
        await db
            .update(trustedDevicesTable)
            .set({ revokedAt: new Date() })
            .where(and(eq(trustedDevicesTable.userId, req.user.id), eq(trustedDevicesTable.deviceId, session.trustedDeviceId)));
    }
    res.json({ success: true });
});
router.post("/auth/sessions/revoke-all", authenticate, async (req, res) => {
    await db
        .update(authSessionsTable)
        .set({ revokedAt: new Date() })
        .where(and(eq(authSessionsTable.userId, req.user.id), isNull(authSessionsTable.revokedAt)));
    await db
        .update(trustedDevicesTable)
        .set({ revokedAt: new Date() })
        .where(and(eq(trustedDevicesTable.userId, req.user.id), isNull(trustedDevicesTable.revokedAt)));
    await db.update(usersTable).set({ refreshToken: null }).where(eq(usersTable.id, req.user.id));
    res.json({ success: true });
});
router.post("/auth/forgot-password", async (req, res) => {
    const parsed = ForgotPasswordBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
        return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (user) {
        const token = createPasswordResetToken();
        await db
            .update(usersTable)
            .set({
            passwordResetToken: hashResetToken(token),
            passwordResetExpiry: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        })
            .where(eq(usersTable.id, user.id));
        logger.info({ userId: user.id, resetToken: token }, "password_reset_token_generated");
    }
    res.json({ success: true, message: "If the account exists, a reset link has been generated." });
});
router.post("/auth/reset-password", async (req, res) => {
    const parsed = ResetPasswordBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
        return;
    }
    const tokenHash = hashResetToken(parsed.data.token);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.passwordResetToken, tokenHash));
    if (!user || !user.passwordResetExpiry || user.passwordResetExpiry.getTime() < Date.now()) {
        res.status(400).json({ error: "RESET_TOKEN_INVALID", message: "Reset token is invalid or expired." });
        return;
    }
    const passwordHash = await hashPassword(parsed.data.password);
    await db
        .update(usersTable)
        .set({
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
        refreshToken: null,
    })
        .where(eq(usersTable.id, user.id));
    res.json({ success: true, message: "Password reset successful. Please sign in." });
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
    const email = parsed.data.email.trim().toLowerCase();
    // Use a consistent response time regardless of whether the email exists
    // (prevents user-enumeration timing attacks)
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!user || user.isVerified) {
        // Return the same 200 to avoid leaking whether the email is registered
        res.json({
            message: "If that email belongs to an unverified account, a new code has been sent.",
        });
        return;
    }
    if (user.role !== "customer") {
        res.json({
            message: "If that email belongs to an unverified account, a new code has been sent.",
        });
        return;
    }
    // Rate-limit OTP resend: 1 per minute
    const [lastOtp] = await db
        .select({ createdAt: emailOtpChallengesTable.createdAt })
        .from(emailOtpChallengesTable)
        .where(eq(emailOtpChallengesTable.email, email))
        .limit(1);
    const ONE_MINUTE = 60_000;
    if (lastOtp && lastOtp.createdAt.getTime() > Date.now() - ONE_MINUTE) {
        res.status(429).json({
            error: "RESEND_TOO_SOON",
            message: "A code was sent recently. Please wait a minute before requesting another.",
        });
        return;
    }
    const otp = generateOtpDigits();
    await saveOtpChallenge(email, otp);
    try {
        await sendOtpEmail(user.email, user.name, otp);
    }
    catch (err) {
        console.error("[auth/resend-verification] Failed to send OTP:", err);
        res.status(502).json({ error: "Failed to send email. Please try again shortly." });
        return;
    }
    res.json({ message: "A new verification code has been sent to your email address." });
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
        if (!user) {
            res.status(401).json({ error: "Invalid refresh token" });
            return;
        }
        const sid = typeof payload.sid === "string" ? payload.sid : null;
        if (sid) {
            const [session] = await db
                .select()
                .from(authSessionsTable)
                .where(and(eq(authSessionsTable.userId, user.id), eq(authSessionsTable.sessionId, sid)));
            if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
                res.status(401).json({ error: "Invalid refresh token" });
                return;
            }
            if (session.refreshTokenHash !== hashOpaqueToken(parsed.data.refreshToken)) {
                res.status(401).json({ error: "Invalid refresh token" });
                return;
            }
            const roleForToken = resolveRoleForToken(user.role);
            const accessToken = generateAccessToken({ id: user.id, email: user.email, role: roleForToken, sid });
            const newRefreshToken = generateRefreshToken({ id: user.id, email: user.email, sid });
            await db
                .update(authSessionsTable)
                .set({
                refreshTokenHash: hashOpaqueToken(newRefreshToken),
                lastActiveAt: new Date(),
            })
                .where(eq(authSessionsTable.id, session.id));
            await db.update(usersTable).set({ refreshToken: newRefreshToken }).where(eq(usersTable.id, user.id));
            res.json({
                accessToken,
                refreshToken: newRefreshToken,
                accessExpiresIn: getAccessExpiresInSeconds(),
                user: sanitize(user),
            });
            return;
        }
        if (user.refreshToken !== parsed.data.refreshToken) {
            res.status(401).json({ error: "Invalid refresh token" });
            return;
        }
        const legacySession = await createSessionForUser(user, { deviceName: "Legacy session refresh" });
        res.json(legacySession);
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
        if (req.user.sid) {
            const [session] = await db
                .select()
                .from(authSessionsTable)
                .where(and(eq(authSessionsTable.userId, req.user.id), eq(authSessionsTable.sessionId, req.user.sid)));
            if (session) {
                await db.update(authSessionsTable).set({ revokedAt: new Date() }).where(eq(authSessionsTable.id, session.id));
                if (session.trustedDeviceId) {
                    await db
                        .update(trustedDevicesTable)
                        .set({ revokedAt: new Date() })
                        .where(and(eq(trustedDevicesTable.userId, req.user.id), eq(trustedDevicesTable.deviceId, session.trustedDeviceId)));
                }
            }
        }
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
