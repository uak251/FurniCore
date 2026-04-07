import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

const tables = ["chart_of_accounts", "journal_entries", "journal_entry_lines", "transactions", "customer_orders", "order_items", "order_updates", "invoices", "suppliers", "supplier_quotes", "manufacturing_tasks", "production_orders", "activity_logs", "notifications"];
for (const t of tables) {
  const rows = await db.execute(sql.raw(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='${t}' ORDER BY ordinal_position`
  ));
  console.log(`\n── ${t} ──`);
  for (const r of rows.rows as {column_name: string; data_type: string}[]) {
    console.log(`  ${r.column_name.padEnd(30)} ${r.data_type}`);
  }
}
await pool.end();
