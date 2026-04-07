/**
 * Seed demo employees and payroll records.
 *
 * Each employee is linked to an existing user account via userEmail → userId.
 * Payroll spans Jan–Apr 2026: Jan+Feb paid, Mar approved, Apr draft.
 *
 * Prerequisite: seed-demo-users must run first.
 *
 * Idempotent:
 *   - Employees upserted by email.
 *   - Payroll records upserted by (employee_id + month + year).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-demo-hr-payroll
 *
 * Data: scripts/data/demo-hr-payroll.json
 * DATABASE_URL: ../.env
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, and, inArray } from "drizzle-orm";
import { db, pool, usersTable, employeesTable, payrollTable } from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface EmployeeRow {
  userEmail: string;
  name: string;
  email: string;
  phone: string | null;
  department: string;
  position: string;
  baseSalary: number;
  hireDate: string;
  isActive: boolean;
}

interface PayrollRow {
  employeeEmail: string;
  month: number;
  year: number;
  baseSalary: number;
  bonus: number;
  deductions: number;
  netSalary: number;
  status: string;
  paidAt: string | null;
  notes: string | null;
}

interface DemoHRFile {
  employees: EmployeeRow[];
  payroll: PayrollRow[];
}

const data: DemoHRFile = JSON.parse(
  readFileSync(join(__dirname, "../data/demo-hr-payroll.json"), "utf-8"),
) as DemoHRFile;

console.log("\nFurniCore — Seed demo HR & payroll");
console.log(`  Employees:       ${data.employees.length}`);
console.log(`  Payroll records: ${data.payroll.length}\n`);

/* ── Resolve user IDs ─────────────────────────────────────────────────────── */

const allEmails = [...new Set(data.employees.map((e) => e.userEmail))];
const userRows = await db
  .select({ id: usersTable.id, email: usersTable.email })
  .from(usersTable)
  .where(inArray(usersTable.email, allEmails));
const emailToUserId = new Map(userRows.map((r) => [r.email, r.id]));

const missing = allEmails.filter((e) => !emailToUserId.has(e));
if (missing.length > 0) {
  console.log(`  [warn] ${missing.length} user email(s) not found — employees will be created with userId=null:\n${missing.map((e) => `         ${e}`).join("\n")}\n`);
}

/* ── 1. Upsert employees ──────────────────────────────────────────────────── */

const emailToEmployeeId = new Map<string, number>();

for (const emp of data.employees) {
  const userId = emailToUserId.get(emp.userEmail) ?? null;

  const values = {
    userId,
    name:       emp.name,
    email:      emp.email,
    phone:      emp.phone ?? null,
    department: emp.department,
    position:   emp.position,
    baseSalary: String(emp.baseSalary),
    hireDate:   new Date(emp.hireDate),
    isActive:   emp.isActive,
  };

  const [existing] = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(eq(employeesTable.email, emp.email))
    .limit(1);

  if (existing) {
    await db.update(employeesTable).set(values).where(eq(employeesTable.id, existing.id));
    emailToEmployeeId.set(emp.email, existing.id);
    console.log(`  [employee] updated  ${emp.email}  (${emp.position})`);
  } else {
    const [inserted] = await db
      .insert(employeesTable)
      .values(values)
      .returning({ id: employeesTable.id });
    emailToEmployeeId.set(emp.email, inserted.id);
    console.log(`  [employee] created  ${emp.email}  (${emp.position})`);
  }
}

/* ── 2. Upsert payroll records ────────────────────────────────────────────── */

console.log();
let payCreated = 0;
let payUpdated = 0;

for (const rec of data.payroll) {
  const employeeId = emailToEmployeeId.get(rec.employeeEmail);
  if (!employeeId) {
    console.log(`  [payroll] SKIP — employee not found: ${rec.employeeEmail}`);
    continue;
  }

  const values = {
    employeeId,
    month:      rec.month,
    year:       rec.year,
    baseSalary: String(rec.baseSalary),
    bonus:      String(rec.bonus),
    deductions: String(rec.deductions),
    netSalary:  String(rec.netSalary),
    status:     rec.status,
    notes:      rec.notes ?? null,
    paidAt:     rec.paidAt ? new Date(rec.paidAt) : null,
  };

  const [existing] = await db
    .select({ id: payrollTable.id })
    .from(payrollTable)
    .where(
      and(
        eq(payrollTable.employeeId, employeeId),
        eq(payrollTable.month, rec.month),
        eq(payrollTable.year, rec.year),
      ),
    )
    .limit(1);

  if (existing) {
    await db.update(payrollTable).set(values).where(eq(payrollTable.id, existing.id));
    payUpdated++;
  } else {
    await db.insert(payrollTable).values(values);
    payCreated++;
  }
}

console.log(`  [payroll] created ${payCreated}, updated ${payUpdated} record(s)`);

/* ── Summary ──────────────────────────────────────────────────────────────── */

const byStatus = data.payroll.reduce<Record<string, number>>((acc, r) => {
  acc[r.status] = (acc[r.status] ?? 0) + 1;
  return acc;
}, {});

const totalNet = data.payroll
  .filter((r) => r.status === "paid")
  .reduce((s, r) => s + r.netSalary, 0);

console.log(`
  Payroll by status: ${Object.entries(byStatus).map(([s, n]) => `${s} ×${n}`).join(", ")}
  Total net paid so far: $${totalNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}
  Done.
`);

await pool.end();
