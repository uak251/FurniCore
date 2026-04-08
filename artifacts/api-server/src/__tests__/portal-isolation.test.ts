/**
 * Integration tests — portal role isolation.
 *
 * Each test mounts the real Express router with a fully mocked @workspace/db
 * and drizzle-orm so no database connection is needed.
 *
 * For every protected portal endpoint we verify the complete access matrix:
 *   • No token                    → 401
 *   • Tokens for every wrong role → 403
 *   • Token(s) for correct role   → NOT 401 and NOT 403
 *     (actual status may be 404/500 because the DB mock returns empty results,
 *      but auth has passed — that is what we are confirming here)
 */

// ── vitest automatically hoists vi.mock() before all imports ─────────────
import { vi } from "vitest";

/* ── mock @workspace/db (must be declared before any import of routes) ── */
vi.mock("@workspace/db", () => {
  const chain: Record<string, unknown> = {};
  const chainMethods = [
    "from", "where", "orderBy", "leftJoin", "innerJoin",
    "limit", "offset", "set", "values", "returning", "$dynamic",
  ];
  for (const m of chainMethods) chain[m] = () => chain;
  chain.then = (res: (v: unknown[]) => unknown) => Promise.resolve([]).then(res);
  chain.catch = (rej: (e: unknown) => unknown) => Promise.resolve([]).catch(rej);

  return {
    db: {
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
    },
    usersTable: {}, employeesTable: {}, productsTable: {},
    inventoryTable: {}, suppliersTable: {}, supplierQuotesTable: {},
    deliveryUpdatesTable: {}, manufacturingTasksTable: {},
    attendanceTable: {}, payrollTable: {}, payrollAdjustmentsTable: {},
    transactionsTable: {}, notificationsTable: {}, activityLogsTable: {},
    performanceReviewsTable: {}, customerOrdersTable: {}, orderItemsTable: {},
    invoicesTable: {}, discountsTable: {}, orderUpdatesTable: {},
    qcRemarksTable: {}, productionTable: {}, hrTable: {},
  };
});

vi.mock("../lib/tokenBlacklist", () => ({
  hashToken: (t: string) => `hash:${t.length}`,
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
  revokeAccessToken: vi.fn().mockResolvedValue(undefined),
  purgeExpiredBlacklistRows: vi.fn().mockResolvedValue(0),
}));

/* ── suppress pino so tests don't spawn worker threads ── */
vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));
vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

/* ── mock drizzle-orm query helpers (tables are stubs, so we neutralise them) */
vi.mock("drizzle-orm", () => ({
  eq: () => ({}), and: () => ({}), or: () => ({}),
  desc: () => ({}), asc: () => ({}), gte: () => ({}), lte: () => ({}),
  sql: () => ({}), ne: () => ({}), inArray: () => ({}),
  isNull: () => ({}), isNotNull: () => ({}), lt: () => ({}), gt: () => ({}),
  ilike: () => ({}),
}));

import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import express from "express";
import router from "../routes/index";
import { tokens, rolesExcept, type Role } from "./helpers/tokens";

/* ── minimal test app (no pino-http, no cookie-parser) ── */
let request: ReturnType<typeof supertest>;
beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  request = supertest(app);
});

/* ─── helper: bearer header ─────────────────────────────────────────────── */
const bearer = (role: Role) => `Bearer ${tokens[role]}`;

/* ═══════════════════════════════════════════════════════════════════════════
   Shared test builder
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * For a given endpoint, verify:
 *   1. 401 — no token
 *   2. 403 — every role that should be denied
 *   3. NOT 401/403 — every role that should be allowed
 */
