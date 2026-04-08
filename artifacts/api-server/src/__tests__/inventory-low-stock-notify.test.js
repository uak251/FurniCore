/**
 * Regression: notifyLowStockStakeholders — Socket.io emit + DB notifications for Admin, Manager, Inventory Manager.
 */
import { vi } from "vitest";
const emitLowStockAlert = vi.fn();
vi.mock("../lib/socket", () => ({
    emitLowStockAlert: (...args) => emitLowStockAlert(...args),
}));
vi.mock("@workspace/db", async () => {
    const { makeDb, TABLE_STUBS } = await import("./helpers/db-mock");
    return { db: makeDb([]), ...TABLE_STUBS };
});
vi.mock("../lib/activityLogger", () => ({
    logActivity: vi.fn().mockResolvedValue(undefined),
    createNotification: vi.fn().mockResolvedValue(undefined),
}));
import { describe, it, expect, beforeEach } from "vitest";
import { makeChain } from "./helpers/db-mock";
import { db } from "@workspace/db";
import { createNotification } from "../lib/activityLogger";
import { notifyLowStockStakeholders } from "../lib/inventoryAlerts";
describe("notifyLowStockStakeholders", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("emits low-stock payload on the socket layer", async () => {
        vi.mocked(db.select).mockReturnValue(makeChain([]));
        const payload = {
            id: 3,
            name: "Pine Plank",
            quantity: 2,
            reorderLevel: 5,
        };
        await notifyLowStockStakeholders(payload);
        expect(emitLowStockAlert).toHaveBeenCalledTimes(1);
        expect(emitLowStockAlert).toHaveBeenCalledWith(payload);
    });
    it("creates notifications for admin, manager, and inventory_manager users", async () => {
        vi.mocked(db.select).mockReturnValue(makeChain([{ id: 10 }, { id: 20 }, { id: 30 }]));
        await notifyLowStockStakeholders({
            id: 1,
            name: "Oak",
            quantity: 1,
            reorderLevel: 3,
        });
        expect(createNotification).toHaveBeenCalledTimes(3);
        const userIds = vi.mocked(createNotification).mock.calls.map((c) => c[0].userId).sort((a, b) => a - b);
        expect(userIds).toEqual([10, 20, 30]);
        expect(vi.mocked(createNotification).mock.calls[0][0]).toMatchObject({
            title: "Low stock alert",
            type: "warning",
            link: "/inventory",
        });
    });
});
