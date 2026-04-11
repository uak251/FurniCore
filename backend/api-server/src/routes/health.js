import { Router } from "express";
const router = Router();
/**
 * Liveness probe — no DB, no Zod (avoids any schema/runtime issues breaking probes).
 * Same JSON shape as OpenAPI `HealthCheckResponse`.
 */
router.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
});
export default router;
