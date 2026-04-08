/**
 * Journal Entries API — double-entry bookkeeping
 *
 * GET    /journal-entries              — list (admin, accountant, manager)
 * POST   /journal-entries              — create with lines (admin, accountant)
 * GET    /journal-entries/:id          — entry + lines + account details
 * PATCH  /journal-entries/:id          — update draft entry (admin, accountant)
 * POST   /journal-entries/:id/post     — post a draft (admin, accountant)
 * POST   /journal-entries/:id/reverse  — create mirror reversal (admin)
 *
 * Validation rules:
 *   - SUM(debit) must equal SUM(credit) before posting
 *   - Only draft entries may be edited
 *   - Only posted entries may be reversed
 */
import { Router } from "express";
import { eq, desc, sql, asc } from "drizzle-orm";
import { db, journalEntriesTable, journalEntryLinesTable, chartOfAccountsTable } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";
const router = Router();
/* ── helpers ────────────────────────────────────────────────────────────────── */
async function nextEntryNumber() {
    const year = new Date().getFullYear();
    const prefix = `JE-${year}-`;
    const [row] = await db
        .select({ n: sql `MAX(entry_number)` })
        .from(journalEntriesTable)
        .where(sql `entry_number LIKE ${prefix + "%"}`);
    const last = row?.n ? parseInt(row.n.split("-")[2] ?? "0", 10) : 0;
    return `${prefix}${String(last + 1).padStart(4, "0")}`;
}
async function getEntryWithLines(id) {
    const [entry] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, id));
    if (!entry)
        return null;
    const lines = await db
        .select({
        id: journalEntryLinesTable.id,
        accountId: journalEntryLinesTable.accountId,
        accountCode: chartOfAccountsTable.code,
        accountName: chartOfAccountsTable.name,
        accountType: chartOfAccountsTable.type,
        description: journalEntryLinesTable.description,
        debit: journalEntryLinesTable.debit,
        credit: journalEntryLinesTable.credit,
    })
        .from(journalEntryLinesTable)
        .leftJoin(chartOfAccountsTable, eq(journalEntryLinesTable.accountId, chartOfAccountsTable.id))
        .where(eq(journalEntryLinesTable.journalEntryId, id))
        .orderBy(asc(journalEntryLinesTable.id));
    return { ...entry, lines };
}
/* ── GET /journal-entries ────────────────────────────────────────────────────*/
router.get("/journal-entries", authenticate, async (req, res, next) => {
    try {
        const { status, from: _from, to: _to, limit = "50", offset = "0" } = req.query;
        let query = db.select({
            id: journalEntriesTable.id,
            entryNumber: journalEntriesTable.entryNumber,
            date: journalEntriesTable.date,
            description: journalEntriesTable.description,
            referenceType: journalEntriesTable.referenceType,
            referenceId: journalEntriesTable.referenceId,
            status: journalEntriesTable.status,
            postedAt: journalEntriesTable.postedAt,
            createdAt: journalEntriesTable.createdAt,
            totalDebit: sql `COALESCE((SELECT SUM(debit)  FROM journal_entry_lines WHERE journal_entry_id = journal_entries.id), 0)`,
            totalCredit: sql `COALESCE((SELECT SUM(credit) FROM journal_entry_lines WHERE journal_entry_id = journal_entries.id), 0)`,
        })
            .from(journalEntriesTable)
            .$dynamic();
        if (status)
            query = query.where(eq(journalEntriesTable.status, status));
        query = query.orderBy(desc(journalEntriesTable.date), desc(journalEntriesTable.id))
            .limit(parseInt(limit, 10))
            .offset(parseInt(offset, 10));
        const rows = await query;
        res.json(rows);
    }
    catch (err) {
        next(err);
    }
});
/* ── POST /journal-entries ───────────────────────────────────────────────────*/
router.post("/journal-entries", authenticate, requireRole("admin", "accountant"), async (req, res, next) => {
    const { date, description, referenceType, referenceId, notes, lines, autoPost } = req.body;
    if (!date) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "date is required." });
        return;
    }
    if (!Array.isArray(lines) || lines.length < 2) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "At least 2 lines (one debit, one credit) are required." });
        return;
    }
    const totalDebit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
    if (autoPost && Math.abs(totalDebit - totalCredit) > 0.001) {
        res.status(400).json({
            error: "UNBALANCED_ENTRY",
            message: `Entry is not balanced. Debits (${totalDebit.toFixed(2)}) ≠ Credits (${totalCredit.toFixed(2)}).`,
        });
        return;
    }
    try {
        const entryNumber = await nextEntryNumber();
        const status = autoPost ? "posted" : "draft";
        const postedAt = autoPost ? new Date() : null;
        const [entry] = await db.insert(journalEntriesTable).values({
            entryNumber, date, description, referenceType, referenceId,
            status, postedAt, notes, createdBy: req.user?.id,
        }).returning();
        await db.insert(journalEntryLinesTable).values(lines.map((l) => ({
            journalEntryId: entry.id,
            accountId: l.accountId,
            description: l.description,
            debit: String(l.debit ?? 0),
            credit: String(l.credit ?? 0),
        })));
        await logActivity({ userId: req.user?.id, action: "CREATE", module: "journal", description: `Created JE ${entryNumber}${autoPost ? " (posted)" : " (draft)"}` });
        const full = await getEntryWithLines(entry.id);
        res.status(201).json(full);
    }
    catch (err) {
        next(err);
    }
});
/* ── GET /journal-entries/:id ────────────────────────────────────────────────*/
router.get("/journal-entries/:id", authenticate, async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "INVALID_ID" });
        return;
    }
    try {
        const entry = await getEntryWithLines(id);
        if (!entry) {
            res.status(404).json({ error: "NOT_FOUND" });
            return;
        }
        res.json(entry);
    }
    catch (err) {
        next(err);
    }
});
/* ── PATCH /journal-entries/:id — update draft ───────────────────────────────*/
router.patch("/journal-entries/:id", authenticate, requireRole("admin", "accountant"), async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "INVALID_ID" });
        return;
    }
    try {
        const [existing] = await db.select({ status: journalEntriesTable.status }).from(journalEntriesTable).where(eq(journalEntriesTable.id, id));
        if (!existing) {
            res.status(404).json({ error: "NOT_FOUND" });
            return;
        }
        if (existing.status !== "draft") {
            res.status(400).json({ error: "NOT_DRAFT", message: "Only draft entries can be edited. Post or reverse the entry instead." });
            return;
        }
        const { date, description, notes, lines } = req.body;
        const updates = {};
        if (date)
            updates.date = date;
        if (description !== undefined)
            updates.description = description;
        if (notes !== undefined)
            updates.notes = notes;
        if (Object.keys(updates).length) {
            await db.update(journalEntriesTable).set(updates).where(eq(journalEntriesTable.id, id));
        }
        if (Array.isArray(lines)) {
            await db.delete(journalEntryLinesTable).where(eq(journalEntryLinesTable.journalEntryId, id));
            await db.insert(journalEntryLinesTable).values(lines.map((l) => ({ journalEntryId: id, accountId: l.accountId, description: l.description, debit: String(l.debit ?? 0), credit: String(l.credit ?? 0) })));
        }
        const full = await getEntryWithLines(id);
        res.json(full);
    }
    catch (err) {
        next(err);
    }
});
/* ── POST /journal-entries/:id/post ─────────────────────────────────────────*/
router.post("/journal-entries/:id/post", authenticate, requireRole("admin", "accountant"), async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "INVALID_ID" });
        return;
    }
    try {
        const [existing] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, id));
        if (!existing) {
            res.status(404).json({ error: "NOT_FOUND" });
            return;
        }
        if (existing.status !== "draft") {
            res.status(400).json({ error: "NOT_DRAFT", message: "Only draft entries can be posted." });
            return;
        }
        const lines = await db.select().from(journalEntryLinesTable).where(eq(journalEntryLinesTable.journalEntryId, id));
        const totalDebit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
        const totalCredit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
        if (Math.abs(totalDebit - totalCredit) > 0.001) {
            res.status(400).json({ error: "UNBALANCED_ENTRY", message: `Debits (${totalDebit.toFixed(2)}) ≠ Credits (${totalCredit.toFixed(2)}). Cannot post.` });
            return;
        }
        const [updated] = await db.update(journalEntriesTable)
            .set({ status: "posted", postedAt: new Date() })
            .where(eq(journalEntriesTable.id, id))
            .returning();
        await logActivity({ userId: req.user?.id, action: "UPDATE", module: "journal", description: `Posted JE ${existing.entryNumber}` });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
