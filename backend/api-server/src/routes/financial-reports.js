/**
 * Financial Reports API
 *
 * All endpoints are READ-ONLY.
 * Roles: admin, accountant, manager
 *
 * GET /reports/trial-balance   ?asOf=YYYY-MM-DD
 * GET /reports/profit-loss     ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * GET /reports/balance-sheet   ?asOf=YYYY-MM-DD
 * GET /reports/cash-book       ?from=&to=    (enhanced transaction ledger with account info)
 */
import { Router } from "express";
import { sql, eq, and, asc } from "drizzle-orm";
import { db, journalEntriesTable, journalEntryLinesTable, chartOfAccountsTable, transactionsTable, suppliersTable } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
const router = Router();
const readRoles = requireRole("admin", "accountant", "manager");
/* ── shared SQL helpers ──────────────────────────────────────────────────────*/
function balanceSql(alias = "balance") {
    return sql `
    CASE
      WHEN ${chartOfAccountsTable.normalBalance} = 'debit'
      THEN COALESCE(SUM(${journalEntryLinesTable.debit}), 0) - COALESCE(SUM(${journalEntryLinesTable.credit}), 0)
      ELSE COALESCE(SUM(${journalEntryLinesTable.credit}), 0) - COALESCE(SUM(${journalEntryLinesTable.debit}), 0)
    END
  `.as(alias);
}
/* ── GET /reports/trial-balance ─────────────────────────────────────────────*/
router.get("/reports/trial-balance", authenticate, readRoles, async (req, res, next) => {
    const asOf = req.query.asOf || new Date().toISOString().split("T")[0];
    try {
        const rows = await db
            .select({
            id: chartOfAccountsTable.id,
            code: chartOfAccountsTable.code,
            name: chartOfAccountsTable.name,
            type: chartOfAccountsTable.type,
            subtype: chartOfAccountsTable.subtype,
            normalBalance: chartOfAccountsTable.normalBalance,
            totalDebit: sql `COALESCE(SUM(${journalEntryLinesTable.debit}), 0)`,
            totalCredit: sql `COALESCE(SUM(${journalEntryLinesTable.credit}), 0)`,
            balance: balanceSql(),
        })
            .from(chartOfAccountsTable)
            .leftJoin(journalEntryLinesTable, eq(journalEntryLinesTable.accountId, chartOfAccountsTable.id))
            .leftJoin(journalEntriesTable, and(eq(journalEntriesTable.id, journalEntryLinesTable.journalEntryId), eq(journalEntriesTable.status, "posted"), sql `${journalEntriesTable.date} <= ${asOf}`))
            .where(eq(chartOfAccountsTable.isActive, true))
            .groupBy(chartOfAccountsTable.id, chartOfAccountsTable.code, chartOfAccountsTable.name, chartOfAccountsTable.type, chartOfAccountsTable.subtype, chartOfAccountsTable.normalBalance)
            .orderBy(asc(chartOfAccountsTable.code));
        const data = rows.map((r) => ({
            ...r,
            totalDebit: Number(r.totalDebit),
            totalCredit: Number(r.totalCredit),
            balance: Number(r.balance),
        }));
        const grandDebit = data.reduce((s, r) => s + r.totalDebit, 0);
        const grandCredit = data.reduce((s, r) => s + r.totalCredit, 0);
        res.json({ asOf, rows: data, totals: { debit: grandDebit, credit: grandCredit, balanced: Math.abs(grandDebit - grandCredit) < 0.01 } });
    }
    catch (err) {
        next(err);
    }
});
/* ── GET /reports/profit-loss ────────────────────────────────────────────────*/
router.get("/reports/profit-loss", authenticate, readRoles, async (req, res, next) => {
    const { from, to } = req.query;
    const now = new Date();
    const fromDate = from ?? `${now.getFullYear()}-01-01`;
    const toDate = to ?? now.toISOString().split("T")[0];
    try {
        const rows = await db
            .select({
            id: chartOfAccountsTable.id,
            code: chartOfAccountsTable.code,
            name: chartOfAccountsTable.name,
            type: chartOfAccountsTable.type,
            subtype: chartOfAccountsTable.subtype,
            normalBalance: chartOfAccountsTable.normalBalance,
            balance: balanceSql(),
        })
            .from(chartOfAccountsTable)
            .leftJoin(journalEntryLinesTable, eq(journalEntryLinesTable.accountId, chartOfAccountsTable.id))
            .leftJoin(journalEntriesTable, and(eq(journalEntriesTable.id, journalEntryLinesTable.journalEntryId), eq(journalEntriesTable.status, "posted"), sql `${journalEntriesTable.date} >= ${fromDate}`, sql `${journalEntriesTable.date} <= ${toDate}`))
            .where(and(eq(chartOfAccountsTable.isActive, true), sql `${chartOfAccountsTable.type} IN ('income', 'expense')`))
            .groupBy(chartOfAccountsTable.id, chartOfAccountsTable.code, chartOfAccountsTable.name, chartOfAccountsTable.type, chartOfAccountsTable.subtype, chartOfAccountsTable.normalBalance)
            .orderBy(asc(chartOfAccountsTable.code));
        const income = rows.filter((r) => r.type === "income").map((r) => ({ ...r, balance: Number(r.balance) }));
        const expenses = rows.filter((r) => r.type === "expense").map((r) => ({ ...r, balance: Number(r.balance) }));
        const totalIncome = income.reduce((s, r) => s + r.balance, 0);
        const totalExpenses = expenses.reduce((s, r) => s + r.balance, 0);
        const netProfit = totalIncome - totalExpenses;
        const margin = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : "0.0";
        res.json({ from: fromDate, to: toDate, income, expenses, totals: { income: totalIncome, expenses: totalExpenses, netProfit, margin: Number(margin) } });
    }
    catch (err) {
        next(err);
    }
});
/* ── GET /reports/balance-sheet ──────────────────────────────────────────────*/
router.get("/reports/balance-sheet", authenticate, readRoles, async (req, res, next) => {
    const asOf = req.query.asOf || new Date().toISOString().split("T")[0];
    try {
        const rows = await db
            .select({
            id: chartOfAccountsTable.id,
            code: chartOfAccountsTable.code,
            name: chartOfAccountsTable.name,
            type: chartOfAccountsTable.type,
            subtype: chartOfAccountsTable.subtype,
            normalBalance: chartOfAccountsTable.normalBalance,
            balance: balanceSql(),
        })
            .from(chartOfAccountsTable)
            .leftJoin(journalEntryLinesTable, eq(journalEntryLinesTable.accountId, chartOfAccountsTable.id))
            .leftJoin(journalEntriesTable, and(eq(journalEntriesTable.id, journalEntryLinesTable.journalEntryId), eq(journalEntriesTable.status, "posted"), sql `${journalEntriesTable.date} <= ${asOf}`))
            .where(and(eq(chartOfAccountsTable.isActive, true), sql `${chartOfAccountsTable.type} IN ('asset', 'liability', 'equity')`))
            .groupBy(chartOfAccountsTable.id, chartOfAccountsTable.code, chartOfAccountsTable.name, chartOfAccountsTable.type, chartOfAccountsTable.subtype, chartOfAccountsTable.normalBalance)
            .orderBy(asc(chartOfAccountsTable.code));
        const assets = rows.filter((r) => r.type === "asset").map((r) => ({ ...r, balance: Number(r.balance) }));
        const liabilities = rows.filter((r) => r.type === "liability").map((r) => ({ ...r, balance: Number(r.balance) }));
        const equity = rows.filter((r) => r.type === "equity").map((r) => ({ ...r, balance: Number(r.balance) }));
        const totalAssets = assets.reduce((s, r) => s + r.balance, 0);
        const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
        const totalEquity = equity.reduce((s, r) => s + r.balance, 0);
        const totalLiabEquity = totalLiabilities + totalEquity;
        const balanced = Math.abs(totalAssets - totalLiabEquity) < 0.01;
        res.json({
            asOf,
            assets,
            liabilities,
            equity,
            totals: { assets: totalAssets, liabilities: totalLiabilities, equity: totalEquity, liabilitiesAndEquity: totalLiabEquity, balanced },
        });
    }
    catch (err) {
        next(err);
    }
});
/* ── GET /reports/cash-book ───────────────────────────────────────────────────
   Enhanced transaction ledger with chart-of-accounts classification.        */
