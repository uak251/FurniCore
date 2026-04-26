import { Router } from "express";
import { pool } from "@workspace/db";
const router = Router();
async function healthSnapshot() {
    try {
        await pool.query("select 1 as ok");
        return { status: "ok", db: "connected" };
    }
    catch {
        return { status: "degraded", db: "disconnected" };
    }
}
router.get("/healthz", async (_req, res) => {
    const snap = await healthSnapshot();
    // Railway healthcheck should stay green even during temporary DB outages.
    res.status(200).json({
        status: snap.status,
        uptime: process.uptime(),
        db: snap.db,
    });
});
router.get("/health", async (_req, res) => {
    const snap = await healthSnapshot();
    res.status(200).json({
        status: snap.status,
        uptime: process.uptime(),
        db: snap.db,
        message: snap.db === "connected" ? "Connected to Supabase DB" : "Database unavailable",
    });
});
router.get("/healthz/db", async (_req, res) => {
    try {
        await pool.query("select 1 as ok");
        res.status(200).json({ status: "ok", db: "ok" });
    }
    catch (err) {
        res.status(503).json({
            status: "degraded",
            db: "down",
            error: "DB_UNAVAILABLE",
            message: "Database connection unavailable.",
            details: String(err?.message ?? ""),
        });
    }
});
export default router;
