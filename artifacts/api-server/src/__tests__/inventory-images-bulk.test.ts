/**
 * Regression: POST /api/images/inventory/:id/bulk
 * — valid/invalid entity id, allowed image MIME types, Drizzle insert payload (record_images).
 */

import { vi } from "vitest";

vi.mock("@workspace/db", async () => {
  const { makeDb, TABLE_STUBS } = await import("./helpers/db-mock");
  return { db: makeDb([]), ...TABLE_STUBS };
});

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

describe("POST /api/images/inventory/:id/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without Authorization", async () => {
    const res = await request(app).post("/api/images/inventory/1/bulk");
    expect(res.status).toBe(401);
  });

  it("returns 400 INVALID_ID when :id is not an integer (before requiring files)", async () => {
    const token = makeToken("admin");
    const res = await request(app)
      .post("/api/images/inventory/not-a-number/bulk")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_ID");
  });

  it("returns 403 for roles that cannot upload images", async () => {
    const token = makeToken("customer");
    const res = await request(app)
      .post("/api/images/inventory/1/bulk")
      .set("Authorization", `Bearer ${token}`)
      .attach("images", Buffer.from("x"), { filename: "a.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when MIME type is not allowed", async () => {
    const token = makeToken("inventory_manager");
    const res = await request(app)
      .post("/api/images/inventory/42/bulk")
      .set("Authorization", `Bearer ${token}`)
      .attach("images", Buffer.from("bogus"), { filename: "bad.exe", contentType: "application/octet-stream" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UPLOAD_ERROR");
  });

  it.each([
    ["image/jpeg", "one.jpg"],
    ["image/jpg", "two.jpg"],
    ["image/png", "three.png"],
    ["image/gif", "four.gif"],
    ["image/webp", "five.webp"],
  ] as const)("accepts %s and persists rows via db.insert…values (mime %s)", async (mime, filename) => {
    const token = makeToken("admin");
    const captured: unknown[] = [];

    vi.mocked(db.insert).mockImplementationOnce(() => ({
      values: (rows: unknown) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        captured.push(...arr);
        return {
          returning: vi.fn().mockResolvedValue(
            arr.map((row: Record<string, unknown>, i: number) => ({
              id: i + 1,
              ...row,
            })),
          ),
        };
      },
    }));

    const res = await request(app)
      .post("/api/images/inventory/7/bulk")
      .set("Authorization", `Bearer ${token}`)
      .attach("images", Buffer.from("fake-bytes"), { filename, contentType: mime });

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body)).toBe(true);
    expect(captured.length).toBe(1);
    expect(captured[0]).toMatchObject({
      entityType: "inventory",
      entityId: 7,
      mimeType: mime,
    });
  });

  it("allows Admin and Inventory Manager to upload", async () => {
    for (const role of ["admin", "inventory_manager"] as const) {
      vi.mocked(db.insert).mockImplementationOnce(() => ({
        values: (rows: unknown) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          return {
            returning: vi.fn().mockResolvedValue(arr.map((_: unknown, i: number) => ({ id: i + 1 }))),
          };
        },
      }));

      const res = await request(app)
        .post("/api/images/inventory/3/bulk")
        .set("Authorization", `Bearer ${makeToken(role)}`)
        .attach("images", Buffer.from("x"), { filename: "z.png", contentType: "image/png" });

      expect(res.status).toBe(201);
    }
  });
});
