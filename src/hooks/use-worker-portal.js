/**
 * React Query hooks for the Worker Portal.
 * All data is automatically scoped to the authenticated worker — the backend
 * derives the employee/task scope from the JWT, never from URL params.
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
/* ─── Hooks ──────────────────────────────────────────────────────────────── */
export function useWorkerMe() {
    return useQuery({
        queryKey: ["workerMe"],
        queryFn: () => apiFetch("/worker-portal/me"),
    });
}
export function useWorkerTasks() {
    return useQuery({
        queryKey: ["workerTasks"],
        queryFn: () => apiFetch("/worker-portal/tasks"),
        refetchInterval: 60_000, // poll every minute for new assignments
    });
}
export function useUpdateWorkerTask() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) => apiFetch(`/worker-portal/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["workerTasks"] }),
    });
}
export function useWorkerAttendance(month, year) {
    return useQuery({
        queryKey: ["workerAttendance", month, year],
        queryFn: () => apiFetch(`/worker-portal/attendance?month=${month}&year=${year}`),
    });
}
export function useWorkerPayroll() {
    return useQuery({
        queryKey: ["workerPayroll"],
        queryFn: () => apiFetch("/worker-portal/payroll"),
    });
}
