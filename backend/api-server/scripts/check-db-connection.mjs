import "../src/load-env.js";
import dns from "node:dns/promises";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL?.trim() || "";
const publicConnectionCandidates = [
  process.env.RAILWAY_PUBLIC_DATABASE_URL?.trim() || "",
  process.env.DATABASE_PUBLIC_URL?.trim() || "",
  process.env.PUBLIC_DATABASE_URL?.trim() || "",
].filter(Boolean);

if (!connectionString) {
  console.error("[db-check] DATABASE_URL is required.");
  process.exit(1);
}

function isNetworkAddressError(err) {
  const code = String(err?.code || "");
  const msg = String(err?.message || "");
  return (
    ["ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED", "ENOTFOUND"].includes(code) ||
    /ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ECONNREFUSED|ENOTFOUND/i.test(msg)
  );
}

function withHostAddr(urlString, ipv4) {
  const url = new URL(urlString);
  url.searchParams.set("hostaddr", ipv4);
  return url.toString();
}

async function lookupIpv4Host(urlString) {
  try {
    const url = new URL(urlString);
    const host = url.hostname;
    if (!host) return null;
    const result = await dns.lookup(host, { family: 4 });
    return result?.address || null;
  } catch {
    return null;
  }
}

async function queryOnce(urlString) {
  const client = new Client({ connectionString: urlString });
  try {
    await client.connect();
    await client.query("select 1 as ok");
  } finally {
    await client.end().catch(() => {});
  }
}

async function tryPublicFallbackUrls(firstErr) {
  for (const candidate of publicConnectionCandidates) {
    try {
      await queryOnce(candidate);
      console.log("[db-check] Database connection OK via public fallback URL.");
      return true;
    } catch {
      // continue
    }
  }
  console.error("[db-check] Public URL fallbacks failed:", firstErr?.message || String(firstErr));
  return false;
}

try {
  await queryOnce(connectionString);
  console.log("[db-check] Database connection OK.");
} catch (firstErr) {
  if (!isNetworkAddressError(firstErr)) {
    console.error("[db-check] Database connection failed:", firstErr?.message || String(firstErr));
    process.exit(1);
  }

  const lookupIpv4 = await lookupIpv4Host(connectionString);
  const ipv4Candidates = Array.from(
    new Set(
      [process.env.PGHOSTADDR, process.env.DB_HOSTADDR, lookupIpv4]
        .map((v) => String(v || "").trim())
        .filter(Boolean),
    ),
  );

  for (const ipv4 of ipv4Candidates) {
    const retryConn = withHostAddr(connectionString, ipv4);
    try {
      await queryOnce(retryConn);
      console.log(`[db-check] Database connection OK (IPv4 fallback via hostaddr=${ipv4}).`);
      process.exit(0);
    } catch {
      // keep trying candidate hostaddrs
    }
  }

  const publicFallbackOk = await tryPublicFallbackUrls(firstErr);
  if (publicFallbackOk) {
    process.exit(0);
  }

  console.error(
    "[db-check] Database connection failed after IPv4 fallback attempts:",
    firstErr?.message || String(firstErr),
  );
  process.exit(1);
}
