const REQUIRED_VARS = ["VITE_API_URL"];

function fail(message) {
  console.error(`[deploy-env] ${message}`);
  process.exit(1);
}

function normalizeBaseUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(/\/+$/, "");
}

async function canReach(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

for (const key of REQUIRED_VARS) {
  if (!process.env[key]?.trim()) {
    fail(`Missing required environment variable: ${key}`);
  }
}

const apiBase = normalizeBaseUrl(process.env.VITE_API_URL);
let parsed;
try {
  parsed = new URL(apiBase);
} catch {
  fail(`VITE_API_URL must be a valid absolute URL. Received: ${process.env.VITE_API_URL}`);
}

if (!["http:", "https:"].includes(parsed.protocol)) {
  fail(`VITE_API_URL must use http or https. Received protocol: ${parsed.protocol}`);
}

if (!process.env.NODE_ENV?.trim()) {
  console.warn("[deploy-env] NODE_ENV is not set. Recommended: NODE_ENV=production for CI/deploy.");
}

if (process.env.SKIP_API_REACHABILITY === "1") {
  console.log("[deploy-env] Skipping API reachability check (SKIP_API_REACHABILITY=1).");
  process.exit(0);
}

const probes = [`${apiBase}/api/healthz`, `${apiBase}/healthz`];
for (const probe of probes) {
  if (await canReach(probe)) {
    console.log(`[deploy-env] API reachability OK: ${probe}`);
    process.exit(0);
  }
}

fail(`Backend API is unreachable. Checked: ${probes.join(", ")}`);
