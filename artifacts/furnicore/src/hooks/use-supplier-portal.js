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
