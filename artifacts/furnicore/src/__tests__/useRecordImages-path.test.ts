import { describe, it, expect } from "vitest";
import { getInventoryBulkImageUploadApiPath } from "@/components/images/useRecordImages";

describe("getInventoryBulkImageUploadApiPath", () => {
  it("targets POST /api/images/inventory/:id/bulk for bulk inventory uploads", () => {
    expect(getInventoryBulkImageUploadApiPath(42)).toBe("/api/images/inventory/42/bulk");
  });
});
