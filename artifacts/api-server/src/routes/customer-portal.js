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
} from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { notifySalesStakeholdersOfCustomerOrder } from "../lib/salesOrderNotifications";
import {
    PRODUCT_STATUS_LABELS,
    MANUFACTURING_STAGE_LABELS,
    ECOMMERCE_SHELF_BADGE,
} from "../lib/productCatalogConstants.js";
const router = Router();
const customerOnly = [authenticate, requireRole("customer")];
/* ─── helpers ───────────────────────────────────────────────────────────── */
function genOrderNumber() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    return `CO-${ymd}-${rand4()}`;
}
function pad(n) { return String(n).padStart(2, "0"); }
function rand4() { return String(Math.floor(Math.random() * 9000) + 1000); }
async function enrichOrderForCustomer(order) {
    const [items, updates] = await Promise.all([
        db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id)),
        db.select().from(orderUpdatesTable)
            .where(and(eq(orderUpdatesTable.orderId, order.id), eq(orderUpdatesTable.visibleToCustomer, true)))
            .orderBy(desc(orderUpdatesTable.createdAt)),
    ]);
    return {
        ...order,
        subtotal: Number(order.subtotal),
        discountAmount: Number(order.discountAmount),
        taxAmount: Number(order.taxAmount),
        totalAmount: Number(order.totalAmount),
        taxRate: Number(order.taxRate),
        estimatedDelivery: order.estimatedDelivery?.toISOString() ?? null,
        items: items.map(i => ({
            ...i,
            unitPrice: Number(i.unitPrice),
            discountPercent: Number(i.discountPercent),
            lineTotal: Number(i.lineTotal),
        })),
        updates: updates.map(u => ({
            id: u.id,
            message: u.message,
            status: u.status,
            imageUrl: u.imageUrl,
            createdAt: u.createdAt.toISOString(),
        })),
    };
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
    const orders = await db.select().from(customerOrdersTable)
        .where(eq(customerOrdersTable.customerId, req.user.id))
        .orderBy(desc(customerOrdersTable.createdAt));
    const enriched = await Promise.all(orders.map(enrichOrderForCustomer));
    res.json(enriched);
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
    const d = parsed.data;
    const userId = req.user.id;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    // Fetch products
    const products = await Promise.all(d.items.map((i) => db.select().from(productsTable).where(eq(productsTable.id, i.productId)).then((r) => r[0])));
    if (products.some((p) => !p)) {
        res.status(400).json({ error: "One or more products were not found" });
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
    // Discount
    let discountAmount = 0;
    let appliedCode = null;
    if (d.discountCode) {
        const [disc] = await db.select().from(discountsTable)
            .where(and(eq(discountsTable.code, d.discountCode.toUpperCase()), eq(discountsTable.isActive, true)));
        if (disc && (!disc.expiresAt || new Date(disc.expiresAt) > new Date())
            && (!disc.maxUses || disc.usedCount < disc.maxUses)
            && (!disc.minOrderAmount || subtotal >= Number(disc.minOrderAmount))) {
            discountAmount = disc.type === "percentage"
                ? subtotal * Number(disc.value) / 100
                : Math.min(Number(disc.value), subtotal);
            appliedCode = disc.code;
            await db.update(discountsTable).set({ usedCount: disc.usedCount + 1 }).where(eq(discountsTable.id, disc.id));
        }
    }
    const taxRate = d.taxRate ?? 0;
    const taxAmount = (subtotal - discountAmount) * taxRate / 100;
    const total = subtotal - discountAmount + taxAmount;
    const [order] = await db.insert(customerOrdersTable).values({
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
    }).returning();
    await Promise.all(lines.map(({ product, item, unitPrice, lineTotal }) => db.insert(orderItemsTable).values({
        orderId: order.id,
        productId: item.productId,
        productName: product.name,
        productSku: product.sku,
        quantity: item.quantity,
        unitPrice: String(unitPrice.toFixed(2)),
        discountPercent: "0",
        lineTotal: String(lineTotal.toFixed(2)),
    })));
    // Auto-insert a "confirmed" update
    await db.insert(orderUpdatesTable).values({
        orderId: order.id,
        message: "Your order has been received and confirmed. We'll notify you when production starts.",
        status: "confirmed",
        visibleToCustomer: true,
    });
    void notifySalesStakeholdersOfCustomerOrder(order);
    res.status(201).json(await enrichOrderForCustomer(order));
});
/* ═════════════════════════════════════════════════════════════════════════ */
/*  INVOICES                                                                 */
/* ═════════════════════════════════════════════════════════════════════════ */
router.get("/customer-portal/invoices", ...customerOnly, async (req, res) => {
    const invoices = await db.select().from(invoicesTable)
        .where(eq(invoicesTable.customerId, req.user.id))
        .orderBy(desc(invoicesTable.createdAt));
    res.json(invoices.map(inv => ({
        ...inv,
        subtotal: Number(inv.subtotal),
        discountAmount: Number(inv.discountAmount),
        taxAmount: Number(inv.taxAmount),
        totalAmount: Number(inv.totalAmount),
        dueDate: inv.dueDate?.toISOString() ?? null,
        paidAt: inv.paidAt?.toISOString() ?? null,
    })));
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
    const [updated] = await db.update(invoicesTable).set({
        status: "paid",
        paidAt: new Date(),
        paymentMethod: body.data.paymentMethod,
        paymentReference: body.data.paymentReference ?? null,
    }).where(eq(invoicesTable.id, id)).returning();
    // Mark linked order as delivered if fully paid
    if (updated.orderId) {
        await db.update(customerOrdersTable)
            .set({ status: "delivered" })
            .where(eq(customerOrdersTable.id, updated.orderId));
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
