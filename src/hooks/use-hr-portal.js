/**
 * React Query hooks for the extended HR Portal.
 * Covers: attendance CRUD, attendance summary, performance reviews,
 * payroll adjustments, and payroll regeneration.
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
// ─── Attendance ───────────────────────────────────────────────────────────────
export function useListAttendance(params) {
    const qs = new URLSearchParams();
    if (params?.employeeId)
        qs.set("employeeId", String(params.employeeId));
    if (params?.month)
        qs.set("month", String(params.month));
    if (params?.year)
        qs.set("year", String(params.year));
    const query = qs.toString();
    return useQuery({
        queryKey: ["attendance", params],
        queryFn: () => apiFetch(`/attendance${query ? "?" + query : ""}`),
    });
}
export function useUpdateAttendance() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) => apiFetch(`/attendance/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
    });
}
export function useDeleteAttendance() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiFetch(`/attendance/${id}`, { method: "DELETE" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
    });
}
export function useAttendanceSummary(month, year) {
    return useQuery({
        queryKey: ["attendanceSummary", month, year],
        queryFn: () => apiFetch(`/hr/attendance-summary?month=${month}&year=${year}`),
    });
}
// ─── Performance reviews ──────────────────────────────────────────────────────
export function usePerformanceReviews(employeeId) {
    const qs = employeeId ? `?employeeId=${employeeId}` : "";
    return useQuery({
        queryKey: ["performanceReviews", employeeId],
        queryFn: () => apiFetch(`/performance-reviews${qs}`),
    });
}
export function useCreatePerformanceReview() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiFetch("/performance-reviews", { method: "POST", body: JSON.stringify(data) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["performanceReviews"] }),
    });
}
export function useUpdatePerformanceReview() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) => apiFetch(`/performance-reviews/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["performanceReviews"] }),
    });
}
export function useDeletePerformanceReview() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiFetch(`/performance-reviews/${id}`, { method: "DELETE" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["performanceReviews"] }),
    });
}
// ─── Payroll adjustments ──────────────────────────────────────────────────────
export function usePayrollAdjustments(params) {
    const qs = new URLSearchParams();
    if (params?.employeeId)
        qs.set("employeeId", String(params.employeeId));
    if (params?.month)
        qs.set("month", String(params.month));
    if (params?.year)
        qs.set("year", String(params.year));
    const query = qs.toString();
    return useQuery({
        queryKey: ["payrollAdjustments", params],
        queryFn: () => apiFetch(`/payroll-adjustments${query ? "?" + query : ""}`),
    });
}
export function useAddPayrollAdjustment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiFetch("/payroll-adjustments", { method: "POST", body: JSON.stringify(data) }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["payrollAdjustments"] });
            qc.invalidateQueries({ queryKey: ["listPayroll"] });
        },
    });
}
export function useDeletePayrollAdjustment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiFetch(`/payroll-adjustments/${id}`, { method: "DELETE" }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["payrollAdjustments"] });
            qc.invalidateQueries({ queryKey: ["listPayroll"] });
        },
    });
}
export function useRegeneratePayroll() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiFetch(`/payroll/${id}/regenerate`, { method: "POST" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["listPayroll"] }),
    });
}
