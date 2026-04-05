import { pgTable, text, serial, timestamp, numeric, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./hr";

export const payrollTable = pgTable("payroll", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).notNull(),
  bonus: numeric("bonus", { precision: 12, scale: 2 }).notNull().default("0"),
  deductions: numeric("deductions", { precision: 12, scale: 2 }).notNull().default("0"),
  netSalary: numeric("net_salary", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  notes: text("notes"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPayrollSchema = createInsertSchema(payrollTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type PayrollRecord = typeof payrollTable.$inferSelect;
