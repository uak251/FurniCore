import "dotenv/config";
import "./load-env";
import { createServer, request as httpRequest } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { initSocket } from "./lib/socket";
import { loadSessionPolicy } from "./lib/sessionPolicy.js";

process.on("unhandledRejection", (reason) => {
    logger.error({
        errMessage: reason instanceof Error ? reason.message : String(reason),
        errStack: reason instanceof Error ? reason.stack : null,
    }, "unhandled_rejection");
});
process.on("uncaughtException", (err) => {
    logger.error({
        errMessage: err?.message || String(err),
        errStack: err?.stack || null,
    }, "uncaught_exception");
});

try {
    await loadSessionPolicy();
} catch (err) {
    logger.error({ err: err?.message || err }, "session_policy_load_failed_starting_degraded");
}

function collectRoutes(expressApp) {
    const routes = [];
    const stack = expressApp?._router?.stack || expressApp?.router?.stack || [];
    for (const layer of stack) {
        if (layer?.route?.path && layer.route.methods) {
            const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
            for (const method of methods)
                routes.push(`${method} ${layer.route.path}`);
            continue;
        }
        if (!layer?.handle?.stack)
            continue;
        for (const child of layer.handle.stack) {
            if (!child?.route?.path || !child.route.methods)
                continue;
            const methods = Object.keys(child.route.methods).map((m) => m.toUpperCase());
            for (const method of methods)
                routes.push(`${method} ${child.route.path}`);
        }
    }
    return routes;
}

const port = Number(process.env.PORT || 3000);

function probeExistingApi(p) {
    return new Promise((resolve) => {
        const req = httpRequest({
            host: "127.0.0.1",
            port: p,
            path: "/api/healthz",
            method: "GET",
            timeout: 1200,
        }, (res) => {
            const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 500;
            res.resume();
            resolve(Boolean(ok));
        });
        req.on("timeout", () => {
            req.destroy();
            resolve(false);
        });
        req.on("error", () => resolve(false));
        req.end();
    });
}

function startOnPort(p) {
    const httpServer = createServer(app);
    initSocket(httpServer);
    return new Promise((resolve, reject) => {
        httpServer.once("error", (err) => reject(err));
        httpServer.listen(p, "0.0.0.0", () => resolve({ httpServer, port: p }));
    });
}

async function startWithPortStrategy(initialPort) {
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i += 1) {
        const p = initialPort + i;
        try {
            const result = await startOnPort(p);
            try {
                const { refreshAnalyticsRbacOverridesFromDb } = await import("./middlewares/analytics-access.js");
                await refreshAnalyticsRbacOverridesFromDb();
            }
            catch (e) {
                logger.warn({ err: String(e) }, "analytics_rbac_overrides_boot_failed");
            }
            const routes = collectRoutes(app);
            logger.info({ port: result.port, routeCount: routes.length }, "Server listening");
            logger.info({ routes }, "registered_routes");
            return;
        }
        catch (err) {
            if (err && err.code === "EADDRINUSE") {
                const looksLikeOurApi = await probeExistingApi(p);
                if (looksLikeOurApi) {
                    logger.info({ port: p }, "API already running; skipping duplicate start");
                    process.exit(0);
                }
                if (i < maxAttempts - 1) {
                    logger.warn({ port: p }, "port_in_use_trying_next");
                    continue;
                }
                logger.error({ port: p, err }, `Port ${p} is already in use. No free port found in range ${initialPort}-${initialPort + maxAttempts - 1}.`);
                process.exit(1);
            }
            logger.error({ err }, "http_server_error");
            process.exit(1);
        }
    }
}

void startWithPortStrategy(port);
