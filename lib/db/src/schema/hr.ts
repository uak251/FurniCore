import { pgTable, text, serial, timestamp, numeric, integer, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  department: varchar("department", { length: 100 }).notNull(),
  position: varchar("position", { length: 100 }).notNull(),
  baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).notNull(),
  hireDate: timestamp("hire_date", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  date: timestamp("date", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  checkIn: timestamp("check_in", { withTimezone: true }),
  checkOut: timestamp("check_out", { withTimezone: true }),
  hoursWorked: numeric("hours_worked", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;

export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({ id: true, createdAt: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type AttendanceRecord = typeof attendanceTable.$inferSelect;
