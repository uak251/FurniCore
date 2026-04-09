import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ImageModal — full-screen lightbox for a single or navigable set of images.
 *
 * Usage:
 *   <ImageModal images={images} initialIndex={2} onClose={() => setOpen(false)} />
 */
import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resolvePublicAssetUrl } from "@/lib/image-url";
export function ImageModal({ images, initialIndex = 0, onClose, canDelete, onDelete }) {
    const [idx, setIdx] = useState(Math.min(initialIndex, images.length - 1));
    const current = images[idx];
    const prev = useCallback(() => setIdx((i) => (i > 0 ? i - 1 : images.length - 1)), [images.length]);
    const next = useCallback(() => setIdx((i) => (i < images.length - 1 ? i + 1 : 0)), [images.length]);
    // Keyboard navigation
    useEffect(() => {
        const handler = (e) => {
            if (e.key === "Escape")
                onClose();
            if (e.key === "ArrowLeft")
                prev();
            if (e.key === "ArrowRight")
                next();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose, prev, next]);
    if (!current)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm", onClick: onClose, children: _jsxs("div", { className: "relative flex max-h-[95vh] max-w-[95vw] flex-col overflow-hidden rounded-xl bg-background shadow-2xl", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "flex items-center justify-between border-b px-4 py-2.5", children: [_jsx("p", { className: "text-sm font-medium truncate max-w-[300px]", children: current.altText || current.originalName || current.filename }), _jsxs("div", { className: "flex items-center gap-1.5 shrink-0 ml-3", children: [_jsxs(Badge, { variant: "secondary", className: "text-xs", children: [idx + 1, " / ", images.length] }), current.sizeBytes && (_jsxs(Badge, { variant: "outline", className: "text-xs hidden sm:inline-flex", children: [(current.sizeBytes / 1024).toFixed(0), " KB"] })), _jsx("a", { href: resolvePublicAssetUrl(current.url), download: current.originalName ?? current.filename, target: "_blank", rel: "noopener noreferrer", onClick: (e) => e.stopPropagation(), children: _jsx(Button, { size: "icon", variant: "ghost", className: "h-7 w-7", children: _jsx(Download, { className: "h-3.5 w-3.5" }) }) }), canDelete && onDelete && (_jsx(Button, { size: "icon", variant: "ghost", className: "h-7 w-7 text-destructive hover:text-destructive", onClick: () => { onDelete(current.id); if (images.length === 1)
                                        onClose();
                                    else
                                        setIdx((i) => Math.max(0, i - 1)); }, children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })), _jsx(Button, { size: "icon", variant: "ghost", className: "h-7 w-7", onClick: onClose, children: _jsx(X, { className: "h-4 w-4" }) })] })] }), _jsxs("div", { className: "relative flex items-center justify-center bg-black/5 min-h-[300px]", children: [images.length > 1 && (_jsx(Button, { size: "icon", variant: "ghost", className: "absolute left-2 z-10 h-9 w-9 rounded-full bg-background/80 hover:bg-background", onClick: prev, children: _jsx(ChevronLeft, { className: "h-5 w-5" }) })), _jsx("img", { src: resolvePublicAssetUrl(current.url), alt: current.altText ?? current.originalName ?? "", className: "max-h-[70vh] max-w-[88vw] object-contain" }, current.id ?? current.url), images.length > 1 && (_jsx(Button, { size: "icon", variant: "ghost", className: "absolute right-2 z-10 h-9 w-9 rounded-full bg-background/80 hover:bg-background", onClick: next, children: _jsx(ChevronRight, { className: "h-5 w-5" }) }))] }), images.length > 1 && (_jsx("div", { className: "flex gap-1.5 overflow-x-auto border-t p-2", children: images.map((img, i) => (_jsx("button", { onClick: () => setIdx(i), className: cn("h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition-all", i === idx ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"), children: _jsx("img", { src: resolvePublicAssetUrl(img.url), alt: img.altText ?? "", className: "h-full w-full object-cover" }) }, img.id))) }))] }) }));
}
