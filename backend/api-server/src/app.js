import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { mkdirSync } from "fs";
import router from "./routes";
import analyticsRoutes from "./routes/analytics.routes";
import { logger } from "./lib/logger";
import { UPLOADS_ROOT } from "./uploadsRoot.js";
import { validateEnvMiddleware } from "./middlewares/validate-env";
mkdirSync(UPLOADS_ROOT, { recursive: true });
const app = express();
// Behind Railway / reverse proxies — correct client IPs for logging and future cookie features
app.set("trust proxy", 1);
const healthState = {
    db: "degraded",
    lastCheckedAt: null,
};
let healthProbeInFlight = false;
let lastDbHealthLogState = "unknown";
let dbHealthFailureStreak = 0;
/** Must be >= pool `connectionTimeoutMillis` (see @workspace/db) so cold Supabase / Docker DNS does not false-fail. */
function getDbHealthProbeTimeoutMs() {
    const raw = Number(process.env.DB_HEALTH_PROBE_TIMEOUT_MS);
    if (Number.isFinite(raw) && raw >= 1000)
        return Math.min(raw, 60_000);
    return 15_000;
}
async function refreshDbHealthState() {
    if (healthProbeInFlight)
        return;
    healthProbeInFlight = true;
    const probeMs = getDbHealthProbeTimeoutMs();
    try {
        const { pool } = await import("@workspace/db");
        await Promise.race([
            pool.query("select 1"),
            new Promise((_, reject) => setTimeout(() => reject(new Error("db_health_timeout")), probeMs)),
        ]);
        dbHealthFailureStreak = 0;
        healthState.db = "connected";
    }
    catch (err) {
        dbHealthFailureStreak += 1;
        // Avoid flapping to degraded on a single transient timeout.
        healthState.db = dbHealthFailureStreak >= 2 ? "degraded" : healthState.db;
        logger.error({
            errMessage: err?.message || String(err),
            errStack: err?.stack || null,
        }, "db_health_probe_failed");
    }
    finally {
        if (healthState.db !== lastDbHealthLogState) {
            logger.info({ dbState: healthState.db }, "db_health_state_changed");
            lastDbHealthLogState = healthState.db;
        }
        healthState.lastCheckedAt = new Date().toISOString();
        healthProbeInFlight = false;
    }
}
void refreshDbHealthState();
const healthProbeInterval = setInterval(() => {
    void refreshDbHealthState();
}, 10_000);
healthProbeInterval.unref?.();
// Keep healthcheck first and unconditional so Railway can always probe service liveness.
app.get("/api/healthz", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.status(200).json({
        status: healthState.db === "connected" ? "ok" : "degraded",
        uptime: process.uptime(),
        db: healthState.db,
        timestamp: new Date().toISOString(),
    });
});
app.use(pinoHttp({
    logger,
    serializers: {
        req(req) {
            return {
                id: req.id,
                method: req.method,
                url: req.url?.split("?")[0],
            };
        },
        res(res) {
            return {
                statusCode: res.statusCode,
            };
        },
    },
}));
function normalizeOrigin(origin) {
    return String(origin ?? "").trim().replace(/\/+$/, "");
}
const configuredCorsOrigins = String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((v) => normalizeOrigin(v))
    .filter(Boolean);
const explicitOrigins = Array.from(new Set([
    ...configuredCorsOrigins,
    normalizeOrigin(process.env.APP_URL),
    normalizeOrigin(process.env.FRONTEND_URL),
    "https://furnicore-frontend.up.railway.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
].filter(Boolean)));
const corsOptions = {
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    origin(origin, callback) {
        if (!origin) {
            callback(null, true);
            return;
        }
        const normalized = normalizeOrigin(origin);
        if (explicitOrigins.includes(normalized)) {
            callback(null, true);
            return;
        }
        // Do not pass an Error here — `cors` forwards that to `next(err)` and Express
        // turns it into a misleading 500 + SERVER_ERROR while the browser reports CORS.
        callback(null, false);
    },
};
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(validateEnvMiddleware);
app.use((req, res, next) => {
    if (req.path === "/api/healthz" || req.path === "/api/healthz/db") {
        next();
        return;
    }
    // Keep authentication write paths safe, but do not block /auth/me on transient probes.
    const isAuthWritePath = req.path.startsWith("/api/auth")
        && req.path !== "/api/auth/me"
        && req.method !== "GET";
    if (isAuthWritePath && healthState.db !== "connected") {
        res.status(503).json({
            error: "DB_UNAVAILABLE",
            message: "Database connection is not ready. Please try again shortly.",
        });
        return;
    }
    next();
});
// Serve uploaded images as static assets at /uploads/*
app.use("/uploads", express.static(UPLOADS_ROOT, { maxAge: "1d", etag: true }));
// Mount analytics routes first to avoid dynamic /api/:id route interception.
app.use("/api/analytics", analyticsRoutes);
app.use("/api", router);
app.use("/api", (_req, res) => {
    res.status(404).json({
        success: false,
        error: "ROUTE_NOT_FOUND",
        message: "API route not found.",
    });
});
/**
 * Global JSON error handler — registered LAST so it catches every unhandled
 * throw from any route. Without this, Express returns an HTML error page
 * which causes the frontend's res.json() to throw a parse error, swallowing
 * the real server message and showing "Something went wrong" instead.
 */
app.use((err, _req, res, _next) => {
    logger.error({
        errMessage: err?.message || String(err),
        errStack: err?.stack || null,
        errCode: err?.code || null,
    }, "unhandled_request_error");
    const status = typeof err === "object" && err !== null && "status" in err
        ? Number(err.status)
        : 500;
    const isServerError = !(status >= 100 && status < 500);
    const message = isServerError
        ? "An unexpected server error occurred. Please try again."
        : (typeof err === "object" && err !== null && "message" in err
            ? String(err.message)
            : "Request failed.");
    res
        .status(status >= 100 && status < 600 ? status : 500)
        .json({
        success: false,
        error: "SERVER_ERROR",
        message,
    });
});
export default app;
