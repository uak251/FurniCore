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

const createModuleTables = `
CREATE TABLE IF NOT EXISTS email_otp_challenges (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_otp_challenges_email_idx ON email_otp_challenges (email);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255),
  country VARCHAR(120),
  city_region VARCHAR(120),
  preferred_currency VARCHAR(3),
  timezone VARCHAR(80),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS currency_rates_cache (
  id SERIAL PRIMARY KEY,
  base_currency VARCHAR(3) NOT NULL UNIQUE,
  rates_json TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);
`;

/** Existing DBs: allow null preferred currency (locality default vs explicit override). */
const userProfilesPreferredCurrencyNullable = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
      AND column_name = 'preferred_currency' AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE user_profiles ALTER COLUMN preferred_currency DROP DEFAULT;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
      AND column_name = 'preferred_currency' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE user_profiles ALTER COLUMN preferred_currency DROP NOT NULL;
  END IF;
END $$;
`;

/** Categories, product status/WIP columns, manufacturing event log + backfill. */
const productCatalogModuleV1 = `
CREATE TABLE IF NOT EXISTS product_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES product_categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE products ADD COLUMN IF NOT EXISTS wip_stage VARCHAR(32);
ALTER TABLE products ADD COLUMN IF NOT EXISTS wip_progress_percent SMALLINT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wip_department VARCHAR(120);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_wip_progress_range'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_wip_progress_range
      CHECK (wip_progress_percent IS NULL OR (wip_progress_percent >= 0 AND wip_progress_percent <= 100));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS product_manufacturing_events (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  event_type VARCHAR(32) NOT NULL,
  from_status VARCHAR(32),
  to_status VARCHAR(32),
  from_stage VARCHAR(32),
  to_stage VARCHAR(32),
  from_progress SMALLINT,
  to_progress SMALLINT,
  department VARCHAR(120),
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS product_manufacturing_events_product_id_idx ON product_manufacturing_events (product_id);
CREATE INDEX IF NOT EXISTS product_manufacturing_events_created_at_idx ON product_manufacturing_events (created_at);

INSERT INTO product_categories (name, slug, sort_order)
SELECT 'Uncategorized', 'uncategorized', -1
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE slug = 'uncategorized');

INSERT INTO product_categories (name, slug, sort_order)
SELECT x.nm, 'c' || substr(md5(x.nm), 1, 15), 0
FROM (
  SELECT DISTINCT trim(category) AS nm FROM products WHERE trim(category) <> ''
) x
WHERE NOT EXISTS (SELECT 1 FROM product_categories pc WHERE pc.name = x.nm);

UPDATE products p
SET category_id = pc.id
FROM product_categories pc
WHERE trim(p.category) <> '' AND pc.name = trim(p.category);

UPDATE products
SET category = 'Uncategorized',
    category_id = (SELECT id FROM product_categories WHERE slug = 'uncategorized' LIMIT 1)
WHERE trim(category) = '' OR category IS NULL;
`;

/** Storefront merchandising: category hero images, promo pricing, featured rails. */
const storefrontMerchV1 = `
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS show_in_collection BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS hot_rank INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS favourite_rank INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2);

CREATE INDEX IF NOT EXISTS products_hot_rank_idx ON products (hot_rank) WHERE hot_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_fav_rank_idx ON products (favourite_rank) WHERE favourite_rank IS NOT NULL;
`;

/** Checkout: auto-invoice + optional payment-plan request on customer_orders */
const checkoutInvoicePaymentPlanV1 = `
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS payment_plan_requested_at TIMESTAMPTZ;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS payment_plan_customer_notes TEXT;
`;

const migrations = [
  createModuleTables,
  userProfilesPreferredCurrencyNullable,
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_theme VARCHAR(64)",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40)",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT",
  renameCoaAccountType,
  "ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS subtype VARCHAR(50)",
  "ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS parent_id INTEGER",
  productCatalogModuleV1,
  storefrontMerchV1,
  checkoutInvoicePaymentPlanV1,
];

for (const stmt of migrations) {
  await db.execute(sql.raw(stmt));
  console.log("  applied:", stmt.slice(0, 80));
}
console.log("All migrations applied.");
await pool.end();
