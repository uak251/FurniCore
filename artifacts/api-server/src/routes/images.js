/**
 * Images API — polymorphic image upload, listing, and deletion
 *
 * Supported entityType values: product | inventory | employee | payroll | supplier
 *
 * UPLOAD:
 *   POST /images/:entityType/:entityId          — single image  (multipart/form-data, field "image")
 *   POST /images/inventory/:id/bulk              — inventory-only alias for bulk upload (same as below)
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
 *   Upload / delete : admin, manager, accountant, sales_manager, inventory_manager
 *   View            : any authenticated user
 *
 * Storage: local disk under uploads/<entityType>/ (see middlewares/upload.ts). DB: record_images (Drizzle).
 *
 * Mount: `app.use("/api", router)` in app.ts → public paths are prefixed with /api
 * (e.g. POST /api/images/inventory/:id/bulk).
 */
import { Router } from "express";
import { eq, and, asc } from "drizzle-orm";
import { unlink } from "fs/promises";
import { join } from "path";
import multer from "multer";
import { db, recordImagesTable } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { uploadSingle, uploadMulti, UPLOADS_ROOT } from "../middlewares/upload";
import { logActivity } from "../lib/activityLogger";
const router = Router();
const VALID_ENTITY_TYPES = new Set(["product", "inventory", "employee", "payroll", "supplier"]);
/** Who may upload / delete / reorder images (view is any authenticated user). */
const IMAGE_EDIT_ROLES = ["admin", "manager", "accountant", "sales_manager", "inventory_manager"];
/** Wraps a Multer middleware so that MulterError and fileFilter rejections return 400 JSON instead of 500. */
function runUpload(mw) {
    return (req, res, next) => {
        mw(req, res, (err) => {
            if (!err)
                return next();
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ error: "MULTER_ERROR", code: err.code, message: err.message });
            }
            if (err instanceof Error) {
                return res.status(400).json({ error: "UPLOAD_ERROR", message: err.message });
            }
            next(err);
        });
    };
}
function validateEntityType(req, res) {
    const { entityType } = req.params;
    if (!VALID_ENTITY_TYPES.has(entityType)) {
        res.status(400).json({ error: "INVALID_ENTITY_TYPE", message: `entityType must be one of: ${[...VALID_ENTITY_TYPES].join(", ")}` });
        return false;
    }
    return true;
}
function publicUrl(entityType, filename) {
    return `/uploads/${entityType}/${filename}`;
}
/** Shared handler after Multer — inserts rows into PostgreSQL (`record_images`). */
async function bulkUploadHandler(req, res, next) {
    const { entityType, entityId } = req.params;
    const parsedEntityId = parseInt(entityId, 10);
    if (isNaN(parsedEntityId)) {
        res.status(400).json({ error: "INVALID_ID", message: "entityId must be a positive integer." });
        return;
    }
    const files = (req.files ?? []);
    if (!files.length) {
        res.status(400).json({ error: "NO_FILES", message: "No image files received." });
        return;
    }
    try {
        const inserted = await db.insert(recordImagesTable).values(files.map((f, idx) => ({
            entityType,
            entityId: parsedEntityId,
            filename: f.filename,
            originalName: f.originalname,
            mimeType: f.mimetype,
            sizeBytes: f.size,
            url: publicUrl(entityType, f.filename),
            sortOrder: idx,
            uploadedBy: req.user?.id,
        }))).returning();
        await logActivity({
            userId: req.user?.id,
            action: "CREATE",
            module: "images",
            description: `Bulk-uploaded ${inserted.length} images for ${entityType} #${parsedEntityId}`,
        });
        res.status(201).json(inserted);
    }
    catch (err) {
        next(err);
    }
}
/**
 * Maps `POST /images/inventory/:id/bulk` → `entityType` + `entityId` expected by Multer `destination`
 * and by `bulkUploadHandler`. Runs **before** `runUpload(uploadMulti)` so `req.params.entityType`
 * is `"inventory"` when Multer writes to `uploads/inventory/`. `:id` is the inventory row PK (same as
 * generic route’s `:entityId`).
 */
