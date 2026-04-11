import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { logger } from "./logger.js";

export const SESSION_DURATION_KEY = "SESSION_DURATION";

/** Preset keys stored in app_settings (admin-configurable). */
export const SESSION_DURATION_PRESETS = ["30m", "1h", "1d", "persistent"];

const POLICY = {
    "30m": { access: "30m", refresh: "14d", accessSeconds: 30 * 60 },
    "1h": { access: "1h", refresh: "30d", accessSeconds: 60 * 60 },
    "1d": { access: "1d", refresh: "90d", accessSeconds: 24 * 60 * 60 },
    /** "Always" — long-lived browser session until explicit logout (JWTs are still bounded). */
    persistent: { access: "24h", refresh: "3650d", accessSeconds: 24 * 60 * 60 },
};

let cached = POLICY["1h"];
let cachedPreset = "1h";

function normalizePreset(raw) {
    const s = String(raw ?? "1h").trim().toLowerCase();
    if (SESSION_DURATION_PRESETS.includes(s))
        return s;
    return "1h";
}

function presetToPolicy(preset) {
    return POLICY[preset] ?? POLICY["1h"];
}

/**
 * Load SESSION_DURATION from DB (or env SESSION_DURATION), update in-memory policy.
 * Call on startup and after admin changes the setting.
 */
export async function loadSessionPolicy() {
    let fromDb;
    try {
        const [row] = await db
            .select({ value: appSettingsTable.value })
            .from(appSettingsTable)
            .where(eq(appSettingsTable.key, SESSION_DURATION_KEY));
        fromDb = row?.value;
    }
    catch (err) {
        logger.warn({ err }, "session_policy_db_unavailable_using_env_only");
        fromDb = undefined;
    }
    const fromEnv = process.env.SESSION_DURATION;
    const preset = normalizePreset(fromDb ?? fromEnv ?? "1h");
    cachedPreset = preset;
    cached = presetToPolicy(preset);
}

/** Current preset key (e.g. `1h`, `persistent`) after the last load. */
export function getSessionDurationPreset() {
    return cachedPreset;
}

export function getAccessExpiresIn() {
    return cached.access;
}

export function getRefreshExpiresIn() {
    return cached.refresh;
}

/** Access token lifetime in seconds (for API clients / proactive refresh). */
export function getAccessExpiresInSeconds() {
    return cached.accessSeconds;
}

export function isValidSessionDurationValue(value) {
    return SESSION_DURATION_PRESETS.includes(String(value).trim().toLowerCase());
}
