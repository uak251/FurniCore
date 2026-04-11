/**
 * One-time local env bootstrap: copy *.env.example → .env when missing.
 * Run from repo root: pnpm run setup:env
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function ensureCopy(relExample, relTarget) {
    const from = path.join(root, relExample);
    const to = path.join(root, relTarget);
    if (!existsSync(from)) {
        console.warn(`skip (missing template): ${relExample}`);
        return;
    }
    if (existsSync(to)) {
        console.log(`exists: ${relTarget}`);
        return;
    }
    copyFileSync(from, to);
    console.log(`created: ${relTarget}  ←  ${relExample}`);
}

ensureCopy(".env.example", ".env");
ensureCopy("frontend/furnicore/.env.example", "frontend/furnicore/.env");

console.log("\nNext: run `pnpm run db:up` then ensure root `.env` has DATABASE_URL matching docker-compose (see .env.example).");