/* ── POST /journal-entries/:id/reverse ───────────────────────────────────────*/
router.post("/journal-entries/:id/reverse", authenticate, requireRole("admin"), async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: "INVALID_ID" });
        return;
    }
    try {
        const original = await getEntryWithLines(id);
        if (!original) {
            res.status(404).json({ error: "NOT_FOUND" });
            return;
        }
        if (original.status !== "posted") {
            res.status(400).json({ error: "NOT_POSTED", message: "Only posted entries can be reversed." });
            return;
        }
        const reversalNumber = await nextEntryNumber();
        const reversalDate = req.body.date ?? new Date().toISOString().split("T")[0];
        const [reversal] = await db.insert(journalEntriesTable).values({
            entryNumber: reversalNumber,
            date: reversalDate,
            description: `REVERSAL of ${original.entryNumber}: ${original.description ?? ""}`,
            referenceType: "reversal",
            referenceId: id,
            status: "posted",
            postedAt: new Date(),
            createdBy: req.user?.id,
        }).returning();
        // Swap debit/credit for each line
        await db.insert(journalEntryLinesTable).values(original.lines.map((l) => ({
            journalEntryId: reversal.id,
            accountId: l.accountId,
            description: `Reversal: ${l.description ?? ""}`,
            debit: l.credit ?? "0",
            credit: l.debit ?? "0",
        })));
        // Mark original as reversed
        await db.update(journalEntriesTable).set({ status: "reversed" }).where(eq(journalEntriesTable.id, id));
        await logActivity({ userId: req.user?.id, action: "UPDATE", module: "journal", description: `Reversed JE ${original.entryNumber} → new JE ${reversalNumber}` });
        const full = await getEntryWithLines(reversal.id);
        res.status(201).json(full);
    }
    catch (err) {
        next(err);
    }
});
/* ── Exported helper — create a posted JE from a cash transaction ────────────
   Called by accounting.ts when a transaction is created with account mapping. */
export async function autoCreateJournalEntry(opts) {
    const entryNumber = await nextEntryNumber();
    const [entry] = await db.insert(journalEntriesTable).values({
        entryNumber,
        date: opts.date,
        description: opts.description,
        referenceType: opts.referenceType,
        referenceId: opts.referenceId,
        status: "posted",
        postedAt: new Date(),
        createdBy: opts.createdBy,
    }).returning();
    await db.insert(journalEntryLinesTable).values([
        { journalEntryId: entry.id, accountId: opts.debitAccountId, debit: String(opts.amount), credit: "0" },
        { journalEntryId: entry.id, accountId: opts.creditAccountId, debit: "0", credit: String(opts.amount) },
    ]);
    return entry.id;
}
export default router;
