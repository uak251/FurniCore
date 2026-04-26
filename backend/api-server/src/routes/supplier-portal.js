/**
 * Supplier Portal API
 *
 * All routes are protected: authenticate + requireRole("supplier").
 * Supplier identity is resolved by matching req.user.email → suppliersTable.email.
 *
 * Endpoints:
 *   GET  /supplier-portal/me                  — linked supplier profile
 *   GET  /supplier-portal/quotes              — quotes submitted by this supplier
 *   POST /supplier-portal/quotes              — submit a new quotation
 *   GET  /supplier-portal/deliveries          — delivery updates for this supplier's quotes
 *   POST /supplier-portal/deliveries          — add a delivery update to a quote
 *   PATCH /supplier-portal/deliveries/:id     — edit an existing delivery update
 *   GET  /supplier-portal/ledger              — ledger data scoped to this supplier
 *   GET  /supplier-portal/quotes/:quoteId/shipment-images — packing / delivery photos for a quote
 *   POST /supplier-portal/quotes/:quoteId/shipment-images — multipart field "images" (up to 10)
 *   DELETE /supplier-portal/shipment-images/:imageId — remove a photo uploaded for your quote
 */
import { Router } from "express";
import { eq, and, desc, asc } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import { unlink } from "fs/promises";
import { join } from "path";
import { db, suppliersTable, supplierQuotesTable, deliveryUpdatesTable, recordImagesTable, } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { uploadSupplierQuoteImages, UPLOADS_ROOT } from "../middlewares/upload";
import { logActivity } from "../lib/activityLogger";
const router = Router();
const guard = [authenticate, requireRole("supplier")];
const SHIPMENT_IMAGE_ENTITY = "supplier_quote";
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
function shipmentImagePublicUrl(filename) {
    return `/uploads/${SHIPMENT_IMAGE_ENTITY}/${filename}`;
}
/* ─── helpers ──────────────────────────────────────────────────── */
async function resolveSupplier(email) {
    const [supplier] = await db
        .select()
        .from(suppliersTable)
        .where(eq(suppliersTable.email, email));
    return supplier ?? null;
}
function serializeQuote(q, supplierName) {
    return {
        ...q,
        supplierName,
        quantity: Number(q.quantity),
        unitPrice: Number(q.unitPrice),
        totalPrice: Number(q.totalPrice),
        validUntil: q.validUntil?.toISOString() ?? null,
        lockedAt: q.lockedAt?.toISOString() ?? null,
        approvedAt: q.approvedAt?.toISOString() ?? null,
        paidAt: q.paidAt?.toISOString() ?? null,
    };
}
/* ─── GET /supplier-portal/me ──────────────────────────────────── */
router.get("/supplier-portal/me", ...guard, async (req, res) => {
    const supplier = await resolveSupplier(req.user.email);
    if (!supplier) {
        res.status(404).json({
            error: "No supplier record linked to this account.",
            hint: "Ask your administrator to create a supplier entry with your email address.",
        });
        return;
    }
    res.json({ ...supplier, rating: supplier.rating !== null ? Number(supplier.rating) : null });
});
/* ─── GET /supplier-portal/quotes ──────────────────────────────── */
router.get("/supplier-portal/quotes", ...guard, async (req, res) => {
    const supplier = await resolveSupplier(req.user.email);
    if (!supplier) {
        res.status(404).json({ error: "Supplier profile not found." });
        return;
    }
    const quotes = await db
        .select()
        .from(supplierQuotesTable)
        .where(eq(supplierQuotesTable.supplierId, supplier.id))
        .orderBy(desc(supplierQuotesTable.createdAt));
    res.json(quotes.map((q) => serializeQuote(q, supplier.name)));
});
/* ─── POST /supplier-portal/quotes ─────────────────────────────── */
const SubmitQuoteBody = z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    notes: z.string().optional(),
    validUntil: z.string().optional(),
});
router.post("/supplier-portal/quotes", ...guard, async (req, res) => {
    const supplier = await resolveSupplier(req.user.email);
    if (!supplier) {
        res.status(404).json({ error: "Supplier profile not found." });
        return;
    }
    const parsed = SubmitQuoteBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const { description, quantity, unitPrice, notes, validUntil } = parsed.data;
    const totalPrice = quantity * unitPrice;
    const [quote] = await db
        .insert(supplierQuotesTable)
        .values({
        supplierId: supplier.id,
        description,
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        totalPrice: String(totalPrice),
        notes: notes ?? null,
        validUntil: validUntil ? new Date(validUntil) : null,
        status: "PENDING",
    })
        .returning();
    res.status(201).json(serializeQuote(quote, supplier.name));
});
/* ─── GET /supplier-portal/deliveries ──────────────────────────── */
router.get("/supplier-portal/deliveries", ...guard, async (req, res) => {
    const supplier = await resolveSupplier(req.user.email);
    if (!supplier) {
        res.status(404).json({ error: "Supplier profile not found." });
        return;
    }
    // Get all quotes for this supplier
    const quotes = await db
        .select()
        .from(supplierQuotesTable)
        .where(eq(supplierQuotesTable.supplierId, supplier.id));
    const quoteIds = quotes.map((q) => q.id);
    if (quoteIds.length === 0) {
        res.json([]);
        return;
    }
    // Fetch delivery updates for those quotes
    const updates = await db
        .select()
        .from(deliveryUpdatesTable)
        .orderBy(desc(deliveryUpdatesTable.createdAt));
    const filtered = updates.filter((u) => quoteIds.includes(u.quoteId));
    // Attach quote description for context
    const quoteMap = Object.fromEntries(quotes.map((q) => [q.id, q]));
    const enriched = filtered.map((u) => {
        const q = quoteMap[u.quoteId];
        return {
            ...u,
            estimatedDelivery: u.estimatedDelivery?.toISOString() ?? null,
            createdAt: u.createdAt.toISOString(),
            quoteDescription: q?.description ?? "",
            quoteStatus: q?.status ?? "",
        };
    });
    res.json(enriched);
});
/* ─── POST /supplier-portal/deliveries ─────────────────────────── */
const AddDeliveryBody = z.object({
    quoteId: z.number().int().positive(),
    status: z.enum(["preparing", "shipped", "in_transit", "delivered", "delayed"]),
    note: z.string().optional(),
    estimatedDelivery: z.string().optional(),
});
router.post("/supplier-portal/deliveries", ...guard, async (req, res) => {
    const supplier = await resolveSupplier(req.user.email);
    if (!supplier) {
        res.status(404).json({ error: "Supplier profile not found." });
        return;
    }
    const parsed = AddDeliveryBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    // Verify the quote belongs to this supplier
    const [quote] = await db
        .select()
        .from(supplierQuotesTable)
        .where(and(eq(supplierQuotesTable.id, parsed.data.quoteId), eq(supplierQuotesTable.supplierId, supplier.id)));
    if (!quote) {
        res.status(404).json({ error: "Quote not found or does not belong to you." });
        return;
    }
    const [update] = await db
        .insert(deliveryUpdatesTable)
        .values({
        quoteId: parsed.data.quoteId,
        status: parsed.data.status,
        note: parsed.data.note ?? null,
        estimatedDelivery: parsed.data.estimatedDelivery
            ? new Date(parsed.data.estimatedDelivery)
            : null,
        updatedBy: req.user.id,
    })
        .returning();
    res.status(201).json({
        ...update,
        estimatedDelivery: update.estimatedDelivery?.toISOString() ?? null,
        createdAt: update.createdAt.toISOString(),
        quoteDescription: quote.description,
        quoteStatus: quote.status,
    });
});
/* ─── PATCH /supplier-portal/deliveries/:id ────────────────────── */
const PatchDeliveryBody = z.object({
    status: z.enum(["preparing", "shipped", "in_transit", "delivered", "delayed"]).optional(),
    note: z.string().optional(),
    estimatedDelivery: z.string().nullable().optional(),
});
router.patch("/supplier-portal/deliveries/:id", ...guard, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id." });
        return;
    }
    const supplier = await resolveSupplier(req.user.email);
    if (!supplier) {
        res.status(404).json({ error: "Supplier profile not found." });
        return;
    }
    const [existing] = await db
        .select()
        .from(deliveryUpdatesTable)
        .where(eq(deliveryUpdatesTable.id, id));
    if (!existing) {
        res.status(404).json({ error: "Delivery update not found." });
        return;
    }
    // Verify the update's quote belongs to this supplier
    const [quote] = await db
        .select()
        .from(supplierQuotesTable)
        .where(and(eq(supplierQuotesTable.id, existing.quoteId), eq(supplierQuotesTable.supplierId, supplier.id)));
    if (!quote) {
        res.status(403).json({ error: "Access denied." });
        return;
    }
    const parsed = PatchDeliveryBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const patch = {};
    if (parsed.data.status !== undefined)
        patch.status = parsed.data.status;
    if (parsed.data.note !== undefined)
        patch.note = parsed.data.note;
    if (parsed.data.estimatedDelivery !== undefined) {
        patch.estimatedDelivery = parsed.data.estimatedDelivery
            ? new Date(parsed.data.estimatedDelivery)
            : null;
    }
    const [updated] = await db
        .update(deliveryUpdatesTable)
        .set(patch)
        .where(eq(deliveryUpdatesTable.id, id))
        .returning();
    res.json({
        ...updated,
        estimatedDelivery: updated.estimatedDelivery?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        quoteDescription: quote.description,
        quoteStatus: quote.status,
    });
});
/* ─── GET /supplier-portal/ledger ──────────────────────────────── */
router.get("/supplier-portal/ledger", ...guard, async (req, res) => {
    const supplier = await resolveSupplier(req.user.email);
    if (!supplier) {
        res.status(404).json({ error: "Supplier profile not found." });
        return;
    }
    const quotes = await db
        .select()
        .from(supplierQuotesTable)
        .where(eq(supplierQuotesTable.supplierId, supplier.id))
        .orderBy(desc(supplierQuotesTable.createdAt));
    const rows = quotes.map((q) => ({
        id: q.id,
        description: q.description,
        quantity: Number(q.quantity),
        unitPrice: Number(q.unitPrice),
        totalPrice: Number(q.totalPrice),
        status: q.status,
        notes: q.notes,
        validUntil: q.validUntil?.toISOString() ?? null,
        lockedAt: q.lockedAt?.toISOString() ?? null,
        approvedAt: q.approvedAt?.toISOString() ?? null,
        paidAt: q.paidAt?.toISOString() ?? null,
        createdAt: q.createdAt.toISOString(),
    }));
    const summary = {
        totalQuotes: rows.length,
        totalValue: rows.reduce((s, r) => s + r.totalPrice, 0),
        paidValue: rows
            .filter((r) => r.status === "PAID")
            .reduce((s, r) => s + r.totalPrice, 0),
        pendingValue: rows
            .filter((r) => r.status === "PENDING")
            .reduce((s, r) => s + r.totalPrice, 0),
        approvedValue: rows
            .filter((r) => r.status === "ADMIN_APPROVED")
            .reduce((s, r) => s + r.totalPrice, 0),
    };
    res.json({ supplier: { id: supplier.id, name: supplier.name }, summary, ledger: rows });
});
/* ─── Quote shipment images (supplier-owned packing / POD photos) ─────────── */
async function assertSupplierOwnsQuote(supplierId, quoteId) {
    const [quote] = await db
        .select()
        .from(supplierQuotesTable)
        .where(and(eq(supplierQuotesTable.id, quoteId), eq(supplierQuotesTable.supplierId, supplierId)));
    return quote ?? null;
}
router.get("/supplier-portal/quotes/:quoteId/shipment-images", ...guard, async (req, res, next) => {
    const quoteId = parseInt(req.params.quoteId, 10);
    if (isNaN(quoteId)) {
        res.status(400).json({ error: "Invalid quote id." });
        return;
    }
    const supplier = await resolveSupplier(req.user.email);
    if (!supplier) {
        res.status(404).json({ error: "Supplier profile not found." });
        return;
    }
    const quote = await assertSupplierOwnsQuote(supplier.id, quoteId);
    if (!quote) {
        res.status(404).json({ error: "Quote not found or does not belong to you." });
        return;
    }
    try {
        const rows = await db
            .select()
            .from(recordImagesTable)
            .where(and(eq(recordImagesTable.entityType, SHIPMENT_IMAGE_ENTITY), eq(recordImagesTable.entityId, quoteId)))
            .orderBy(asc(recordImagesTable.sortOrder), asc(recordImagesTable.createdAt));
        res.json(rows);
    }
    catch (err) {
        next(err);
    }
});
router.post("/supplier-portal/quotes/:quoteId/shipment-images", ...guard, runUpload(uploadSupplierQuoteImages), async (req, res, next) => {
    const quoteId = parseInt(req.params.quoteId, 10);
    if (isNaN(quoteId)) {
        res.status(400).json({ error: "Invalid quote id." });
        return;
    }
    const supplier = await resolveSupplier(req.user.email);
    if (!supplier) {
        res.status(404).json({ error: "Supplier profile not found." });
        return;
    }
    const quote = await assertSupplierOwnsQuote(supplier.id, quoteId);
    if (!quote) {
        res.status(404).json({ error: "Quote not found or does not belong to you." });
        return;
    }
    const files = req.files ?? [];
    if (!files.length) {
        res.status(400).json({ error: "NO_FILES", message: "No image files received." });
        return;
    }
    try {
        const inserted = await db.insert(recordImagesTable).values(files.map((f, idx) => ({
            entityType: SHIPMENT_IMAGE_ENTITY,
            entityId: quoteId,
            filename: f.filename,
            originalName: f.originalname,
            mimeType: f.mimetype,
            sizeBytes: f.size,
            url: shipmentImagePublicUrl(f.filename),
            sortOrder: idx,
            uploadedBy: req.user?.id,
        }))).returning();
        await logActivity({
            userId: req.user?.id,
            action: "CREATE",
            module: "supplier_portal",
            description: `Uploaded ${inserted.length} shipment image(s) for quote #${quoteId}`,
        });
        res.status(201).json(inserted);
    }
    catch (err) {
        next(err);
    }
});
router.delete("/supplier-portal/shipment-images/:imageId", ...guard, async (req, res, next) => {
    const imageId = parseInt(req.params.imageId, 10);
    if (isNaN(imageId)) {
        res.status(400).json({ error: "Invalid image id." });
        return;
    }
    const supplier = await resolveSupplier(req.user.email);
    if (!supplier) {
        res.status(404).json({ error: "Supplier profile not found." });
        return;
    }
    try {
        const [row] = await db.select().from(recordImagesTable).where(eq(recordImagesTable.id, imageId));
        if (!row || row.entityType !== SHIPMENT_IMAGE_ENTITY) {
            res.status(404).json({ error: "Image not found." });
            return;
        }
        const quote = await assertSupplierOwnsQuote(supplier.id, row.entityId);
        if (!quote) {
            res.status(403).json({ error: "Access denied." });
            return;
        }
        const [deleted] = await db.delete(recordImagesTable).where(eq(recordImagesTable.id, imageId)).returning();
        if (!deleted) {
            res.status(404).json({ error: "Image not found." });
            return;
        }
        try {
            const filePath = join(UPLOADS_ROOT, deleted.entityType, deleted.filename);
            await unlink(filePath);
        }
        catch {
            /* file missing — ok */
        }
        await logActivity({
            userId: req.user?.id,
            action: "DELETE",
            module: "supplier_portal",
            description: `Deleted shipment image #${imageId} for quote #${deleted.entityId}`,
        });
        res.json({ deleted: true, id: deleted.id });
    }
    catch (err) {
        next(err);
    }
});
export default router;
