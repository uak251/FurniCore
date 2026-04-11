/**
 * App Settings API — key/value store for runtime configuration.
 *
 * GET  /settings            — list all settings (admin only); values masked for secrets
 * GET  /settings/:key       — get a single setting value (admin only)
 * PUT  /settings/:key       — upsert a single setting (admin only)
 * POST /settings/bulk       — upsert multiple settings at once (admin only)
 * DELETE /settings/:key     — remove a setting (falls back to env var)
 *
 * Known key groups:
 *   POWERBI_*  — Azure AD + Power BI report IDs
 *   SESSION_DURATION — 30m | 1h | 1d | persistent (JWT access + refresh lifetimes)
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";
import { loadSessionPolicy, isValidSessionDurationValue, SESSION_DURATION_KEY, } from "../lib/sessionPolicy.js";
const router = Router();
/** Keys whose values should be masked when listed (only last 4 chars shown). */
const SECRET_KEYS = new Set(["POWERBI_CLIENT_SECRET"]);
/** Keys that are valid for Power BI configuration. */
const POWERBI_KEYS = [
    "POWERBI_TENANT_ID",
    "POWERBI_CLIENT_ID",
    "POWERBI_CLIENT_SECRET",
    "POWERBI_WORKSPACE_ID",
    "POWERBI_REPORT_SUPPLIER_LEDGER",
    "POWERBI_REPORT_EXPENSE_INCOME",
    "POWERBI_REPORT_TRIAL_BALANCE",
    "POWERBI_REPORT_PAYROLL_SUMMARY",
    "POWERBI_REPORT_PROFIT_MARGIN",
    "POWERBI_REPORT_INVENTORY_ANALYSIS",
    "POWERBI_REPORT_HR_DASHBOARD",
    "POWERBI_REPORT_SALES_OVERVIEW",
];
/** Non-PowerBI setting keys that can also be read/written through this API. */
const EXTRA_KEYS = ["INVENTORY_VALUATION_METHOD", "SESSION_DURATION"];
const ALLOWED_KEYS = new Set([...POWERBI_KEYS, ...EXTRA_KEYS]);
function maskValue(key, value) {
    if (!value)
        return "";
    if (SECRET_KEYS.has(key))
        return `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
    return value;
}
/* ── GET /settings — list all stored settings + env-var fallbacks ──────────── */
router.get("/settings", authenticate, requireRole("admin"), async (_req, res, next) => {
    try {
        const rows = await db.select().from(appSettingsTable);
        const storedMap = new Map(rows.map((r) => [r.key, r.value]));
        const result = POWERBI_KEYS.map((key) => {
            const stored = storedMap.get(key);
            const fromEnv = !stored && !!process.env[key];
            const raw = stored ?? process.env[key] ?? null;
            return {
                key,
                value: maskValue(key, raw),
                rawValue: raw, // full value for prefill (secrets still masked)
                source: stored ? "db" : fromEnv ? "env" : "unset",
                isSecret: SECRET_KEYS.has(key),
                isSet: !!raw,
            };
        });
        res.json({ settings: result });
    }
    catch (err) {
        next(err);
    }
});
/* ── GET /settings/:key — read a single setting ─────────────────────────────── */
router.get("/settings/:key", authenticate, requireRole("admin"), async (req, res, next) => {
    const key = req.params.key;
    if (!ALLOWED_KEYS.has(key)) {
        res.status(400).json({ error: "UNKNOWN_KEY", message: `Unknown setting key: ${key}` });
        return;
    }
    try {
        const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
        const value = row?.value ?? process.env[key] ?? null;
        res.json({ key, value });
    }
    catch (err) {
        next(err);
    }
});
/* ── PUT /settings/:key — upsert a single setting ───────────────────────────── */
router.put("/settings/:key", authenticate, requireRole("admin"), async (req, res, next) => {
    const key = req.params.key;
    if (!ALLOWED_KEYS.has(key)) {
        res.status(400).json({ error: "UNKNOWN_KEY", message: `Unknown setting key: ${key}. Allowed: ${[...ALLOWED_KEYS].join(", ")}` });
        return;
    }
    const { value } = req.body;
    if (typeof value !== "string") {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "value must be a string" });
        return;
    }
    try {
        const trimmed = value.trim();
        if (key === SESSION_DURATION_KEY && trimmed && !isValidSessionDurationValue(trimmed)) {
            res.status(400).json({
                error: "VALIDATION_ERROR",
                message: `SESSION_DURATION must be one of: 30m, 1h, 1d, persistent`,
            });
            return;
        }
        if (!trimmed) {
            // Empty value → delete the DB entry (fall back to env var)
            await db.delete(appSettingsTable).where(eq(appSettingsTable.key, key));
        }
        else {
            await db
                .insert(appSettingsTable)
                .values({ key, value: trimmed })
                .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: trimmed, updatedAt: new Date() } });
        }
        // Invalidate the in-memory cache in powerbi.ts
        settingsCache.clear();
        if (key === SESSION_DURATION_KEY) {
            await loadSessionPolicy();
        }
        await logActivity({ userId: req.user?.id, action: "UPDATE", module: "settings", description: `Set ${key}${SECRET_KEYS.has(key) ? " (secret)" : ""}` });
        res.json({ key, saved: true });
    }
    catch (err) {
        next(err);
    }
});
/* ── POST /settings/bulk — upsert many settings at once ─────────────────────── */
router.post("/settings/bulk", authenticate, requireRole("admin"), async (req, res, next) => {
    const { settings } = req.body;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "settings must be an object { key: value }" });
        return;
    }
    const invalid = Object.keys(settings).filter((k) => !ALLOWED_KEYS.has(k));
    if (invalid.length) {
        res.status(400).json({ error: "UNKNOWN_KEYS", message: `Unknown keys: ${invalid.join(", ")}` });
        return;
    }
    try {
        for (const [key, value] of Object.entries(settings)) {
            const trimmed = String(value ?? "").trim();
            if (key === SESSION_DURATION_KEY && trimmed && !isValidSessionDurationValue(trimmed)) {
                res.status(400).json({
                    error: "VALIDATION_ERROR",
                    message: `SESSION_DURATION must be one of: 30m, 1h, 1d, persistent`,
                });
                return;
            }
            if (!trimmed) {
                await db.delete(appSettingsTable).where(eq(appSettingsTable.key, key));
            }
            else {
                await db
                    .insert(appSettingsTable)
                    .values({ key, value: trimmed })
                    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: trimmed, updatedAt: new Date() } });
            }
        }
        settingsCache.clear();
        if (Object.keys(settings).includes(SESSION_DURATION_KEY)) {
            await loadSessionPolicy();
        }
        await logActivity({ userId: req.user?.id, action: "UPDATE", module: "settings", description: `Bulk-updated ${Object.keys(settings).length} settings` });
        res.json({ saved: Object.keys(settings).length });
    }
    catch (err) {
        next(err);
    }
});
/* ── DELETE /settings/:key — remove a stored setting (env var becomes active) ── */
router.delete("/settings/:key", authenticate, requireRole("admin"), async (req, res, next) => {
    const key = req.params.key;
    if (!ALLOWED_KEYS.has(key)) {
        res.status(400).json({ error: "UNKNOWN_KEY" });
        return;
    }
    try {
        await db.delete(appSettingsTable).where(eq(appSettingsTable.key, key));
        settingsCache.clear();
        if (key === SESSION_DURATION_KEY) {
            await loadSessionPolicy();
        }
        res.json({ key, removed: true });
    }
    catch (err) {
        next(err);
    }
});
/* ═══════════════════════════════════════════════════════════════════════════════
   Exported helper — used by powerbi.ts to read a setting (DB-first, env fallback)
   30-second TTL to avoid a DB call on every embed-token request.
   ═══════════════════════════════════════════════════════════════════════════════ */
export const settingsCache = new Map();
const SETTINGS_TTL_MS = 30_000;
export async function getSetting(key) {
    const cached = settingsCache.get(key);
    if (cached && Date.now() - cached.ts < SETTINGS_TTL_MS)
        return cached.value;
    const [row] = await db
        .select({ value: appSettingsTable.value })
        .from(appSettingsTable)
        .where(eq(appSettingsTable.key, key));
    const value = row?.value ?? process.env[key] ?? null;
    settingsCache.set(key, { value, ts: Date.now() });
    return value;
}
export default router;
