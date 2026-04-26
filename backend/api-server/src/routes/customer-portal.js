/**
 * Customer Portal API routes — role = "customer".
 * All data is scoped to req.user.id; customers never see other customers' data.
 *
 * GET  /customer-portal/profile               — customer profile
 * GET  /customer-portal/catalog               — active products
 * GET  /customer-portal/validate-discount     — check discount code validity
 * GET  /customer-portal/orders               — own orders (with items + updates)
 * POST /customer-portal/orders               — place new order
 * GET  /customer-portal/orders/:id           — single order detail
 * GET  /customer-portal/invoices             — own invoices
 * POST /customer-portal/invoices/:id/pay     — record payment for an invoice
 */
import { Router } from "express";
import { eq, and, desc, asc, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import { mkdir } from "fs/promises";
import path from "path";
import {
    db,
    customerOrdersTable,
    orderItemsTable,
    invoicesTable,
    discountsTable,
    orderUpdatesTable,
    productsTable,
    productCategoriesTable,
    recordImagesTable,
    usersTable,
    appSettingsTable,
} from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { notifySalesStakeholdersOfCustomerOrder, notifySalesStakeholdersOfPaymentPlanRequest } from "../lib/salesOrderNotifications";
import { insertInvoiceForOrderIfAbsent } from "../lib/invoiceHelpers.js";
import { logger } from "../lib/logger";
import { createNotification } from "../lib/activityLogger";
import {
    PRODUCT_STATUS_LABELS,
    MANUFACTURING_STAGE_LABELS,
    ECOMMERCE_SHELF_BADGE,
} from "../lib/productCatalogConstants.js";
const router = Router();
// Allow storefront workflow for customer accounts and designated sales-facing staff.
const customerOnly = [authenticate, requireRole("customer", "admin", "manager", "sales_manager")];
const PAYMENTS_UPLOAD_DIR = path.resolve(process.cwd(), "../../uploads/payments");
const paymentProofUpload = multer({
    storage: multer.diskStorage({
        destination: async (_req, _file, cb) => {
            try {
                await mkdir(PAYMENTS_UPLOAD_DIR, { recursive: true });
                cb(null, PAYMENTS_UPLOAD_DIR);
            }
            catch (err) {
                cb(err, PAYMENTS_UPLOAD_DIR);
            }
        },
        filename: (_req, file, cb) => {
            const safe = (file.originalname || "proof").replace(/[^\w.-]/g, "_");
            cb(null, `${Date.now()}-${safe}`);
        },
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
        cb(ok ? null : new Error("Only PDF/JPG/PNG/WEBP files are allowed"), ok);
    },
});
function isSchemaOrRelationError(error) {
    const msg = String(error?.message ?? "");
    return msg.includes("column")
        || msg.includes("relation")
        || msg.includes("does not exist")
        || msg.includes("Failed query")
        || /42P01|42703|42883/i.test(msg);
}
function safeMoney(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}
function safeIso(d) {
    if (d == null)
        return null;
    try {
        const x = d instanceof Date ? d : new Date(d);
        return Number.isNaN(x.getTime()) ? null : x.toISOString();
    }
    catch {
        return null;
    }
}
/** Ensure JSON.stringify / res.json never throws on Drizzle/pg oddities (e.g. bigint). */
function jsonReplacer(_key, value) {
    return typeof value === "bigint" ? Number(value) : value;
}
/* ─── helpers ───────────────────────────────────────────────────────────── */
function genOrderNumber() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    return `CO-${ymd}-${rand4()}`;
}
function pad(n) { return String(n).padStart(2, "0"); }
function rand4() { return String(Math.floor(Math.random() * 9000) + 1000); }
async function enrichOrderForCustomer(order) {
    try {
        const [items, updates, inv] = await Promise.all([
            db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id)),
            db.select().from(orderUpdatesTable)
                .where(and(eq(orderUpdatesTable.orderId, order.id), eq(orderUpdatesTable.visibleToCustomer, true)))
                .orderBy(desc(orderUpdatesTable.createdAt)),
            db.select({
                id: invoicesTable.id,
                invoiceNumber: invoicesTable.invoiceNumber,
                status: invoicesTable.status,
                totalAmount: invoicesTable.totalAmount,
                dueDate: invoicesTable.dueDate,
                pdfUrl: invoicesTable.pdfUrl,
            }).from(invoicesTable).where(eq(invoicesTable.orderId, order.id)).limit(1).then((r) => r[0] ?? null),
        ]);
        return {
            ...order,
            subtotal: safeMoney(order.subtotal),
            discountAmount: safeMoney(order.discountAmount),
            taxAmount: safeMoney(order.taxAmount),
            totalAmount: safeMoney(order.totalAmount),
            taxRate: safeMoney(order.taxRate),
            estimatedDelivery: safeIso(order.estimatedDelivery),
            paymentPlanRequestedAt: safeIso(order.paymentPlanRequestedAt),
            paymentPlanCustomerNotes: order.paymentPlanCustomerNotes ?? null,
            createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : (safeIso(order.createdAt) ?? new Date().toISOString()),
            invoice: inv
                ? {
                    id: inv.id,
                    invoiceNumber: inv.invoiceNumber,
                    status: inv.status,
                    totalAmount: safeMoney(inv.totalAmount),
                    dueDate: safeIso(inv.dueDate),
                    pdfUrl: inv.pdfUrl ?? null,
                }
                : null,
            items: items.map(i => ({
                ...i,
                unitPrice: safeMoney(i.unitPrice),
                discountPercent: safeMoney(i.discountPercent),
                lineTotal: safeMoney(i.lineTotal),
            })),
            updates: updates.map(u => ({
                id: u.id,
                message: u.message,
                status: u.status,
                imageUrl: u.imageUrl,
                createdAt: safeIso(u.createdAt) ?? new Date().toISOString(),
            })),
        };
    }
    catch (err) {
        logger.warn({ orderId: order?.id, err: String(err?.message ?? err) }, "enrich_order_customer_fallback");
        return {
            ...order,
            subtotal: safeMoney(order?.subtotal),
            discountAmount: safeMoney(order?.discountAmount),
            taxAmount: safeMoney(order?.taxAmount),
            totalAmount: safeMoney(order?.totalAmount),
            taxRate: safeMoney(order?.taxRate),
            estimatedDelivery: safeIso(order?.estimatedDelivery),
            paymentPlanRequestedAt: safeIso(order?.paymentPlanRequestedAt),
            paymentPlanCustomerNotes: order?.paymentPlanCustomerNotes ?? null,
            createdAt: safeIso(order?.createdAt) ?? new Date().toISOString(),
            invoice: null,
            items: [],
            updates: [],
        };
    }
}
/* ═════════════════════════════════════════════════════════════════════════ */
/*  PROFILE                                                                  */
/* ═════════════════════════════════════════════════════════════════════════ */
router.get("/customer-portal/profile", ...customerOnly, async (req, res) => {
    const [user] = await db
        .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, req.user.id));
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    res.json(user);
});
/* ═════════════════════════════════════════════════════════════════════════ */
/*  PRODUCT CATALOG                                                          */
/* ═════════════════════════════════════════════════════════════════════════ */
function serializeCatalogRow(p, categoryRow) {
    const status = p.productStatus ?? "AVAILABLE";
    const wip = status === "WORK_IN_PROCESS";
    return {
        id: p.id,
        name: p.name,
        description: p.description,
        sku: p.sku,
        category: categoryRow?.name ?? p.category,
        categoryId: p.categoryId ?? null,
        sellingPrice: Number(p.sellingPrice),
        stockQuantity: p.stockQuantity,
        productStatus: status,
        productStatusLabel: PRODUCT_STATUS_LABELS[status] ?? status,
        wip,
        wipStage: wip ? (p.wipStage ?? null) : null,
        wipStageLabel: wip && p.wipStage ? (MANUFACTURING_STAGE_LABELS[p.wipStage] ?? p.wipStage) : null,
        wipProgressPercent: wip ? (p.wipProgressPercent ?? 0) : null,
        wipDepartment: wip ? (p.wipDepartment ?? null) : null,
    };
}

