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
 * Idempotent: if the email already exists the script upgrades it to admin
 * and marks it as verified instead of failing.
 *
 * DATABASE_URL is loaded from ../.env via `tsx --env-file=../.env` before
 * any module code runs (see scripts/package.json seed-admin script).
 */

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";

const {
  ADMIN_NAME  = "Master Admin",
  ADMIN_EMAIL = "admin@furnicore.com",
  ADMIN_PASS  = "Admin@123456",
} = process.env;

console.log(`\nFurniCore — Bootstrap Admin User`);
console.log(`  Email : ${ADMIN_EMAIL}`);
console.log(`  Name  : ${ADMIN_NAME}\n`);

const [existing] = await db
  .select({ id: usersTable.id, role: usersTable.role, isVerified: usersTable.isVerified })
  .from(usersTable)
  .where(eq(usersTable.email, ADMIN_EMAIL));

if (existing) {
  if (existing.role === "admin" && existing.isVerified) {
    console.log("  Admin account already exists and is verified — nothing to do.");
  } else {
    await db
      .update(usersTable)
      .set({ role: "admin", isVerified: true, isActive: true })
      .where(eq(usersTable.id, existing.id));
    console.log(`  Updated existing account (id=${existing.id}) -> role=admin, isVerified=true`);
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

  console.log(`  Admin user created (id=${created.id})`);
}

console.log(`\n  You can now log in:`);
console.log(`    Email    : ${ADMIN_EMAIL}`);
console.log(`    Password : ${ADMIN_PASS}`);
console.log(`\n  Change the password immediately after first login!\n`);

await pool.end();
