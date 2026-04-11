import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db, supplierQuotesTable, suppliersTable, inventoryTable, supplierOfficialRatesTable } from "@workspace/db";
import { CreateQuoteBody, ListQuotesQueryParams, GetQuoteParams, LockQuoteParams, ApproveQuoteParams, PayQuoteParams } from "@workspace/api-zod";
import { authenticate, requireRole } from "../middlewares/authenticate";
// Internal quotes routes are restricted to staff roles only.
// Suppliers use /supplier-portal/quotes instead.
const internalOnly = requireRole("admin", "manager", "accountant", "sales_manager", "employee", "inventory_manager");
import { logActivity } from "../lib/activityLogger";
import { recordOfficialSupplierRate, getFinanceThreshold } from "../lib/quoteWorkflow.js";
const router = Router();
async function toQuote(q) {
    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, q.supplierId));
    let itemName = null;
    if (q.inventoryItemId) {
        const [item] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, q.inventoryItemId));
        itemName = item?.name ?? null;
    }
    return {
        ...q,
        supplierName: supplier?.name ?? "",
        itemName,
        quantity: Number(q.quantity),
        unitPrice: Number(q.unitPrice),
        totalPrice: Number(q.totalPrice),
        validUntil: q.validUntil?.toISOString() ?? null,
        lockedAt: q.lockedAt?.toISOString() ?? null,
        approvedAt: q.approvedAt?.toISOString() ?? null,
        paidAt: q.paidAt?.toISOString() ?? null,
        workflowStage: q.workflowStage ?? "legacy",
        submittedForReviewAt: q.submittedForReviewAt?.toISOString() ?? null,
        pmReviewedAt: q.pmReviewedAt?.toISOString() ?? null,
        financeReviewedAt: q.financeReviewedAt?.toISOString() ?? null,
        requiresFinanceStep: Boolean(q.requiresFinanceStep),
    };
}
router.get("/quotes", authenticate, internalOnly, async (req, res) => {
    const params = ListQuotesQueryParams.safeParse(req.query);
    const wf = z.enum(["all", "draft", "pending_pm", "pending_finance", "approved", "rejected", "legacy"]).optional().safeParse(req.query.workflow);
    const cond = [];
    if (params.success && params.data.status)
        cond.push(eq(supplierQuotesTable.status, params.data.status));
    if (wf.success && wf.data && wf.data !== "all")
        cond.push(eq(supplierQuotesTable.workflowStage, wf.data));
    let query = db.select().from(supplierQuotesTable).$dynamic();
    if (cond.length === 1)
        query = query.where(cond[0]);
    else if (cond.length > 1)
        query = query.where(and(...cond));
    const quotes = await query;
    const enriched = await Promise.all(quotes.map(toQuote));
    res.json(enriched);
});

/** Compare supplier unit rates per inventory item (bidding / analytics) */
router.get("/quotes/rate-comparison", authenticate, internalOnly, async (req, res) => {
    const quotes = await db.select().from(supplierQuotesTable);
    const enriched = await Promise.all(quotes.map(toQuote));
    const groups = new Map();
    for (const q of enriched) {
        if (q.inventoryItemId == null)
            continue;
        const key = q.inventoryItemId;
        if (!groups.has(key)) {
            groups.set(key, {
                inventoryItemId: q.inventoryItemId,
                itemName: q.itemName ?? "",
                quotes: [],
            });
        }
        groups.get(key).quotes.push({
            id: q.id,
            supplierId: q.supplierId,
            supplierName: q.supplierName,
            unitPrice: q.unitPrice,
            quantity: q.quantity,
            totalPrice: q.totalPrice,
            status: q.status,
            workflowStage: q.workflowStage,
            description: q.description,
        });
    }
    res.json({ groups: [...groups.values()] });
});

/** Approved official supplier unit rates (workflow-completed snapshots) */
router.get("/quotes/official-rates", authenticate, internalOnly, async (req, res) => {
    const rows = await db
        .select({
            id: supplierOfficialRatesTable.id,
            supplierId: supplierOfficialRatesTable.supplierId,
            inventoryItemId: supplierOfficialRatesTable.inventoryItemId,
            unitPrice: supplierOfficialRatesTable.unitPrice,
            sourceQuoteId: supplierOfficialRatesTable.sourceQuoteId,
            effectiveFrom: supplierOfficialRatesTable.effectiveFrom,
            supplierName: suppliersTable.name,
            itemName: inventoryTable.name,
        })
        .from(supplierOfficialRatesTable)
        .innerJoin(suppliersTable, eq(supplierOfficialRatesTable.supplierId, suppliersTable.id))
        .innerJoin(inventoryTable, eq(supplierOfficialRatesTable.inventoryItemId, inventoryTable.id))
        .orderBy(desc(supplierOfficialRatesTable.effectiveFrom));
    res.json(
        rows.map((r) => ({
            ...r,
            unitPrice: Number(r.unitPrice),
            effectiveFrom: r.effectiveFrom.toISOString(),
        })),
    );
});

