/**
 * Bootstrap the first admin user.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-admin
 *
 * Environment variables (or set in .env at repo root):
 *   DATABASE_URL  — PostgreSQL connection string
 *   ADMIN_NAME    — Display name  (default: "Master Admin")
 *   ADMIN_EMAIL   — Email address (default: "admin@furnicore.com")
 *   ADMIN_PASS    — Password      (default: "Admin@123456")
 *
 * The script is idempotent: if an account with the given email already exists
 * it updates the role to "admin" and marks it as verified instead of failing.
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

// Load .env from the workspace root (two levels up from scripts/src/)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";
import { usersTable } from "@workspace/db";

const {
  DATABASE_URL,
  ADMIN_NAME  = "Master Admin",
  ADMIN_EMAIL = "admin@furnicore.com",
  ADMIN_PASS  = "Admin@123456",
} = process.env;

if (!DATABASE_URL) {
  console.error("✖  DATABASE_URL is not set. Please set it in your .env file.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
const db = drizzle(client);

console.log(`\n🔧  FurniCore — Bootstrap Admin User`);
console.log(`   Email : ${ADMIN_EMAIL}`);
console.log(`   Name  : ${ADMIN_NAME}\n`);

const [existing] = await db
  .select({ id: usersTable.id, role: usersTable.role, isVerified: usersTable.isVerified })
  .from(usersTable)
  .where(eq(usersTable.email, ADMIN_EMAIL));

if (existing) {
  if (existing.role === "admin" && existing.isVerified) {
    console.log("✔  Admin account already exists and is verified. Nothing to do.");
  } else {
    await db
      .update(usersTable)
      .set({ role: "admin", isVerified: true, isActive: true })
      .where(eq(usersTable.id, existing.id));
    console.log(`✔  Updated existing account (id=${existing.id}) → role=admin, isVerified=true`);
  }
} else {
  const passwordHash = await bcrypt.hash(ADMIN_PASS, 12);

  const [created] = await db
    .insert(usersTable)
    .values({
      name:        ADMIN_NAME,
      email:       ADMIN_EMAIL,
      passwordHash,
      role:        "admin",
      isActive:    true,
      isVerified:  true,
    })
    .returning({ id: usersTable.id });

  console.log(`✔  Admin user created (id=${created.id})`);
}

console.log(`\n   You can now log in at your FurniCore instance:`);
console.log(`     Email    : ${ADMIN_EMAIL}`);
console.log(`     Password : ${ADMIN_PASS}`);
console.log(`\n   ⚠  Change the password immediately after first login!\n`);

await client.end();
