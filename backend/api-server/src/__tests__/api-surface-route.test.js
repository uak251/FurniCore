import { describe, it, expect, vi, beforeEach } from "vitest";
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
import { pool } from "@workspace/db";

function auth(role = "admin") {
  return { Authorization: `Bearer ${makeToken(role)}` };
}

describe("API surface routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/healthz/db returns JSON status", async () => {
    const res = await request(app).get("/api/healthz/db");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(["ok", "degraded"]).toContain(res.body.status);
    expect(pool.query).toHaveBeenCalled();
  });

  it("GET /api/dashboard-themes/catalog is registered and authenticated", async () => {
    const res = await request(app)
      .get("/api/dashboard-themes/catalog")
      .set(auth("admin"));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.themes)).toBe(true);
  });

  it("GET /api/dashboard/summary is mounted and not 404 for authed user", async () => {
    const res = await request(app)
      .get("/api/dashboard/summary")
      .set(auth("admin"));
    expect([200, 500]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(404);
  });
});