/** First cover image per product id (sort_order, then id). */
async function primaryImageUrlsByProductIds(ids) {
    if (!ids.length) return {};
    const rows = await db
        .select({
            entityId: recordImagesTable.entityId,
            url: recordImagesTable.url,
            sortOrder: recordImagesTable.sortOrder,
            id: recordImagesTable.id,
        })
        .from(recordImagesTable)
        .where(and(eq(recordImagesTable.entityType, "product"), inArray(recordImagesTable.entityId, ids)))
        .orderBy(asc(recordImagesTable.entityId), asc(recordImagesTable.sortOrder), asc(recordImagesTable.id));
    const map = {};
    for (const r of rows) {
        if (map[r.entityId] == null) map[r.entityId] = r.url;
    }
    return map;
}

function enrichCatalogRow(p, categoryRow, primaryImageUrl) {
    const base = serializeCatalogRow(p, categoryRow);
    const sell = Number(p.sellingPrice);
    const compare = p.compareAtPrice != null ? Number(p.compareAtPrice) : null;
    let discountPercent = null;
    if (compare != null && compare > sell) {
        discountPercent = Math.round((1 - sell / compare) * 100);
    }
    return {
        ...base,
        compareAtPrice: compare,
        discountPercent,
        primaryImageUrl: primaryImageUrl ?? null,
        shelfBadge: ECOMMERCE_SHELF_BADGE[base.productStatus] ?? base.productStatusLabel,
        ratingAvg: p.ratingAvg != null ? Number(p.ratingAvg) : null,
    };
}

