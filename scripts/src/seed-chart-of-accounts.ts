/**
 * Seed standard Chart of Accounts directly into the DB.
 * Mirrors the STANDARD_ACCOUNTS list from api-server/src/routes/accounts.ts.
 * Idempotent: upserts by code (updates name/subtype/normalBalance if already exists).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-chart-of-accounts
 */

import { eq } from "drizzle-orm";
import { db, pool, chartOfAccountsTable } from "@workspace/db";

const STANDARD_ACCOUNTS = [
  // Assets
  { code: "1000", name: "Cash & Bank",              type: "asset",     subtype: "current_asset",       normalBalance: "debit"  },
  { code: "1100", name: "Accounts Receivable",       type: "asset",     subtype: "current_asset",       normalBalance: "debit"  },
  { code: "1200", name: "Inventory",                 type: "asset",     subtype: "current_asset",       normalBalance: "debit"  },
  { code: "1300", name: "Prepaid Expenses",          type: "asset",     subtype: "current_asset",       normalBalance: "debit"  },
  { code: "1500", name: "Fixed Assets",              type: "asset",     subtype: "fixed_asset",         normalBalance: "debit"  },
  { code: "1600", name: "Accumulated Depreciation",  type: "asset",     subtype: "fixed_asset",         normalBalance: "credit" },
  // Liabilities
  { code: "2000", name: "Accounts Payable",          type: "liability", subtype: "current_liability",   normalBalance: "credit" },
  { code: "2100", name: "Accrued Liabilities",       type: "liability", subtype: "current_liability",   normalBalance: "credit" },
  { code: "2200", name: "Deferred Revenue",          type: "liability", subtype: "current_liability",   normalBalance: "credit" },
  { code: "2300", name: "Salaries Payable",          type: "liability", subtype: "current_liability",   normalBalance: "credit" },
  { code: "2500", name: "Notes Payable",             type: "liability", subtype: "long_term_liability",  normalBalance: "credit" },
  // Equity
  { code: "3000", name: "Owner's Equity",            type: "equity",    subtype: "equity",              normalBalance: "credit" },
  { code: "3100", name: "Retained Earnings",         type: "equity",    subtype: "equity",              normalBalance: "credit" },
  // Income
  { code: "4000", name: "Sales Revenue",             type: "income",    subtype: "operating",           normalBalance: "credit" },
  { code: "4100", name: "Service Revenue",           type: "income",    subtype: "operating",           normalBalance: "credit" },
  { code: "4200", name: "Other Income",              type: "income",    subtype: "non_operating",       normalBalance: "credit" },
  // COGS
  { code: "5000", name: "Cost of Goods Sold",        type: "expense",   subtype: "cogs",                normalBalance: "debit"  },
  // Operating Expenses
  { code: "6000", name: "Salaries Expense",          type: "expense",   subtype: "operating",           normalBalance: "debit"  },
  { code: "6100", name: "Rent Expense",              type: "expense",   subtype: "operating",           normalBalance: "debit"  },
  { code: "6200", name: "Utilities Expense",         type: "expense",   subtype: "operating",           normalBalance: "debit"  },
  { code: "6300", name: "Depreciation Expense",      type: "expense",   subtype: "operating",           normalBalance: "debit"  },
  { code: "6400", name: "Marketing Expense",         type: "expense",   subtype: "operating",           normalBalance: "debit"  },
  { code: "6500", name: "Office Supplies",           type: "expense",   subtype: "operating",           normalBalance: "debit"  },
  { code: "6900", name: "Other Expenses",            type: "expense",   subtype: "operating",           normalBalance: "debit"  },
] as const;

console.log("\nFurniCore — Seed Chart of Accounts");
console.log(`  Accounts: ${STANDARD_ACCOUNTS.length}\n`);

let created = 0;
let updated = 0;

for (const acct of STANDARD_ACCOUNTS) {
  const [existing] = await db
    .select({ id: chartOfAccountsTable.id })
    .from(chartOfAccountsTable)
    .where(eq(chartOfAccountsTable.code, acct.code))
    .limit(1);

  if (existing) {
    await db
      .update(chartOfAccountsTable)
      .set({ name: acct.name, type: acct.type, subtype: acct.subtype, normalBalance: acct.normalBalance, isActive: true })
      .where(eq(chartOfAccountsTable.id, existing.id));
    updated++;
    console.log(`  updated  ${acct.code}  ${acct.name}`);
  } else {
    await db.insert(chartOfAccountsTable).values({
      code:          acct.code,
      name:          acct.name,
      type:          acct.type,
      subtype:       acct.subtype,
      normalBalance: acct.normalBalance,
      isActive:      true,
    });
    created++;
    console.log(`  created  ${acct.code}  ${acct.name}`);
  }
}

console.log(`\n  Done — created: ${created}, updated: ${updated}\n`);

await pool.end();
