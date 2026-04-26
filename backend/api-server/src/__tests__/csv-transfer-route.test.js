import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@workspace/db", async () => {
  const { makeDb, TABLE_STUBS } = await import("./helpers/db-mock");
  return { db: makeDb([]), ...TABLE_STUBS };
});

vi.mock("../lib/tokenBlacklist", () => ({
  hashToken: (t) => `hash:${t.length}`,
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
  revokeAccessToken: vi.fn().mockResolvedValue(undefined),
  purgeExpiredBlacklistRows: vi.fn().mockResolvedValue(0),
}));

import app from "../app";
import { db } from "@workspace/db";
import { makeToken } from "./helpers/tokens";

function auth(role = "admin") {
  return { Authorization: `Bearer ${makeToken(role)}` };
}

describe("CSV transfer routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.insert).mockImplementation(() => ({ values: vi.fn().mockResolvedValue([]) }));
    vi.mocked(db.select).mockImplementation(() => ({ from: vi.fn().mockResolvedValue([]) }));
  });

  it("imports inventory csv rows", async () => {
    const csv = "name,type,unit,quantity,reorderLevel,unitCost\nOak plank,raw,pcs,15,5,12.5\n";
    const res = await request(app)
      .post("/api/inventory/import-csv")
      .set(auth("admin"))
      .attach("file", Buffer.from(csv, "utf8"), { filename: "inventory.csv", contentType: "text/csv" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.imported).toBe(1);
    expect(db.insert).toHaveBeenCalled();
  });

  it("exports accounting csv", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => ({
      from: vi.fn().mockResolvedValue([
        {
          id: 1,
          type: "income",
          description: "seed",
          amount: "1200.00",
          transactionDate: new Date("2026-04-01T00:00:00.000Z"),
        },
      ]),
    }));

    const res = await request(app)
      .get("/api/accounting/export-csv")
      .set(auth("admin"));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("type");
    expect(res.text).toContain("income");
  });

  it("exports notifications csv template", async () => {
    const res = await request(app)
      .get("/api/notifications/csv-template")
      .set(auth("admin"));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("title");
    expect(res.text).toContain("message");
  });

  it("returns JSON 404 for unknown csv module route", async () => {
    const res = await request(app)
      .get("/api/unknown-module/export-csv")
      .set(auth("admin"));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Route not found");
  });
});
