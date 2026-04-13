/**
 * One-shot production deploy: saves VITE_API_URL on Vercel (Production) and deploys.
 * Usage (from frontend/furnicore):
 *   pnpm run deploy:vercel -- https://your-api.up.railway.app
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = process.argv[2];
if (!raw || !/^https:\/\/.+/i.test(raw.trim())) {
    console.error("Usage: pnpm run deploy:vercel -- https://<your-railway-service>.up.railway.app");
    process.exit(1);
}
const apiOrigin = raw.trim().replace(/\/+$/, "");

function run(cmd, args) {
    const r = spawnSync(cmd, args, {
        cwd: root,
        stdio: "inherit",
        shell: true,
    });
    if (r.status !== 0)
        process.exit(r.status ?? 1);
}

run("vercel", ["env", "add", "VITE_API_URL", "production", "--value", apiOrigin, "--yes", "--force"]);
run("vercel", ["deploy", "--prod", "-b", `VITE_API_URL=${apiOrigin}`, "--yes"]);
