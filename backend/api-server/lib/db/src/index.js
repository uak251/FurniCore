import fs from "node:fs";
import path from "node:path";
import dns from "node:dns";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

export * from "./schema.js";

if (!process.env.DATABASE_URL) {
  for (const candidate of [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", ".env"),
    path.join(process.cwd(), "..", "..", ".env"),
  ]) {
    if (!fs.existsSync(candidate)) continue;
    const content = fs.readFileSync(candidate, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    if (process.env.DATABASE_URL) break;
  }
}

const connectionString = String(process.env.DATABASE_URL || "").trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required. Configure Supabase PostgreSQL URL in environment variables.");
}

const ssl = {
  rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true",
};

function lookupIpv4First(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, { ...(options || {}), family: 4, all: false }, (err, address, family) => {
    if (!err) {
      callback(null, address, family);
      return;
    }
    dns.lookup(hostname, options || {}, callback);
  });
}

export const pool = new pg.Pool({
  connectionString,
  ssl,
  lookup: lookupIpv4First,
  connectionTimeoutMillis: 8000,
});

pool
  .query("select 1")
  .then(() => {
    console.log("Connected to Supabase DB");
  })
  .catch((err) => {
    console.error("Supabase DB connection failed:", err?.message || err);
  });

export const db = drizzle(pool);
