/**
 * Optional Google / Facebook OAuth for **customer** sign-in.
 * - Persists `oauth_provider` + `oauth_subject` on `users` (see migration `oauthUserLinkColumnsV1`).
 * - Staff accounts (non-customer): blocked from social login on that email.
 * - Admin-created customers: same email links OAuth without changing password or role.
 * - Session: JWT access + refresh via existing `auth_sessions` + `generateAccessToken` (same as password login).
 *
 * Frontend: GET /api/auth/oauth/providers → then redirect browser to …/google|facebook/start,
 * then POST /api/auth/oauth/exchange with `{ code }` from `/auth/oauth-bridge`.
 */
import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, authSessionsTable } from "@workspace/db";
import { hashPassword, generateAccessToken, generateRefreshToken } from "../lib/auth.js";
import { getAccessExpiresInSeconds } from "../lib/sessionPolicy.js";
import { logger } from "../lib/logger";
import { resolveRoleForToken } from "../lib/userRole.js";

const router = Router();
const OAUTH_STATE_SECRET = String(process.env.SESSION_SECRET || process.env.JWT_SECRET || "oauth-state-fallback");
const FRONTEND_ORIGIN = String(process.env.APP_URL || process.env.OAUTH_FRONTEND_ORIGIN || "http://localhost:5173").replace(/\/+$/, "");
const API_PUBLIC_ORIGIN = String(process.env.OAUTH_API_PUBLIC_ORIGIN || process.env.RAILWAY_PUBLIC_DOMAIN || "").replace(/\/+$/, "");

function hashOpaqueToken(value) {
    return createHash("sha256").update(String(value || "")).digest("hex");
}
function nowPlusDays(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
function signState(provider) {
    return jwt.sign({ purpose: "oauth-state", provider, n: randomBytes(8).toString("hex") }, OAUTH_STATE_SECRET, { expiresIn: "15m" });
}
function verifyState(token, expectedProvider) {
    const d = jwt.verify(String(token || ""), OAUTH_STATE_SECRET);
    if (d.purpose !== "oauth-state" || d.provider !== expectedProvider)
        throw new Error("bad_state");
    return d;
}
function googleConfigured() {
    return Boolean(String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim() && String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim());
}
function facebookConfigured() {
    return Boolean(String(process.env.FACEBOOK_APP_ID || "").trim() && String(process.env.FACEBOOK_APP_SECRET || "").trim());
}
function apiCallbackBase(req) {
    if (API_PUBLIC_ORIGIN)
        return API_PUBLIC_ORIGIN;
    const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    return `${proto}://${host}`;
}

const pendingExchanges = new Map();
function stashExchangePayload(payload) {
    const code = randomBytes(24).toString("hex");
    pendingExchanges.set(code, { ...payload, exp: Date.now() + 120_000 });
    return code;
}
function takeExchangePayload(code) {
    const row = pendingExchanges.get(code);
    pendingExchanges.delete(code);
    if (!row || row.exp < Date.now())
        return null;
    return row;
}

/**
 * Link or create a **customer** row. Preserves password and role for admin-created customers.
 */
async function findOrCreateOrLinkOAuthUser({ provider, providerSubject, email, name, profileImageUrl }) {
    const subject = String(providerSubject || "").trim();
    const em = String(email || "").trim().toLowerCase();
    if (!subject)
        throw new Error("OAuth provider did not return a stable account id (subject).");
    if (!em || !em.includes("@"))
        throw new Error("OAuth account did not return a usable email.");

    const [byOAuth] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.oauthProvider, provider), eq(usersTable.oauthSubject, subject)));
    if (byOAuth) {
        if (byOAuth.role !== "customer") {
            throw new Error("This social login is linked to a staff account. Use password sign-in.");
        }
        const updates = {
            oauthProvider: provider,
            oauthSubject: subject,
            updatedAt: new Date(),
        };
        if (name && name !== byOAuth.name)
            updates.name = name;
        if (profileImageUrl && !byOAuth.profileImageUrl)
            updates.profileImageUrl = profileImageUrl;
        if (String(byOAuth.email).toLowerCase() !== em) {
            logger.warn({ userId: byOAuth.id, storedEmail: byOAuth.email, idpEmail: em }, "oauth_returned_different_email");
        }
        await db.update(usersTable).set(updates).where(eq(usersTable.id, byOAuth.id));
        const [fresh] = await db.select().from(usersTable).where(eq(usersTable.id, byOAuth.id));
        return fresh;
    }

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, em));
    if (existing) {
        if (existing.role !== "customer") {
            throw new Error("This email is already registered to a staff account. Sign in with your password.");
        }
        const updates = {
            oauthProvider: provider,
            oauthSubject: subject,
            updatedAt: new Date(),
        };
        if (name && name !== existing.name)
            updates.name = name;
        if (profileImageUrl && !existing.profileImageUrl)
            updates.profileImageUrl = profileImageUrl;
        await db.update(usersTable).set(updates).where(eq(usersTable.id, existing.id));
        const [u2] = await db.select().from(usersTable).where(eq(usersTable.id, existing.id));
        return u2;
    }

    const randomPw = randomBytes(32).toString("hex");
    const passwordHash = await hashPassword(randomPw);
    try {
        const [created] = await db.insert(usersTable).values({
            name: name || em.split("@")[0] || "Customer",
            email: em,
            passwordHash,
            role: "customer",
            isActive: true,
            isVerified: true,
            profileImageUrl: profileImageUrl || null,
            oauthProvider: provider,
            oauthSubject: subject,
        }).returning();
        return created;
    }
    catch (err) {
        const msg = String(err?.message ?? err);
        if (msg.includes("duplicate key") || msg.includes("unique")) {
            const [again] = await db.select().from(usersTable).where(eq(usersTable.email, em));
            if (again && again.role === "customer") {
                await db.update(usersTable).set({
                    oauthProvider: provider,
                    oauthSubject: subject,
                    updatedAt: new Date(),
                    ...(name && name !== again.name ? { name } : {}),
                    ...(profileImageUrl && !again.profileImageUrl ? { profileImageUrl } : {}),
                }).where(eq(usersTable.id, again.id));
                const [u3] = await db.select().from(usersTable).where(eq(usersTable.id, again.id));
                return u3;
            }
        }
        if (msg.includes("users_oauth_provider_subject"))
            throw new Error("This social account is already linked to another user.");
        throw err;
    }
}

