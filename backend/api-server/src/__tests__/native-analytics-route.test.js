import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("@workspace/db", async () => {
  const { makeDb, TABLE_STUBS } = await import("./helpers/db-mock");
  return { db: makeDb([]), ...TABLE_STUBS, materialUsageTable: {} };
});

vi.mock("../lib/tokenBlacklist", () => ({
  hashToken: (t) => `hash:${t.length}`,
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
  revokeAccessToken: vi.fn().mockResolvedValue(undefined),
  purgeExpiredBlacklistRows: vi.fn().mockResolvedValue(0),
}));

vi.mock("../lib/native-analytics", () => ({
  nativeAnalyticsHandlers: {
    inventory: vi.fn(async () => ({
      module: "inventory",
      charts: [{ id: "c1", type: "bar", xKey: "name", yKeys: ["value"], data: [{ name: "raw", value: 10 }] }],
      kpis: [{ label: "Items", value: 1 }],
    })),
    procurement: vi.fn(async () => ({
      module: "procurement",
      charts: [{ id: "cp1", type: "bar", xKey: "m", yKeys: ["n"], data: [{ m: "a", n: 1 }] }],
      kpis: [{ label: "Quotes", value: 1 }],
    })),
    finance: vi.fn(async () => ({
      module: "finance",
      charts: [{ id: "c2", type: "line", xKey: "month", yKeys: ["revenue", "expenses"], data: [{ month: "2026-04", revenue: 100, expenses: 40 }] }],
      kpis: [{ label: "Current Valuation", value: "WAC" }],
    })),
    accounting: vi.fn(async () => ({
      module: "accounting",
      charts: [{ id: "ca1", type: "line", xKey: "month", yKeys: ["v"], data: [{ month: "2026-04", v: 1 }] }],
      kpis: [{ label: "Net", value: 1 }],
    })),
    hr: vi.fn(async () => ({
      module: "hr",
      charts: [{ id: "c3", type: "pie", xKey: "name", yKeys: ["value"], data: [{ name: "present", value: 12 }] }],
      kpis: [{ label: "Attendance Records", value: 12 }],
    })),
    payroll: vi.fn(async () => ({
      module: "payroll",
      charts: [{ id: "pr1", type: "bar", xKey: "x", yKeys: ["y"], data: [{ x: "a", y: 1 }] }],
      kpis: [{ label: "Runs", value: 1 }],
    })),
    customer: vi.fn(async () => ({
      module: "customer",
      charts: [{ id: "c4b", type: "bar", xKey: "region", yKeys: ["orders"], data: [{ region: "unknown", orders: 1 }] }],
      kpis: [{ label: "Orders", value: 1 }],
    })),
    "customer-profile": vi.fn(async () => ({
      module: "customer-profile",
      charts: [{ id: "c4", type: "bar", xKey: "region", yKeys: ["orders"], data: [{ region: "unknown", orders: 1 }] }],
      kpis: [{ label: "Customer Orders", value: 1 }],
    })),
    supplier: vi.fn(async () => ({
      module: "supplier",
      charts: [{ id: "c5", type: "line", xKey: "quote", yKeys: ["daysToApprove"], data: [{ quote: "Q-1", daysToApprove: 2 }] }],
      kpis: [{ label: "Total Quotes", value: 1 }],
    })),
    production: vi.fn(async () => ({
      module: "production",
      charts: [{ id: "c6", type: "bar", xKey: "status", yKeys: ["count"], data: [{ status: "pending", count: 3 }] }],
      kpis: [{ label: "Tasks", value: 3 }],
    })),
    notifications: vi.fn(async () => ({
      module: "notifications",
      charts: [{ id: "c7", type: "pie", xKey: "state", yKeys: ["value"], data: [{ state: "pending", value: 5 }] }],
      kpis: [{ label: "Notifications", value: 5 }],
    })),
    settings: vi.fn(async () => ({
      module: "settings",
      charts: [{ id: "c8", type: "bar", xKey: "module", yKeys: ["events"], data: [{ module: "inventory", events: 8 }] }],
      kpis: [{ label: "Users", value: 4 }],
    })),
    admin: vi.fn(async () => ({
      module: "admin",
      charts: [{ id: "c9", type: "bar", xKey: "a", yKeys: ["b"], data: [{ a: "x", b: 1 }] }],
      kpis: [{ label: "K", value: 1 }],
    })),
  },
}));

import app from "../app";
import { makeToken } from "./helpers/tokens";
import { nativeAnalyticsHandlers } from "../lib/native-analytics";

function auth(role = "admin") {
  return { Authorization: `Bearer ${makeToken(role)}` };
}

