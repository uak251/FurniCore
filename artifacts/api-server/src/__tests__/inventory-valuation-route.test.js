/**
 * Regression: GET /api/inventory/valuation — method from app_settings + WAC-style row values.
 */
import { vi } from "vitest";
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
    default: () => (_req, _res, next) => next(),
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
describe("GET /api/inventory/valuation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it.each([
        ["FIFO", 150],
        ["LIFO", 150],
        ["WAC", 150],
    ])("returns method %s and totalValue from quantity × unitCost (report line values)", async (method, expectedTotal) => {
        vi.mocked(db.select)
            .mockReturnValueOnce(makeChain([{ key: "INVENTORY_VALUATION_METHOD", value: method }]))
            .mockReturnValueOnce(makeChain([
            {
                id: 1,
                name: "A",
                type: "raw_material",
                unit: "kg",
                quantity: "10",
                reorderLevel: "2",
                unitCost: "5",
                supplierId: null,
            },
            {
                id: 2,
                name: "B",
                type: "raw_material",
                unit: "m",
                quantity: "4",
                reorderLevel: "1",
                unitCost: "25",
                supplierId: null,
            },
        ]));
        const res = await request(app)
            .get("/api/inventory/valuation")
            .set("Authorization", `Bearer ${makeToken("admin")}`);
        expect(res.status).toBe(200);
        expect(res.body.method).toBe(method);
        expect(res.body.totalValue).toBe(expectedTotal);
        expect(res.body.rows).toHaveLength(2);
        expect(res.body.rows[0].value).toBe(50);
        expect(res.body.rows[1].value).toBe(100);
    });
    it("defaults method to WAC when setting row is missing", async () => {
        vi.mocked(db.select)
            .mockReturnValueOnce(makeChain([]))
            .mockReturnValueOnce(makeChain([
            {
                id: 1,
                name: "Only",
                type: "raw_material",
                unit: "u",
                quantity: "2",
                reorderLevel: "0",
                unitCost: "3",
                supplierId: null,
            },
        ]));
        const res = await request(app)
            .get("/api/inventory/valuation")
            .set("Authorization", `Bearer ${makeToken("manager")}`);
        expect(res.status).toBe(200);
        expect(res.body.method).toBe("WAC");
        expect(res.body.totalValue).toBe(6);
    });
});