router.post("/quotes", authenticate, internalOnly, async (req, res) => {
    const parsed = CreateQuoteBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const totalPrice = parsed.data.quantity * parsed.data.unitPrice;
    const [quote] = await db.insert(supplierQuotesTable).values({
        ...parsed.data,
        quantity: String(parsed.data.quantity),
        unitPrice: String(parsed.data.unitPrice),
        totalPrice: String(totalPrice),
        inventoryItemId: parsed.data.inventoryItemId ?? null,
        validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
        workflowStage: "draft",
    }).returning();
    const enriched = await toQuote(quote);
    await logActivity({ userId: req.user?.id, action: "CREATE", module: "quotes", description: `New quote from ${enriched.supplierName}`, newData: enriched });
    res.status(201).json(enriched);
});
router.get("/quotes/:id", authenticate, internalOnly, async (req, res) => {
    const params = GetQuoteParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [quote] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, params.data.id));
    if (!quote) {
        res.status(404).json({ error: "Quote not found" });
        return;
    }
    res.json(await toQuote(quote));
});
router.post("/quotes/:id/lock", authenticate, internalOnly, async (req, res) => {
    const params = LockQuoteParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [existing] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, params.data.id));
    if (!existing) {
        res.status(404).json({ error: "Quote not found" });
        return;
    }
    if (existing.status !== "PENDING") {
        res.status(400).json({ error: "Quote can only be locked from PENDING status" });
        return;
    }
    const [quote] = await db.update(supplierQuotesTable).set({ status: "LOCKED", lockedAt: new Date() }).where(eq(supplierQuotesTable.id, params.data.id)).returning();
    const enriched = await toQuote(quote);
    await logActivity({ userId: req.user?.id, action: "LOCK", module: "quotes", description: `Locked quote from ${enriched.supplierName}`, newData: enriched });
    res.json(enriched);
});
router.post("/quotes/:id/approve", authenticate, internalOnly, async (req, res) => {
    const params = ApproveQuoteParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [existing] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, params.data.id));
    if (!existing) {
        res.status(404).json({ error: "Quote not found" });
        return;
    }
    if (existing.status !== "LOCKED") {
        res.status(400).json({ error: "Quote must be LOCKED before approval" });
        return;
    }
    const [quote] = await db.update(supplierQuotesTable).set({ status: "ADMIN_APPROVED", approvedAt: new Date() }).where(eq(supplierQuotesTable.id, params.data.id)).returning();
    const enriched = await toQuote(quote);
    await logActivity({ userId: req.user?.id, action: "APPROVE", module: "quotes", description: `Approved quote from ${enriched.supplierName}`, newData: enriched });
    res.json(enriched);
});
const procurementRoles = requireRole("admin", "manager", "employee", "inventory_manager", "accountant", "sales_manager");
const purchaseManagerRoles = requireRole("admin", "manager");
const financeRoles = requireRole("admin", "accountant");

/** Procurement: submit quote into PM review queue */
router.post("/quotes/:id/workflow/submit", authenticate, procurementRoles, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [q] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, id));
    if (!q) {
        res.status(404).json({ error: "Quote not found" });
        return;
    }
    if ((q.workflowStage ?? "legacy") !== "draft") {
        res.status(400).json({ error: "Only draft quotes can be submitted" });
        return;
    }
    if (!q.inventoryItemId) {
        res.status(400).json({ error: "inventoryItemId is required for approval workflow" });
        return;
    }
    const [updated] = await db
        .update(supplierQuotesTable)
        .set({
            workflowStage: "pending_pm",
            submittedForReviewAt: new Date(),
            submittedByUserId: req.user.id,
        })
        .where(eq(supplierQuotesTable.id, id))
        .returning();
    const enriched = await toQuote(updated);
    await logActivity({
        userId: req.user.id,
        action: "SUBMIT_QUOTE",
        module: "quotes",
        description: `Submitted quote ${id} for purchase manager review`,
        newData: enriched,
    });
    res.json(enriched);
});

