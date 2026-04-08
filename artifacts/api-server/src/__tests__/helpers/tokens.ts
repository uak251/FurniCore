/**
 * JWT token factory for tests.
 * Uses the same secret as the server's default (when SESSION_SECRET is not set).
 */

import jwt from "jsonwebtoken";

/** Must match src/lib/auth.ts ACCESS_SECRET fallback */
const ACCESS_SECRET = "furnicore_access_secret_2024";

export const ALL_ROLES = [
  "admin",
  "manager",
  "accountant",
  "accounts",
  "employee",
  "supplier",
  "worker",
  "customer",
  "sales_manager",
  "inventory_manager",
] as const;

export type Role = (typeof ALL_ROLES)[number];

/** All roles except those in the exclusion list */
export function rolesExcept(...exclude: Role[]): Role[] {
  return ALL_ROLES.filter((r) => !exclude.includes(r));
}

/**
 * Generate a signed JWT for the given role.
 * @param role   - user role
 * @param userId - numeric user id (default 1)
 * @param email  - user email (default `{role}@test.com`)
 */
export function makeToken(
  role: Role,
  userId = 1,
  email = `${role}@test.com`,
): string {
  return jwt.sign({ id: userId, email, role }, ACCESS_SECRET, {
    expiresIn: "1h",
  });
}

/** Pre-built token for each role (userId=1 for each) */
export const tokens: Record<Role, string> = Object.fromEntries(
  ALL_ROLES.map((r) => [r, makeToken(r)]),
) as Record<Role, string>;