async function mapRowsWithImages(rows) {
    const ids = rows.map((r) => r.p.id);
    const imgMap = await primaryImageUrlsByProductIds(ids);
    return rows.map(({ p, c }) => enrichCatalogRow(p, c, imgMap[p.id]));
}

/** Full catalog: all products stay visible (not filtered by stock or isActive). */
router.get("/customer-portal/catalog", ...customerOnly, async (_req, res) => {
    const rows = await db
        .select({ p: productsTable, c: productCategoriesTable })
        .from(productsTable)
        .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id));
    res.json(await mapRowsWithImages(rows));
});

/**
 * Home page payload: category tiles, featured rails, promo metadata.
 * Falls back to first N products when hot/favourite ranks are unset.
 */
router.get("/customer-portal/storefront", ...customerOnly, async (_req, res) => {
    const [salesContact] = await db
        .select({
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
    })
        .from(usersTable)
        .where(and(eq(usersTable.isActive, true), inArray(usersTable.role, ["sales_manager", "manager", "admin"])))
        .orderBy(asc(usersTable.id))
        .limit(1);
    const categories = await db
        .select()
        .from(productCategoriesTable)
        .where(eq(productCategoriesTable.showInCollection, true))
        .orderBy(asc(productCategoriesTable.sortOrder), asc(productCategoriesTable.name));

    const join = () =>
        db
            .select({ p: productsTable, c: productCategoriesTable })
            .from(productsTable)
            .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id));

    let hotRows = await join()
        .where(isNotNull(productsTable.hotRank))
        .orderBy(asc(productsTable.hotRank), asc(productsTable.id))
        .limit(8);
    if (hotRows.length === 0) {
        hotRows = await join().orderBy(desc(productsTable.id)).limit(8);
    }

    let favRows = await join()
        .where(isNotNull(productsTable.favouriteRank))
        .orderBy(asc(productsTable.favouriteRank), asc(productsTable.id))
        .limit(8);
    if (favRows.length === 0) {
        favRows = await join().orderBy(asc(productsTable.id)).limit(8);
    }

    const hotIds = hotRows.map((r) => r.p.id);
    const favIds = favRows.map((r) => r.p.id);
    const imgMap = await primaryImageUrlsByProductIds([...new Set([...hotIds, ...favIds])]);

    const collections = categories
        .filter((c) => c.slug !== "uncategorized")
        .map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            imageUrl: c.imageUrl ?? null,
        }));

    res.json({
        announcement: {
            label: "Offer of the week",
            subtitle: "Member pricing and curated showroom picks",
            href: "#shop-all",
        },
        collections,
        hotSelling: hotRows.map(({ p, c }) => enrichCatalogRow(p, c, imgMap[p.id])),
        mostFavourites: favRows.map(({ p, c }) => enrichCatalogRow(p, c, imgMap[p.id])),
        salesContact: salesContact
            ? {
                name: salesContact.name,
                email: salesContact.email,
                phone: salesContact.phone ?? "",
            }
            : null,
    });
});

