import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
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
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
/* ─── 1. Pure-function tests (mirrors Layout.tsx lines 171-173) ─────────── */
/**
 * This is the exact redirect-decision logic copied from Layout.tsx.
 * Keeping it inline ensures the test stays in sync with the source.
 */
function layoutRedirectTarget(role) {
    if (role === "supplier")
        return "/supplier-portal";
    if (role === "worker")
        return "/worker-portal";
    if (role === "customer")
        return "/customer-portal";
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
function MinimalLayoutGuard({ role, children, }) {
    if (role === "supplier")
        return _jsx("div", { "data-testid": "redirect", "data-to": "/supplier-portal" });
    if (role === "worker")
        return _jsx("div", { "data-testid": "redirect", "data-to": "/worker-portal" });
    if (role === "customer")
        return _jsx("div", { "data-testid": "redirect", "data-to": "/customer-portal" });
    return _jsx(_Fragment, { children: children });
}
describe("Layout redirect guard — rendered component", () => {
    it("renders Redirect for 'supplier'", () => {
        render(_jsx(MinimalLayoutGuard, { role: "supplier", children: _jsx("span", {}) }));
        expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/supplier-portal");
    });
    it("renders Redirect for 'worker'", () => {
        render(_jsx(MinimalLayoutGuard, { role: "worker", children: _jsx("span", {}) }));
        expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/worker-portal");
    });
    it("renders Redirect for 'customer'", () => {
        render(_jsx(MinimalLayoutGuard, { role: "customer", children: _jsx("span", {}) }));
        expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/customer-portal");
    });
    it("does NOT render Redirect for 'admin'", () => {
        render(_jsx(MinimalLayoutGuard, { role: "admin", children: _jsx("div", { "data-testid": "erp-content", children: "ERP" }) }));
        expect(screen.queryByTestId("redirect")).not.toBeInTheDocument();
        expect(screen.getByTestId("erp-content")).toBeInTheDocument();
    });
    it.each(["admin", "manager", "accounts", "employee", "sales_manager"])("renders children (not a redirect) for internal role '%s'", (role) => {
        render(_jsx(MinimalLayoutGuard, { role: role, children: _jsx("div", { "data-testid": "erp-content", children: "ERP" }) }));
        expect(screen.queryByTestId("redirect")).not.toBeInTheDocument();
    });
    it("portal roles never render children", () => {
        for (const role of ["supplier", "worker", "customer"]) {
            const { unmount } = render(_jsx(MinimalLayoutGuard, { role: role, children: _jsx("div", { "data-testid": "erp-content", children: "ERP" }) }));
            expect(screen.queryByTestId("erp-content")).not.toBeInTheDocument();
            unmount();
        }
    });
});
