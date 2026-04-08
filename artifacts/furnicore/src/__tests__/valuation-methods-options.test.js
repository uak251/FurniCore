import { describe, it, expect } from "vitest";
import { VALUATION_METHODS } from "@/pages/settings";
/**
 * Ensures General tab exposes FIFO / LIFO / WAC — backend GET /inventory/valuation
 * echoes the stored method while row math is quantity × unitCost for all three.
 */
describe("settings VALUATION_METHODS (inventory reports)", () => {
    it("lists FIFO, LIFO, and WAC with stable value keys", () => {
        expect(VALUATION_METHODS.map((m) => m.value)).toEqual(["FIFO", "LIFO", "WAC"]);
    });
});
