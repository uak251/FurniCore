import { db, pool, chartOfAccountsTable } from "@workspace/db";
const rows = await db.select({ id: chartOfAccountsTable.id, code: chartOfAccountsTable.code }).from(chartOfAccountsTable).limit(5);
console.log("CoA rows found:", rows.length);
if (rows.length) console.log("Sample codes:", rows.map(r => r.code).join(", "));
else console.log("Chart of accounts is EMPTY — need to seed it.");
await pool.end();
