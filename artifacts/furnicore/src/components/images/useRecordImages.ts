/**
 * React Query hooks for the record-images API.
 *
 * Uses the same `customFetch` + `setBaseUrl` as generated API hooks so URLs match
 * (avoids HTTP 404 when VITE_API_URL mistakenly includes `/api` — which would
 * produce `/api/api/images/...`).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";

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

/**
 * Inventory bulk upload — must match Express route in `api-server/src/routes/images.ts`:
 * `router.post("/images/inventory/:id/bulk", …)` under `app.use("/api", router)`.
 * Full URL: `POST /api/images/inventory/:id/bulk` — multipart field name `images` (Multer `uploadMulti`).
 */
export function getInventoryBulkImageUploadApiPath(inventoryItemId: number): string {
  return `/api/images/inventory/${inventoryItemId}/bulk`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData =
    typeof FormData !== "undefined" && init?.body != null && init.body instanceof FormData;
  const headers = new Headers(init?.headers);
  if (isFormData) {
    headers.delete("Content-Type");
  }
  return customFetch<T>(path, {
    ...init,
    headers,
    responseType: "json",
  });
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
      apiFetch(
        entityType === "inventory"
          ? getInventoryBulkImageUploadApiPath(entityId)
          : `/api/images/${entityType}/${entityId}/bulk`,
        {
          method: "POST",
          body: form,
        },
      ),
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
