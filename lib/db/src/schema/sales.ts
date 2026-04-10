/**
 * Sales & Customer schema
 *
 * Tables:
 *   customer_orders   — orders placed by customers (or created by sales staff)
 *   order_items       — line items per order
 *   invoices          — financial documents tied to orders
 *   discounts         — reusable discount codes (% or fixed)
 *   order_updates     — production progress notes + image URLs visible to customer
 */

import {
  pgTable, serial, integer, varchar, numeric,
  text, boolean, timestamp,
} from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { usersTable } from "./users";

// ─── Customer Orders ──────────────────────────────────────────────────────────

export const customerOrdersTable = pgTable("customer_orders", {
  id:            serial("id").primaryKey(),
  /** Auto-generated: CO-YYYYMMDD-XXXX */
  orderNumber:   varchar("order_number", { length: 50 }).notNull().unique(),
  customerId:    integer("customer_id").references(() => usersTable.id),
  customerName:  varchar("customer_name",  { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }).notNull(),
  /**
   * draft | confirmed | in_production | quality_check | shipped |
   * delivered | cancelled
   */
  status:            varchar("status", { length: 50 }).notNull().default("draft"),
  notes:             text("notes"),
  shippingAddress:   text("shipping_address"),
  subtotal:          numeric("subtotal",       { precision: 12, scale: 2 }).notNull().default("0"),
  discountCode:      varchar("discount_code",  { length: 50 }),
  discountAmount:    numeric("discount_amount",{ precision: 12, scale: 2 }).notNull().default("0"),
  taxRate:           numeric("tax_rate",       { precision: 5,  scale: 2 }).notNull().default("0"),
  taxAmount:         numeric("tax_amount",     { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount:       numeric("total_amount",   { precision: 12, scale: 2 }).notNull().default("0"),
  estimatedDelivery: timestamp("estimated_delivery", { withTimezone: true }),
  /** Customer asked sales for advance + installment payment plan */
  paymentPlanRequestedAt: timestamp("payment_plan_requested_at", { withTimezone: true }),
  paymentPlanCustomerNotes: text("payment_plan_customer_notes"),
  /** Optional link to a manufacturing task for production tracking */
  taskId:    integer("task_id"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Order Items ──────────────────────────────────────────────────────────────

export const orderItemsTable = pgTable("order_items", {
  id:              serial("id").primaryKey(),
  orderId:         integer("order_id").notNull().references(() => customerOrdersTable.id),
  productId:       integer("product_id").references(() => productsTable.id),
  productName:     varchar("product_name", { length: 255 }).notNull(),
  productSku:      varchar("product_sku",  { length: 100 }),
  quantity:        integer("quantity").notNull().default(1),
  unitPrice:       numeric("unit_price",       { precision: 12, scale: 2 }).notNull(),
  discountPercent: numeric("discount_percent", { precision: 5,  scale: 2 }).notNull().default("0"),
  lineTotal:       numeric("line_total",       { precision: 12, scale: 2 }).notNull(),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Invoices ─────────────────────────────────────────────────────────────────

export const invoicesTable = pgTable("invoices", {
  id:            serial("id").primaryKey(),
  /** Auto-generated: INV-YYYYMMDD-XXXX */
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
  orderId:       integer("order_id").references(() => customerOrdersTable.id),
  customerId:    integer("customer_id").references(() => usersTable.id),
  customerName:  varchar("customer_name",  { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }).notNull(),
  /** draft | sent | paid | overdue | cancelled */
  status:           varchar("status", { length: 50 }).notNull().default("draft"),
  subtotal:         numeric("subtotal",       { precision: 12, scale: 2 }).notNull(),
  discountAmount:   numeric("discount_amount",{ precision: 12, scale: 2 }).notNull().default("0"),
  taxAmount:        numeric("tax_amount",     { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount:      numeric("total_amount",   { precision: 12, scale: 2 }).notNull(),
  dueDate:          timestamp("due_date",     { withTimezone: true }),
  paidAt:           timestamp("paid_at",      { withTimezone: true }),
  paymentMethod:    varchar("payment_method",    { length: 100 }),
  paymentReference: varchar("payment_reference", { length: 255 }),
  notes:            text("notes"),
  createdBy:        integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Discounts ────────────────────────────────────────────────────────────────

export const discountsTable = pgTable("discounts", {
  id:             serial("id").primaryKey(),
  code:           varchar("code", { length: 50 }).notNull().unique(),
  description:    varchar("description", { length: 255 }),
  /** "percentage" | "fixed" */
  type:           varchar("type",  { length: 20 }).notNull(),
  value:          numeric("value", { precision: 12, scale: 2 }).notNull(),
  minOrderAmount: numeric("min_order_amount", { precision: 12, scale: 2 }).default("0"),
  maxUses:        integer("max_uses"),
  usedCount:      integer("used_count").notNull().default(0),
  expiresAt:      timestamp("expires_at", { withTimezone: true }),
  isActive:       boolean("is_active").notNull().default(true),
  createdBy:      integer("created_by").references(() => usersTable.id),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Order Updates (production progress, visible to customer) ─────────────────

export const orderUpdatesTable = pgTable("order_updates", {
  id:                serial("id").primaryKey(),
  orderId:           integer("order_id").notNull().references(() => customerOrdersTable.id),
  message:           text("message").notNull(),
  /** If this update also changes the order status, record it here */
  status:            varchar("status", { length: 50 }),
  /** Optional production photo URL */
  imageUrl:          text("image_url"),
  visibleToCustomer: boolean("visible_to_customer").notNull().default(true),
  createdBy:         integer("created_by").references(() => usersTable.id),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomerOrder  = typeof customerOrdersTable.$inferSelect;
export type OrderItem      = typeof orderItemsTable.$inferSelect;
export type Invoice        = typeof invoicesTable.$inferSelect;
export type Discount       = typeof discountsTable.$inferSelect;
export type OrderUpdate    = typeof orderUpdatesTable.$inferSelect;
