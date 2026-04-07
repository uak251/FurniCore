/**
 * ImageGallery — compact thumbnail grid for a record or module-wide gallery.
 *
 * Two display modes:
 *   "grid"    — standard thumbnail grid (used in record detail panels)
 *   "module"  — grouped gallery indexed by entity, with entity name headings
 *               (used for bulk gallery view of a whole module)
 */

import { useState } from "react";
import { ImageIcon, Star, Trash2, Loader2, UploadCloud, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ImageModal } from "./ImageModal";
import { ImageUpload } from "./ImageUpload";
import { useDeleteImage, useSetPrimaryImage, type EntityType, type RecordImage } from "./useRecordImages";

/* ── helpers ─────────────────────────────────────────────────────────────── */
function humanSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ── ImageThumbnail ──────────────────────────────────────────────────────── */
function ImageThumbnail({
  image, index, onOpen, canDelete, onDelete, canReorder, onSetPrimary,
}: {
  image: RecordImage; index: number; onOpen: () => void;
  canDelete: boolean; onDelete: (id: number) => void;
  canReorder: boolean; onSetPrimary: (id: number) => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-muted/30 aspect-square">
      <img
        src={image.url}
        alt={image.altText ?? image.originalName ?? ""}
        className="h-full w-full object-cover transition-transform group-hover:scale-105"
        loading="lazy"
      />

      {/* Sort badge */}
      {image.sortOrder === 0 && index === 0 && (
        <Badge className="absolute top-1 left-1 text-[10px] px-1 py-0 bg-amber-500 text-white border-0">
          <Star className="mr-0.5 h-2.5 w-2.5 fill-current" />Cover
        </Badge>
      )}

      {/* Overlay controls */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 group-hover:bg-black/40 transition-colors">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="icon" variant="secondary" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          {canReorder && index !== 0 && (
            <Button size="icon" variant="secondary" className="h-7 w-7" title="Set as cover" onClick={(e) => { e.stopPropagation(); onSetPrimary(image.id); }}>
              <Star className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button size="icon" variant="secondary" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {image.sizeBytes && (
          <p className="text-[10px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">{humanSize(image.sizeBytes)}</p>
        )}
      </div>
    </div>
  );
}

/* ── ImageGallery — record-level ─────────────────────────────────────────── */
interface ImageGalleryProps {
  entityType: EntityType;
  entityId: number;
  images: RecordImage[];
  isLoading?: boolean;
  canUpload?: boolean;
  canDelete?: boolean;
  className?: string;
}

export function ImageGallery({ entityType, entityId, images, isLoading, canUpload, canDelete, className }: ImageGalleryProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const deleteMut   = useDeleteImage(entityType, entityId);
  const reorderMut  = useSetPrimaryImage(entityType, entityId);

  const handleDelete = (id: number) => deleteMut.mutate(id);
  const handlePrimary = (id: number) => {
    const prev = images.find((i) => i.sortOrder === 0);
    if (prev) reorderMut.mutate({ id: prev.id, sortOrder: 1 });
    reorderMut.mutate({ id, sortOrder: 0 });
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)
          : images.map((img, i) => (
            <ImageThumbnail
              key={img.id} image={img} index={i}
              onOpen={() => setLightboxIdx(i)}
              canDelete={!!canDelete} onDelete={handleDelete}
              canReorder={!!canDelete} onSetPrimary={handlePrimary}
            />
          ))
        }
        {!isLoading && images.length === 0 && !canUpload && (
          <div className="col-span-full flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-40" />
            <p className="text-sm">No images attached.</p>
          </div>
        )}
      </div>

      {/* Upload zone */}
      {canUpload && (
        <ImageUpload entityType={entityType} entityId={entityId} maxFiles={10} />
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && images.length > 0 && (
        <ImageModal
          images={images}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          canDelete={canDelete}
          onDelete={(id) => { handleDelete(id); setLightboxIdx(null); }}
        />
      )}
    </div>
  );
}

/* ── ModuleGallery — full-module gallery view (bulk) ─────────────────────── */
interface ModuleGalleryProps {
  entityType: EntityType;
  images: RecordImage[];
  isLoading?: boolean;
  canDelete?: boolean;
  /** Map from entityId → display name/label */
  entityLabels?: Record<number, string>;
  className?: string;
}

export function ModuleGallery({ entityType, images, isLoading, canDelete, entityLabels, className }: ModuleGalleryProps) {
  const [lightboxImages, setLightboxImages] = useState<RecordImage[] | null>(null);
  const [lightboxIdx,    setLightboxIdx]    = useState(0);
  const deleteMut = useDeleteImage(entityType);

  // Group by entityId
  const groups = images.reduce<Record<number, RecordImage[]>>((acc, img) => {
    (acc[img.entityId] ??= []).push(img);
    return acc;
  }, {});

  const openLightbox = (imgs: RecordImage[], idx: number) => { setLightboxImages(imgs); setLightboxIdx(idx); };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
      </div>
    );
  }

  if (!images.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
        <UploadCloud className="h-10 w-10 opacity-30" />
        <p className="text-sm">No images in this module yet. Open a record to upload images.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {Object.entries(groups).map(([eid, imgs]) => {
        const label = entityLabels?.[Number(eid)] ?? `#${eid}`;
        return (
          <div key={eid}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {imgs.map((img, i) => (
                <ImageThumbnail
                  key={img.id} image={img} index={i}
                  onOpen={() => openLightbox(imgs, i)}
                  canDelete={!!canDelete} onDelete={(id) => deleteMut.mutate(id)}
                  canReorder={false} onSetPrimary={() => {}}
                />
              ))}
            </div>
          </div>
        );
      })}

      {lightboxImages && (
        <ImageModal
          images={lightboxImages}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxImages(null)}
          canDelete={canDelete}
          onDelete={(id) => deleteMut.mutate(id)}
        />
      )}
    </div>
  );
}
