/**
 * RecordImagePanel — a drop-in panel used inside "detail" dialogs or
 * expanded rows across Products, Inventory, HR, and Payroll pages.
 *
 * Renders:
 *  - Primary image preview (largest, first in sort order)
 *  - Thumbnail strip
 *  - Upload zone  (canUpload = true)
 *  - Delete buttons (canDelete = true)
 */

import { ImageIcon } from "lucide-react";
import { resolvePublicAssetUrl } from "@/lib/image-url";
import { useEntityImages, type EntityType } from "./useRecordImages";
import { ImageGallery } from "./ImageGallery";

interface RecordImagePanelProps {
  entityType: EntityType;
  entityId: number;
  canUpload?: boolean;
  canDelete?: boolean;
  compact?: boolean;
}

export function RecordImagePanel({ entityType, entityId, canUpload, canDelete, compact }: RecordImagePanelProps) {
  const { data: images = [], isLoading } = useEntityImages(entityType, entityId);

  // Primary image thumbnail (first/lowest sortOrder)
  const primary = images.find((i) => i.sortOrder === 0) ?? images[0];

  return (
    <div className="space-y-3">
      {/* Large primary image */}
      {!isLoading && primary && !compact && (
        <div className="relative overflow-hidden rounded-xl border bg-muted/20 aspect-video">
          <img src={resolvePublicAssetUrl(primary.url)} alt={primary.altText ?? ""} className="h-full w-full object-contain" />
        </div>
      )}

      {/* Gallery grid + upload */}
      <ImageGallery
        entityType={entityType}
        entityId={entityId}
        images={images}
        isLoading={isLoading}
        canUpload={canUpload}
        canDelete={canDelete}
      />
    </div>
  );
}

/* ── Inline avatar/thumbnail for tables ─────────────────────────────────── */
export function RecordAvatar({ entityType, entityId, className }: { entityType: EntityType; entityId: number; className?: string }) {
  const { data: images = [] } = useEntityImages(entityType, entityId);
  const primary = images.find((i) => i.sortOrder === 0) ?? images[0];

  if (!primary) {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-muted ${className ?? "h-10 w-10"}`}>
        <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <img
      src={resolvePublicAssetUrl(primary.url)}
      alt={primary.altText ?? ""}
      className={`rounded-lg object-cover ${className ?? "h-10 w-10"}`}
      loading="lazy"
    />
  );
}