function accessMatrix(
  method: "get" | "post" | "patch" | "delete",
  path: string,
  allowedRoles: Role[],
  body?: Record<string, unknown>,
) {
  const deniedRoles = rolesExcept(...allowedRoles);

  it("returns 401 with no Authorization header", async () => {
    const res = await request[method](`/api${path}`)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
  });

  it.each(deniedRoles)(
    "returns 403 for role '%s' (not in allowed list)",
    async (role) => {
      const res = await request[method](`/api${path}`)
        .set("Authorization", bearer(role))
        .send(body ?? {});
      expect(res.status).toBe(403);
    },
  );

  it.each(allowedRoles)(
    "passes auth (not 401/403) for allowed role '%s'",
    async (role) => {
      const res = await request[method](`/api${path}`)
        .set("Authorization", bearer(role))
        .send(body ?? {});
      // DB mock returns empty data so we may get 404/500, but NOT 401/403
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. Supplier Portal  — role: "supplier" only
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Supplier Portal /supplier-portal/me", () => {
  accessMatrix("get", "/supplier-portal/me", ["supplier"]);
});

describe("Supplier Portal /supplier-portal/quotes", () => {
  accessMatrix("get", "/supplier-portal/quotes", ["supplier"]);
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. Worker Portal  — role: "worker" only
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Worker Portal /worker-portal/me", () => {
  accessMatrix("get", "/worker-portal/me", ["worker"]);
});

describe("Worker Portal /worker-portal/tasks", () => {
  accessMatrix("get", "/worker-portal/tasks", ["worker"]);
});

describe("Worker Portal /worker-portal/attendance", () => {
  accessMatrix("get", "/worker-portal/attendance", ["worker"]);
});

describe("Worker Portal /worker-portal/payroll", () => {
  accessMatrix("get", "/worker-portal/payroll", ["worker"]);
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. Customer Portal  — role: "customer" only
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Customer Portal /customer-portal/profile", () => {
  accessMatrix("get", "/customer-portal/profile", ["customer"]);
});

describe("Customer Portal /customer-portal/catalog", () => {
  accessMatrix("get", "/customer-portal/catalog", ["customer"]);
});

describe("Customer Portal /customer-portal/orders", () => {
  accessMatrix("get", "/customer-portal/orders", ["customer"]);
});

describe("Customer Portal /customer-portal/invoices", () => {
  accessMatrix("get", "/customer-portal/invoices", ["customer"]);
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. Sales Manager  — roles: "admin" | "manager" | "sales_manager"
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Sales Manager /sales-manager/overview", () => {
  accessMatrix("get", "/sales-manager/overview", ["admin", "manager", "sales_manager"]);
});

describe("Sales Manager /sales-manager/orders", () => {
  accessMatrix("get", "/sales-manager/orders", ["admin", "manager", "sales_manager"]);
});

describe("Sales Manager /sales-manager/invoices", () => {
  accessMatrix("get", "/sales-manager/invoices", ["admin", "manager", "sales_manager"]);
});

describe("Sales Manager /sales-manager/discounts", () => {
  accessMatrix("get", "/sales-manager/discounts", ["admin", "manager", "sales_manager"]);
});

describe("Sales Manager /sales-manager/receivables", () => {
  accessMatrix("get", "/sales-manager/receivables", ["admin", "manager", "sales_manager"]);
});

/* ═══════════════════════════════════════════════════════════════════════════
   5. HR Portal mutations  — roles: "admin" | "manager"
   (GET endpoints in hr-portal.ts only require authenticate, not requireRole.
    Mutation endpoints use const mgmt = [authenticate, requireRole("admin","manager")])
   ═══════════════════════════════════════════════════════════════════════════ */

describe("HR Portal POST /performance-reviews (mgmt only)", () => {
  accessMatrix("post", "/performance-reviews", ["admin", "manager"], {
    employeeId: 1, period: "2025-Q1", overallRating: 3,
  });
});

describe("HR Portal POST /payroll-adjustments (mgmt only)", () => {
  accessMatrix("post", "/payroll-adjustments", ["admin", "manager"], {
    employeeId: 1, type: "bonus", reason: "Good work", amount: 100, month: 1, year: 2025,
  });
});

describe("HR Portal DELETE /attendance/:id (mgmt only)", () => {
  accessMatrix("delete", "/attendance/99", ["admin", "manager"]);
});

/* ═══════════════════════════════════════════════════════════════════════════
   6. Payroll regenerate  — roles: "admin" | "manager"
   (GET /payroll only requires authenticate; POST /payroll/:id/regenerate uses mgmt)
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Payroll POST /payroll/:id/regenerate (mgmt only)", () => {
  accessMatrix("post", "/payroll/1/regenerate", ["admin", "manager"]);
});

/* ═══════════════════════════════════════════════════════════════════════════
   7. Users — create (admin only)
   (GET /users only requires authenticate; POST /users requires admin)
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Users POST /users (admin only)", () => {
  accessMatrix("post", "/users", ["admin"], {
    name: "Test", email: "t@test.com", password: "pw123", role: "employee",
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   8. Cross-portal contamination — explicit spot checks
   These duplicate some matrix cases but make intent crystal-clear.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Cross-portal contamination", () => {
  it("customer token is rejected by supplier-portal", async () => {
    const res = await request.get("/api/supplier-portal/me")
      .set("Authorization", bearer("customer"));
    expect(res.status).toBe(403);
  });

  it("worker token is rejected by customer-portal", async () => {
    const res = await request.get("/api/customer-portal/profile")
      .set("Authorization", bearer("worker"));
    expect(res.status).toBe(403);
  });

  it("supplier token is rejected by worker-portal", async () => {
    const res = await request.get("/api/worker-portal/me")
      .set("Authorization", bearer("supplier"));
    expect(res.status).toBe(403);
  });

  it("customer token is rejected by sales-manager portal", async () => {
    const res = await request.get("/api/sales-manager/overview")
      .set("Authorization", bearer("customer"));
    expect(res.status).toBe(403);
  });

  it("worker token is rejected by sales-manager portal", async () => {
    const res = await request.get("/api/sales-manager/overview")
      .set("Authorization", bearer("worker"));
    expect(res.status).toBe(403);
  });

  it("supplier token is rejected by sales-manager portal", async () => {
    const res = await request.get("/api/sales-manager/overview")
      .set("Authorization", bearer("supplier"));
    expect(res.status).toBe(403);
  });

  it("employee token is rejected by HR Portal POST /performance-reviews", async () => {
    const res = await request.post("/api/performance-reviews")
      .set("Authorization", bearer("employee"))
      .send({ employeeId: 1, period: "2025-Q1", overallRating: 3 });
    expect(res.status).toBe(403);
  });

  it("accounts token is rejected by HR Portal POST /performance-reviews", async () => {
    const res = await request.post("/api/performance-reviews")
      .set("Authorization", bearer("accounts"))
      .send({ employeeId: 1, period: "2025-Q1", overallRating: 3 });
    expect(res.status).toBe(403);
  });

  it("manager token is rejected by supplier-portal (even privileged internal roles are blocked)", async () => {
    const res = await request.get("/api/supplier-portal/me")
      .set("Authorization", bearer("manager"));
    expect(res.status).toBe(403);
  });

  it("admin token is rejected by supplier-portal", async () => {
    const res = await request.get("/api/supplier-portal/me")
      .set("Authorization", bearer("admin"));
    expect(res.status).toBe(403);
  });

  it("admin token is rejected by worker-portal", async () => {
    const res = await request.get("/api/worker-portal/me")
      .set("Authorization", bearer("admin"));
    expect(res.status).toBe(403);
  });

  it("admin token is rejected by customer-portal", async () => {
    const res = await request.get("/api/customer-portal/profile")
      .set("Authorization", bearer("admin"));
    expect(res.status).toBe(403);
  });
});