/** Purchase Manager */
router.post("/quotes/:id/workflow/pm-approve", authenticate, purchaseManagerRoles, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [q] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, id));
    if (!q) {
        res.status(404).json({ error: "Quote not found" });
        return;
    }
    if (q.workflowStage !== "pending_pm") {
        res.status(400).json({ error: "Quote is not awaiting purchase manager review" });
        return;
    }
    const total = Number(q.totalPrice);
    const threshold = await getFinanceThreshold();
    const needsFinance = total >= threshold;
    if (needsFinance) {
        const [updated] = await db
            .update(supplierQuotesTable)
            .set({
                workflowStage: "pending_finance",
                requiresFinanceStep: true,
                pmReviewedAt: new Date(),
                pmReviewerId: req.user.id,
                pmDecision: "approve",
            })
            .where(eq(supplierQuotesTable.id, id))
            .returning();
        const enriched = await toQuote(updated);
        await logActivity({
            userId: req.user.id,
            action: "PM_APPROVE_QUOTE_FINANCE_PENDING",
            module: "quotes",
            description: `PM approved quote ${id}; finance review required (≥ ${threshold})`,
            newData: enriched,
        });
        res.json(enriched);
        return;
    }
    const [updated] = await db
        .update(supplierQuotesTable)
        .set({
            workflowStage: "approved",
            status: "ADMIN_APPROVED",
            approvedAt: new Date(),
            pmReviewedAt: new Date(),
            pmReviewerId: req.user.id,
            pmDecision: "approve",
        })
        .where(eq(supplierQuotesTable.id, id))
        .returning();
    await recordOfficialSupplierRate(updated);
    const enriched = await toQuote(updated);
    await logActivity({
        userId: req.user.id,
        action: "PM_APPROVE_QUOTE_FINAL",
        module: "quotes",
        description: `PM approved quote ${id}; official rate recorded`,
        newData: enriched,
    });
    res.json(enriched);
});

router.post("/quotes/:id/workflow/pm-reject", authenticate, purchaseManagerRoles, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const body = z.object({ reason: z.string().min(1).max(2000) }).safeParse(req.body);
    if (!body.success) {
        res.status(400).json({ error: "reason required" });
        return;
    }
    const [q] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, id));
    if (!q || q.workflowStage !== "pending_pm") {
        res.status(400).json({ error: "Invalid quote state" });
        return;
    }
    const [updated] = await db
        .update(supplierQuotesTable)
        .set({
            workflowStage: "rejected",
            rejectionReason: body.data.reason,
            pmReviewedAt: new Date(),
            pmReviewerId: req.user.id,
            pmDecision: "reject",
        })
        .where(eq(supplierQuotesTable.id, id))
        .returning();
    const enriched = await toQuote(updated);
    await logActivity({ userId: req.user.id, action: "PM_REJECT_QUOTE", module: "quotes", description: body.data.reason, newData: enriched });
    res.json(enriched);
});

/** Finance */
router.post("/quotes/:id/workflow/finance-approve", authenticate, financeRoles, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const [q] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, id));
    if (!q || q.workflowStage !== "pending_finance") {
        res.status(400).json({ error: "Quote is not awaiting finance review" });
        return;
    }
    const [updated] = await db
        .update(supplierQuotesTable)
        .set({
            workflowStage: "approved",
            status: "ADMIN_APPROVED",
            approvedAt: new Date(),
            financeReviewedAt: new Date(),
            financeReviewerId: req.user.id,
            financeDecision: "approve",
        })
        .where(eq(supplierQuotesTable.id, id))
        .returning();
    await recordOfficialSupplierRate(updated);
    const enriched = await toQuote(updated);
    await logActivity({
        userId: req.user.id,
        action: "FINANCE_APPROVE_QUOTE",
        module: "quotes",
        description: `Finance approved quote ${id}`,
        newData: enriched,
    });
    res.json(enriched);
});

router.post("/quotes/:id/workflow/finance-reject", authenticate, financeRoles, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const body = z.object({ reason: z.string().min(1).max(2000) }).safeParse(req.body);
    if (!body.success) {
        res.status(400).json({ error: "reason required" });
        return;
    }
    const [q] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, id));
    if (!q || q.workflowStage !== "pending_finance") {
        res.status(400).json({ error: "Invalid quote state" });
        return;
    }
    const [updated] = await db
        .update(supplierQuotesTable)
        .set({
            workflowStage: "rejected",
            rejectionReason: body.data.reason,
            financeReviewedAt: new Date(),
            financeReviewerId: req.user.id,
            financeDecision: "reject",
        })
        .where(eq(supplierQuotesTable.id, id))
        .returning();
    const enriched = await toQuote(updated);
    await logActivity({ userId: req.user.id, action: "FINANCE_REJECT_QUOTE", module: "quotes", description: body.data.reason, newData: enriched });
    res.json(enriched);
});

router.post("/quotes/:id/pay", authenticate, internalOnly, async (req, res) => {
    const params = PayQuoteParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [existing] = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.id, params.data.id));
    if (!existing) {
        res.status(404).json({ error: "Quote not found" });
        return;
    }
    if (existing.status !== "ADMIN_APPROVED") {
        res.status(400).json({ error: "Quote must be ADMIN_APPROVED before payment" });
        return;
    }
    const [quote] = await db.update(supplierQuotesTable).set({ status: "PAID", paidAt: new Date() }).where(eq(supplierQuotesTable.id, params.data.id)).returning();
    const enriched = await toQuote(quote);
    await logActivity({ userId: req.user?.id, action: "PAY", module: "quotes", description: `Paid quote from ${enriched.supplierName}`, newData: enriched });
    res.json(enriched);
});
export default router;
