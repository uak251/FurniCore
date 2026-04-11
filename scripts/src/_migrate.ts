import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Fresh/empty databases (e.g. new Supabase project) have no `users` or core ERP tables.
 * Later migration strings assume these exist (`ALTER TABLE users`, `REFERENCES users`, etc.).
 * This block is idempotent (`IF NOT EXISTS`) and must run first.
 */
const foundationTablesV1 = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  refresh_token TEXT,
  email_verify_token TEXT,
  email_verify_expiry TIMESTAMPTZ,
  profile_image_url TEXT,
  permissions TEXT,
  dashboard_theme TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  contact_person TEXT,
  status TEXT,
  rating TEXT,
  payment_terms TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity TEXT NOT NULL,
  reorder_level TEXT NOT NULL,
  unit_cost TEXT NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT NOT NULL,
  category TEXT,
  selling_price TEXT NOT NULL,
  cost_price TEXT NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manufacturing_tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  product_id INTEGER REFERENCES products(id),
  assignee_id INTEGER REFERENCES users(id),
  description TEXT,
  estimated_hours TEXT,
  actual_hours TEXT,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_quotes (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  inventory_item_id INTEGER REFERENCES inventory(id),
  quantity TEXT NOT NULL,
  unit_price TEXT NOT NULL,
  total_price TEXT NOT NULL,
  valid_until TIMESTAMPTZ,
  status TEXT NOT NULL,
  notes TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  normal_balance TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  subtype TEXT,
  parent_id INTEGER
);

CREATE TABLE IF NOT EXISTS customer_orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL,
  total_amount TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

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

/** ERP pricing workflow, official rates, COGM / standard cost (FurniCore next iteration) */
const erpPricingCogmV1 = `
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS workflow_stage VARCHAR(32) DEFAULT 'legacy';
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMPTZ;
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS submitted_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS pm_reviewed_at TIMESTAMPTZ;
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS pm_reviewer_id INTEGER REFERENCES users(id);
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS pm_decision VARCHAR(20);
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS finance_reviewed_at TIMESTAMPTZ;
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS finance_reviewer_id INTEGER REFERENCES users(id);
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS finance_decision VARCHAR(20);
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS requires_finance_step BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supplier_quotes ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE TABLE IF NOT EXISTS supplier_official_rates (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  inventory_item_id INTEGER NOT NULL REFERENCES inventory(id),
  unit_price NUMERIC(12,2) NOT NULL,
  source_quote_id INTEGER REFERENCES supplier_quotes(id),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS supplier_official_rates_lookup_idx ON supplier_official_rates (supplier_id, inventory_item_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS product_price_proposals (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  proposed_selling_price NUMERIC(12,2) NOT NULL,
  proposed_compare_at_price NUMERIC(12,2),
  discount_percent_requested NUMERIC(5,2),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  notes TEXT,
  proposed_by_user_id INTEGER REFERENCES users(id),
  reviewed_by_user_id INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_standard_costs_monthly (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  material_standard NUMERIC(12,2) NOT NULL DEFAULT 0,
  labor_standard NUMERIC(12,2) NOT NULL DEFAULT 0,
  overhead_standard NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_standard NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, year, month)
);

CREATE TABLE IF NOT EXISTS cogm_variance_records (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  task_id INTEGER REFERENCES manufacturing_tasks(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  estimated_material NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_material NUMERIC(12,2) NOT NULL DEFAULT 0,
  estimated_labor NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_labor NUMERIC(12,2) NOT NULL DEFAULT 0,
  variance_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  variance_percent NUMERIC(8,2),
  remark VARCHAR(32),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cogm_variance_records_period_idx ON cogm_variance_records (year, month);

INSERT INTO app_settings (key, value)
VALUES ('FINANCE_QUOTE_APPROVAL_THRESHOLD', '50000')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value)
VALUES ('LABOR_HOURLY_RATE', '18')
ON CONFLICT (key) DO NOTHING;
`;

const migrations = [
  foundationTablesV1,
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
  erpPricingCogmV1,
];

for (const stmt of migrations) {
  await db.execute(sql.raw(stmt));
  console.log("  applied:", stmt.slice(0, 80));
}
console.log("All migrations applied.");
await pool.end();
