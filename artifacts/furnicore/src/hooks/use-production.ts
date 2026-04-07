/**
 * React Query hooks for the Production Manager portal.
 * Covers: production orders, QC remarks, material usage.
 *
 * All hooks use @tanstack/react-query directly (no orval-generated client)
 * because these endpoints were added after the initial code generation.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

// ─── Shared fetch util ────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken() ?? ""}`,
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as unknown as T;
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json as T;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProductionOrder {
  id: number;
  orderNumber: string;
  taskId: number | null;
  productId: number;
  quantity: number;
  targetDate: string | null;
  status: "planned" | "in_production" | "quality_check" | "completed" | "cancelled";
  notes: string | null;
  createdBy: number | null;
  createdByName: string | null;
  productName: string | null;
  taskTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QcRemark {
  id: number;
  taskId: number;
  taskTitle: string | null;
  inspectorId: number | null;
  inspectorName: string | null;
  result: "pass" | "fail" | "hold";
  remarks: string;
  visibleToCustomer: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialUsageRecord {
  id: number;
  taskId: number;
  taskTitle: string | null;
  inventoryItemId: number | null;
  materialName: string;
  quantityUsed: number;
  unit: string;
  notes: string | null;
  loggedBy: number | null;
  loggedByName: string | null;
  createdAt: string;
}

// ─── Production Orders ────────────────────────────────────────────────────────

export function useProductionOrders() {
  return useQuery<ProductionOrder[]>({
    queryKey: ["productionOrders"],
    queryFn: () => apiFetch("/production-orders"),
  });
}

export function useCreateProductionOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProductionOrder> & { productId: number }) =>
      apiFetch<ProductionOrder>("/production-orders", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productionOrders"] }),
  });
}

export function useUpdateProductionOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ProductionOrder> }) =>
      apiFetch<ProductionOrder>(`/production-orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productionOrders"] }),
  });
}

export function useDeleteProductionOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/production-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productionOrders"] }),
  });
}

// ─── QC Remarks ───────────────────────────────────────────────────────────────

export function useQcRemarks(taskId?: number) {
  return useQuery<QcRemark[]>({
    queryKey: ["qcRemarks", taskId ?? "all"],
    queryFn: () =>
      apiFetch(`/qc-remarks${taskId ? `?taskId=${taskId}` : ""}`),
  });
}

export function usePublicQcRemarks(taskId?: number) {
  return useQuery<QcRemark[]>({
    queryKey: ["qcRemarksPublic", taskId ?? "all"],
    queryFn: () =>
      apiFetch(`/qc-remarks/public${taskId ? `?taskId=${taskId}` : ""}`),
  });
}

export function useCreateQcRemark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      taskId: number;
      result: "pass" | "fail" | "hold";
      remarks: string;
      visibleToCustomer: boolean;
    }) =>
      apiFetch<QcRemark>("/qc-remarks", {
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
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: { result?: string; remarks?: string; visibleToCustomer?: boolean };
    }) =>
      apiFetch<QcRemark>(`/qc-remarks/${id}`, {
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
    mutationFn: (id: number) =>
      apiFetch(`/qc-remarks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qcRemarks"] });
      qc.invalidateQueries({ queryKey: ["qcRemarksPublic"] });
    },
  });
}

// ─── Material Usage ───────────────────────────────────────────────────────────

export function useMaterialUsage(taskId?: number) {
  return useQuery<MaterialUsageRecord[]>({
    queryKey: ["materialUsage", taskId ?? "all"],
    queryFn: () =>
      apiFetch(`/material-usage${taskId ? `?taskId=${taskId}` : ""}`),
  });
}

export function useCreateMaterialUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      taskId: number;
      inventoryItemId?: number;
      materialName: string;
      quantityUsed: number;
      unit: string;
      notes?: string;
    }) =>
      apiFetch<MaterialUsageRecord>("/material-usage", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["materialUsage"] }),
  });
}

export function useDeleteMaterialUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/material-usage/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["materialUsage"] }),
  });
}
