import { jsx as _jsx } from "react/jsx-runtime";
/**
 * NotificationBell — registers for Socket.io `low-stock` and surfaces a destructive toast.
 */
import { vi } from "vitest";
const mocks = vi.hoisted(() => ({
    mockToast: vi.fn(),
    mockInvalidate: vi.fn(),
    mockOn: vi.fn(),
    mockOff: vi.fn(),
}));
vi.mock("@/lib/socket", () => ({
    socket: {
        on: mocks.mockOn,
        off: mocks.mockOff,
    },
    connectSocket: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({ toast: mocks.mockToast }),
}));
const mockUseListNotifications = vi.fn();
const mockMutateAsync = vi.fn();
vi.mock("@workspace/api-client-react", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useListNotifications: () => mockUseListNotifications(),
        useMarkNotificationRead: () => ({ mutateAsync: mockMutateAsync }),
    };
});
vi.mock("wouter", () => ({
    Link: ({ children, href }) => (_jsx("a", { href: href, children: children })),
}));
import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationBell } from "@/components/NotificationBell";
function renderBell() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(client, "invalidateQueries").mockImplementation(mocks.mockInvalidate);
    return render(_jsx(QueryClientProvider, { client: client, children: _jsx(NotificationBell, {}) }));
}
describe("NotificationBell + low-stock socket", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseListNotifications.mockReturnValue({
            data: [],
            isLoading: false,
        });
    });
    it("subscribes to low-stock and shows a toast + invalidates notifications when fired", async () => {
        renderBell();
        await waitFor(() => {
            expect(mocks.mockOn).toHaveBeenCalledWith("low-stock", expect.any(Function));
        });
        const handler = mocks.mockOn.mock.calls.find((c) => c[0] === "low-stock")?.[1];
        expect(handler).toBeDefined();
        handler({
            name: "Walnut Board",
            quantity: 2,
            reorderLevel: 10,
        });
        expect(mocks.mockToast).toHaveBeenCalledWith(expect.objectContaining({
            variant: "destructive",
            title: "Low Stock Alert",
            description: expect.stringContaining("Walnut Board"),
        }));
        expect(mocks.mockInvalidate).toHaveBeenCalledWith({ queryKey: ["/api/notifications"] });
    });
});
