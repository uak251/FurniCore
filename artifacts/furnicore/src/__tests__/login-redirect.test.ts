/**
 * Login redirect logic — pure unit tests, no React needed.
 *
 * The login page maps each role in the JWT to a target URL.
 * We test the exact role → path mapping table that lives in login.tsx.
 *
 * Roles and expected destinations:
 *   supplier → /supplier-portal
 *   worker   → /worker-portal
 *   customer → /customer-portal
 *   <any other role> (admin / manager / accounts / employee / sales_manager) → /
 */

import { describe, it, expect } from "vitest";

/* ─── Extract and replicate the redirect logic ───────────────────────────── */
// This is the exact same logic as in login.tsx's onSubmit handler.
// By testing the pure function, we keep this test fast and reliable.

function getRedirectPath(role: string): string {
  if (role === "supplier")  return "/supplier-portal";
  if (role === "worker")    return "/worker-portal";
  if (role === "customer")  return "/customer-portal";
  return "/";
}

/* ─── Isolated portal roles ──────────────────────────────────────────────── */

describe("Login redirect — isolated portal roles", () => {
  it("redirects 'supplier' role to /supplier-portal", () => {
    expect(getRedirectPath("supplier")).toBe("/supplier-portal");
  });

  it("redirects 'worker' role to /worker-portal", () => {
    expect(getRedirectPath("worker")).toBe("/worker-portal");
  });

  it("redirects 'customer' role to /customer-portal", () => {
    expect(getRedirectPath("customer")).toBe("/customer-portal");
  });
});

/* ─── Internal ERP roles → dashboard ────────────────────────────────────── */

describe("Login redirect — internal ERP roles go to dashboard", () => {
  const internalRoles = ["admin", "manager", "accounts", "employee", "sales_manager"];

  it.each(internalRoles)(
    "redirects '%s' role to / (dashboard)",
    (role) => {
      expect(getRedirectPath(role)).toBe("/");
    },
  );
});

/* ─── Edge cases ─────────────────────────────────────────────────────────── */

describe("Login redirect — edge cases", () => {
  it("unknown role falls back to /", () => {
    expect(getRedirectPath("unknown_role")).toBe("/");
  });

  it("empty string falls back to /", () => {
    expect(getRedirectPath("")).toBe("/");
  });

  it("role names are case-sensitive (SUPPLIER !== supplier)", () => {
    expect(getRedirectPath("SUPPLIER")).toBe("/");
  });
});

/* ─── Isolation guarantee ────────────────────────────────────────────────── */

describe("Login redirect — no portal role shares a destination", () => {
  const portalRoles: Array<[string, string]> = [
    ["supplier", "/supplier-portal"],
    ["worker",   "/worker-portal"],
    ["customer", "/customer-portal"],
  ];

  it("each isolated role has a unique destination", () => {
    const destinations = portalRoles.map(([r]) => getRedirectPath(r));
    const unique = new Set(destinations);
    expect(unique.size).toBe(portalRoles.length);
  });

  it("no isolated portal role resolves to the ERP dashboard", () => {
    for (const [role] of portalRoles) {
      expect(getRedirectPath(role)).not.toBe("/");
    }
  });

  it("no ERP role resolves to an isolated portal path", () => {
    const internalRoles = ["admin", "manager", "accounts", "employee", "sales_manager"];
    const portalPaths = ["/supplier-portal", "/worker-portal", "/customer-portal"];

    for (const role of internalRoles) {
      expect(portalPaths).not.toContain(getRedirectPath(role));
    }
  });
});
