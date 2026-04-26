import "../src/load-env.js";
import dns from "node:dns/promises";
import { spawn } from "node:child_process";

const DATABASE_URL = process.env.DATABASE_URL?.trim() || "";
const RAILWAY_PUBLIC_URL =
  process.env.RAILWAY_PUBLIC_DATABASE_URL?.trim() ||
  process.env.DATABASE_PUBLIC_URL?.trim() ||
  process.env.PUBLIC_DATABASE_URL?.trim() ||
  "";

if (!DATABASE_URL) {
  console.error("[start:win] DATABASE_URL is required.");
  process.exit(1);
}

function isIpv4(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function hostFromUrl(urlString) {
  try {
    return new URL(urlString).hostname || "";
  } catch {
    return "";
  }
}

async function resolveIpv4Host(host) {
  if (!host) throw new Error("Host is empty.");
  if (isIpv4(host)) return { host, address: host };
  const { address } = await dns.lookup(host, { family: 4 });
  return { host, address };
}

async function resolveWithFallback() {
  const primaryHost = hostFromUrl(DATABASE_URL);
  const railwayHost = hostFromUrl(RAILWAY_PUBLIC_URL);
  const candidates = [
    primaryHost,
    railwayHost,
    "metro.proxy.rlwy.net",
  ]
    .map((h) => String(h || "").trim())
    .filter(Boolean);

  const tried = [];
  for (const host of candidates) {
    try {
      const resolved = await resolveIpv4Host(host);
      return { ...resolved, tried };
    } catch (err) {
      tried.push({ host, error: err?.code || err?.message || String(err) });
    }
  }

  const fallbackAddr = process.env.PGHOSTADDR?.trim() || process.env.DB_HOSTADDR?.trim() || "";
  if (fallbackAddr) {
    return { host: "env-fallback", address: fallbackAddr, tried };
  }

  throw new Error(`Unable to resolve IPv4 host. Tried: ${JSON.stringify(tried)}`);
}

async function run() {
  try {
    const resolved = await resolveWithFallback();
    const host = resolved.host;
    const ipv4 = resolved.address;
    if (resolved.tried?.length) {
      console.warn("[start:win] Failed candidates before success:", resolved.tried);
    }

    console.log(`[start:win] Resolved ${host} -> ${ipv4}`);
    console.log(`[start:win] Launching backend with PGHOSTADDR=${ipv4}`);

    const child = spawn("pnpm", ["run", "start"], {
      stdio: "inherit",
      cwd: process.cwd(),
      shell: true,
      env: {
        ...process.env,
        PGHOSTADDR: ipv4,
      },
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`[start:win] Backend process terminated by signal: ${signal}`);
        process.exit(1);
      }
      process.exit(code ?? 0);
    });
  } catch (err) {
    console.error("[start:win] Failed to resolve IPv4 host for DATABASE_URL:", err?.message || String(err));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("[start:win] Unexpected error:", err?.message || String(err));
  process.exit(1);
});
