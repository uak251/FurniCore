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
/* ─── Overview ───────────────────────────────────────────────────────────── */
export function useSalesOverview() {
    return useQuery({ queryKey: ["salesOverview"], queryFn: () => apiFetch("/sales-manager/overview") });
}
/* ─── Orders ─────────────────────────────────────────────────────────────── */
export function useSalesOrders() {
    return useQuery({ queryKey: ["salesOrders"], queryFn: () => apiFetch("/sales-manager/orders") });
}
export function useCreateSalesOrder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiFetch("/sales-manager/orders", { method: "POST", body: JSON.stringify(data) }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["salesOrders"] }); qc.invalidateQueries({ queryKey: ["salesOverview"] }); },
    });
}
export function useUpdateSalesOrder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) => apiFetch(`/sales-manager/orders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["salesOrders"] }),
    });
}
export function useAddOrderUpdate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ orderId, ...data }) => apiFetch(`/sales-manager/orders/${orderId}/updates`, { method: "POST", body: JSON.stringify(data) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["salesOrders"] }),
    });
}
/* ─── Invoices ───────────────────────────────────────────────────────────── */
export function useSalesInvoices() {
    return useQuery({ queryKey: ["salesInvoices"], queryFn: () => apiFetch("/sales-manager/invoices") });
}
export function useGenerateInvoice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiFetch("/sales-manager/invoices", { method: "POST", body: JSON.stringify(data) }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["salesInvoices"] }); qc.invalidateQueries({ queryKey: ["salesReceivables"] }); },
    });
}
export function useUpdateInvoice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) => apiFetch(`/sales-manager/invoices/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["salesInvoices"] }); qc.invalidateQueries({ queryKey: ["salesReceivables"] }); },
    });
}
/* ─── Discounts ──────────────────────────────────────────────────────────── */
export function useSalesDiscounts() {
    return useQuery({ queryKey: ["salesDiscounts"], queryFn: () => apiFetch("/sales-manager/discounts") });
}
export function useCreateDiscount() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiFetch("/sales-manager/discounts", { method: "POST", body: JSON.stringify(data) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["salesDiscounts"] }),
    });
}
export function useUpdateDiscount() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) => apiFetch(`/sales-manager/discounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["salesDiscounts"] }),
    });
}
export function useDeleteDiscount() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiFetch(`/sales-manager/discounts/${id}`, { method: "DELETE" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["salesDiscounts"] }),
    });
}
/* ─── Receivables ────────────────────────────────────────────────────────── */
export function useSalesReceivables() {
    return useQuery({ queryKey: ["salesReceivables"], queryFn: () => apiFetch("/sales-manager/receivables") });
}
