import { pgTable, serial, varchar, integer, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Polymorphic image store — one table for every module's images.
 *
 * entityType values: product | inventory | employee | payroll
 *
 * url  : publicly-accessible path, e.g. /uploads/products/uuid.jpg
 * sortOrder : 0 = primary / cover image
 *
 * (Prisma equivalent: model RecordImage { id Int @id @default(autoincrement()) … })
 * This project uses Drizzle; uploads are inserted from Express + Multer routes.
 */
export const recordImagesTable = pgTable("record_images", {
  id:           serial("id").primaryKey(),
  entityType:   varchar("entity_type",   { length: 50  }).notNull(),
  entityId:     integer("entity_id").notNull(),
  filename:     varchar("filename",      { length: 255 }).notNull(),
  originalName: varchar("original_name", { length: 255 }),
  mimeType:     varchar("mime_type",     { length: 100 }),
  sizeBytes:    integer("size_bytes"),
  url:          varchar("url",           { length: 500 }).notNull(),
  altText:      varchar("alt_text",      { length: 255 }),
  sortOrder:    integer("sort_order").default(0),
  uploadedBy:   integer("uploaded_by"),
  createdAt:    timestamp("created_at",  { withTimezone: true }).defaultNow(),
});

export type RecordImage       = typeof recordImagesTable.$inferSelect;
export type InsertRecordImage = typeof recordImagesTable.$inferInsert;
