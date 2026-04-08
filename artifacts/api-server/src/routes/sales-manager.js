/**
 * Sales Manager API routes — accessible to admin / manager / sales_manager roles.
 *
 * GET  /sales-manager/overview              — KPIs + revenue summary
 * GET  /sales-manager/orders                — all orders (with items)
 * POST /sales-manager/orders                — create order manually
 * GET  /sales-manager/orders/:id            — single order detail
 * PATCH /sales-manager/orders/:id           — update status / notes / delivery date
 * POST /sales-manager/orders/:id/updates    — add production progress update
 * GET  /sales-manager/invoices              — all invoices
 * POST /sales-manager/invoices              — generate invoice from order
 * PATCH /sales-manager/invoices/:id         — update invoice (mark paid, send, etc.)
 * GET  /sales-manager/discounts             — list discount codes
 * POST /sales-manager/discounts             — create discount
 * PATCH /sales-manager/discounts/:id        — edit discount
 * DELETE /sales-manager/discounts/:id       — remove discount
 * GET  /sales-manager/receivables           — outstanding invoices with aging buckets
 */
import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db, customerOrdersTable, orderItemsTable, invoicesTable, discountsTable, orderUpdatesTable, productsTable, } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
const router = Router();
const salesAuth = [authenticate, requireRole("admin", "manager", "sales_manager")];
/* ─── helpers ─────────────────────────────────────────────────────────────── */
function genOrderNumber() { return `CO-${dateSuffix()}-${rand4()}`; }
function genInvoiceNumber() { return `INV-${dateSuffix()}-${rand4()}`; }
function dateSuffix() {
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, "0"); }
function rand4() { return String(Math.floor(Math.random() * 9000) + 1000); }
async function enrichOrder(order) {
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    const updates = await db.select().from(orderUpdatesTable).where(eq(orderUpdatesTable.orderId, order.id)).orderBy(desc(orderUpdatesTable.createdAt));
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
        updates: updates.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })),
    };
}
/* ═════════════════════════════════════════════════════════════════════════ */
/*  OVERVIEW                                                                 */
/* ═════════════════════════════════════════════════════════════════════════ */
router.get("/sales-manager/overview", ...salesAuth, async (_req, res) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const [allOrders, allInvoices] = await Promise.all([
        db.select().from(customerOrdersTable).orderBy(desc(customerOrdersTable.createdAt)),
        db.select().from(invoicesTable).orderBy(desc(invoicesTable.createdAt)),
    ]);
    const mtdOrders = allOrders.filter(o => new Date(o.createdAt) >= start);
    const revenue = allInvoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.totalAmount), 0);
    const mtdRevenue = allInvoices.filter(i => i.status === "paid" && new Date(i.createdAt) >= start).reduce((s, i) => s + Number(i.totalAmount), 0);
    const outstanding = allInvoices.filter(i => i.status !== "paid" && i.status !== "cancelled").reduce((s, i) => s + Number(i.totalAmount), 0);
    const overdue = allInvoices.filter(i => i.status !== "paid" && i.status !== "cancelled" && i.dueDate && new Date(i.dueDate) < now);
    const ordersByStatus = {};
    for (const o of allOrders)
        ordersByStatus[o.status] = (ordersByStatus[o.status] ?? 0) + 1;
    const recentOrders = await Promise.all(allOrders.slice(0, 5).map(enrichOrder));
    res.json({
        totalRevenue: +revenue.toFixed(2),
        mtdRevenue: +mtdRevenue.toFixed(2),
        mtdOrders: mtdOrders.length,
        totalOrders: allOrders.length,
        outstandingAR: +outstanding.toFixed(2),
        overdueCount: overdue.length,
        ordersByStatus,
        recentOrders,
    });
});
/* ═════════════════════════════════════════════════════════════════════════ */
/*  ORDERS                                                                   */
/* ═════════════════════════════════════════════════════════════════════════ */
router.get("/sales-manager/orders", ...salesAuth, async (_req, res) => {
    const orders = await db.select().from(customerOrdersTable).orderBy(desc(customerOrdersTable.createdAt));
    const enriched = await Promise.all(orders.map(enrichOrder));
    res.json(enriched);
});
router.get("/sales-manager/orders/:id", ...salesAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [order] = await db.select().from(customerOrdersTable).where(eq(customerOrdersTable.id, id));
    if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
    }
    res.json(await enrichOrder(order));
});
const CreateOrderBody = z.object({
    customerName: z.string().min(1),
    customerEmail: z.string().email(),
    customerId: z.number().int().optional(),
    shippingAddress: z.string().optional(),
    notes: z.string().optional(),
    discountCode: z.string().optional(),
    taxRate: z.number().min(0).max(100).optional(),
    estimatedDelivery: z.string().datetime().optional(),
    items: z.array(z.object({
        productId: z.number().int(),
        quantity: z.number().int().positive(),
        discountPercent: z.number().min(0).max(100).optional(),
    })).min(1),
});
router.post("/sales-manager/orders", ...salesAuth, async (req, res) => {
    const parsed = CreateOrderBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const d = parsed.data;
    // Fetch products
    const products = await Promise.all(d.items.map(i => db.select().from(productsTable).where(eq(productsTable.id, i.productId)).then(r => r[0])));
    if (products.some(p => !p)) {
        res.status(400).json({ error: "One or more products not found" });
        return;
    }
    // Calculate line totals
    let subtotal = 0;
    const lines = d.items.map((item, idx) => {
        const product = products[idx];
        const unitPrice = Number(product.sellingPrice);
        const discPct = item.discountPercent ?? 0;
        const lineTotal = unitPrice * item.quantity * (1 - discPct / 100);
        subtotal += lineTotal;
        return { product, item, unitPrice, discPct, lineTotal };
    });
    // Apply order-level discount code
    let discountAmount = 0;
    if (d.discountCode) {
        const [disc] = await db.select().from(discountsTable).where(and(eq(discountsTable.code, d.discountCode), eq(discountsTable.isActive, true)));
        if (disc && (!disc.expiresAt || new Date(disc.expiresAt) > new Date())) {
            if (!disc.maxUses || disc.usedCount < disc.maxUses) {
                discountAmount = disc.type === "percentage"
                    ? subtotal * Number(disc.value) / 100
                    : Math.min(Number(disc.value), subtotal);
                await db.update(discountsTable).set({ usedCount: disc.usedCount + 1 }).where(eq(discountsTable.id, disc.id));
            }
        }
    }
    const taxRate = d.taxRate ?? 0;
    const taxAmount = (subtotal - discountAmount) * taxRate / 100;
    const total = subtotal - discountAmount + taxAmount;
    const [order] = await db.insert(customerOrdersTable).values({
        orderNumber: genOrderNumber(),
        customerId: d.customerId ?? null,
        customerName: d.customerName,
        customerEmail: d.customerEmail,
        shippingAddress: d.shippingAddress ?? null,
        notes: d.notes ?? null,
        discountCode: d.discountCode ?? null,
        subtotal: String(subtotal.toFixed(2)),
        discountAmount: String(discountAmount.toFixed(2)),
        taxRate: String(taxRate),
        taxAmount: String(taxAmount.toFixed(2)),
        totalAmount: String(total.toFixed(2)),
        estimatedDelivery: d.estimatedDelivery ? new Date(d.estimatedDelivery) : null,
        createdBy: req.user?.id ?? null,
    }).returning();
    // Insert line items
    await Promise.all(lines.map(({ product, item, unitPrice, discPct, lineTotal }) => db.insert(orderItemsTable).values({
        orderId: order.id,
        productId: item.productId,
        productName: product.name,
        productSku: product.sku,
        quantity: item.quantity,
        unitPrice: String(unitPrice.toFixed(2)),
        discountPercent: String(discPct),
        lineTotal: String(lineTotal.toFixed(2)),
    })));
    res.status(201).json(await enrichOrder(order));
});
const PatchOrderBody = z.object({
    status: z.enum(["draft", "confirmed", "in_production", "quality_check", "shipped", "delivered", "cancelled"]).optional(),
    notes: z.string().optional(),
    shippingAddress: z.string().optional(),
    estimatedDelivery: z.string().datetime().optional().nullable(),
    taskId: z.number().int().optional().nullable(),
});
router.patch("/sales-manager/orders/:id", ...salesAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = PatchOrderBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const patch = {};
    const d = parsed.data;
    if (d.status !== undefined)
        patch.status = d.status;
    if (d.notes !== undefined)
        patch.notes = d.notes;
    if (d.shippingAddress !== undefined)
        patch.shippingAddress = d.shippingAddress;
    if (d.estimatedDelivery !== undefined)
        patch.estimatedDelivery = d.estimatedDelivery ? new Date(d.estimatedDelivery) : null;
    if (d.taskId !== undefined)
        patch.taskId = d.taskId;
    const [order] = await db.update(customerOrdersTable).set(patch).where(eq(customerOrdersTable.id, id)).returning();
    if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
    }
    res.json(await enrichOrder(order));
});
router.post("/sales-manager/orders/:id/updates", ...salesAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const body = z.object({
        message: z.string().min(1),
        status: z.string().optional(),
        imageUrl: z.string().url().optional().or(z.literal("")),
        visibleToCustomer: z.boolean().optional(),
    }).safeParse(req.body);
    if (!body.success) {
        res.status(400).json({ error: body.error.message });
        return;
    }
    const [order] = await db.select().from(customerOrdersTable).where(eq(customerOrdersTable.id, id));
    if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
    }
    // Optionally advance order status
    if (body.data.status) {
        await db.update(customerOrdersTable).set({ status: body.data.status }).where(eq(customerOrdersTable.id, id));
    }
    const [update] = await db.insert(orderUpdatesTable).values({
        orderId: id,
        message: body.data.message,
        status: body.data.status ?? null,
        imageUrl: body.data.imageUrl || null,
        visibleToCustomer: body.data.visibleToCustomer ?? true,
        createdBy: req.user?.id ?? null,
    }).returning();
    res.status(201).json(update);
});
/* ═════════════════════════════════════════════════════════════════════════ */
/*  INVOICES                                                                 */
/* ═════════════════════════════════════════════════════════════════════════ */
function serializeInvoice(inv) {
    return {
        ...inv,
        subtotal: Number(inv.subtotal),
        discountAmount: Number(inv.discountAmount),
        taxAmount: Number(inv.taxAmount),
        totalAmount: Number(inv.totalAmount),
        dueDate: inv.dueDate?.toISOString() ?? null,
        paidAt: inv.paidAt?.toISOString() ?? null,
        createdAt: inv.createdAt.toISOString(),
        updatedAt: inv.updatedAt.toISOString(),
    };
}
router.get("/sales-manager/invoices", ...salesAuth, async (_req, res) => {
    const invoices = await db.select().from(invoicesTable).orderBy(desc(invoicesTable.createdAt));
    res.json(invoices.map(serializeInvoice));
});
router.post("/sales-manager/invoices", ...salesAuth, async (req, res) => {
    const body = z.object({
        orderId: z.number().int(),
        dueDate: z.string().datetime().optional(),
        notes: z.string().optional(),
        taxRate: z.number().min(0).max(100).optional(),
    }).safeParse(req.body);
    if (!body.success) {
        res.status(400).json({ error: body.error.message });
        return;
    }
    const [order] = await db.select().from(customerOrdersTable).where(eq(customerOrdersTable.id, body.data.orderId));
    if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
    }
    const subtotal = Number(order.subtotal);
    const discountAmount = Number(order.discountAmount);
    const taxRate = body.data.taxRate ?? Number(order.taxRate);
    const taxAmount = (subtotal - discountAmount) * taxRate / 100;
    const totalAmount = subtotal - discountAmount + taxAmount;
    const [inv] = await db.insert(invoicesTable).values({
        invoiceNumber: genInvoiceNumber(),
        orderId: order.id,
        customerId: order.customerId ?? null,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        subtotal: String(subtotal.toFixed(2)),
        discountAmount: String(discountAmount.toFixed(2)),
        taxAmount: String(taxAmount.toFixed(2)),
        totalAmount: String(totalAmount.toFixed(2)),
        dueDate: body.data.dueDate ? new Date(body.data.dueDate) : null,
        notes: body.data.notes ?? null,
        createdBy: req.user?.id ?? null,
    }).returning();
    res.status(201).json(serializeInvoice(inv));
});
const PatchInvoiceBody = z.object({
    status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
    dueDate: z.string().datetime().optional().nullable(),
    paymentMethod: z.string().optional(),
    paymentReference: z.string().optional(),
    notes: z.string().optional(),
});
router.patch("/sales-manager/invoices/:id", ...salesAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = PatchInvoiceBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const patch = {};
    const d = parsed.data;
    if (d.status !== undefined)
        patch.status = d.status;
    if (d.dueDate !== undefined)
        patch.dueDate = d.dueDate ? new Date(d.dueDate) : null;
    if (d.paymentMethod !== undefined)
        patch.paymentMethod = d.paymentMethod;
    if (d.paymentReference !== undefined)
        patch.paymentReference = d.paymentReference;
    if (d.notes !== undefined)
        patch.notes = d.notes;
    if (d.status === "paid")
        patch.paidAt = new Date();
    const [inv] = await db.update(invoicesTable).set(patch).where(eq(invoicesTable.id, id)).returning();
    if (!inv) {
        res.status(404).json({ error: "Invoice not found" });
        return;
    }
    res.json(serializeInvoice(inv));
});
/* ═════════════════════════════════════════════════════════════════════════ */
/*  DISCOUNTS                                                                */
/* ═════════════════════════════════════════════════════════════════════════ */
function serializeDiscount(d) {
    return {
        ...d,
        value: Number(d.value),
        minOrderAmount: d.minOrderAmount ? Number(d.minOrderAmount) : 0,
        expiresAt: d.expiresAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
    };
}
router.get("/sales-manager/discounts", ...salesAuth, async (_req, res) => {
    const rows = await db.select().from(discountsTable).orderBy(desc(discountsTable.createdAt));
    res.json(rows.map(serializeDiscount));
});
const DiscountBody = z.object({
    code: z.string().min(1).max(50),
    description: z.string().optional(),
    type: z.enum(["percentage", "fixed"]),
    value: z.number().positive(),
    minOrderAmount: z.number().min(0).optional(),
    maxUses: z.number().int().positive().optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
    isActive: z.boolean().optional(),
});
router.post("/sales-manager/discounts", ...salesAuth, async (req, res) => {
    const parsed = DiscountBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const d = parsed.data;
    const [disc] = await db.insert(discountsTable).values({
        code: d.code.toUpperCase(),
        description: d.description ?? null,
        type: d.type,
        value: String(d.value),
        minOrderAmount: d.minOrderAmount !== undefined ? String(d.minOrderAmount) : null,
        maxUses: d.maxUses ?? null,
        expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
        isActive: d.isActive ?? true,
        createdBy: req.user?.id ?? null,
    }).returning();
    res.status(201).json(serializeDiscount(disc));
});
router.patch("/sales-manager/discounts/:id", ...salesAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = DiscountBody.partial().safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const patch = {};
    const d = parsed.data;
    if (d.code !== undefined)
        patch.code = d.code.toUpperCase();
    if (d.description !== undefined)
        patch.description = d.description;
    if (d.type !== undefined)
        patch.type = d.type;
    if (d.value !== undefined)
        patch.value = String(d.value);
    if (d.minOrderAmount !== undefined)
        patch.minOrderAmount = String(d.minOrderAmount);
    if (d.maxUses !== undefined)
        patch.maxUses = d.maxUses;
    if (d.expiresAt !== undefined)
        patch.expiresAt = d.expiresAt ? new Date(d.expiresAt) : null;
    if (d.isActive !== undefined)
        patch.isActive = d.isActive;
    const [disc] = await db.update(discountsTable).set(patch).where(eq(discountsTable.id, id)).returning();
    if (!disc) {
        res.status(404).json({ error: "Discount not found" });
        return;
    }
    res.json(serializeDiscount(disc));
});
router.delete("/sales-manager/discounts/:id", ...salesAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [disc] = await db.delete(discountsTable).where(eq(discountsTable.id, id)).returning();
    if (!disc) {
        res.status(404).json({ error: "Discount not found" });
        return;
    }
    res.sendStatus(204);
});
/* ═════════════════════════════════════════════════════════════════════════ */
/*  RECEIVABLES (accounts receivable aging)                                  */
/* ═════════════════════════════════════════════════════════════════════════ */
router.get("/sales-manager/receivables", ...salesAuth, async (_req, res) => {
    const now = new Date();
    const invoices = await db.select().from(invoicesTable)
        .where(sql `status NOT IN ('paid', 'cancelled')`)
        .orderBy(desc(invoicesTable.dueDate));
    const buckets = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    const rows = invoices.map(inv => {
        const amount = Number(inv.totalAmount);
        let ageDays = 0;
        let bucket = "current";
        if (inv.dueDate) {
            ageDays = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
            if (ageDays > 90) {
                bucket = "over90";
                buckets.over90 += amount;
            }
            else if (ageDays > 60) {
                bucket = "days90";
                buckets.days90 += amount;
            }
            else if (ageDays > 30) {
                bucket = "days60";
                buckets.days60 += amount;
            }
            else if (ageDays > 0) {
                bucket = "days30";
                buckets.days30 += amount;
            }
            else {
                buckets.current += amount;
            }
        }
        else {
            buckets.current += amount;
        }
        return { ...serializeInvoice(inv), ageDays, bucket };
    });
    const totalOutstanding = Object.values(buckets).reduce((s, v) => s + v, 0);
    res.json({ totalOutstanding: +totalOutstanding.toFixed(2), buckets, invoices: rows });
});
export default router;
