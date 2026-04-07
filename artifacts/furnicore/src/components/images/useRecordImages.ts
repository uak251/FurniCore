/**
 * React Query hooks for the record-images API.
 *
 * All requests send Authorization: Bearer (required by the API). Optional
 * VITE_API_URL prefixes paths when the UI and API run on different origins.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/auth";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

export type EntityType = "product" | "inventory" | "employee" | "payroll" | "supplier";

export interface RecordImage {
  id: number;
  entityType: string;
  entityId: number;
  filename: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string;
  altText: string | null;
  sortOrder: number | null;
  uploadedBy: number | null;
  createdAt: string | null;
}

function resolveApiPath(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

function mergeAuthHeaders(init?: HeadersInit): Headers {
  const h = new Headers(init);
  const token = getAuthToken();
  if (token) h.set("Authorization", `Bearer ${token}`);
  return h;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = resolveApiPath(path);
  const isFormData =
    typeof FormData !== "undefined" && init?.body != null && init.body instanceof FormData;
  const headers = mergeAuthHeaders(init?.headers);
  /* multipart/form-data must set boundary automatically — never send application/json */
  if (isFormData) {
    headers.delete("Content-Type");
  }
  const r = await fetch(url, { credentials: "include", ...init, headers });
  if (!r.ok) {
    const e = await r.json().catch(() => ({})) as { message?: string; error?: string };
    const msg = e.message ?? e.error ?? `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

/* ── hooks ───────────────────────────────────────────────────────────────── */

export function useEntityImages(entityType: EntityType, entityId: number | null | undefined) {
  return useQuery<RecordImage[]>({
    queryKey: ["images", entityType, entityId],
    queryFn:  () => apiFetch(`/api/images/${entityType}/${entityId}`),
    enabled:  entityId != null,
  });
}

export function useModuleImages(entityType: EntityType) {
  return useQuery<RecordImage[]>({
    queryKey: ["images", entityType],
    queryFn:  () => apiFetch(`/api/images/${entityType}`),
  });
}

export function useUploadImage(entityType: EntityType, entityId: number) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation<RecordImage, Error, FormData>({
    mutationFn: (form) =>
      apiFetch(`/api/images/${entityType}/${entityId}`, {
        method: "POST",
        body: form,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["images", entityType, entityId] });
      qc.invalidateQueries({ queryKey: ["images", entityType] });
      toast({ title: "Image uploaded" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Upload failed", description: e.message }),
  });
}

export function useBulkUploadImages(entityType: EntityType, entityId: number) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation<RecordImage[], Error, FormData>({
    mutationFn: (form) =>
      apiFetch(`/api/images/${entityType}/${entityId}/bulk`, {
        method: "POST",
        body: form,
      }),
    onSuccess: (imgs) => {
      qc.invalidateQueries({ queryKey: ["images", entityType, entityId] });
      qc.invalidateQueries({ queryKey: ["images", entityType] });
      toast({ title: `${imgs.length} image${imgs.length !== 1 ? "s" : ""} uploaded` });
    },
    onError: (e) => toast({ variant: "destructive", title: "Upload failed", description: e.message }),
  });
}

export function useDeleteImage(entityType: EntityType, entityId?: number) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation<void, Error, number>({
    mutationFn: (id) => apiFetch(`/api/images/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["images", entityType] });
      if (entityId != null) qc.invalidateQueries({ queryKey: ["images", entityType, entityId] });
      toast({ title: "Image deleted" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Delete failed", description: e.message }),
  });
}

export function useSetPrimaryImage(entityType: EntityType, entityId: number) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation<void, Error, { id: number; sortOrder: number }>({
    mutationFn: ({ id, sortOrder }) =>
      apiFetch(`/api/images/${id}/sort-order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["images", entityType, entityId] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Reorder failed", description: e.message }),
  });
}
