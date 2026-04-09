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
    if (!res.ok) {
        const fromIssues = Array.isArray(json?.issues) && json.issues.length > 0
            ? json.issues.map((i) => i.message).join(" ")
            : "";
        throw new Error(fromIssues || (typeof json?.error === "string" ? json.error : "") || `HTTP ${res.status}`);
    }
    return json;
}
/* ─── Hooks ──────────────────────────────────────────────────────────────── */
export function useCustomerProfile() {
    return useQuery({ queryKey: ["customerProfile"], queryFn: () => apiFetch("/customer-portal/profile") });
}
export function useProductCatalog() {
    return useQuery({ queryKey: ["catalog"], queryFn: () => apiFetch("/customer-portal/catalog") });
}
export function useValidateDiscount(code, orderAmount) {
    return useQuery({
        queryKey: ["discountValidation", code, orderAmount],
        queryFn: () => apiFetch(`/customer-portal/validate-discount?code=${encodeURIComponent(code)}&orderAmount=${orderAmount}`),
        enabled: code.length >= 2,
    });
}
export function useCustomerOrders() {
    return useQuery({ queryKey: ["customerOrders"], queryFn: () => apiFetch("/customer-portal/orders") });
}
export function usePlaceOrder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiFetch("/customer-portal/orders", { method: "POST", body: JSON.stringify(data) }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["customerOrders"] }); qc.invalidateQueries({ queryKey: ["customerInvoices"] }); },
    });
}
export function useCustomerInvoices() {
    return useQuery({ queryKey: ["customerInvoices"], queryFn: () => apiFetch("/customer-portal/invoices") });
}
export function usePayInvoice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) => apiFetch(`/customer-portal/invoices/${id}/pay`, { method: "POST", body: JSON.stringify(data) }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["customerInvoices"] }); qc.invalidateQueries({ queryKey: ["customerOrders"] }); },
    });
}
