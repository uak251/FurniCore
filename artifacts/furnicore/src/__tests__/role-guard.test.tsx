/**
 * RoleGuard component tests.
 *
 * Verifies:
 *   1. Shows spinner while user data is loading
 *   2. Renders "Access restricted" when role is not in allowedRoles
 *   3. Renders children when role IS in allowedRoles
 *   4. Renders "Access restricted" when user is null (unauthenticated)
 *   5. Handles multiple allowed roles correctly
 */

import { vi } from "vitest";

/* ── Mock wouter (no real router needed in unit tests) ── */
vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/", vi.fn()],
}));

/* ── Mock @workspace/api-client-react — controls useGetCurrentUser() ── */
const mockUseGetCurrentUser = vi.fn();
vi.mock("@workspace/api-client-react", () => ({
  useGetCurrentUser: () => mockUseGetCurrentUser(),
}));

import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleGuard } from "@/components/RoleGuard";

/* ─── helpers ──────────────────────────────────────────────────────────── */

function renderGuard(allowedRoles: string[], userRole?: string, isLoading = false) {
  if (isLoading) {
    mockUseGetCurrentUser.mockReturnValue({ data: undefined, isLoading: true });
  } else {
    mockUseGetCurrentUser.mockReturnValue({
      data: userRole ? { id: 1, name: "Test User", email: "t@t.com", role: userRole } : null,
      isLoading: false,
    });
  }
  return render(
    <RoleGuard allowedRoles={allowedRoles}>
      <div data-testid="protected-content">Secret content</div>
    </RoleGuard>,
  );
}

beforeEach(() => vi.clearAllMocks());

/* ─── Loading state ─────────────────────────────────────────────────────── */

describe("RoleGuard — loading state", () => {
  it("shows a spinner (aria-label 'Loading…') while fetching user", () => {
    renderGuard(["admin"], undefined, true);
    expect(screen.getByLabelText("Loading…")).toBeInTheDocument();
  });

  it("does not render protected content while loading", () => {
    renderGuard(["admin"], undefined, true);
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });
});

/* ─── Role not in allowed list ──────────────────────────────────────────── */

describe("RoleGuard — role denied", () => {
  it("shows 'Access restricted' for a completely wrong role", () => {
    renderGuard(["admin"], "supplier");
    expect(screen.getByText(/access restricted/i)).toBeInTheDocument();
  });

  it("shows the user's current role in the denial message", () => {
    renderGuard(["admin", "manager"], "customer");
    expect(screen.getByText(/customer/i)).toBeInTheDocument();
  });

  it("shows 'Go to Dashboard' link when access is denied", () => {
    renderGuard(["admin"], "worker");
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("does not render protected content when role is denied", () => {
    renderGuard(["admin"], "employee");
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });
});

/* ─── Null user (not authenticated) ────────────────────────────────────── */

describe("RoleGuard — unauthenticated user (null)", () => {
  it("shows 'Access restricted' when user is null", () => {
    renderGuard(["admin", "manager"], undefined);
    expect(screen.getByText(/access restricted/i)).toBeInTheDocument();
  });

  it("does not render protected content when user is null", () => {
    renderGuard(["admin"], undefined);
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });
});

/* ─── Role IS in allowed list ───────────────────────────────────────────── */

describe("RoleGuard — role allowed", () => {
  it("renders children when user role is the sole allowed role", () => {
    renderGuard(["admin"], "admin");
    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
  });

  it("renders children when user role is one of multiple allowed roles", () => {
    renderGuard(["admin", "manager", "accounts"], "manager");
    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
  });

  it("does NOT render 'Access restricted' when access is granted", () => {
    renderGuard(["admin"], "admin");
    expect(screen.queryByText(/access restricted/i)).not.toBeInTheDocument();
  });
});

/* ─── Portal isolation spot checks ─────────────────────────────────────── */

describe("RoleGuard — portal isolation spot checks", () => {
  const portalCases: Array<[string[], string, boolean]> = [
    // [allowedRoles, userRole, shouldPass]
    [["supplier"],                  "supplier",     true],
    [["supplier"],                  "worker",       false],
    [["supplier"],                  "customer",     false],
    [["supplier"],                  "admin",        false],
    [["worker"],                    "worker",       true],
    [["worker"],                    "supplier",     false],
    [["worker"],                    "customer",     false],
    [["customer"],                  "customer",     true],
    [["customer"],                  "worker",       false],
    [["customer"],                  "admin",        false],
    [["admin","manager","sales_manager"], "admin",  true],
    [["admin","manager","sales_manager"], "manager",true],
    [["admin","manager","sales_manager"], "sales_manager", true],
    [["admin","manager","sales_manager"], "customer", false],
    [["admin","manager","sales_manager"], "worker",   false],
    [["admin","manager","sales_manager"], "supplier", false],
    [["admin"],                     "manager",      false],
    [["admin"],                     "accounts",     false],
  ];

  it.each(portalCases)(
    "allowedRoles=%j, userRole='%s' → shouldPass=%s",
    (allowedRoles, userRole, shouldPass) => {
      renderGuard(allowedRoles, userRole);
      if (shouldPass) {
        expect(screen.getByTestId("protected-content")).toBeInTheDocument();
      } else {
        expect(screen.getByText(/access restricted/i)).toBeInTheDocument();
        expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
      }
    },
  );
});
