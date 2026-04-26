/**
 * Drizzle table definitions — align with `scripts/src/_migrate.ts` and route usage.
 * PKs are SERIAL/INTEGER unless noted; user FKs reference users(id) as INTEGER.
 */
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/* ─── Auth & profiles ─────────────────────────────────────────────────────── */

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isVerified: boolean("is_verified").notNull().default(false),
  refreshToken: text("refresh_token"),
  emailVerifyToken: text("email_verify_token"),
  emailVerifyExpiry: timestamp("email_verify_expiry", { withTimezone: true, mode: "date" }),
  profileImageUrl: text("profile_image_url"),
  permissions: text("permissions"),
  dashboardTheme: text("dashboard_theme"),
  phone: text("phone"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  totpSecretEnc: text("totp_secret_enc"),
  totpTempSecretEnc: text("totp_temp_secret_enc"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpiry: timestamp("password_reset_expiry", { withTimezone: true, mode: "date" }),
  /** Last linked OAuth provider, e.g. `google` | `facebook` (stable subject in oauth_subject). */
  oauthProvider: text("oauth_provider"),
  oauthSubject: text("oauth_subject"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const emailOtpChallengesTable = pgTable("email_otp_challenges", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  otpHash: text("otp_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const userProfilesTable = pgTable("user_profiles", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  fullName: text("full_name"),
  country: text("country"),
  cityRegion: text("city_region"),
  preferredCurrency: text("preferred_currency"),
  timezone: text("timezone"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const tokenBlacklistTable = pgTable("token_blacklist", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id").references(() => usersTable.id),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  reason: text("reason"),
});

export const twoFactorBackupCodesTable = pgTable("two_factor_backup_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const trustedDevicesTable = pgTable("trusted_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull().unique(),
  tokenHash: text("token_hash").notNull(),
  deviceName: text("device_name"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const authSessionsTable = pgTable("auth_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().unique(),
  refreshTokenHash: text("refresh_token_hash").notNull(),
  trustedDeviceId: text("trusted_device_id"),
  deviceName: text("device_name"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const currencyRatesCacheTable = pgTable("currency_rates_cache", {
  id: serial("id").primaryKey(),
  baseCurrency: text("base_currency").notNull().unique(),
  ratesJson: text("rates_json").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

/* ─── Catalog & products ─────────────────────────────────────────────────── */

export const productCategoriesTable = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  imageUrl: text("image_url"),
  showInCollection: boolean("show_in_collection").notNull().default(true),
});

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  sku: text("sku").notNull(),
  category: text("category"),
  categoryId: integer("category_id").references(() => productCategoriesTable.id),
  productStatus: text("product_status").notNull().default("AVAILABLE"),
  sellingPrice: text("selling_price").notNull(),
  costPrice: text("cost_price").notNull(),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  wipStage: text("wip_stage"),
  wipProgressPercent: integer("wip_progress_percent"),
  wipDepartment: text("wip_department"),
  compareAtPrice: numeric("compare_at_price", { precision: 12, scale: 2 }),
  hotRank: integer("hot_rank"),
  favouriteRank: integer("favourite_rank"),
  ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const productManufacturingEventsTable = pgTable("product_manufacturing_events", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  fromStage: text("from_stage"),
  toStage: text("to_stage"),
  fromProgress: integer("from_progress"),
  toProgress: integer("to_progress"),
  department: text("department"),
  note: text("note"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const manufacturingTasksTable = pgTable("manufacturing_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  productId: integer("product_id").references(() => productsTable.id),
  assigneeId: integer("assignee_id").references(() => usersTable.id),
  description: text("description"),
  estimatedHours: text("estimated_hours"),
  actualHours: text("actual_hours"),
  dueDate: timestamp("due_date", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

/* ─── Inventory & suppliers ──────────────────────────────────────────────── */

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  contactPerson: text("contact_person"),
  status: text("status"),
  rating: text("rating"),
  paymentTerms: text("payment_terms"),
  notes: text("notes"),
});

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  unit: text("unit").notNull(),
  quantity: text("quantity").notNull(),
  reorderLevel: text("reorder_level").notNull(),
  unitCost: text("unit_cost").notNull(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
});

export const supplierQuotesTable = pgTable("supplier_quotes", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliersTable.id),
  inventoryItemId: integer("inventory_item_id").references(() => inventoryTable.id),
  quantity: text("quantity").notNull(),
  unitPrice: text("unit_price").notNull(),
  totalPrice: text("total_price").notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true, mode: "date" }),
  status: text("status").notNull(),
  workflowStage: text("workflow_stage").default("legacy"),
  lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
  approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  submittedForReviewAt: timestamp("submitted_for_review_at", { withTimezone: true, mode: "date" }),
  submittedByUserId: integer("submitted_by_user_id").references(() => usersTable.id),
  pmReviewedAt: timestamp("pm_reviewed_at", { withTimezone: true, mode: "date" }),
  pmReviewerId: integer("pm_reviewer_id").references(() => usersTable.id),
  pmDecision: text("pm_decision"),
  financeReviewedAt: timestamp("finance_reviewed_at", { withTimezone: true, mode: "date" }),
  financeReviewerId: integer("finance_reviewer_id").references(() => usersTable.id),
  financeDecision: text("finance_decision"),
  requiresFinanceStep: boolean("requires_finance_step").notNull().default(false),
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const supplierOfficialRatesTable = pgTable("supplier_official_rates", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliersTable.id),
  inventoryItemId: integer("inventory_item_id")
    .notNull()
    .references(() => inventoryTable.id),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  sourceQuoteId: integer("source_quote_id").references(() => supplierQuotesTable.id),
  effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const productPriceProposalsTable = pgTable("product_price_proposals", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id),
  proposedSellingPrice: text("proposed_selling_price").notNull(),
  proposedCompareAtPrice: text("proposed_compare_at_price"),
  discountPercentRequested: text("discount_percent_requested"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  proposedByUserId: integer("proposed_by_user_id").references(() => usersTable.id),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const productStandardCostsMonthlyTable = pgTable("product_standard_costs_monthly", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  materialStandard: numeric("material_standard", { precision: 12, scale: 2 }).notNull(),
  laborStandard: numeric("labor_standard", { precision: 12, scale: 2 }).notNull(),
  overheadStandard: numeric("overhead_standard", { precision: 12, scale: 2 }).notNull(),
  totalStandard: numeric("total_standard", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const cogmVarianceRecordsTable = pgTable("cogm_variance_records", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => productsTable.id),
  taskId: integer("task_id").references(() => manufacturingTasksTable.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  estimatedMaterial: numeric("estimated_material", { precision: 12, scale: 2 }).notNull(),
  actualMaterial: numeric("actual_material", { precision: 12, scale: 2 }).notNull(),
  estimatedLabor: numeric("estimated_labor", { precision: 12, scale: 2 }).notNull(),
  actualLabor: numeric("actual_labor", { precision: 12, scale: 2 }).notNull(),
  varianceAmount: numeric("variance_amount", { precision: 12, scale: 2 }).notNull(),
  variancePercent: numeric("variance_percent", { precision: 8, scale: 2 }),
  remark: text("remark"),
  computedAt: timestamp("computed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/* ─── Sales orders ────────────────────────────────────────────────────────── */

export const customerOrdersTable = pgTable("customer_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number"),
  customerId: integer("customer_id").references(() => usersTable.id),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  status: text("status").notNull(),
  shippingAddress: text("shipping_address"),
  totalAmount: text("total_amount"),
  subtotal: text("subtotal"),
  discountCode: text("discount_code"),
  discountAmount: text("discount_amount"),
  taxRate: text("tax_rate"),
  taxAmount: text("tax_amount"),
  estimatedDelivery: timestamp("estimated_delivery", { withTimezone: true, mode: "date" }),
  taskId: integer("task_id").references(() => manufacturingTasksTable.id),
  createdBy: integer("created_by").references(() => usersTable.id),
  notes: text("notes"),
  paymentPlanRequestedAt: timestamp("payment_plan_requested_at", { withTimezone: true, mode: "date" }),
  paymentPlanCustomerNotes: text("payment_plan_customer_notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => customerOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id),
  productName: text("product_name"),
  productSku: text("product_sku"),
  unitPrice: text("unit_price").notNull(),
  discountPercent: text("discount_percent"),
  quantity: integer("quantity"),
  lineTotal: text("line_total").notNull(),
});

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number"),
  orderId: integer("order_id").references(() => customerOrdersTable.id),
  customerId: integer("customer_id").references(() => usersTable.id),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  subtotal: text("subtotal"),
  discountAmount: text("discount_amount"),
  taxRate: text("tax_rate"),
  taxAmount: text("tax_amount"),
  totalAmount: text("total_amount"),
  status: text("status"),
  dueDate: timestamp("due_date", { withTimezone: true, mode: "date" }),
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
  paymentProofUrl: text("payment_proof_url"),
  pdfUrl: text("pdf_url"),
  notes: text("notes"),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const discountsTable = pgTable("discounts", {
  id: serial("id").primaryKey(),
  code: text("code"),
  description: text("description"),
  type: text("type"),
  value: text("value"),
  minOrderAmount: text("min_order_amount"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const orderUpdatesTable = pgTable("order_updates", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => customerOrdersTable.id),
  message: text("message"),
  status: text("status"),
  imageUrl: text("image_url"),
  visibleToCustomer: boolean("visible_to_customer").default(true),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

/* ─── Accounting ─────────────────────────────────────────────────────────── */

export const chartOfAccountsTable = pgTable("chart_of_accounts", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  subtype: text("subtype"),
  normalBalance: text("normal_balance").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  parentId: integer("parent_id"),
});

export const journalEntriesTable = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  entryNumber: text("entry_number").notNull(),
  date: timestamp("date", { mode: "date" }).notNull(),
  description: text("description"),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  status: text("status").notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true, mode: "date" }),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const journalEntryLinesTable = pgTable("journal_entry_lines", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id")
    .notNull()
    .references(() => journalEntriesTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id")
    .notNull()
    .references(() => chartOfAccountsTable.id),
  description: text("description"),
  debit: text("debit").notNull().default("0"),
  credit: text("credit").notNull().default("0"),
});

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  transactionDate: timestamp("transaction_date", { withTimezone: true, mode: "date" }).notNull(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  reference: text("reference"),
  accountId: integer("account_id").references(() => chartOfAccountsTable.id),
  journalEntryId: integer("journal_entry_id").references(() => journalEntriesTable.id),
});

export const accrualsTable = pgTable("accruals", {
  id: serial("id").primaryKey(),
  description: text("description"),
  amount: text("amount"),
  status: text("status"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

/* ─── HR & payroll ───────────────────────────────────────────────────────── */

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  department: text("department"),
  position: text("position"),
  baseSalary: text("base_salary").notNull(),
  hireDate: timestamp("hire_date", { withTimezone: true, mode: "date" }).notNull(),
  userId: integer("user_id").references(() => usersTable.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id),
  date: timestamp("date", { mode: "date" }).notNull(),
  status: text("status").notNull(),
  checkIn: timestamp("check_in", { withTimezone: true, mode: "date" }),
  checkOut: timestamp("check_out", { withTimezone: true, mode: "date" }),
  hoursWorked: text("hours_worked"),
});

export const payrollTable = pgTable("payroll", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  baseSalary: text("base_salary").notNull(),
  bonus: text("bonus").notNull(),
  deductions: text("deductions").notNull(),
  netSalary: text("net_salary").notNull(),
  notes: text("notes"),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  status: text("status").notNull().default("draft"),
});

export const payrollAdjustmentsTable = pgTable("payroll_adjustments", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employeesTable.id),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  type: text("type").notNull(),
  amount: text("amount").notNull(),
  reason: text("reason"),
  appliedToPayrollId: integer("applied_to_payroll_id").references(() => payrollTable.id),
});

export const performanceReviewsTable = pgTable("performance_reviews", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employeesTable.id),
  reviewDate: timestamp("review_date", { withTimezone: true, mode: "date" }),
  rating: text("rating"),
  notes: text("notes"),
});

/* ─── Ops & misc ─────────────────────────────────────────────────────────── */

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"),
  link: text("link"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const activityLogsTable = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  action: text("action").notNull(),
  module: text("module").notNull(),
  description: text("description").notNull(),
  oldData: jsonb("old_data"),
  newData: jsonb("new_data"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const recordImagesTable = pgTable("record_images", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  url: text("url").notNull(),
  altText: text("alt_text"),
  sortOrder: integer("sort_order").notNull().default(0),
  uploadedBy: integer("uploaded_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const deliveryUpdatesTable = pgTable("delivery_updates", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  quoteId: integer("quote_id").references(() => supplierQuotesTable.id),
  status: text("status"),
  notes: text("notes"),
  eta: timestamp("eta", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const productionOrdersTable = pgTable("production_orders", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => manufacturingTasksTable.id),
  productId: integer("product_id").references(() => productsTable.id),
  createdBy: integer("created_by").references(() => usersTable.id),
  status: text("status"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const qcRemarksTable = pgTable("qc_remarks", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => manufacturingTasksTable.id),
  inspectorId: integer("inspector_id").references(() => usersTable.id),
  /** pass | fail | hold */
  result: text("result"),
  remark: text("remark"),
  visibleToCustomer: boolean("visible_to_customer").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const materialUsageTable = pgTable("material_usage", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => manufacturingTasksTable.id),
  inventoryItemId: integer("inventory_item_id").references(() => inventoryTable.id),
  materialName: text("material_name"),
  unit: text("unit"),
  notes: text("notes"),
  quantityUsed: text("quantity_used"),
  loggedBy: integer("logged_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
});