describe("GET /api/analytics/native/:module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when token is missing", async () => {
    const res = await request(app).get("/api/analytics/native/inventory");
    expect(res.status).toBe(401);
  });

  it("returns 403 for authenticated but unauthorized role", async () => {
    const res = await request(app)
      .get("/api/analytics/native/inventory")
      .set(auth("worker"));
    expect(res.status).toBe(403);
  });

  it("returns 404 JSON for unknown analytics module (not HTML)", async () => {
    const res = await request(app)
      .get("/api/analytics/native/unknown-module")
      .set(auth("admin"));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Route not found");
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(Array.isArray(res.body.supported)).toBe(true);
  });

  it.each([
    "inventory",
    "procurement",
    "production",
    "hr",
    "supplier",
    "customer",
    "accounting",
    "notifications",
  ])("smoke: GET /api/analytics/native/%s returns 200 JSON (not 404)", async (moduleKey) => {
    const res = await request(app)
      .get(`/api/analytics/native/${moduleKey}`)
      .set(auth("admin"));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.module).toBe(moduleKey);
    expect(Array.isArray(res.body.charts)).toBe(true);
  });

  it.each([
    "inventory",
    "finance",
    "hr",
    "customer-profile",
    "supplier",
    "production",
    "notifications",
    "settings",
    "procurement",
    "accounting",
    "customer",
    "payroll",
  ])("returns analytics payload for %s", async (moduleKey) => {
    const res = await request(app)
      .get(`/api/analytics/native/${moduleKey}`)
      .set(auth("manager"));

    expect(res.status).toBe(200);
    expect(res.body.module).toBe(moduleKey);
    expect(Array.isArray(res.body.charts)).toBe(true);
    expect(Array.isArray(res.body.kpis)).toBe(true);
    expect(typeof res.body.updatedAt).toBe("string");

    for (const chart of res.body.charts) {
      expect(Array.isArray(chart.data)).toBe(true);
      for (const row of chart.data) {
        expect(typeof row).toBe("object");
      }
    }
  });

  it("returns admin-only analytics for admin role", async () => {
    const res = await request(app)
      .get("/api/analytics/native/admin")
      .set(auth("admin"));
    expect(res.status).toBe(200);
    expect(res.body.module).toBe("admin");
  });

  it("allows customer only on customer-profile module", async () => {
    const ok = await request(app)
      .get("/api/analytics/native/customer-profile")
      .set(auth("customer"));
    expect(ok.status).toBe(200);
    expect(ok.body.module).toBe("customer-profile");

    const denied = await request(app)
      .get("/api/analytics/native/finance")
      .set(auth("customer"));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe("INSUFFICIENT_PERMISSIONS");
  });

  it("returns ANALYTICS_ERROR JSON when a handler throws", async () => {
    vi.mocked(nativeAnalyticsHandlers.inventory).mockRejectedValueOnce(new Error("db down"));

    const res = await request(app)
      .get("/api/analytics/native/inventory")
      .set(auth("admin"));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "ANALYTICS_ERROR" });
  });
});

describe("GET /api/analytics/rbac-contract", () => {
  it("returns 401 when token missing", async () => {
    const res = await request(app).get("/api/analytics/rbac-contract");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    const res = await request(app)
      .get("/api/analytics/rbac-contract")
      .set(auth("manager"));
    expect(res.status).toBe(403);
  });

  it("returns active contract for admin", async () => {
    const res = await request(app)
      .get("/api/analytics/rbac-contract")
      .set(auth("admin"));
    expect(res.status).toBe(200);
    expect(typeof res.body.version).toBe("string");
    expect(typeof res.body.roles).toBe("object");
    expect(typeof res.body.modules).toBe("object");
  });
});

describe("POST /api/analytics/native/:module/actions/:action", () => {
  it("returns 401 when token missing", async () => {
    const res = await request(app).post("/api/analytics/native/inventory/actions/contact-supplier");
    expect(res.status).toBe(401);
  });

  it("returns 403 for unauthorized role", async () => {
    const res = await request(app)
      .post("/api/analytics/native/inventory/actions/contact-supplier")
      .set(auth("worker"));
    expect(res.status).toBe(403);
  });

  it("executes known quick action for allowed role", async () => {
    const res = await request(app)
      .post("/api/analytics/native/inventory/actions/contact-supplier")
      .set(auth("admin"));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe("success");
    expect(typeof res.body.executedAt).toBe("string");
    expect(res.body.action).toBe("contact-supplier");
    expect(typeof res.body.redirectTo).toBe("string");
  });

  it.each([
    ["/api/analytics/native/inventory/actions/reorder-now", "admin"],
    ["/api/analytics/native/procurement/actions/approve-quote", "manager"],
    ["/api/analytics/native/production/actions/log-qc-check", "manager"],
    ["/api/analytics/native/hr/actions/allocate-bonus-penalty", "manager"],
    ["/api/analytics/native/supplier/actions/lock-price", "accountant"],
    ["/api/analytics/native/customer/actions/view-satisfaction-survey", "manager"],
    ["/api/analytics/native/finance/actions/approve-transaction", "accountant"],
    ["/api/analytics/native/notifications/actions/view-audit-log", "admin"],
  ])("executes quick action endpoint %s for role %s", async (url, role) => {
    const res = await request(app).post(url).set(auth(role));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("unregistered /api routes", () => {
  it("return JSON { error: Route not found } instead of HTML", async () => {
    const res = await request(app).get("/api/__no_such_route__/xyz");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Route not found");
    expect(res.headers["content-type"]).toMatch(/json/);
  });
});