function aliasInventoryBulkParams(req, _res, next) {
    const id = req.params.id;
    req.params.entityType = "inventory";
    req.params.entityId = id;
    next();
}
/* ── GET /images/:entityType/:entityId ────────────────────────────────────── */
router.get("/images/:entityType/:entityId", authenticate, async (req, res, next) => {
    if (!validateEntityType(req, res))
        return;
    const entityId = parseInt(req.params.entityId, 10);
    if (isNaN(entityId)) {
        res.status(400).json({ error: "INVALID_ID" });
        return;
    }
    try {
        const rows = await db.select().from(recordImagesTable)
            .where(and(eq(recordImagesTable.entityType, req.params.entityType), eq(recordImagesTable.entityId, entityId)))
            .orderBy(asc(recordImagesTable.sortOrder), asc(recordImagesTable.createdAt));
        res.json(rows);
    }
    catch (err) {
        next(err);
    }
});
/* ── GET /images/:entityType — module gallery ─────────────────────────────── */
router.get("/images/:entityType", authenticate, async (req, res, next) => {
    if (!validateEntityType(req, res))
        return;
    try {
        const rows = await db.select().from(recordImagesTable)
            .where(eq(recordImagesTable.entityType, req.params.entityType))
            .orderBy(asc(recordImagesTable.entityId), asc(recordImagesTable.sortOrder));
        res.json(rows);
    }
    catch (err) {
        next(err);
    }
});
/* ── POST bulk (register before single-file POST so paths like …/inventory/25/bulk always match) ─ */
/* ── POST /images/inventory/:id/bulk — inventory bulk (alias; Multer MIME: jpeg/png/gif/webp) ─ */
router.post("/images/inventory/:id/bulk", authenticate, requireRole(...IMAGE_EDIT_ROLES), aliasInventoryBulkParams, runUpload(uploadMulti), bulkUploadHandler);
/* ── POST /images/:entityType/:entityId/bulk — multi-upload (all entity types) ─ */
router.post("/images/:entityType/:entityId/bulk", authenticate, requireRole(...IMAGE_EDIT_ROLES), (req, res, next) => { if (!validateEntityType(req, res))
    return; next(); }, runUpload(uploadMulti), bulkUploadHandler);
/* ── POST /images/:entityType/:entityId — single upload ──────────────────── */
router.post("/images/:entityType/:entityId", authenticate, requireRole(...IMAGE_EDIT_ROLES), (req, res, next) => { if (!validateEntityType(req, res))
    return; next(); }, runUpload(uploadSingle), async (req, res, next) => {
    const { entityType, entityId } = req.params;
    const file = req.file;
    if (!file) {
        res.status(400).json({ error: "NO_FILE", message: "No image file received." });
        return;
    }
    const altText = req.body.altText ?? null;
    try {
        const [row] = await db.insert(recordImagesTable).values({
            entityType, entityId: parseInt(entityId, 10),
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            url: publicUrl(entityType, file.filename),
            altText,
            sortOrder: 0,
            uploadedBy: req.user?.id,
        }).returning();
        await logActivity({ userId: req.user?.id, action: "CREATE", module: "images", description: `Uploaded image for ${entityType} #${entityId}: ${file.originalname}` });
        res.status(201).json(row);
    }
    catch (err) {
        next(err);
    }
});
/* ── PATCH /images/:id/sort-order ─────────────────────────────────────────── */
router.patch("/images/:id/sort-order", authenticate, requireRole(...IMAGE_EDIT_ROLES), async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "INVALID_ID" });
        return;
    }
    const { sortOrder } = req.body;
    if (typeof sortOrder !== "number") {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "sortOrder must be a number" });
        return;
    }
    try {
        const [row] = await db.update(recordImagesTable).set({ sortOrder }).where(eq(recordImagesTable.id, id)).returning();
        if (!row) {
            res.status(404).json({ error: "NOT_FOUND" });
            return;
        }
        res.json(row);
    }
    catch (err) {
        next(err);
    }
});
/* ── PATCH /images/:id/alt-text ──────────────────────────────────────────── */
router.patch("/images/:id/alt-text", authenticate, requireRole(...IMAGE_EDIT_ROLES), async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "INVALID_ID" });
        return;
    }
    const { altText } = req.body;
    try {
        const [row] = await db.update(recordImagesTable).set({ altText }).where(eq(recordImagesTable.id, id)).returning();
        if (!row) {
            res.status(404).json({ error: "NOT_FOUND" });
            return;
        }
        res.json(row);
    }
    catch (err) {
        next(err);
    }
});
/* ── DELETE /images/:id ───────────────────────────────────────────────────── */
router.delete("/images/:id", authenticate, requireRole(...IMAGE_EDIT_ROLES), async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "INVALID_ID" });
        return;
    }
    try {
        const [row] = await db.delete(recordImagesTable).where(eq(recordImagesTable.id, id)).returning();
        if (!row) {
            res.status(404).json({ error: "NOT_FOUND" });
            return;
        }
        // Remove physical file
        try {
            const filePath = join(UPLOADS_ROOT, row.entityType, row.filename);
            await unlink(filePath);
        }
        catch {
            // File may not exist — not a fatal error
        }
        await logActivity({ userId: req.user?.id, action: "DELETE", module: "images", description: `Deleted image #${id} (${row.originalName}) for ${row.entityType} #${row.entityId}` });
        res.json({ deleted: true, id: row.id });
    }
    catch (err) {
        next(err);
    }
});
export default router;