async function createSessionForUser(user, req) {
    const sessionId = randomBytes(16).toString("hex");
    const roleForToken = resolveRoleForToken(user.role);
    const accessToken = generateAccessToken({ id: user.id, email: user.email, role: roleForToken, sid: sessionId });
    const refreshToken = generateRefreshToken({ id: user.id, email: user.email, sid: sessionId });
    const ua = String(req.headers["user-agent"] || "").slice(0, 120);
    const xff = req.headers["x-forwarded-for"];
    const ip = typeof xff === "string" && xff.length ? xff.split(",")[0].trim() : (req.socket?.remoteAddress || null);
    await db.insert(authSessionsTable).values({
        userId: user.id,
        sessionId,
        refreshTokenHash: hashOpaqueToken(refreshToken),
        trustedDeviceId: null,
        deviceName: `OAuth (${ua || "browser"})`,
        userAgent: ua || null,
        ipAddress: ip,
        lastActiveAt: new Date(),
        expiresAt: nowPlusDays(30),
    });
    await db.update(usersTable).set({ refreshToken }).where(eq(usersTable.id, user.id));
    return { accessToken, refreshToken, accessExpiresIn: getAccessExpiresInSeconds() };
}

function redirectLoginError(res, message) {
    res.redirect(`${FRONTEND_ORIGIN}/login?oauth=error&message=${encodeURIComponent(message)}`);
}

router.get("/auth/oauth/providers", (_req, res) => {
    res.json({
        google: googleConfigured(),
        facebook: facebookConfigured(),
    });
});

router.get("/auth/oauth/google/start", (req, res) => {
    if (!googleConfigured()) {
        res.status(501).json({ error: "GOOGLE_OAUTH_NOT_CONFIGURED", message: "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET." });
        return;
    }
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID.trim();
    const redirectUri = `${apiCallbackBase(req)}/api/auth/oauth/google/callback`;
    const state = signState("google");
    const q = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        state,
        scope: "openid email profile",
        access_type: "offline",
        prompt: "consent",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`);
});

router.get("/auth/oauth/google/callback", async (req, res) => {
    try {
        const err = String(req.query.error || "");
        if (err)
            return redirectLoginError(res, err === "access_denied" ? "Sign-in was cancelled." : err);
        try {
            verifyState(req.query.state, "google");
        }
        catch {
            return redirectLoginError(res, "Invalid or expired OAuth state. Please try again.");
        }
        const code = String(req.query.code || "");
        if (!code)
            return redirectLoginError(res, "Missing authorization code.");
        const redirectUri = `${apiCallbackBase(req)}/api/auth/oauth/google/callback`;
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_OAUTH_CLIENT_ID.trim(),
                client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET.trim(),
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
            }).toString(),
        });
        const tokenJson = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || !tokenJson.access_token) {
            logger.warn({ status: tokenRes.status, tokenJson }, "google_oauth_token_failed");
            return redirectLoginError(res, tokenJson.error_description || tokenJson.error || "Google token exchange failed.");
        }
        const profRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        });
        const prof = await profRes.json().catch(() => ({}));
        const email = prof.email;
        const sub = prof.sub;
        const name = prof.name || prof.given_name || "";
        const picture = prof.picture || null;
        if (!sub)
            return redirectLoginError(res, "Google did not return account id (sub).");
        const user = await findOrCreateOrLinkOAuthUser({
            provider: "google",
            providerSubject: sub,
            email,
            name,
            profileImageUrl: picture,
        });
        const tokens = await createSessionForUser(user, req);
        const ex = stashExchangePayload({
            ...tokens,
            user: { id: user.id, name: user.name, email: user.email, role: resolveRoleForToken(user.role) },
        });
        res.redirect(`${FRONTEND_ORIGIN}/auth/oauth-bridge?code=${encodeURIComponent(ex)}`);
    }
    catch (e) {
        logger.error({ err: String(e?.message || e) }, "google_oauth_callback_failed");
        return redirectLoginError(res, String(e?.message || "Sign-in failed. Please try again."));
    }
});

router.get("/auth/oauth/facebook/start", (req, res) => {
    if (!facebookConfigured()) {
        res.status(501).json({ error: "FACEBOOK_OAUTH_NOT_CONFIGURED", message: "Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET." });
        return;
    }
    const appId = process.env.FACEBOOK_APP_ID.trim();
    const redirectUri = `${apiCallbackBase(req)}/api/auth/oauth/facebook/callback`;
    const state = signState("facebook");
    const q = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        state,
        scope: "email,public_profile",
    });
    res.redirect(`https://www.facebook.com/v18.0/dialog/oauth?${q.toString()}`);
});