router.get("/reports/cash-book", authenticate, readRoles, async (req, res, next) => {
    const { from, to } = req.query;
    try {
        let query = db
            .select({
            id: transactionsTable.id,
            type: transactionsTable.type,
            category: transactionsTable.category,
            amount: transactionsTable.amount,
            description: transactionsTable.description,
            reference: transactionsTable.reference,
            status: transactionsTable.status,
            transactionDate: transactionsTable.transactionDate,
            accountId: transactionsTable.accountId,
            accountCode: chartOfAccountsTable.code,
            accountName: chartOfAccountsTable.name,
            accountType: chartOfAccountsTable.type,
            journalEntryId: transactionsTable.journalEntryId,
            supplierName: suppliersTable.name,
        })
            .from(transactionsTable)
            .leftJoin(chartOfAccountsTable, eq(transactionsTable.accountId, chartOfAccountsTable.id))
            .leftJoin(suppliersTable, eq(transactionsTable.supplierId, suppliersTable.id))
            .$dynamic();
        if (from)
            query = query.where(sql `${transactionsTable.transactionDate} >= ${from}`);
        if (to)
            query = query.where(sql `${transactionsTable.transactionDate} <= ${to + "T23:59:59"}`);
        const rows = await query;
        const data = rows.map((r) => ({ ...r, amount: Number(r.amount) }));
        const totalIncome = data.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
        const totalExpense = data.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
        const netCash = totalIncome - totalExpense;
        res.json({ rows: data, totals: { income: totalIncome, expense: totalExpense, netCash } });
    }
    catch (err) {
        next(err);
    }
});
export default router;
