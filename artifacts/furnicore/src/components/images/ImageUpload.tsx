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
import { type EntityType, useUploadImage, useBulkUploadImages } from "./useRecordImages";

interface ImageUploadProps {
  entityType: EntityType;
  entityId: number;
  maxFiles?: number;
  onUploaded?: () => void;
  /** Render a smaller inline upload button instead of the full drag-and-drop zone. */
  compact?: boolean;
  className?: string;
}

export function ImageUpload({ entityType, entityId, maxFiles = 1, onUploaded, compact, className }: ImageUploadProps) {
  const inputRef   = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const single = useUploadImage(entityType, entityId);
  const bulk   = useBulkUploadImages(entityType, entityId);
  const isPending = single.isPending || bulk.isPending;

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (maxFiles === 1) {
      const form = new FormData();
      form.append("image", files[0] as File);
      await single.mutateAsync(form);
    } else {
      const form = new FormData();
      Array.from(files).slice(0, maxFiles).forEach((f) => form.append("images", f));
      await bulk.mutateAsync(form);
    }
    onUploaded?.();
  }, [maxFiles, single, bulk, onUploaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple={maxFiles > 1}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          className={cn("w-full", className)}
          onClick={() => !isPending && inputRef.current?.click()}
        >
          {isPending
            ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Uploading…</>
            : <><Upload className="mr-1.5 h-3.5 w-3.5" />Upload image</>}
        </Button>
      </>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
        isPending && "pointer-events-none opacity-60",
        className,
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !isPending && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple={maxFiles > 1}
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {isPending ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Uploading…</p>
        </>
      ) : (
        <>
          <div className="rounded-full bg-muted p-3 group-hover:bg-primary/10 transition-colors">
            <ImagePlus className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">
              Drag &amp; drop {maxFiles > 1 ? `up to ${maxFiles} images` : "an image"} here
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">or click to browse — JPEG, PNG, WebP, GIF · max 8 MB each</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-1 pointer-events-none group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <Upload className="mr-1.5 h-3.5 w-3.5" />Browse
          </Button>
        </>
      )}
    </div>
  );
}
