import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ImageUpload — drag-and-drop + click-to-browse file picker.
 *
 * Props:
 *   entityType  : "product" | "inventory" | "employee" | "payroll"
 *   entityId    : numeric primary key of the record
 *   maxFiles    : 1 → single upload dialog, >1 → bulk upload (default 1)
 *   onUploaded  : optional callback when upload(s) complete
 */
import { useRef, useState, useCallback } from "react";
import { Upload, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUploadImage, useBulkUploadImages } from "./useRecordImages";
export function ImageUpload({ entityType, entityId, maxFiles = 1, onUploaded, compact, className }) {
    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const single = useUploadImage(entityType, entityId);
    const bulk = useBulkUploadImages(entityType, entityId);
    const isPending = single.isPending || bulk.isPending;
    const handleFiles = useCallback(async (files) => {
        if (!files || files.length === 0)
            return;
        if (maxFiles === 1) {
            const form = new FormData();
            form.append("image", files[0]);
            await single.mutateAsync(form);
        }
        else {
            const form = new FormData();
            Array.from(files).slice(0, maxFiles).forEach((f) => form.append("images", f));
            await bulk.mutateAsync(form);
        }
        onUploaded?.();
    }, [maxFiles, single, bulk, onUploaded]);
    const onDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
    }, [handleFiles]);
    if (compact) {
        return (_jsxs(_Fragment, { children: [_jsx("input", { ref: inputRef, type: "file", accept: "image/jpeg,image/png,image/webp,image/gif", multiple: maxFiles > 1, className: "sr-only", onChange: (e) => handleFiles(e.target.files) }), _jsx(Button, { type: "button", variant: "outline", size: "sm", disabled: isPending, className: cn("w-full", className), onClick: () => !isPending && inputRef.current?.click(), children: isPending
                        ? _jsxs(_Fragment, { children: [_jsx(Loader2, { className: "mr-1.5 h-3.5 w-3.5 animate-spin" }), "Uploading\u2026"] })
                        : _jsxs(_Fragment, { children: [_jsx(Upload, { className: "mr-1.5 h-3.5 w-3.5" }), "Upload image"] }) })] }));
    }
    return (_jsxs("div", { className: cn("group relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors", dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30", isPending && "pointer-events-none opacity-60", className), onDragOver: (e) => { e.preventDefault(); setDragging(true); }, onDragLeave: () => setDragging(false), onDrop: onDrop, onClick: () => !isPending && inputRef.current?.click(), children: [_jsx("input", { ref: inputRef, type: "file", accept: "image/jpeg,image/png,image/webp,image/gif", multiple: maxFiles > 1, className: "sr-only", onChange: (e) => handleFiles(e.target.files) }), isPending ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-8 w-8 animate-spin text-primary" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Uploading\u2026" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "rounded-full bg-muted p-3 group-hover:bg-primary/10 transition-colors", children: _jsx(ImagePlus, { className: "h-6 w-6 text-muted-foreground group-hover:text-primary" }) }), _jsxs("div", { children: [_jsxs("p", { className: "text-sm font-medium", children: ["Drag & drop ", maxFiles > 1 ? `up to ${maxFiles} images` : "an image", " here"] }), _jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: "or click to browse \u2014 JPEG, PNG, WebP, GIF \u00B7 max 8 MB each" })] }), _jsxs(Button, { type: "button", variant: "outline", size: "sm", className: "mt-1 pointer-events-none group-hover:bg-primary group-hover:text-primary-foreground transition-colors", children: [_jsx(Upload, { className: "mr-1.5 h-3.5 w-3.5" }), "Browse"] })] }))] }));
}