router.get("/auth/oauth/facebook/callback", async (req, res) => {
    try {
        const err = String(req.query.error || "");
        if (err)
            return redirectLoginError(res, err === "access_denied" ? "Sign-in was cancelled." : err);
        try {
            verifyState(req.query.state, "facebook");
        }
        catch {
            return redirectLoginError(res, "Invalid or expired OAuth state. Please try again.");
        }
        const code = String(req.query.code || "");
        if (!code)
            return redirectLoginError(res, "Missing authorization code.");
        const redirectUri = `${apiCallbackBase(req)}/api/auth/oauth/facebook/callback`;
        const tokenUrl = new URL("https://graph.facebook.com/v18.0/oauth/access_token");
        tokenUrl.searchParams.set("client_id", process.env.FACEBOOK_APP_ID.trim());
        tokenUrl.searchParams.set("redirect_uri", redirectUri);
        tokenUrl.searchParams.set("client_secret", process.env.FACEBOOK_APP_SECRET.trim());
        tokenUrl.searchParams.set("code", code);
        const tokenRes = await fetch(tokenUrl.toString());
        const tokenJson = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || !tokenJson.access_token) {
            logger.warn({ status: tokenRes.status, tokenJson }, "facebook_oauth_token_failed");
            return redirectLoginError(res, tokenJson.error?.message || tokenJson.error || "Facebook token exchange failed.");
        }
        const profUrl = new URL("https://graph.facebook.com/v18.0/me");
        profUrl.searchParams.set("fields", "id,name,email,picture.type(large)");
        profUrl.searchParams.set("access_token", tokenJson.access_token);
        const profRes = await fetch(profUrl.toString());
        const prof = await profRes.json().catch(() => ({}));
        if (prof.error)
            return redirectLoginError(res, prof.error.message || "Facebook profile request failed.");
        const email = prof.email;
        const fbId = prof.id != null ? String(prof.id) : "";
        const name = prof.name || "";
        const picture = prof.picture?.data?.url || null;
        if (!email)
            return redirectLoginError(res, "Facebook did not return an email. Enable email permission or use a test user with email.");
        if (!fbId)
            return redirectLoginError(res, "Facebook did not return user id.");
        const user = await findOrCreateOrLinkOAuthUser({
            provider: "facebook",
            providerSubject: fbId,
            email,
            name,
            profileImageUrl: picture,
        });
        const tokens = await createSessionForUser(user, req);
        const ex = stashExchangePayload({
            ...tokens,
            user: { id: user.id, name: user.name, email: user.email, role: resolveRoleForToken(user.role) },
        });
        res.redirect(`${FRONTEND_ORIGIN}/auth/oauth-bridge?code=${encodeURIComponent(ex)}`);
    }
    catch (e) {
        logger.error({ err: String(e?.message || e) }, "facebook_oauth_callback_failed");
        return redirectLoginError(res, String(e?.message || "Sign-in failed. Please try again."));
    }
});

const ExchangeBody = z.object({ code: z.string().min(10) });

router.post("/auth/oauth/exchange", (req, res) => {
    const parsed = ExchangeBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "INVALID_CODE", message: "Invalid exchange payload" });
        return;
    }
    const row = takeExchangePayload(parsed.data.code);
    if (!row) {
        res.status(400).json({ error: "EXPIRED_CODE", message: "Login link expired. Please try signing in again." });
        return;
    }
    res.json({
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        accessExpiresIn: row.accessExpiresIn,
        user: row.user,
    });
});

export default router;
