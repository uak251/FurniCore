/**
 * PostgreSQL pool + Drizzle client. Tables live in `./schema.js`.
 * Set `DATABASE_URL` in the environment (repo root `.env` for the API).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

export * from "./schema.js";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://furnicore:furnicore_dev@127.0.0.1:5432/furnicore";

/** Hosted DBs use TLS; strict verify often fails behind corporate proxies or odd CA chains. Opt into strict verify with DATABASE_SSL_REJECT_UNAUTHORIZED=true. */
const needsSsl = /supabase\.co|neon\.tech|sslmode=require/i.test(connectionString);
const ssl = needsSsl
  ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" }
  : undefined;

export const pool = new pg.Pool({
  connectionString,
  ...(ssl ? { ssl } : {}),
});

export const db = drizzle(pool);
