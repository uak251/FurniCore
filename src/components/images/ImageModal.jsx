import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ImageModal — full-screen lightbox with Save, delete, and keyboard navigation.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Download, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resolvePublicAssetUrl } from "@/lib/image-url";
export function ImageModal({ images, initialIndex = 0, onClose, canDelete, onDelete }) {
    const [idx, setIdx] = useState(Math.min(initialIndex, Math.max(0, images.length - 1)));
    const [saveFeedback, setSaveFeedback] = useState(false);
    const saveFeedbackTimer = useRef(null);
    const current = images[idx];
    const prev = useCallback(() => setIdx((i) => (i > 0 ? i - 1 : images.length - 1)), [images.length]);
    const next = useCallback(() => setIdx((i) => (i < images.length - 1 ? i + 1 : 0)), [images.length]);
    useEffect(() => {
        setIdx(Math.min(initialIndex, Math.max(0, images.length - 1)));
    }, [initialIndex, images.length]);
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
    useEffect(() => {
        if (!saveFeedback)
            return;
        saveFeedbackTimer.current = window.setTimeout(() => setSaveFeedback(false), 2800);
        return () => {
            if (saveFeedbackTimer.current)
                window.clearTimeout(saveFeedbackTimer.current);
        };
    }, [saveFeedback]);
    const handleSaveImage = () => {
        if (!current)
            return;
        const url = resolvePublicAssetUrl(current.url);
        const name = current.originalName ?? current.filename ?? "image";
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setSaveFeedback(true);
    };
    if (!current)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm", onClick: onClose, children: _jsxs("div", { className: "relative flex max-h-[95vh] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-border/40 bg-background shadow-2xl", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5 sm:px-4", children: [_jsx("p", { className: "min-w-0 flex-1 text-sm font-medium tracking-tight text-foreground", children: _jsx("span", { className: "line-clamp-2", children: current.altText || current.originalName || current.filename }) }), _jsxs("div", { className: "ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2", children: [_jsxs(Badge, { variant: "secondary", className: "shrink-0 tabular-nums text-xs font-normal", children: [idx + 1, " / ", images.length] }), current.sizeBytes && (_jsxs(Badge, { variant: "outline", className: "hidden shrink-0 tabular-nums text-xs font-normal sm:inline-flex", children: [(current.sizeBytes / 1024).toFixed(0), " KB"] })), _jsxs(Button, { type: "button", size: "sm", variant: "default", className: "h-8 gap-1.5 px-3 shadow-sm", onClick: (e) => { e.stopPropagation(); handleSaveImage(); }, children: [_jsx(Download, { className: "h-3.5 w-3.5", "aria-hidden": true }), _jsx("span", { className: "hidden sm:inline", children: "Save image" }), _jsx("span", { className: "sm:hidden", children: "Save" })] }), canDelete && onDelete && (_jsx(Button, { type: "button", size: "icon", variant: "ghost", className: "h-8 w-8 text-destructive hover:text-destructive", "aria-label": "Delete image", onClick: () => { onDelete(current.id); if (images.length === 1)
                                onClose();
                            else
                                setIdx((i) => Math.max(0, i - 1)); }, children: _jsx(Trash2, { className: "h-4 w-4" }) })), _jsx(Button, { type: "button", size: "icon", variant: "ghost", className: "h-8 w-8", "aria-label": "Close", onClick: onClose, children: _jsx(X, { className: "h-4 w-4" }) })] })] }), _jsxs("div", { className: "relative flex min-h-[280px] items-center justify-center bg-muted/20 sm:min-h-[320px]", children: [images.length > 1 && (_jsx(Button, { type: "button", size: "icon", variant: "secondary", className: "absolute left-2 z-10 h-10 w-10 rounded-full shadow-md", onClick: prev, "aria-label": "Previous image", children: _jsx(ChevronLeft, { className: "h-5 w-5" }) })), _jsx("img", { src: resolvePublicAssetUrl(current.url), alt: current.altText ?? current.originalName ?? "", className: "max-h-[min(70vh,720px)] max-w-[min(88vw,1200px)] object-contain" }, current.id ?? current.url), images.length > 1 && (_jsx(Button, { type: "button", size: "icon", variant: "secondary", className: "absolute right-2 z-10 h-10 w-10 rounded-full shadow-md", onClick: next, "aria-label": "Next image", children: _jsx(ChevronRight, { className: "h-5 w-5" }) })), saveFeedback && (_jsxs("div", { className: cn("absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 border-t border-green-500/20 bg-green-500/10 px-4 py-3 text-sm font-medium text-green-800 dark:text-green-200", "animate-in slide-in-from-bottom-2 fade-in duration-300"), role: "status", children: [_jsx(CheckCircle2, { className: "h-5 w-5 shrink-0", "aria-hidden": true }), _jsx("span", { children: "Image saved \u2014 check your downloads folder" })] }))] }), images.length > 1 && (_jsx("div", { className: "flex gap-1.5 overflow-x-auto border-t border-border/60 bg-muted/20 p-2", children: images.map((img, i) => (_jsx("button", { type: "button", onClick: () => setIdx(i), className: cn("h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", i === idx ? "border-primary ring-1 ring-primary/30" : "border-transparent opacity-60 hover:opacity-100"), "aria-label": `Image ${i + 1}`, "aria-current": i === idx ? "true" : undefined, children: _jsx("img", { src: resolvePublicAssetUrl(img.url), alt: img.altText ?? "", className: "h-full w-full object-cover" }) }, img.id))) }))] }) }));
}
