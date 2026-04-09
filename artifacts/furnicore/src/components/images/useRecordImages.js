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
/**
 * Inventory bulk upload — must match Express route in `api-server/src/routes/images.js`:
 * `router.post("/images/inventory/:id/bulk", …)` under `app.use("/api", router)`.
 * Full URL: `POST /api/images/inventory/:id/bulk` — multipart field name `images` (Multer `uploadMulti`).
 */
export function getInventoryBulkImageUploadApiPath(inventoryItemId) {
    return `/api/images/inventory/${inventoryItemId}/bulk`;
}
async function apiFetch(path, init) {
    const isFormData = typeof FormData !== "undefined" && init?.body != null && init.body instanceof FormData;
    const headers = new Headers(init?.headers);
    if (isFormData) {
        headers.delete("Content-Type");
    }
    return customFetch(path, {
        ...init,
        headers,
        responseType: "json",
    });
}
/* ── hooks ───────────────────────────────────────────────────────────────── */
export function useEntityImages(entityType, entityId) {
    return useQuery({
        queryKey: ["images", entityType, entityId],
        queryFn: () => apiFetch(`/api/images/${entityType}/${entityId}`),
        enabled: entityId != null,
    });
}
export function useModuleImages(entityType) {
    return useQuery({
        queryKey: ["images", entityType],
        queryFn: () => apiFetch(`/api/images/${entityType}`),
    });
}
export function useUploadImage(entityType, entityId) {
    const qc = useQueryClient();
    const { toast } = useToast();
    return useMutation({
        mutationFn: (form) => apiFetch(`/api/images/${entityType}/${entityId}`, {
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
export function useBulkUploadImages(entityType, entityId) {
    const qc = useQueryClient();
    const { toast } = useToast();
    return useMutation({
        mutationFn: (form) => apiFetch(entityType === "inventory"
            ? getInventoryBulkImageUploadApiPath(entityId)
            : `/api/images/${entityType}/${entityId}/bulk`, {
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
export function useDeleteImage(entityType, entityId) {
    const qc = useQueryClient();
    const { toast } = useToast();
    return useMutation({
        mutationFn: (id) => apiFetch(`/api/images/${id}`, { method: "DELETE" }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["images", entityType] });
            if (entityId != null)
                qc.invalidateQueries({ queryKey: ["images", entityType, entityId] });
            toast({ title: "Image deleted" });
        },
        onError: (e) => toast({ variant: "destructive", title: "Delete failed", description: e.message }),
    });
}
export function useSetPrimaryImage(entityType, entityId) {
    const qc = useQueryClient();
    const { toast } = useToast();
    return useMutation({
        mutationFn: ({ id, sortOrder }) => apiFetch(`/api/images/${id}/sort-order`, {
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
