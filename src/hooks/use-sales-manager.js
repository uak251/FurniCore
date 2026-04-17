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
export function useSalesCustomers() {
    return useQuery({ queryKey: ["salesCustomers"], queryFn: () => apiFetch("/sales-manager/customers") });
}
export function useSalesWorkers() {
    return useQuery({ queryKey: ["salesWorkers"], queryFn: () => apiFetch("/sales-manager/workers") });
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
export function useUploadOrderUpdateImage() {
    return useMutation({
        mutationFn: async ({ orderId, file }) => {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`${API}/api/sales-manager/orders/${orderId}/updates/upload-image`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
                body: form,
            });
            const json = await res.json();
            if (!res.ok)
                throw new Error(json?.error ?? `HTTP ${res.status}`);
            return json;
        },
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
export function useUploadInvoicePdf() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, file }) => {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`${API}/api/sales-manager/invoices/${id}/upload-pdf`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
                body: form,
            });
            const json = await res.json();
            if (!res.ok)
                throw new Error(json?.error ?? `HTTP ${res.status}`);
            return json;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["salesInvoices"] });
        },
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
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["salesDiscounts"] });
        },
    });
}
/* ─── Receivables ────────────────────────────────────────────────────────── */
export function useSalesReceivables() {
    return useQuery({ queryKey: ["salesReceivables"], queryFn: () => apiFetch("/sales-manager/receivables") });
}

/** Category list for catalog filters (admin / manager / sales_manager). */
export function useSalesProductCategories() {
    return useQuery({ queryKey: ["salesProductCategories"], queryFn: () => apiFetch("/sales-manager/product-categories") });
}

/** Products with optional category + operational status filters. */
export function useSalesCatalogProducts(filters) {
    return useQuery({
        queryKey: ["salesCatalogProducts", filters],
        queryFn: () => {
            const sp = new URLSearchParams();
            if (filters?.search) sp.set("search", filters.search);
            if (filters?.categoryId != null && filters.categoryId !== "all") sp.set("categoryId", String(filters.categoryId));
            if (filters?.productStatus && filters.productStatus !== "all") sp.set("productStatus", filters.productStatus);
            const q = sp.toString();
            return apiFetch(q ? `/products?${q}` : "/products");
        },
    });
}

export function useUpdateSalesProduct() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...body }) => apiFetch(`/products/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["salesCatalogProducts"] });
            qc.invalidateQueries({ queryKey: ["listProducts"] });
        },
    });
}

export function useProductManufacturingHistory(productId) {
    return useQuery({
        queryKey: ["productManufacturingHistory", productId],
        queryFn: () => apiFetch(`/products/${productId}/manufacturing-history`),
        enabled: productId != null && productId > 0,
    });
}
