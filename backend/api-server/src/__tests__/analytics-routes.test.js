import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("@workspace/db", async () => {
  const { makeDb, TABLE_STUBS } = await import("./helpers/db-mock");
  return {
    db: makeDb([]),
    pool: { query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }) },
    ...TABLE_STUBS,
    materialUsageTable: {},
  };
});

vi.mock("../lib/tokenBlacklist", () => ({
  hashToken: (t) => `hash:${t.length}`,
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
  revokeAccessToken: vi.fn().mockResolvedValue(undefined),
  purgeExpiredBlacklistRows: vi.fn().mockResolvedValue(0),
}));

import app from "../app";
import { makeToken } from "./helpers/tokens";

function auth(role = "admin") {
  return { Authorization: `Bearer ${makeToken(role)}` };
}

describe("analytics routes", () => {
  it("GET /api/analytics/test returns analytics working marker", async () => {
    const res = await request(app).get("/api/analytics/test");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(String(res.body.message).toLowerCase()).toContain("analytics working");
  });

  it("GET /api/analytics/native/notifications is mounted and not 404 when authenticated", async () => {
    const res = await request(app)
      .get("/api/analytics/native/notifications")
      .set(auth("admin"));
    expect([200, 500]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(404);
  });

  it("GET /api/analytics/native/unknown-module returns JSON 404", async () => {
    const res = await request(app)
      .get("/api/analytics/native/unknown-module")
      .set(auth("admin"));
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.success).toBe(false);
  });
});
