/**
 * Images API — polymorphic image upload, listing, and deletion
 *
 * Supported entityType values: product | inventory | employee | payroll
 *
 * UPLOAD:
 *   POST /images/:entityType/:entityId          — single image  (multipart/form-data, field "image")
 *   POST /images/:entityType/:entityId/bulk     — up to 10 images (field "images")
 *
 * LIST:
 *   GET  /images/:entityType/:entityId          — all images for a record
 *   GET  /images/:entityType                    — all images for a whole module (gallery view)
 *
 * DELETE:
 *   DELETE /images/:id                          — delete by image id (admin / relevant manager)
 *
 * REORDER:
 *   PATCH  /images/:id/sort-order               — update sortOrder (set primary)
 *
 * RBAC:
 *   Upload / delete : admin, manager
 *   View            : any authenticated user
 */

import { Router, type IRouter, type NextFunction, type Request } from "express";
import { eq, and, asc } from "drizzle-orm";
import { unlink } from "fs/promises";
import { join } from "path";
import { db, recordImagesTable } from "@workspace/db";
import { authenticate, requireRole, AuthRequest } from "../middlewares/authenticate";
import { uploadSingle, uploadMulti, UPLOADS_ROOT } from "../middlewares/upload";
import { logActivity } from "../lib/activityLogger";

const router: IRouter = Router();

const VALID_ENTITY_TYPES = new Set(["product","inventory","employee","payroll"]);

function validateEntityType(req: Request, res: any): boolean {
  const { entityType } = req.params as any;
  if (!VALID_ENTITY_TYPES.has(entityType)) {
    res.status(400).json({ error: "INVALID_ENTITY_TYPE", message: `entityType must be one of: ${[...VALID_ENTITY_TYPES].join(", ")}` });
    return false;
  }
  return true;
}

function publicUrl(entityType: string, filename: string): string {
  return `/uploads/${entityType}/${filename}`;
}

/* ── GET /images/:entityType/:entityId ────────────────────────────────────── */
router.get("/images/:entityType/:entityId", authenticate, async (req, res, next: NextFunction): Promise<void> => {
  if (!validateEntityType(req, res)) return;
  const entityId = parseInt((req.params as any).entityId, 10);
  if (isNaN(entityId)) { res.status(400).json({ error: "INVALID_ID" }); return; }
  try {
    const rows = await db.select().from(recordImagesTable)
      .where(and(eq(recordImagesTable.entityType, (req.params as any).entityType), eq(recordImagesTable.entityId, entityId)))
      .orderBy(asc(recordImagesTable.sortOrder), asc(recordImagesTable.createdAt));
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── GET /images/:entityType — module gallery ─────────────────────────────── */
router.get("/images/:entityType", authenticate, async (req, res, next: NextFunction): Promise<void> => {
  if (!validateEntityType(req, res)) return;
  try {
    const rows = await db.select().from(recordImagesTable)
      .where(eq(recordImagesTable.entityType, (req.params as any).entityType))
      .orderBy(asc(recordImagesTable.entityId), asc(recordImagesTable.sortOrder));
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── POST /images/:entityType/:entityId — single upload ──────────────────── */
router.post(
  "/images/:entityType/:entityId",
  authenticate,
  requireRole("admin", "manager"),
  (req, res, next) => {
    if (!validateEntityType(req, res)) return;
    uploadSingle(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: "UPLOAD_ERROR", message: (err as Error).message });
        return;
      }
      next();
    });
  },
  async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
    const { entityType, entityId } = req.params as any;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) { res.status(400).json({ error: "NO_FILE", message: "No image file received." }); return; }

    const altText = (req.body as any).altText ?? null;

    try {
      const [row] = await db.insert(recordImagesTable).values({
        entityType, entityId: parseInt(entityId, 10),
        filename:     file.filename,
        originalName: file.originalname,
        mimeType:     file.mimetype,
        sizeBytes:    file.size,
        url:          publicUrl(entityType, file.filename),
        altText,
        sortOrder:    0,
        uploadedBy:   (req as AuthRequest).user?.id,
      }).returning();
      await logActivity({ userId: (req as AuthRequest).user?.id, action: "CREATE", module: "images", description: `Uploaded image for ${entityType} #${entityId}: ${file.originalname}` });
      res.status(201).json(row);
    } catch (err) { next(err); }
  }
);

/* ── POST /images/:entityType/:entityId/bulk — multi-upload ──────────────── */
router.post(
  "/images/:entityType/:entityId/bulk",
  authenticate,
  requireRole("admin", "manager"),
  (req, res, next) => {
    if (!validateEntityType(req, res)) return;
    uploadMulti(req, res, (err) => {
      if (err) { res.status(400).json({ error: "UPLOAD_ERROR", message: (err as Error).message }); return; }
      next();
    });
  },
  async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
    const { entityType, entityId } = req.params as any;
    const files = ((req as any).files ?? []) as Express.Multer.File[];
    if (!files.length) { res.status(400).json({ error: "NO_FILES" }); return; }

    try {
      const inserted = await db.insert(recordImagesTable).values(
        files.map((f, idx) => ({
          entityType, entityId: parseInt(entityId, 10),
          filename:     f.filename,
          originalName: f.originalname,
          mimeType:     f.mimetype,
          sizeBytes:    f.size,
          url:          publicUrl(entityType, f.filename),
          sortOrder:    idx,
          uploadedBy:   req.user?.id,
        }))
      ).returning();
      await logActivity({ userId: req.user?.id, action: "CREATE", module: "images", description: `Bulk-uploaded ${inserted.length} images for ${entityType} #${entityId}` });
      res.status(201).json(inserted);
    } catch (err) { next(err); }
  }
);

/* ── PATCH /images/:id/sort-order ─────────────────────────────────────────── */
router.patch("/images/:id/sort-order", authenticate, requireRole("admin", "manager"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const id = parseInt((req.params as any).id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
  const { sortOrder } = req.body as { sortOrder: number };
  if (typeof sortOrder !== "number") { res.status(400).json({ error: "VALIDATION_ERROR", message: "sortOrder must be a number" }); return; }
  try {
    const [row] = await db.update(recordImagesTable).set({ sortOrder }).where(eq(recordImagesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});

/* ── PATCH /images/:id/alt-text ──────────────────────────────────────────── */
router.patch("/images/:id/alt-text", authenticate, requireRole("admin", "manager"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const id = parseInt((req.params as any).id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
  const { altText } = req.body as { altText: string };
  try {
    const [row] = await db.update(recordImagesTable).set({ altText }).where(eq(recordImagesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});

/* ── DELETE /images/:id ───────────────────────────────────────────────────── */
router.delete("/images/:id", authenticate, requireRole("admin", "manager"), async (req: AuthRequest, res, next: NextFunction): Promise<void> => {
  const id = parseInt((req.params as any).id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
  try {
    const [row] = await db.delete(recordImagesTable).where(eq(recordImagesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }

    // Remove physical file
    try {
      const filePath = join(UPLOADS_ROOT, row.entityType, row.filename);
      await unlink(filePath);
    } catch {
      // File may not exist — not a fatal error
    }

    await logActivity({ userId: req.user?.id, action: "DELETE", module: "images", description: `Deleted image #${id} (${row.originalName}) for ${row.entityType} #${row.entityId}` });
    res.json({ deleted: true, id: row.id });
  } catch (err) { next(err); }
});

export default router;
