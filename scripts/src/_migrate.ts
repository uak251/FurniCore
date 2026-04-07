import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

const migrations = [
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_theme VARCHAR(64)",
  "ALTER TABLE chart_of_accounts RENAME COLUMN account_type TO type",
  "ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS subtype VARCHAR(50)",
  "ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS parent_id INTEGER",
];
for (const stmt of migrations) {
  await db.execute(sql.raw(stmt));
  console.log("  applied:", stmt.slice(0, 80));
}
console.log("All migrations applied.");
await pool.end();
