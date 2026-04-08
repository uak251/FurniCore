/**
 * Dashboard theme catalog & portal defaults (app_settings key THEME_DEFAULTS).
 *
 * GET  /dashboard-themes/catalog           — theme metadata (authenticated)
 * GET  /dashboard-themes/defaults        — resolved JSON map role → themeId (authenticated)
 * PUT  /dashboard-themes/defaults         — admin only, set portal defaults
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, appSettingsTable } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";
import { THEME_IDS } from "../lib/themeCatalog";
const router = Router();
const THEME_DEFAULTS_KEY = "THEME_DEFAULTS";
/** Role keys that receive a default theme when user.dashboardTheme is null */
export const PORTAL_ROLE_KEYS = [
    "admin",
    "manager",
    "accountant",
    "employee",
    "sales_manager",
    "supplier",
    "worker",
    "customer",
];
export const BUILTIN_DEFAULTS = {
    admin: "indigo-clinical",
    manager: "amber-forge",
    accountant: "cyan-ledger",
    employee: "slate-executive",
    sales_manager: "rose-revenue",
    supplier: "coral-supply",
    worker: "teal-floor",
    customer: "sky-client",
};
const THEME_CATALOG = [
    { id: "indigo-clinical", label: "Indigo Clinical", description: "Deep lavender sidebar, soft grey canvas — doc.track inspired base." },
    { id: "slate-executive", label: "Slate Executive", description: "Neutral charcoal chrome with crisp blue accents." },
    { id: "emerald-ops", label: "Emerald Ops", description: "Fresh greens for inventory & stock control." },
    { id: "amber-forge", label: "Amber Forge", description: "Warm amber highlights for production & manufacturing." },
    { id: "rose-revenue", label: "Rose Revenue", description: "Sales & CRM with rose and coral energy." },
    { id: "cyan-ledger", label: "Cyan Ledger", description: "Cool teals for accounting & finance." },
    { id: "violet-people", label: "Violet People", description: "HR & people analytics with purple depth." },
    { id: "coral-supply", label: "Coral Supply", description: "Supplier portal with coral warmth." },
    { id: "teal-floor", label: "Teal Floor", description: "Shop-floor worker clarity in teal & slate." },
    { id: "sky-client", label: "Sky Client", description: "Light customer portal with sky blue airiness." },
];
function parseDefaults(raw) {
    if (!raw)
        return { ...BUILTIN_DEFAULTS };
    try {
        const obj = JSON.parse(raw);
        const out = { ...BUILTIN_DEFAULTS };
        for (const k of PORTAL_ROLE_KEYS) {
            const v = obj[k];
            if (v && THEME_IDS.includes(v))
                out[k] = v;
        }
        return out;
    }
    catch {
        return { ...BUILTIN_DEFAULTS };
    }
}
async function loadDefaultsFromDb() {
    const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, THEME_DEFAULTS_KEY)).limit(1);
    return parseDefaults(row?.value ?? null);
}
router.get("/dashboard-themes/catalog", authenticate, (_req, res) => {
    res.json({ themes: THEME_CATALOG });
});
router.get("/dashboard-themes/defaults", authenticate, async (_req, res, next) => {
    try {
        const defaults = await loadDefaultsFromDb();
        res.json({ defaults });
    }
    catch (err) {
        next(err);
    }
});
const PutDefaultsBody = z.object({
    defaults: z.record(z.string(), z.string()),
});
router.put("/dashboard-themes/defaults", authenticate, requireRole("admin"), async (req, res, next) => {
    const parsed = PutDefaultsBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
        return;
    }
    const merged = { ...BUILTIN_DEFAULTS };
    for (const k of PORTAL_ROLE_KEYS) {
        const v = parsed.data.defaults[k];
        if (v && THEME_IDS.includes(v))
            merged[k] = v;
    }
    try {
        const json = JSON.stringify(merged);
        await db
            .insert(appSettingsTable)
            .values({ key: THEME_DEFAULTS_KEY, value: json })
            .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: json, updatedAt: new Date() } });
        await logActivity({ userId: req.user?.id, action: "UPDATE", module: "settings", description: "Updated THEME_DEFAULTS (portal dashboard themes)" });
        res.json({ defaults: merged });
    }
    catch (err) {
        next(err);
    }
});
export default router;
