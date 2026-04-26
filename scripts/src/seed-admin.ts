/**
 * Bootstrap the first admin user.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-admin
 *
 * Override defaults with environment variables in .env:
 *   ADMIN_NAME    — Display name  (default: "Master Admin")
 *   ADMIN_EMAIL   — Email address (default: "admin@furnicore.com")
 *   ADMIN_PASS    — Password      (default: "Admin@123456")
 *
 * Idempotent: re-run anytime. If the email already exists, the password is
 * reset to ADMIN_PASS and the account is forced to admin + verified + active.
 *
 * DATABASE_URL is loaded from ../.env via `tsx --env-file=../.env` before
 * any module code runs (see scripts/package.json seed-admin script).
 */

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

if (process.env.DATABASE_PUBLIC_URL?.trim()) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL.trim();
}

const { db, pool, usersTable } = await import("@workspace/db");

const {
  ADMIN_NAME  = "Master Admin",
  ADMIN_EMAIL = "admin@furnicore.com",
  ADMIN_PASS  = "Admin@123456",
} = process.env;

const emailNorm = ADMIN_EMAIL.trim().toLowerCase();

console.log(`\nFurniCore — Bootstrap Admin User`);
console.log(`  Email : ${emailNorm}`);
console.log(`  Name  : ${ADMIN_NAME}\n`);
const [existing] = await db
  .select({ id: usersTable.id })
  .from(usersTable)
  .where(eq(usersTable.email, emailNorm));

const passwordHash = await bcrypt.hash(ADMIN_PASS, 12);

if (existing) {
  await db
    .update(usersTable)
    .set({
      name: ADMIN_NAME,
      passwordHash,
      role: "admin",
      isActive: true,
      isVerified: true,
    })
    .where(eq(usersTable.id, existing.id));
  console.log(`  Admin user updated (id=${existing.id}) — password reset to ADMIN_PASS, role=admin, verified`);
} else {
  const [created] = await db
    .insert(usersTable)
    .values({
      name: ADMIN_NAME,
      email: emailNorm,
      passwordHash,
      role: "admin",
      isActive: true,
      isVerified: true,
    })
    .returning({ id: usersTable.id });

  console.log(`  Admin user created (id=${created.id})`);
}

console.log(`\n  You can now log in:`);
console.log(`    Email    : ${emailNorm}`);
console.log(`    Password : ${ADMIN_PASS}`);
console.log(`\n  Change the password immediately after first login!\n`);

await pool.end();
