/**
 * Quick checks for full-stack integration (Vercel UI + Railway API).
 * Usage (from frontend/furnicore):
 *   pnpm run integration:status
 *   pnpm run integration:status -- https://your-api.up.railway.app
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiFromArg = process.argv[2];

function vercelEnvList() {
    const r = spawnSync("vercel", ["env", "ls"], { cwd: root, encoding: "utf-8" });
    return `${r.stdout ?? ""}${r.stderr ?? ""}`;
}

console.log("=== FurniCore — integration check ===\n");

const envOut = vercelEnvList();
const hasViteApi = /VITE_API_URL/i.test(envOut) && !/No Environment Variables found/i.test(envOut);
if (hasViteApi) {
    console.log("[Vercel] VITE_API_URL: present (see `vercel env ls` for values).");
}
else {
    console.log("[Vercel] MISSING: VITE_API_URL (Production) — SPA cannot reach Railway API.");
    console.log("         Fix: pnpm run deploy:vercel -- https://<your-railway-api>.up.railway.app");
}

if (apiFromArg?.startsWith("https://")) {
    const health = `${apiFromArg.replace(/\/+$/, "")}/api/healthz`;
    console.log(`\n[Railway API] GET ${health}`);
    try {
        const res = await fetch(health, { signal: AbortSignal.timeout(15_000) });
        const text = await res.text();
        console.log(`         Status: ${res.status} ${res.ok ? "OK" : ""}`);
        console.log(`         Body: ${text.slice(0, 200)}`);
    }
    catch (e) {
        console.log(`         Error: ${e?.message ?? e}`);
    }
}
else {
    console.log("\n[Railway API] Optional: pass API base URL to test health, e.g.");
    console.log("         pnpm run integration:status -- https://your-api.up.railway.app");
}

console.log("\n[Railway dashboard] API service should have:");
console.log("  - DATABASE_URL (internal Postgres)");
console.log("  - SESSION_SECRET, EMAIL_VERIFY_SECRET");
console.log("  - APP_URL = your Vercel production URL (for email links)");
console.log("\n[Railway CLI] Run `railway login` once on this PC if `railway whoami` fails.");
console.log("Deployment IDs (e.g. f688f153-...) are in Railway → Deployment → copy from URL or details.");
