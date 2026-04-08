/**
 * React Query hooks for the Production Manager portal.
 * Covers: production orders, QC remarks, material usage.
 *
 * All hooks use @tanstack/react-query directly (no orval-generated client)
 * because these endpoints were added after the initial code generation.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";
const API = apiOriginPrefix();
// ─── Shared fetch util ────────────────────────────────────────────────────────
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
// ─── Production Orders ────────────────────────────────────────────────────────
export function useProductionOrders() {
    return useQuery({
        queryKey: ["productionOrders"],
        queryFn: () => apiFetch("/production-orders"),
    });
}
export function useCreateProductionOrder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiFetch("/production-orders", {
            method: "POST",
            body: JSON.stringify(data),
        }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["productionOrders"] }),
    });
}
export function useUpdateProductionOrder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }) => apiFetch(`/production-orders/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["productionOrders"] }),
    });
}
export function useDeleteProductionOrder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiFetch(`/production-orders/${id}`, { method: "DELETE" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["productionOrders"] }),
    });
}
// ─── QC Remarks ───────────────────────────────────────────────────────────────
export function useQcRemarks(taskId) {
    return useQuery({
        queryKey: ["qcRemarks", taskId ?? "all"],
        queryFn: () => apiFetch(`/qc-remarks${taskId ? `?taskId=${taskId}` : ""}`),
    });
}
export function usePublicQcRemarks(taskId) {
    return useQuery({
        queryKey: ["qcRemarksPublic", taskId ?? "all"],
        queryFn: () => apiFetch(`/qc-remarks/public${taskId ? `?taskId=${taskId}` : ""}`),
    });
}
export function useCreateQcRemark() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiFetch("/qc-remarks", {
            method: "POST",
            body: JSON.stringify(data),
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["qcRemarks"] });
            qc.invalidateQueries({ queryKey: ["qcRemarksPublic"] });
        },
    });
}
export function useUpdateQcRemark() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data, }) => apiFetch(`/qc-remarks/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["qcRemarks"] });
            qc.invalidateQueries({ queryKey: ["qcRemarksPublic"] });
        },
    });
}
export function useDeleteQcRemark() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiFetch(`/qc-remarks/${id}`, { method: "DELETE" }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["qcRemarks"] });
            qc.invalidateQueries({ queryKey: ["qcRemarksPublic"] });
        },
    });
}
// ─── Material Usage ───────────────────────────────────────────────────────────
export function useMaterialUsage(taskId) {
    return useQuery({
        queryKey: ["materialUsage", taskId ?? "all"],
        queryFn: () => apiFetch(`/material-usage${taskId ? `?taskId=${taskId}` : ""}`),
    });
}
export function useCreateMaterialUsage() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiFetch("/material-usage", {
            method: "POST",
            body: JSON.stringify(data),
        }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["materialUsage"] }),
    });
}
export function useDeleteMaterialUsage() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiFetch(`/material-usage/${id}`, { method: "DELETE" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["materialUsage"] }),
    });
}
