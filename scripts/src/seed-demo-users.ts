/**
 * Seed demo users (one per portal / role) for FurniCore QA and demos.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-demo-users
 *
 * Environment (optional, defaults shown):
 *   DEMO_USER_PASSWORD  — shared password for all seeded demo accounts (default: Demo@123456)
 *
 * Idempotent: upserts by email (updates name, role, password hash, verified flag).
 *
 * DATABASE_URL is loaded from ../.env (see scripts/package.json).
 */

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";

const DEMO_USER_PASSWORD = process.env["DEMO_USER_PASSWORD"] ?? "Demo@123456";

const USERS: { name: string; email: string; role: string }[] = [
  { name: "Victoria Chen",    email: "victoria.chen@furnicore.demo",    role: "admin" },
  { name: "Marcus Webb",      email: "marcus.webb@furnicore.demo",      role: "manager" },
  { name: "Nina Okonkwo",     email: "nina.okonkwo@furnicore.demo",     role: "inventory_manager" },
  { name: "Diego Alvarez",    email: "diego.alvarez@furnicore.demo",    role: "supplier" },
  { name: "Amira Hassan",     email: "amira.hassan@furnicore.demo",     role: "accountant" },
  { name: "Jordan Ellis",     email: "jordan.ellis@furnicore.demo",     role: "manager" },
  { name: "Sam Rivera",       email: "sam.rivera@furnicore.demo",      role: "worker" },
  { name: "Priya Nair",       email: "priya.nair@furnicore.demo",       role: "sales_manager" },
  { name: "Chloe Park",       email: "chloe.park@furnicore.demo",       role: "customer" },
];

console.log("\nFurniCore — Seed demo users");
console.log(`  Accounts: ${USERS.length}`);
console.log(`  Password: ${DEMO_USER_PASSWORD} (set DEMO_USER_PASSWORD to override)\n`);

const passwordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 12);

for (const u of USERS) {
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, u.email));

  if (existing) {
    await db
      .update(usersTable)
      .set({
        name: u.name,
        role: u.role,
        passwordHash,
        isActive: true,
        isVerified: true,
      })
      .where(eq(usersTable.id, existing.id));
    console.log(`  Updated  ${u.email}  (${u.role})`);
  } else {
    await db.insert(usersTable).values({
      name: u.name,
      email: u.email,
      passwordHash,
      role: u.role,
      isActive: true,
      isVerified: true,
    });
    console.log(`  Created  ${u.email}  (${u.role})`);
  }
}

console.log("\n  Login with any email above and the demo password.\n");

await pool.end();