router.get("/customer-portal/catalog/:id", ...customerOnly, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [row] = await db
        .select({ p: productsTable, c: productCategoriesTable })
        .from(productsTable)
        .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
        .where(eq(productsTable.id, id));
    if (!row) {
        res.status(404).json({ error: "Product not found" });
        return;
    }
    const [img] = await db
        .select({ url: recordImagesTable.url })
        .from(recordImagesTable)
        .where(and(eq(recordImagesTable.entityType, "product"), eq(recordImagesTable.entityId, id)))
        .orderBy(asc(recordImagesTable.sortOrder), asc(recordImagesTable.id))
        .limit(1);
    const x = enrichCatalogRow(row.p, row.c, img?.url ?? null);
    res.json({
        ...x,
        costVisibleToCustomer: false,
    });
});
/* ═════════════════════════════════════════════════════════════════════════ */
/*  DISCOUNT VALIDATION                                                      */
/* ═════════════════════════════════════════════════════════════════════════ */
router.get("/customer-portal/validate-discount", ...customerOnly, async (req, res) => {
    const code = String(req.query.code ?? "").toUpperCase();
    const order = Number(req.query.orderAmount ?? 0);
    if (!code) {
        res.status(400).json({ error: "code is required" });
        return;
    }
    const [disc] = await db.select().from(discountsTable)
        .where(and(eq(discountsTable.code, code), eq(discountsTable.isActive, true)));
    if (!disc) {
        res.json({ valid: false, reason: "Code not found or inactive" });
        return;
    }
    if (disc.expiresAt && new Date(disc.expiresAt) < new Date()) {
        res.json({ valid: false, reason: "Code has expired" });
        return;
    }
    if (disc.maxUses && disc.usedCount >= disc.maxUses) {
        res.json({ valid: false, reason: "Code has reached its usage limit" });
        return;
    }
    if (disc.minOrderAmount && order < Number(disc.minOrderAmount)) {
        res.json({ valid: false, reason: `Minimum order amount is $${Number(disc.minOrderAmount).toFixed(2)}` });
        return;
    }
    const discountAmount = disc.type === "percentage"
        ? order * Number(disc.value) / 100
        : Math.min(Number(disc.value), order);
    res.json({
        valid: true,
        code: disc.code,
        type: disc.type,
        value: Number(disc.value),
        discountAmount: +discountAmount.toFixed(2),
        description: disc.description,
    });
});
/* ═════════════════════════════════════════════════════════════════════════ */
/*  ORDERS                                                                   */
/* ═════════════════════════════════════════════════════════════════════════ */
router.get("/customer-portal/orders", ...customerOnly, async (req, res) => {
    try {
        const orders = await db.select().from(customerOrdersTable)
            .where(eq(customerOrdersTable.customerId, req.user.id))
            .orderBy(desc(customerOrdersTable.createdAt));
        const enriched = await Promise.all(orders.map(enrichOrderForCustomer));
        res.json(enriched);
    }
    catch (error) {
        if (isSchemaOrRelationError(error)) {
            res.json([]);
            return;
        }
        throw error;
    }
});
router.get("/customer-portal/orders/:id", ...customerOnly, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [order] = await db.select().from(customerOrdersTable)
        .where(and(eq(customerOrdersTable.id, id), eq(customerOrdersTable.customerId, req.user.id)));
    if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
    }
    res.json(await enrichOrderForCustomer(order));
});
const PlaceOrderBody = z.object({
    shippingAddress: z
        .string()
        .transform((s) => s.trim())
        .pipe(z.string().min(5, "Shipping address must be at least 5 characters.")),
    notes: z.string().optional(),
    discountCode: z.string().optional(),
    taxRate: z.number().min(0).max(100).optional(),
    /** Ask sales to propose advance + installment schedule */
    requestPaymentPlan: z.boolean().optional(),
    paymentPlanNotes: z.string().max(2000).optional(),
    items: z.array(z.object({
        productId: z.number().int(),
        quantity: z.number().int().positive(),
    })).min(1, "Add at least one line item."),
});
function zodIssuesPayload(err) {
    const issues = err.issues.map((i) => ({
        path: i.path.map(String).join(".") || "request",
        message: i.message,
    }));
    return {
        error: issues[0]?.message ?? "Invalid request",
        issues,
    };
}
router.post("/customer-portal/orders", ...customerOnly, async (req, res) => {
    const parsed = PlaceOrderBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(zodIssuesPayload(parsed.error));
        return;
    }
    try {
        const d = parsed.data;
        const userId = req.user.id;
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
        if (!user) {
            res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
            return;
        }
        // Fetch products
        const products = await Promise.all(d.items.map((i) => db.select().from(productsTable).where(eq(productsTable.id, i.productId)).then((r) => r[0])));
        if (products.some((p) => !p)) {
            res.status(400).json({ error: "PRODUCT_NOT_FOUND", message: "One or more products were not found" });
            return;
        }
        let subtotal = 0;
        const lines = d.items.map((item, idx) => {
            const product = products[idx];
            const unitPrice = Number(product.sellingPrice);
            const lineTotal = unitPrice * item.quantity;
            subtotal += lineTotal;
            return { product, item, unitPrice, lineTotal };
        });
        const badLine = lines.find((ln) => !Number.isFinite(ln.unitPrice) || ln.unitPrice < 0
            || !Number.isFinite(ln.lineTotal) || ln.lineTotal < 0);
        if (badLine) {
            res.status(400).json({
                error: "INVALID_PRODUCT_PRICE",
                message: "One or more catalog prices are invalid. Refresh the page or contact support.",
            });
            return;
        }
        // Discount — read + validate here; bump used_count inside the order transaction
        let discountAmount = 0;
        let appliedCode = null;
        /** @type {{ id: number; usedSoFar: number } | null} */
        let discRowForTx = null;
        if (d.discountCode) {
            try {
                const [disc] = await db.select().from(discountsTable)
                    .where(and(eq(discountsTable.code, d.discountCode.toUpperCase()), eq(discountsTable.isActive, true)));
                const usedSoFar = Number(disc?.usedCount ?? 0);
                if (disc && (!disc.expiresAt || new Date(disc.expiresAt) > new Date())
                    && (disc.maxUses == null || usedSoFar < Number(disc.maxUses))
                    && (!disc.minOrderAmount || subtotal >= Number(disc.minOrderAmount))) {
                    discountAmount = disc.type === "percentage"
                        ? subtotal * Number(disc.value) / 100
                        : Math.min(Number(disc.value), subtotal);
                    appliedCode = disc.code;
                    discRowForTx = { id: disc.id, usedSoFar };
                }
            }
            catch (discErr) {
                logger.warn({ errMessage: String(discErr?.message ?? discErr) }, "customer_checkout_discount_skipped");
            }
        }
        const taxRate = d.taxRate ?? 0;
        const taxAmount = (subtotal - discountAmount) * taxRate / 100;
        const total = subtotal - discountAmount + taxAmount;
        const requestPlan = Boolean(d.requestPaymentPlan);
        const planNotes = requestPlan ? (d.paymentPlanNotes?.trim() || null) : null;
        let order;
        await db.transaction(async (tx) => {
            const inserted = await tx.insert(customerOrdersTable).values({
                orderNumber: genOrderNumber(),
                customerId: userId,
                customerName: user.name,
                customerEmail: user.email,
                shippingAddress: d.shippingAddress,
                notes: d.notes ?? null,
                discountCode: appliedCode,
                subtotal: String(subtotal.toFixed(2)),
                discountAmount: String(discountAmount.toFixed(2)),
                taxRate: String(taxRate),
                taxAmount: String(taxAmount.toFixed(2)),
                totalAmount: String(total.toFixed(2)),
                status: "confirmed",
                paymentPlanRequestedAt: requestPlan ? new Date() : null,
                paymentPlanCustomerNotes: planNotes,
            }).returning();
            order = inserted[0];
            if (!order?.id) {
                throw new Error("ORDER_INSERT_RETURNED_NO_ROW");
            }
            await Promise.all(lines.map(({ product, item, unitPrice, lineTotal }) => tx.insert(orderItemsTable).values({
                orderId: order.id,
                productId: item.productId,
                productName: product.name,
                productSku: product.sku,
                quantity: item.quantity,
                unitPrice: String(unitPrice.toFixed(2)),
                discountPercent: "0",
                lineTotal: String(lineTotal.toFixed(2)),
            })));
            if (discRowForTx) {
                await tx.update(discountsTable).set({ usedCount: discRowForTx.usedSoFar + 1 }).where(eq(discountsTable.id, discRowForTx.id));
            }
            await tx.insert(orderUpdatesTable).values({
                orderId: order.id,
                message: "Your order has been received and confirmed. We'll notify you when production starts.",
                status: "confirmed",
                visibleToCustomer: true,
            });
            if (requestPlan) {
                await tx.insert(orderUpdatesTable).values({
                    orderId: order.id,
                    message: "You requested a payment plan (advance + installments). A sales manager will contact you with options.",
                    status: "confirmed",
                    visibleToCustomer: true,
                });
            }
        });
        // Invoice is best-effort: order must succeed even if AR row fails (schema drift, constraints, etc.)
        try {
            await insertInvoiceForOrderIfAbsent(order, {
                status: "sent",
                dueDays: 30,
                notes: requestPlan ? "Payment plan requested by customer — sales will follow up." : null,
            });
        }
        catch (invErr) {
            logger.warn({
                orderId: order.id,
                errMessage: String(invErr?.message ?? invErr),
            }, "customer_checkout_invoice_skipped");
        }
        if (requestPlan) {
            void notifySalesStakeholdersOfPaymentPlanRequest(order, planNotes ?? "");
        }
        void notifySalesStakeholdersOfCustomerOrder(order);
        const payload = await enrichOrderForCustomer(order);
        try {
            res.status(201).json(payload);
        }
        catch (jsonErr) {
            logger.warn({ orderId: order?.id, errMessage: String(jsonErr?.message ?? jsonErr) }, "customer_place_order_json_fallback");
            res.status(201).type("json").send(JSON.stringify(payload, jsonReplacer));
        }
    }
    catch (err) {
        logger.error({
            errMessage: err?.message || String(err),
            errStack: err?.stack || null,
        }, "customer_portal_place_order_failed");
        if (isSchemaOrRelationError(err)) {
            res.status(503).json({
                error: "CHECKOUT_DB_SCHEMA",
                message: "Checkout storage is not ready (run database migrations), or a required table/column is missing.",
            });
            return;
        }
        res.status(500).json({
            error: "ORDER_PLACE_FAILED",
            message: String(err?.message ?? "Could not complete checkout. Please try again or contact support."),
        });
    }
});
/* ═════════════════════════════════════════════════════════════════════════ */
/*  INVOICES                                                                 */
/* ═════════════════════════════════════════════════════════════════════════ */
router.get("/customer-portal/invoices", ...customerOnly, async (req, res) => {
    try {
        const invoices = await db.select().from(invoicesTable)
            .where(eq(invoicesTable.customerId, req.user.id))
            .orderBy(desc(invoicesTable.createdAt));
        res.json(invoices.map(inv => ({
            ...inv,
            subtotal: safeMoney(inv.subtotal),
            discountAmount: safeMoney(inv.discountAmount),
            taxAmount: safeMoney(inv.taxAmount),
            totalAmount: safeMoney(inv.totalAmount),
            dueDate: safeIso(inv.dueDate),
            paidAt: safeIso(inv.paidAt),
            pdfUrl: inv.pdfUrl ?? null,
        })));
    }
    catch (error) {
        if (isSchemaOrRelationError(error)) {
            res.json([]);
            return;
        }
        throw error;
    }
});
router.get("/customer-portal/payment-settings", ...customerOnly, async (_req, res) => {
    const keys = ["JAZZCASH_ACCOUNT_TITLE", "JAZZCASH_ACCOUNT_NUMBER", "JAZZCASH_INSTRUCTIONS"];
    const rows = await db.select().from(appSettingsTable).where(inArray(appSettingsTable.key, keys));
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value ?? ""]));
    res.json({
        jazzcash: {
            accountTitle: map.JAZZCASH_ACCOUNT_TITLE || "",
            accountNumber: map.JAZZCASH_ACCOUNT_NUMBER || "",
            instructions: map.JAZZCASH_INSTRUCTIONS || "Send payment and upload proof with reference.",
        },
    });
});
router.post("/customer-portal/invoices/:id/payment-proof", ...customerOnly, paymentProofUpload.single("file"), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
    }
    const [inv] = await db.select().from(invoicesTable)
        .where(and(eq(invoicesTable.id, id), eq(invoicesTable.customerId, req.user.id)));
    if (!inv) {
        res.status(404).json({ error: "Invoice not found" });
        return;
    }
    const proofUrl = `/uploads/payments/${req.file.filename}`;
    const [updated] = await db.update(invoicesTable).set({ paymentProofUrl: proofUrl }).where(eq(invoicesTable.id, id)).returning();
    res.json({ id: updated.id, paymentProofUrl: updated.paymentProofUrl });
});
router.post("/customer-portal/invoices/:id/pay", ...customerOnly, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const body = z.object({
        paymentMethod: z.string().min(1),
        paymentReference: z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) {
        res.status(400).json(zodIssuesPayload(body.error));
        return;
    }
    // Verify invoice belongs to this customer
    const [inv] = await db.select().from(invoicesTable)
        .where(and(eq(invoicesTable.id, id), eq(invoicesTable.customerId, req.user.id)));
    if (!inv) {
        res.status(404).json({ error: "Invoice not found" });
        return;
    }
    if (inv.status === "paid") {
        res.status(400).json({ error: "Invoice is already paid" });
        return;
    }
    if (inv.status === "pending_verification" || inv.status === "sales_verified") {
        res.status(400).json({ error: "Invoice payment is already under verification." });
        return;
    }
    if (!inv.paymentProofUrl) {
        res.status(400).json({
            error: "PAYMENT_PROOF_REQUIRED",
            message: "Please upload payment proof screenshot/receipt before submitting for verification.",
        });
        return;
    }
    const [updated] = await db.update(invoicesTable).set({
        status: "pending_verification",
        paidAt: null,
        paymentMethod: body.data.paymentMethod,
        paymentReference: body.data.paymentReference ?? null,
    }).where(eq(invoicesTable.id, id)).returning();
    // Notify stakeholders; sales/accounting must verify before marking paid.
    try {
        const recipients = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(and(eq(usersTable.isActive, true), inArray(usersTable.role, ["admin", "manager", "sales_manager", "accountant"])));
        await Promise.all(recipients.map((u) => createNotification({
            userId: u.id,
            title: "Payment verification required",
            message: `${updated.invoiceNumber ?? `Invoice #${updated.id}`} submitted by customer. Review proof and confirm payment.`,
            type: "info",
            link: "/sales?tab=invoices",
        })));
    }
    catch {
        // non-fatal
    }
    res.json({
        ...updated,
        subtotal: Number(updated.subtotal),
        discountAmount: Number(updated.discountAmount),
        taxAmount: Number(updated.taxAmount),
        totalAmount: Number(updated.totalAmount),
        paidAt: updated.paidAt?.toISOString() ?? null,
        dueDate: updated.dueDate?.toISOString() ?? null,
    });
});
export default router;
