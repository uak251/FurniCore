/**
 * Regression: POST /api/bulk/inventory/import — incremental quantity on existing rows by name.
 */

import { vi } from "vitest";

vi.mock("@workspace/db", async () => {
  const { makeDb, TABLE_STUBS } = await import("./helpers/db-mock");
  return { db: makeDb([]), ...TABLE_STUBS };
});

vi.mock("../lib/tokenBlacklist", () => ({
  hashToken: (t: string) => `hash:${t.length}`,
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
  revokeAccessToken: vi.fn().mockResolvedValue(undefined),
  purgeExpiredBlacklistRows: vi.fn().mockResolvedValue(0),
}));

vi.mock("../lib/activityLogger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));
vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  or: () => ({}),
  desc: () => ({}),
  asc: () => ({}),
  gte: () => ({}),
  lte: () => ({}),
  sql: () => ({}),
  ne: () => ({}),
  inArray: () => ({}),
  isNull: () => ({}),
  isNotNull: () => ({}),
  lt: () => ({}),
  gt: () => ({}),
  ilike: () => ({}),
}));

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { db } from "@workspace/db";
import app from "../app";
import { makeToken } from "./helpers/tokens";
import { makeChain } from "./helpers/db-mock";

const csvHeader =
  "name,type,unit,quantity,reorderlevel,unitcost\n";

describe("POST /api/bulk/inventory/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a new row when no existing name matches", async () => {
    const insertPayloads: unknown[] = [];

    vi.mocked(db.select).mockReturnValue(makeChain([]));
    vi.mocked(db.insert).mockImplementation(() => ({
      values: (row: unknown) => {
        insertPayloads.push(row);
        return makeChain([]);
      },
    }));

    const body =
      csvHeader +
      "Steel Bar,raw_material,kg,25,5,12.5\n";

    const res = await request(app)
      .post("/api/bulk/inventory/import")
      .set("Authorization", `Bearer ${makeToken("manager")}`)
      .set("Content-Type", "text/csv")
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.updated).toBe(0);
    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0]).toMatchObject({
      name: "Steel Bar",
      quantity: "25",
    });
  });

  it("accumulates quantity when the same name already exists", async () => {
    const setCalls: unknown[] = [];

    vi.mocked(db.select).mockReturnValue(
      makeChain([{ id: 99, quantity: "10" }]),
    );
    vi.mocked(db.update).mockImplementation(() => ({
      set: (patch: unknown) => {
        setCalls.push(patch);
        return { where: vi.fn(() => makeChain([])) };
      },
    }));

    const body =
      csvHeader +
      "Steel Bar,raw_material,kg,4,5,12.5\n";

    const res = await request(app)
      .post("/api/bulk/inventory/import")
      .set("Authorization", `Bearer ${makeToken("inventory_manager")}`)
      .set("Content-Type", "text/csv")
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(0);
    expect(res.body.updated).toBe(1);
    expect(setCalls[0]).toMatchObject({
      quantity: "14",
    });
  });
});
