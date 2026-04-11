/**
 * Minimal API stand-in for UI dev when Postgres / full API is unavailable.
 * Serves GET /api/healthz with the same JSON shape as the real API.
 *
 * Usage: pnpm run dev:api:stub
 * Default port: 3000 (override with PORT in env or root `.env`).
 */
import { readFileSync, existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");
if (existsSync(envPath)) {
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#"))
            continue;
        const i = t.indexOf("=");
        if (i <= 0)
            continue;
        const k = t.slice(0, i).trim();
        let v = t.slice(i + 1).trim();
        if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'")))
            v = v.slice(1, -1);
        if (process.env[k] === undefined)
            process.env[k] = v;
    }
}

const rawPort = process.env.PORT ?? "3000";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
    console.error(`Invalid PORT: ${rawPort}`);
    process.exit(1);
}

const server = http.createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/api/healthz" || req.url?.startsWith("/api/healthz?"))) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "stub_only_healthz" }));
});

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error(`Port ${port} is in use. Run pnpm run ports:free or set PORT=3001.`);
    }
    else {
        console.error(err);
    }
    process.exit(1);
});

server.listen(port, () => {
    console.log(`dev-api-health-stub listening on http://localhost:${port} (GET /api/healthz)`);
});
