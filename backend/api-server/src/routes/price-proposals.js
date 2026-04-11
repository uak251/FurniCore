/**
 * Customer-facing product price / discount proposals — Sales proposes, Admin/Manager approves.
 */
import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db, productPriceProposalsTable, productsTable } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";

const router = Router();
const sales = requireRole("admin", "manager", "sales_manager");
const approvers = requireRole("admin", "manager");

router.get("/price-proposals", authenticate, sales, async (_req, res) => {
    const rows = await db.select().from(productPriceProposalsTable).orderBy(desc(productPriceProposalsTable.createdAt));
    res.json(
        rows.map((r) => ({
            ...r,
            proposedSellingPrice: Number(r.proposedSellingPrice),
            proposedCompareAtPrice: r.proposedCompareAtPrice != null ? Number(r.proposedCompareAtPrice) : null,
            discountPercentRequested: r.discountPercentRequested != null ? Number(r.discountPercentRequested) : null,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            reviewedAt: r.reviewedAt?.toISOString() ?? null,
        })),
    );
});

const CreateBody = z.object({
    productId: z.number().int().positive(),
    proposedSellingPrice: z.number().positive(),
    proposedCompareAtPrice: z.number().nonnegative().optional(),
    discountPercentRequested: z.number().min(0).max(100).optional(),
    notes: z.string().max(2000).optional(),
});

router.post("/price-proposals", authenticate, requireRole("sales_manager", "admin", "manager"), async (req, res) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const d = parsed.data;
    const [row] = await db
        .insert(productPriceProposalsTable)
        .values({
            productId: d.productId,
            proposedSellingPrice: String(d.proposedSellingPrice.toFixed(2)),
            proposedCompareAtPrice: d.proposedCompareAtPrice != null ? String(d.proposedCompareAtPrice.toFixed(2)) : null,
            discountPercentRequested: d.discountPercentRequested != null ? String(d.discountPercentRequested.toFixed(2)) : null,
            status: "pending",
            notes: d.notes ?? null,
            proposedByUserId: req.user.id,
        })
        .returning();
    await logActivity({
        userId: req.user.id,
        action: "CREATE",
        module: "price_proposals",
        description: `Price proposal for product ${d.productId}`,
        newData: row,
    });
    res.status(201).json({
        ...row,
        proposedSellingPrice: Number(row.proposedSellingPrice),
        proposedCompareAtPrice: row.proposedCompareAtPrice != null ? Number(row.proposedCompareAtPrice) : null,
    });
});

router.post("/price-proposals/:id/approve", authenticate, approvers, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const [p] = await db.select().from(productPriceProposalsTable).where(eq(productPriceProposalsTable.id, id));
    if (!p || p.status !== "pending") {
        res.status(400).json({ error: "Invalid proposal" });
        return;
    }
    await db
        .update(productsTable)
        .set({
            sellingPrice: p.proposedSellingPrice,
            compareAtPrice: p.proposedCompareAtPrice ?? null,
            updatedAt: new Date(),
        })
        .where(eq(productsTable.id, p.productId));
    const [updated] = await db
        .update(productPriceProposalsTable)
        .set({
            status: "approved",
            reviewedByUserId: req.user.id,
            reviewedAt: new Date(),
        })
        .where(eq(productPriceProposalsTable.id, id))
        .returning();
    await logActivity({
        userId: req.user.id,
        action: "APPROVE",
        module: "price_proposals",
        description: `Approved price proposal ${id} → product ${p.productId}`,
        newData: updated,
    });
    res.json(updated);
});

router.post("/price-proposals/:id/reject", authenticate, approvers, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const body = z.object({ reason: z.string().min(1).max(2000) }).safeParse(req.body);
    if (!body.success) {
        res.status(400).json({ error: "reason required" });
        return;
    }
    const [p] = await db.select().from(productPriceProposalsTable).where(eq(productPriceProposalsTable.id, id));
    if (!p || p.status !== "pending") {
        res.status(400).json({ error: "Invalid proposal" });
        return;
    }
    const [updated] = await db
        .update(productPriceProposalsTable)
        .set({
            status: "rejected",
            reviewedByUserId: req.user.id,
            reviewedAt: new Date(),
            rejectionReason: body.data.reason,
        })
        .where(eq(productPriceProposalsTable.id, id))
        .returning();
    await logActivity({
        userId: req.user.id,
        action: "REJECT",
        module: "price_proposals",
        description: body.data.reason,
        newData: updated,
    });
    res.json(updated);
});

export default router;
