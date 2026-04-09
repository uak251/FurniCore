import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

/** Idempotent rename: skip if already `type` or legacy column missing. */
const renameCoaAccountType = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chart_of_accounts' AND column_name = 'account_type'
  ) THEN
    ALTER TABLE chart_of_accounts RENAME COLUMN account_type TO type;
  END IF;
END $$;
`;

const migrations = [
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_theme VARCHAR(64)",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40)",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT",
  renameCoaAccountType,
  "ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS subtype VARCHAR(50)",
  "ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS parent_id INTEGER",
];
for (const stmt of migrations) {
  await db.execute(sql.raw(stmt));
  console.log("  applied:", stmt.slice(0, 80));
}
console.log("All migrations applied.");
await pool.end();
