import { jsx as _jsx } from "react/jsx-runtime";
/**
 * ModuleGallery — raw material grouping, loading skeletons, image previews.
 */
import { vi } from "vitest";
vi.mock("@/components/images/useRecordImages", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useDeleteImage: () => ({ mutate: vi.fn(), isPending: false }),
    };
});
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ModuleGallery } from "@/components/images/ImageGallery";
const sample = [
    {
        id: 1,
        entityType: "inventory",
        entityId: 10,
        filename: "a.jpg",
        originalName: "a.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 100,
        url: "/uploads/inventory/a.jpg",
        altText: null,
        sortOrder: 0,
        uploadedBy: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
    },
];
describe("ModuleGallery", () => {
    it("shows skeleton grid while loading", () => {
        const { container } = render(_jsx(ModuleGallery, { entityType: "inventory", images: [], isLoading: true, canUpload: false }));
        const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
        expect(skeletons.length).toBeGreaterThanOrEqual(8);
    });
    it("renders raw material label and image preview for inventory images", () => {
        render(_jsx(ModuleGallery, { entityType: "inventory", images: sample, isLoading: false, canUpload: false, entityLabels: { 10: "Steel Rod" }, entityIds: [10] }));
        expect(screen.getByText(/steel rod/i)).toBeInTheDocument();
        const group = screen.getByText(/steel rod/i).closest("div")?.parentElement;
        expect(group).toBeTruthy();
        const img = within(group).getByRole("img", { name: /a\.jpg/i });
        expect(img).toHaveAttribute("src", expect.stringContaining("uploads/inventory"));
    });
});
