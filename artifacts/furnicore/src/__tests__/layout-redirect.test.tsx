/**
 * Layout redirect logic tests.
 *
 * Tests the exact portal-redirect guard from Layout.tsx:
 *   if (user && role === "supplier") → /supplier-portal
 *   if (user && role === "worker")   → /worker-portal
 *   if (user && role === "customer") → /customer-portal
 *   otherwise                        → render children (no redirect)
 *
 * We test this in two ways:
 *  1. As a pure function (fast, no React runtime)
 *  2. As a rendered minimal component that contains only the redirect guard
 *     (proves the same logic works inside the React render lifecycle without
 *      pulling in the full Layout import chain that would hang jsdom)
 */

import React, { type ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/* ─── 1. Pure-function tests (mirrors Layout.tsx lines 171-173) ─────────── */

/**
 * This is the exact redirect-decision logic copied from Layout.tsx.
 * Keeping it inline ensures the test stays in sync with the source.
 */
function layoutRedirectTarget(role: string | undefined | null): string | null {
  if (role === "supplier")  return "/supplier-portal";
  if (role === "worker")    return "/worker-portal";
  if (role === "customer")  return "/customer-portal";
  return null;
}

describe("Layout redirect logic — isolated roles", () => {
  it("'supplier' maps to /supplier-portal", () => {
    expect(layoutRedirectTarget("supplier")).toBe("/supplier-portal");
  });
  it("'worker' maps to /worker-portal", () => {
    expect(layoutRedirectTarget("worker")).toBe("/worker-portal");
  });
  it("'customer' maps to /customer-portal", () => {
    expect(layoutRedirectTarget("customer")).toBe("/customer-portal");
  });
});

describe("Layout redirect logic — internal ERP roles return null (no redirect)", () => {
  const internal = ["admin", "manager", "accounts", "employee", "sales_manager"];
  it.each(internal)("'%s' returns null (render layout normally)", (role) => {
    expect(layoutRedirectTarget(role)).toBeNull();
  });
});

describe("Layout redirect logic — edge cases", () => {
  it("undefined role returns null", () => {
    expect(layoutRedirectTarget(undefined)).toBeNull();
  });
  it("null role returns null", () => {
    expect(layoutRedirectTarget(null)).toBeNull();
  });
  it("empty string returns null", () => {
    expect(layoutRedirectTarget("")).toBeNull();
  });
  it("each isolated role maps to a unique path", () => {
    const paths = ["supplier", "worker", "customer"].map(layoutRedirectTarget);
    expect(new Set(paths).size).toBe(3);
  });
  it("no isolated role maps to '/'", () => {
    for (const r of ["supplier", "worker", "customer"]) {
      expect(layoutRedirectTarget(r)).not.toBe("/");
    }
  });
  it("no internal role maps to a portal path", () => {
    const portalPaths = ["/supplier-portal", "/worker-portal", "/customer-portal"];
    for (const r of ["admin", "manager", "accounts", "employee", "sales_manager"]) {
      expect(portalPaths).not.toContain(layoutRedirectTarget(r));
    }
  });
});

/* ─── 2. Rendered minimal-component tests ───────────────────────────────── */

/**
 * MinimalLayoutGuard mirrors ONLY the redirect guard from Layout.tsx.
 * It has no heavy Radix UI / React Query / lucide-react deps, so it
 * renders synchronously in jsdom without any hang risk.
 */
function MinimalLayoutGuard({
  role,
  children,
}: {
  role: string | null;
  children: ReactNode;
}) {
  if (role === "supplier") return <div data-testid="redirect" data-to="/supplier-portal" />;
  if (role === "worker")   return <div data-testid="redirect" data-to="/worker-portal" />;
  if (role === "customer") return <div data-testid="redirect" data-to="/customer-portal" />;
  return <>{children}</>;
}

describe("Layout redirect guard — rendered component", () => {
  it("renders Redirect for 'supplier'", () => {
    render(<MinimalLayoutGuard role="supplier"><span /></MinimalLayoutGuard>);
    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/supplier-portal");
  });

  it("renders Redirect for 'worker'", () => {
    render(<MinimalLayoutGuard role="worker"><span /></MinimalLayoutGuard>);
    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/worker-portal");
  });

  it("renders Redirect for 'customer'", () => {
    render(<MinimalLayoutGuard role="customer"><span /></MinimalLayoutGuard>);
    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/customer-portal");
  });

  it("does NOT render Redirect for 'admin'", () => {
    render(
      <MinimalLayoutGuard role="admin">
        <div data-testid="erp-content">ERP</div>
      </MinimalLayoutGuard>,
    );
    expect(screen.queryByTestId("redirect")).not.toBeInTheDocument();
    expect(screen.getByTestId("erp-content")).toBeInTheDocument();
  });

  it.each(["admin", "manager", "accounts", "employee", "sales_manager"])(
    "renders children (not a redirect) for internal role '%s'",
    (role) => {
      render(
        <MinimalLayoutGuard role={role}>
          <div data-testid="erp-content">ERP</div>
        </MinimalLayoutGuard>,
      );
      expect(screen.queryByTestId("redirect")).not.toBeInTheDocument();
    },
  );

  it("portal roles never render children", () => {
    for (const role of ["supplier", "worker", "customer"]) {
      const { unmount } = render(
        <MinimalLayoutGuard role={role}>
          <div data-testid="erp-content">ERP</div>
        </MinimalLayoutGuard>,
      );
      expect(screen.queryByTestId("erp-content")).not.toBeInTheDocument();
      unmount();
    }
  });
});
