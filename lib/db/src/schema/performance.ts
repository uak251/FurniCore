import { pgTable, serial, integer, varchar, numeric, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { employeesTable } from "./hr";
import { usersTable } from "./users";

/**
 * performance_reviews — periodic employee evaluations (quarterly / annual).
 * Reviewers set scores for KPI, attendance, punctuality plus a free-text
 * summary. A bonus suggestion is recorded but applied separately via
 * payroll_adjustments, keeping the audit trail clear.
 */
export const performanceReviewsTable = pgTable("performance_reviews", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  reviewerId: integer("reviewer_id").references(() => usersTable.id),
  period: varchar("period", { length: 20 }).notNull(), // "2024-Q1" | "2024-H2" | "2024-Annual"
  overallRating: integer("overall_rating").notNull(), // 1–5
  kpiScore: numeric("kpi_score", { precision: 5, scale: 2 }), // 0–100
  attendanceScore: numeric("attendance_score", { precision: 5, scale: 2 }),
  punctualityScore: numeric("punctuality_score", { precision: 5, scale: 2 }),
  summary: text("summary"),
  goals: text("goals"),
  achievements: text("achievements"),
  areasForImprovement: text("areas_for_improvement"),
  recommendBonus: boolean("recommend_bonus").notNull().default(false),
  bonusSuggestion: numeric("bonus_suggestion", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/**
 * payroll_adjustments — manual bonuses and penalties that feed into payroll
 * generation. Each entry carries a mandatory reason so the calculation is
 * fully transparent when shown in the payroll breakdown.
 *
 * appliedToPayrollId is a plain integer (no FK) to avoid circular schema deps.
 */
export const payrollAdjustmentsTable = pgTable("payroll_adjustments", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  type: varchar("type", { length: 20 }).notNull(), // "bonus" | "penalty"
  reason: varchar("reason", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  appliedToPayrollId: integer("applied_to_payroll_id"), // set after payroll generated
  approvedBy: integer("approved_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PerformanceReview = typeof performanceReviewsTable.$inferSelect;
export type PayrollAdjustment = typeof payrollAdjustmentsTable.$inferSelect;
