import { sql } from "drizzle-orm";

if (process.env.DATABASE_PUBLIC_URL?.trim()) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL.trim();
}

const { db, pool } = await import("@workspace/db");

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
  totp_enabled BOOLEAN NOT NULL DEFAULT false,
  totp_secret_enc TEXT,
  totp_temp_secret_enc TEXT,
  password_reset_token TEXT,
  password_reset_expiry TIMESTAMPTZ,
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

CREATE TABLE IF NOT EXISTS two_factor_backup_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS two_factor_backup_codes_user_id_idx ON two_factor_backup_codes (user_id);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  device_name TEXT,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trusted_devices_user_id_idx ON trusted_devices (user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL,
  trusted_device_id TEXT,
  device_name TEXT,
  user_agent TEXT,
  ip_address TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);

CREATE TABLE IF NOT EXISTS token_blacklist (
  id SERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS token_blacklist_expires_at_idx ON token_blacklist (expires_at);
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

/** HR + notifications + activity + accounting transactions — required by GET /api/dashboard/summary and related routes. */
const hrDashboardAccountingTablesV1 = `
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  department TEXT,
  position TEXT,
  base_salary TEXT NOT NULL,
  hire_date TIMESTAMPTZ NOT NULL,
  user_id INTEGER REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  "date" TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  hours_worked TEXT
);

CREATE TABLE IF NOT EXISTS payroll (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  base_salary TEXT NOT NULL,
  bonus TEXT NOT NULL,
  deductions TEXT NOT NULL,
  net_salary TEXT NOT NULL,
  notes TEXT,
  paid_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount TEXT NOT NULL,
  reason TEXT,
  applied_to_payroll_id INTEGER REFERENCES payroll(id)
);

CREATE TABLE IF NOT EXISTS performance_reviews (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  review_date TIMESTAMPTZ,
  rating TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  description TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  transaction_date TIMESTAMPTZ NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  reference TEXT,
  account_id INTEGER REFERENCES chart_of_accounts(id),
  journal_entry_id INTEGER
);
`;

/** Seed minimal transaction rows so analytics/dashboard endpoints have data on fresh environments. */
const transactionsSeedV1 = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'category'
  ) THEN
    INSERT INTO transactions (type, category, description, amount, transaction_date, reference, status)
    SELECT 'income', 'sales', 'Initial seeded sales transaction', '12500', NOW() - INTERVAL '15 days', 'SEED-INCOME-001', 'completed'
    WHERE NOT EXISTS (SELECT 1 FROM transactions);

    INSERT INTO transactions (type, category, description, amount, transaction_date, reference, status)
    SELECT 'expense', 'operations', 'Initial seeded operations expense', '4200', NOW() - INTERVAL '8 days', 'SEED-EXPENSE-001', 'completed'
    WHERE (SELECT COUNT(*) FROM transactions) = 1;
  ELSE
    INSERT INTO transactions (type, description, amount, transaction_date, reference)
    SELECT 'income', 'Initial seeded sales transaction', '12500', NOW() - INTERVAL '15 days', 'SEED-INCOME-001'
    WHERE NOT EXISTS (SELECT 1 FROM transactions);

    INSERT INTO transactions (type, description, amount, transaction_date, reference)
    SELECT 'expense', 'Initial seeded operations expense', '4200', NOW() - INTERVAL '8 days', 'SEED-EXPENSE-001'
    WHERE (SELECT COUNT(*) FROM transactions) = 1;
  END IF;
END $$;
`;

/** Normalize legacy transactions schema so analytics math works consistently. */
const transactionsSchemaNormalizeV1 = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'amount'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE transactions
      ALTER COLUMN amount TYPE NUMERIC(14,2)
      USING NULLIF(regexp_replace(amount::text, '[^0-9\\.-]', '', 'g'), '')::NUMERIC(14,2);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'type'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE transactions ALTER COLUMN type TYPE VARCHAR(50);
  END IF;
END $$;
`;

/** Older DBs may have payroll without status (approve route). */
const payrollStatusColumnIfMissing = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payroll'
  ) THEN
    ALTER TABLE payroll ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
  END IF;
END $$;
`;

const authHardeningColumnsV1 = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_temp_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expiry TIMESTAMPTZ;
`;

/** OAuth social login: which IdP last linked, plus stable subject for lookups. */
const oauthUserLinkColumnsV1 = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_subject TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_provider_subject_uq
  ON users (oauth_provider, oauth_subject)
  WHERE oauth_provider IS NOT NULL AND oauth_subject IS NOT NULL;
`;

/**
 * Fresh databases only had `customer_orders` from foundation; checkout inserts
 * also require `order_items`, `order_updates`, `invoices`, and `discounts`.
 * Idempotent: safe when tables already exist from Drizzle or older installs.
 */
const salesCheckoutTablesEnsureV1 = `
CREATE TABLE IF NOT EXISTS discounts (
  id SERIAL PRIMARY KEY,
  code TEXT,
  description TEXT,
  type TEXT,
  value TEXT,
  min_order_amount TEXT,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  product_name TEXT,
  product_sku TEXT,
  unit_price TEXT NOT NULL,
  discount_percent TEXT,
  quantity INTEGER,
  line_total TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_updates (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES customer_orders(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT,
  image_url TEXT,
  visible_to_customer BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number TEXT,
  order_id INTEGER REFERENCES customer_orders(id),
  customer_id INTEGER REFERENCES users(id),
  customer_name TEXT,
  customer_email TEXT,
  subtotal TEXT,
  discount_amount TEXT,
  tax_rate TEXT,
  tax_amount TEXT,
  total_amount TEXT,
  status TEXT,
  due_date TIMESTAMPTZ,
  payment_method TEXT,
  payment_reference TEXT,
  payment_proof_url TEXT,
  pdf_url TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

const salesWorkflowColumnsV2 = `
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS order_number TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS subtotal TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS discount_code TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS discount_amount TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS tax_rate TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS tax_amount TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS estimated_delivery TIMESTAMPTZ;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS task_id INTEGER REFERENCES manufacturing_tasks(id);
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_sku TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_percent TEXT;

ALTER TABLE order_updates ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE order_updates ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE order_updates ADD COLUMN IF NOT EXISTS visible_to_customer BOOLEAN DEFAULT true;
ALTER TABLE order_updates ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
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
  hrDashboardAccountingTablesV1,
  transactionsSchemaNormalizeV1,
  transactionsSeedV1,
  payrollStatusColumnIfMissing,
  authHardeningColumnsV1,
  oauthUserLinkColumnsV1,
  salesCheckoutTablesEnsureV1,
  salesWorkflowColumnsV2,
];

for (const stmt of migrations) {
  await db.execute(sql.raw(stmt));
  console.log("  applied:", stmt.slice(0, 80));
}
console.log("All migrations applied.");
await pool.end();
