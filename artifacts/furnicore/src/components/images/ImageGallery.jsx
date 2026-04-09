import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ImageGallery — compact thumbnail grid for a record or module-wide gallery.
 *
 * Two display modes:
 *   "grid"    — standard thumbnail grid (used in record detail panels)
 *   "module"  — grouped gallery indexed by entity, with entity name headings
 *               (used for bulk gallery view of a whole module)
 */
import { useState } from "react";
import { ImageIcon, Star, Trash2, UploadCloud, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { resolvePublicAssetUrl } from "@/lib/image-url";
import { ImageModal } from "./ImageModal";
import { ImageUpload } from "./ImageUpload";
import { useDeleteImage, useSetPrimaryImage } from "./useRecordImages";
/* ── helpers ─────────────────────────────────────────────────────────────── */
function humanSize(bytes) {
    if (!bytes)
        return "";
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
/* ── ImageThumbnail ──────────────────────────────────────────────────────── */
function ImageThumbnail({ image, index, onOpen, canDelete, onDelete, canReorder, onSetPrimary, }) {
    return (_jsxs("div", { className: "group relative overflow-hidden rounded-lg border bg-muted/30 aspect-square", children: [_jsx("img", { src: resolvePublicAssetUrl(image.url), alt: image.altText ?? image.originalName ?? "", className: "h-full w-full object-cover transition-transform group-hover:scale-105", loading: "lazy" }), image.sortOrder === 0 && index === 0 && (_jsxs(Badge, { className: "absolute top-1 left-1 text-[10px] px-1 py-0 bg-amber-500 text-white border-0", children: [_jsx(Star, { className: "mr-0.5 h-2.5 w-2.5 fill-current" }), "Cover"] })), _jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 group-hover:bg-black/40 transition-colors", children: [_jsxs("div", { className: "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity", children: [_jsx(Button, { size: "icon", variant: "secondary", className: "h-7 w-7", onClick: (e) => { e.stopPropagation(); onOpen(); }, children: _jsx(ZoomIn, { className: "h-3.5 w-3.5" }) }), canReorder && index !== 0 && (_jsx(Button, { size: "icon", variant: "secondary", className: "h-7 w-7", title: "Set as cover", onClick: (e) => { e.stopPropagation(); onSetPrimary(image.id); }, children: _jsx(Star, { className: "h-3.5 w-3.5" }) })), canDelete && (_jsx(Button, { size: "icon", variant: "secondary", className: "h-7 w-7 text-destructive", onClick: (e) => { e.stopPropagation(); onDelete(image.id); }, children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) }))] }), image.sizeBytes && (_jsx("p", { className: "text-[10px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity", children: humanSize(image.sizeBytes) }))] })] }));
}
export function ImageGallery({ entityType, entityId, images, isLoading, canUpload, canDelete, className }) {
    const [lightboxIdx, setLightboxIdx] = useState(null);
    const deleteMut = useDeleteImage(entityType, entityId);
    const reorderMut = useSetPrimaryImage(entityType, entityId);
    const handleDelete = (id) => deleteMut.mutate(id);
    const handlePrimary = (id) => {
        const prev = images.find((i) => i.sortOrder === 0);
        if (prev)
            reorderMut.mutate({ id: prev.id, sortOrder: 1 });
        reorderMut.mutate({ id, sortOrder: 0 });
    };
    return (_jsxs("div", { className: cn("space-y-3", className), children: [_jsxs("div", { className: "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5", children: [isLoading
                        ? Array.from({ length: 4 }).map((_, i) => _jsx(Skeleton, { className: "aspect-square rounded-lg" }, i))
                        : images.map((img, i) => (_jsx(ImageThumbnail, { image: img, index: i, onOpen: () => setLightboxIdx(i), canDelete: !!canDelete, onDelete: handleDelete, canReorder: !!canDelete, onSetPrimary: handlePrimary }, img.id))), !isLoading && images.length === 0 && !canUpload && (_jsxs("div", { className: "col-span-full flex flex-col items-center gap-2 py-8 text-center text-muted-foreground", children: [_jsx(ImageIcon, { className: "h-8 w-8 opacity-40" }), _jsx("p", { className: "text-sm", children: "No images attached." })] }))] }), canUpload && (_jsx(ImageUpload, { entityType: entityType, entityId: entityId, maxFiles: 10 })), lightboxIdx !== null && images.length > 0 && (_jsx(ImageModal, { images: images, initialIndex: lightboxIdx, onClose: () => setLightboxIdx(null), canDelete: canDelete, onDelete: (id) => { handleDelete(id); setLightboxIdx(null); } }))] }));
}
export function ModuleGallery({ entityType, images, isLoading, canDelete, canUpload, entityLabels, entityIds, emptyListHint, className, }) {
    const [lightboxImages, setLightboxImages] = useState(null);
    const [lightboxIdx, setLightboxIdx] = useState(0);
    const deleteMut = useDeleteImage(entityType);
    // Group by entityId
    const groups = images.reduce((acc, img) => {
        (acc[img.entityId] ??= []).push(img);
        return acc;
    }, {});
    // Merge ids from images + caller-supplied list (so empty items still show upload zone)
    const allIds = Array.from(new Set([
        ...(entityIds ?? []),
        ...Object.keys(groups).map(Number),
    ]));
    const openLightbox = (imgs, idx) => { setLightboxImages(imgs); setLightboxIdx(idx); };
    if (isLoading) {
        return (_jsx("div", { className: "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5", children: Array.from({ length: 10 }).map((_, i) => _jsx(Skeleton, { className: "aspect-square rounded-lg" }, i)) }));
    }
    if (!images.length && !canUpload) {
        return (_jsxs("div", { className: "flex flex-col items-center gap-3 py-16 text-center text-muted-foreground", children: [_jsx(UploadCloud, { className: "h-10 w-10 opacity-30" }), _jsx("p", { className: "text-sm", children: "No images in this module yet. Open a record to upload images." })] }));
    }
    return (_jsxs("div", { className: cn("space-y-6", className), children: [allIds.map((eid) => {
                const imgs = groups[eid] ?? [];
                const label = entityLabels?.[eid] ?? `#${eid}`;
                return (_jsxs("div", { className: "rounded-lg border bg-card p-3 space-y-2", children: [_jsx("p", { className: "text-xs font-semibold text-muted-foreground uppercase tracking-wider", children: label }), imgs.length > 0 && (_jsx("div", { className: "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8", children: imgs.map((img, i) => (_jsx(ImageThumbnail, { image: img, index: i, onOpen: () => openLightbox(imgs, i), canDelete: !!canDelete, onDelete: (id) => deleteMut.mutate(id), canReorder: false, onSetPrimary: () => { } }, img.id))) })), canUpload && (_jsx(ImageUpload, { entityType: entityType, entityId: eid, maxFiles: 10, compact: true }))] }, eid));
            }), !allIds.length && canUpload && (_jsxs("div", { className: "flex flex-col items-center gap-3 py-16 text-center text-muted-foreground", children: [_jsx(UploadCloud, { className: "h-10 w-10 opacity-30" }), _jsx("p", { className: "text-sm", children: emptyListHint ?? "No items found. Add records first." })] })), lightboxImages && (_jsx(ImageModal, { images: lightboxImages, initialIndex: lightboxIdx, onClose: () => setLightboxImages(null), canDelete: canDelete, onDelete: (id) => deleteMut.mutate(id) }))] }));
}
