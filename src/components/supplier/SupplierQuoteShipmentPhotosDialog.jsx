import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  useSupplierQuoteShipmentImages,
  useDeleteSupplierQuoteShipmentImage,
  useUploadSupplierQuoteShipmentImages,
} from "@/hooks/use-supplier-portal";
import { resolvePublicAssetUrl } from "@/lib/image-url";
import { Trash2, Upload } from "lucide-react";

/**
 * Lets a supplier attach packing list / vehicle / proof-of-delivery photos to an approved or paid quote.
 */
export function SupplierQuoteShipmentPhotosDialog({ quote, open, onOpenChange }) {
  const { toast } = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const quoteId = quote?.id;
  const { data: images = [], isLoading, refetch } = useSupplierQuoteShipmentImages(quoteId, open);
  const uploadMutation = useUploadSupplierQuoteShipmentImages(quoteId);
  const deleteMutation = useDeleteSupplierQuoteShipmentImage();

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !quoteId) return;
    setBusy(true);
    try {
      await uploadMutation.mutateAsync(files);
      await refetch();
      toast({ title: "Photos uploaded", description: `${files.length} file(s) saved to quote #${quoteId}.` });
    }
    catch (err) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload images.",
      });
    }
    finally {
      setBusy(false);
    }
  };

  const onDelete = async (imageId) => {
    setBusy(true);
    try {
      await deleteMutation.mutateAsync(imageId);
      await refetch();
      toast({ title: "Photo removed" });
    }
    catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Could not remove image.",
      });
    }
    finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Shipment & packing photos</DialogTitle>
        </DialogHeader>
        {quote ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Quote <span className="font-mono">#{quote.id}</span>
              {" — "}
              <span className="font-medium text-foreground">{quote.description}</span>
            </p>
            <Alert>
              <AlertDescription className="text-xs">
                Upload clear photos of packing, vehicle loading, or signed delivery notes. These support your delivery status updates in the Deliveries tab.
              </AlertDescription>
            </Alert>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={onPickFiles}
            />
            <Button
              type="button"
              variant="secondary"
              className="w-full gap-2"
              disabled={busy || uploadMutation.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-4 w-4" aria-hidden />
              Add photos (up to 10 per upload)
            </Button>
            {isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : images.length === 0 ? (
              <p className="text-muted-foreground">No photos yet.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {images.map((img) => (
                  <li key={img.id} className="group relative overflow-hidden rounded-md border bg-muted/30">
                    <img
                      src={resolvePublicAssetUrl(img.url)}
                      alt={img.originalName ?? "Shipment"}
                      className="aspect-square w-full object-cover"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute right-1 top-1 h-8 w-8 opacity-90 shadow"
                      disabled={busy || deleteMutation.isPending}
                      onClick={() => onDelete(img.id)}
                      aria-label="Delete photo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
