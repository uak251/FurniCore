/**
 * React Query hooks for the Supplier Portal.
 * All hooks target /supplier-portal/* endpoints that are locked to
 * the "supplier" role; the backend further scopes every query to the
 * supplier whose email matches the logged-in user.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";
const API = apiOriginPrefix();
async function apiFetch(path, options) {
    const res = await fetch(`${API}/api${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken() ?? ""}`,
            ...(options?.headers ?? {}),
        },
    });
    if (res.status === 204)
        return undefined;
    const json = await res.json();
    if (!res.ok)
        throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
}
// ─── Hooks ────────────────────────────────────────────────────────────────────
export function useSupplierMe() {
    return useQuery({
        queryKey: ["supplierMe"],
        queryFn: () => apiFetch("/supplier-portal/me"),
    });
}
export function useSupplierQuotes() {
    return useQuery({
        queryKey: ["supplierQuotes"],
        queryFn: () => apiFetch("/supplier-portal/quotes"),
    });
}
export function useSubmitQuote() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiFetch("/supplier-portal/quotes", {
            method: "POST",
            body: JSON.stringify(data),
        }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["supplierQuotes"] }),
    });
}
export function useSupplierDeliveries() {
    return useQuery({
        queryKey: ["supplierDeliveries"],
        queryFn: () => apiFetch("/supplier-portal/deliveries"),
    });
}
export function useAddDeliveryUpdate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiFetch("/supplier-portal/deliveries", {
            method: "POST",
            body: JSON.stringify(data),
        }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["supplierDeliveries"] }),
    });
}
export function usePatchDeliveryUpdate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) => apiFetch(`/supplier-portal/deliveries/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["supplierDeliveries"] }),
    });
}
export function useSupplierLedger() {
    return useQuery({
        queryKey: ["supplierLedger"],
        queryFn: () => apiFetch("/supplier-portal/ledger"),
    });
}
/** Shipment / packing photos for a supplier quote (multipart upload). */
export function useSupplierQuoteShipmentImages(quoteId, enabled = true) {
    return useQuery({
        queryKey: ["supplierQuoteShipmentImages", quoteId],
        queryFn: () => apiFetch(`/supplier-portal/quotes/${quoteId}/shipment-images`),
        enabled: Boolean(enabled && quoteId),
    });
}
export function useUploadSupplierQuoteShipmentImages(quoteId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (/** @type {File[]} */ files) => {
            if (quoteId == null || Number.isNaN(Number(quoteId))) {
                throw new Error("No quote selected.");
            }
            const fd = new FormData();
            for (const f of files)
                fd.append("images", f);
            const res = await fetch(`${API}/api/supplier-portal/quotes/${quoteId}/shipment-images`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
                body: fd,
            });
            const json = await res.json();
            if (!res.ok)
                throw new Error(json?.error ?? json?.message ?? `HTTP ${res.status}`);
            return json;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["supplierQuoteShipmentImages", quoteId] });
        },
    });
}
export function useDeleteSupplierQuoteShipmentImage() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (/** @type {number} */ imageId) => {
            const res = await fetch(`${API}/api/supplier-portal/shipment-images/${imageId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok)
                throw new Error(json?.error ?? `HTTP ${res.status}`);
            return json;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["supplierQuoteShipmentImages"] });
        },
    });
}
