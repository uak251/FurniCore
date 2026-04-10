import { pgTable, serial, varchar, integer, timestamp, text, boolean } from "drizzle-orm/pg-core";

/** Grouping for catalog filters and merchandising (1:N products). */
export const productCategoriesTable = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  /** URL-safe unique key */
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Hero / collection grid image (HTTPS or app-relative `/uploads/...`). */
  imageUrl: text("image_url"),
  /** Show on home “Collection list” strip. */
  showInCollection: boolean("show_in_collection").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductCategoryRow = typeof productCategoriesTable.$inferSelect;
