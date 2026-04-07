/**
 * Seed demo posted journal entries (trial balance, P&L, balance sheet) and optional
 * cash-book transactions. Idempotent: journal entries upserted by entry_number;
 * demo transactions replaced by description prefix.
 *
 * Prerequisite: chart of accounts seeded (POST /accounts/seed as admin, or import CSV).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-demo-accounting
 *
 * Data: scripts/data/demo-accounting.json
 * DATABASE_URL: ../.env
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, inArray, like } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  chartOfAccountsTable,
  journalEntriesTable,
  journalEntryLinesTable,
  transactionsTable,
} from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface JournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
}

interface JournalEntryRow {
  entryNumber: string;
  date: string;
  description: string;
  referenceType?: string;
  notes?: string;
  lines: JournalLine[];
}

interface TransactionRow {
  type: string;
  category: string;
  amount: number;
  description: string;
  transactionDate: string;
  accountCode: string;
}

interface DemoAccountingFile {
  journalEntries: JournalEntryRow[];
  transactions?: TransactionRow[];
}

const data: DemoAccountingFile = JSON.parse(
  readFileSync(join(__dirname, "../data/demo-accounting.json"), "utf-8"),
) as DemoAccountingFile;

function money(n: number): string {
  return n.toFixed(2);
}

console.log("\nFurniCore — Seed demo accounting");
console.log(`  Journal entries: ${data.journalEntries.length}`);
console.log(`  Cash transactions: ${data.transactions?.length ?? 0}\n`);

/* ── Resolve accountant user ID for created_by attribution ───────────────── */

const ACCOUNTANT_EMAIL = "amira.hassan@furnicore.demo";
const [accountantRow] = await db
  .select({ id: usersTable.id })
  .from(usersTable)
  .where(eq(usersTable.email, ACCOUNTANT_EMAIL))
  .limit(1);
const accountantId = accountantRow?.id ?? null;
if (!accountantId) {
  console.log(`  [info] Accountant (${ACCOUNTANT_EMAIL}) not found — journal entries will have createdBy=null. Run seed-demo-users first.`);
}

const codes = new Set<string>();
for (const je of data.journalEntries) {
  for (const line of je.lines) codes.add(line.accountCode);
}
for (const tx of data.transactions ?? []) {
  codes.add(tx.accountCode);
}

const accountRows = await db
  .select({ id: chartOfAccountsTable.id, code: chartOfAccountsTable.code })
  .from(chartOfAccountsTable)
  .where(inArray(chartOfAccountsTable.code, [...codes]));

const codeToId = new Map(accountRows.map((r) => [r.code, r.id]));
const missing = [...codes].filter((c) => !codeToId.has(c));
if (missing.length > 0) {
  console.error(
    `  ERROR: Missing chart-of-accounts codes: ${missing.join(", ")}. Seed accounts first (POST /accounts/seed).`,
  );
  await pool.end();
  process.exit(1);
}

for (const je of data.journalEntries) {
  let d = 0;
  let c = 0;
  for (const line of je.lines) {
    d += line.debit;
    c += line.credit;
  }
  if (Math.abs(d - c) > 0.01) {
    console.error(`  ERROR: Unbalanced entry ${je.entryNumber}: debit ${d} credit ${c}`);
    await pool.end();
    process.exit(1);
  }

  const postedAt = new Date(`${je.date}T12:00:00.000Z`);

  const [existing] = await db
    .select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.entryNumber, je.entryNumber))
    .limit(1);

  let journalEntryId: number;

  if (existing) {
    await db.delete(journalEntryLinesTable).where(eq(journalEntryLinesTable.journalEntryId, existing.id));
    await db
      .update(journalEntriesTable)
      .set({
        date: je.date,
        description: je.description,
        referenceType: je.referenceType ?? "manual",
        referenceId: null,
        status: "posted",
        postedAt,
        notes: je.notes ?? null,
      })
      .where(eq(journalEntriesTable.id, existing.id));
    journalEntryId = existing.id;
    console.log(`  [journal] updated ${je.entryNumber}`);
  } else {
    const [inserted] = await db
      .insert(journalEntriesTable)
      .values({
        entryNumber: je.entryNumber,
        date: je.date,
        description: je.description,
        referenceType: je.referenceType ?? "manual",
        referenceId: null,
        status: "posted",
        postedAt,
        notes: je.notes ?? null,
        createdBy: accountantId,
      })
      .returning({ id: journalEntriesTable.id });
    journalEntryId = inserted.id;
    console.log(`  [journal] created ${je.entryNumber}`);
  }

  await db.insert(journalEntryLinesTable).values(
    je.lines.map((line) => ({
      journalEntryId,
      accountId: codeToId.get(line.accountCode)!,
      description: line.description ?? null,
      debit: money(line.debit),
      credit: money(line.credit),
    })),
  );
}

if (data.transactions?.length) {
  await db.delete(transactionsTable).where(like(transactionsTable.description, "[demo-seed:accounting]%"));

  for (const tx of data.transactions) {
    await db.insert(transactionsTable).values({
      type: tx.type,
      category: tx.category,
      amount: money(tx.amount),
      description: tx.description,
      reference: null,
      supplierId: null,
      accountId: codeToId.get(tx.accountCode) ?? null,
      journalEntryId: null,
      status: "completed",
      transactionDate: new Date(tx.transactionDate),
    });
    console.log(`  [transaction] ${tx.type} ${tx.amount} — ${tx.category}`);
  }
}

console.log("\n  Done. See demo-accounting.json → meta.reportMapping for TB / P&L / BS / cash-book.\n");

await pool.end();
