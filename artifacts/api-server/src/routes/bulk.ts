/**
 * Bulk Import / Export routes
 *
 * Endpoints
 *   POST /api/bulk/inventory/import   — admin | inventory_manager
 *   GET  /api/bulk/inventory/export   — admin | inventory_manager
 *   POST /api/bulk/products/import    — admin | inventory_manager
 *   GET  /api/bulk/products/export    — admin | inventory_manager
 *   POST /api/bulk/employees/import   — admin | manager
 *   GET  /api/bulk/employees/export   — admin | manager
 *   POST /api/bulk/payroll/import     — admin | accountant | manager
 *   GET  /api/bulk/payroll/export     — admin | accountant | manager
 *
 * Import requests must use Content-Type: text/csv and send the file body
 * as raw text (no multipart encoding needed).
 *
 * Responses follow { imported, updated?, skipped?, errors: [{row, column?, message}] }
 */

import { Router, type IRouter, type NextFunction, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import express from "express";
import {
  db,
  inventoryTable,
  productsTable,
  employeesTable,
  payrollTable,
} from "@workspace/db";
import { authenticate, requireRole, AuthRequest } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";

const router: IRouter = Router();

/* ─── inline middlewares ─────────────────────────────────────────────────── */

const csvBody = express.text({ type: "text/csv", limit: "5mb" });

const invRole   = [authenticate, requireRole("admin", "inventory_manager")];
const hrRole    = [authenticate, requireRole("admin", "manager")];
const payRole   = [authenticate, requireRole("admin", "accountant", "manager")];

/* ─── CSV parser ──────────────────────────────────────────────────────────── */

function parseRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");

  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().trim());
  const rows = lines.slice(1).map((line) => {
    const values = parseRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() ?? ""]));
  });
  return { headers, rows };
}

/* ─── CSV builder for export ──────────────────────────────────────────────── */

function buildCsvLine(values: (string | number | boolean | null | undefined)[]): string {
  return values
    .map((v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(",");
}

function sendCsvResponse(res: Response, filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]): void {
  const lines = [buildCsvLine(headers), ...rows.map(buildCsvLine)].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(lines);
}

/* ─── result builder ─────────────────────────────────────────────────────── */

interface BulkError { row: number; column?: string; message: string; }
interface BulkResult { imported: number; updated: number; skipped: number; errors: BulkError[]; }

function emptyResult(): BulkResult {
  return { imported: 0, updated: 0, skipped: 0, errors: [] };
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  INVENTORY (RAW MATERIALS)                                                  */
/* ════════════════════════════════════════════════════════════════════════════ */

const InventoryRowSchema = z.object({
  name:         z.string().min(1, "Name is required"),
  type:         z.string().default("raw_material"),
  unit:         z.string().min(1, "Unit is required"),
  quantity:     z.coerce.number().min(0, "Quantity must be ≥ 0"),
  reorderlevel: z.coerce.number().min(0, "Reorder level must be ≥ 0"),
  unitcost:     z.coerce.number().min(0, "Unit cost must be ≥ 0"),
});

/* POST /bulk/inventory/import */
router.post(
  "/bulk/inventory/import",
  ...invRole,
  csvBody,
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rows } = parseCsv(req.body as string);
      const result = emptyResult();

      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 1;
        const raw = rows[i];

        const parsed = InventoryRowSchema.safeParse(raw);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            result.errors.push({ row: rowNum, column: issue.path.join("."), message: issue.message });
          }
          continue;
        }

        const d = parsed.data;
        /* Upsert by name */
        const [existing] = await db
          .select({ id: inventoryTable.id })
          .from(inventoryTable)
          .where(eq(inventoryTable.name, d.name));

        if (existing) {
          await db.update(inventoryTable).set({
            type: d.type,
            unit: d.unit,
            quantity: String(d.quantity),
            reorderLevel: String(d.reorderlevel),
            unitCost: String(d.unitcost),
          }).where(eq(inventoryTable.id, existing.id));
          result.updated++;
        } else {
          await db.insert(inventoryTable).values({
            name: d.name,
            type: d.type,
            unit: d.unit,
            quantity: String(d.quantity),
            reorderLevel: String(d.reorderlevel),
            unitCost: String(d.unitcost),
          });
          result.imported++;
        }
      }

      await logActivity({
        userId: req.user?.id,
        action: "BULK_IMPORT",
        module: "inventory",
        description: `Bulk imported inventory: ${result.imported} added, ${result.updated} updated, ${result.errors.length} errors`,
      });

      res.json(result);
    } catch (err) { next(err); }
  },
);

/* GET /bulk/inventory/export */
router.get(
  "/bulk/inventory/export",
  ...invRole,
  async (_req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await db.select().from(inventoryTable);
      const headers = ["name", "type", "unit", "quantity", "reorderLevel", "unitCost"];
      const rows = items.map((i) => [
        i.name, i.type, i.unit,
        Number(i.quantity), Number(i.reorderLevel), Number(i.unitCost),
      ]);
      sendCsvResponse(res, "inventory-export.csv", headers, rows);
    } catch (err) { next(err); }
  },
);

/* ════════════════════════════════════════════════════════════════════════════ */
/*  PRODUCTS                                                                    */
/* ════════════════════════════════════════════════════════════════════════════ */

const ProductRowSchema = z.object({
  name:          z.string().min(1, "Name is required"),
  sku:           z.string().min(1, "SKU is required"),
  category:      z.string().min(1, "Category is required"),
  sellingprice:  z.coerce.number().min(0, "Selling price must be ≥ 0"),
  costprice:     z.coerce.number().min(0, "Cost price must be ≥ 0"),
  stockquantity: z.coerce.number().int().min(0).default(0),
  description:   z.string().optional(),
  isactive:      z.string().optional().transform((v) => v?.toLowerCase() !== "false" && v !== "0"),
});

/* POST /bulk/products/import */
router.post(
  "/bulk/products/import",
  ...invRole,
  csvBody,
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rows } = parseCsv(req.body as string);
      const result = emptyResult();

      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 1;
        const parsed = ProductRowSchema.safeParse(rows[i]);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            result.errors.push({ row: rowNum, column: issue.path.join("."), message: issue.message });
          }
          continue;
        }

        const d = parsed.data;
        /* Upsert by SKU */
        const [existing] = await db
          .select({ id: productsTable.id })
          .from(productsTable)
          .where(eq(productsTable.sku, d.sku));

        if (existing) {
          await db.update(productsTable).set({
            name:          d.name,
            category:      d.category,
            sellingPrice:  String(d.sellingprice),
            costPrice:     String(d.costprice),
            stockQuantity: d.stockquantity,
            description:   d.description ?? null,
            isActive:      d.isactive,
          }).where(eq(productsTable.id, existing.id));
          result.updated++;
        } else {
          await db.insert(productsTable).values({
            name:          d.name,
            sku:           d.sku,
            category:      d.category,
            sellingPrice:  String(d.sellingprice),
            costPrice:     String(d.costprice),
            stockQuantity: d.stockquantity,
            description:   d.description ?? null,
            isActive:      d.isactive,
          });
          result.imported++;
        }
      }

      await logActivity({
        userId: req.user?.id,
        action: "BULK_IMPORT",
        module: "products",
        description: `Bulk imported products: ${result.imported} added, ${result.updated} updated, ${result.errors.length} errors`,
      });

      res.json(result);
    } catch (err) { next(err); }
  },
);

/* GET /bulk/products/export */
router.get(
  "/bulk/products/export",
  ...invRole,
  async (_req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const products = await db.select().from(productsTable);
      const headers = ["name", "sku", "category", "sellingPrice", "costPrice", "stockQuantity", "description", "isActive"];
      const rows = products.map((p) => [
        p.name, p.sku, p.category,
        Number(p.sellingPrice), Number(p.costPrice),
        p.stockQuantity,
        p.description ?? "",
        p.isActive ? "true" : "false",
      ]);
      sendCsvResponse(res, "products-export.csv", headers, rows);
    } catch (err) { next(err); }
  },
);

/* ════════════════════════════════════════════════════════════════════════════ */
/*  EMPLOYEES                                                                   */
/* ════════════════════════════════════════════════════════════════════════════ */

const EmployeeRowSchema = z.object({
  name:       z.string().min(1, "Name is required"),
  email:      z.string().email("Invalid email"),
  phone:      z.string().optional(),
  department: z.string().min(1, "Department is required"),
  position:   z.string().min(1, "Position is required"),
  basesalary: z.coerce.number().min(0, "Base salary must be ≥ 0"),
  hiredate:   z.string().min(1, "Hire date is required").refine(
    (v) => !isNaN(Date.parse(v)), "Invalid date — use YYYY-MM-DD",
  ),
  isactive:   z.string().optional().transform((v) => v?.toLowerCase() !== "false" && v !== "0"),
});

/* POST /bulk/employees/import */
router.post(
  "/bulk/employees/import",
  ...hrRole,
  csvBody,
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rows } = parseCsv(req.body as string);
      const result = emptyResult();

      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 1;
        const parsed = EmployeeRowSchema.safeParse(rows[i]);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            result.errors.push({ row: rowNum, column: issue.path.join("."), message: issue.message });
          }
          continue;
        }

        const d = parsed.data;
        /* Upsert by email */
        const [existing] = await db
          .select({ id: employeesTable.id })
          .from(employeesTable)
          .where(eq(employeesTable.email, d.email));

        if (existing) {
          await db.update(employeesTable).set({
            name:       d.name,
            phone:      d.phone ?? null,
            department: d.department,
            position:   d.position,
            baseSalary: String(d.basesalary),
            hireDate:   new Date(d.hiredate),
            isActive:   d.isactive,
          }).where(eq(employeesTable.id, existing.id));
          result.updated++;
        } else {
          await db.insert(employeesTable).values({
            name:       d.name,
            email:      d.email,
            phone:      d.phone ?? null,
            department: d.department,
            position:   d.position,
            baseSalary: String(d.basesalary),
            hireDate:   new Date(d.hiredate),
            isActive:   d.isactive,
          });
          result.imported++;
        }
      }

      await logActivity({
        userId: req.user?.id,
        action: "BULK_IMPORT",
        module: "hr",
        description: `Bulk imported employees: ${result.imported} added, ${result.updated} updated, ${result.errors.length} errors`,
      });

      res.json(result);
    } catch (err) { next(err); }
  },
);

/* GET /bulk/employees/export */
router.get(
  "/bulk/employees/export",
  ...hrRole,
  async (_req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const employees = await db.select().from(employeesTable);
      const headers = ["name", "email", "phone", "department", "position", "baseSalary", "hireDate", "isActive"];
      const rows = employees.map((e) => [
        e.name, e.email, e.phone ?? "",
        e.department, e.position,
        Number(e.baseSalary),
        e.hireDate ? new Date(e.hireDate).toISOString().split("T")[0] : "",
        e.isActive ? "true" : "false",
      ]);
      sendCsvResponse(res, "employees-export.csv", headers, rows);
    } catch (err) { next(err); }
  },
);

/* ════════════════════════════════════════════════════════════════════════════ */
/*  PAYROLL                                                                     */
/* ════════════════════════════════════════════════════════════════════════════ */

const PayrollRowSchema = z.object({
  employeeemail: z.string().email("Invalid employee email"),
  month:         z.coerce.number().int().min(1).max(12),
  year:          z.coerce.number().int().min(2000),
  basesalary:    z.coerce.number().min(0),
  bonus:         z.coerce.number().min(0).default(0),
  deductions:    z.coerce.number().min(0).default(0),
  netsalary:     z.coerce.number().min(0).optional(),
  status:        z.enum(["draft", "approved"]).default("draft"),
  notes:         z.string().optional(),
});

/* POST /bulk/payroll/import */
router.post(
  "/bulk/payroll/import",
  ...payRole,
  csvBody,
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rows } = parseCsv(req.body as string);
      const result = emptyResult();

      /* Cache employee lookups */
      const empCache: Record<string, number | null> = {};
      const lookupEmployee = async (email: string): Promise<number | null> => {
        if (email in empCache) return empCache[email];
        const [emp] = await db
          .select({ id: employeesTable.id })
          .from(employeesTable)
          .where(eq(employeesTable.email, email));
        empCache[email] = emp?.id ?? null;
        return empCache[email];
      };

      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 1;
        const parsed = PayrollRowSchema.safeParse(rows[i]);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            result.errors.push({ row: rowNum, column: issue.path.join("."), message: issue.message });
          }
          continue;
        }

        const d = parsed.data;
        const employeeId = await lookupEmployee(d.employeeemail);
        if (!employeeId) {
          result.errors.push({ row: rowNum, column: "employeeEmail", message: `Employee not found: ${d.employeeemail}` });
          continue;
        }

        const netSalary = d.netsalary ?? Math.max(0, d.basesalary + d.bonus - d.deductions);

        /* Upsert by (employeeId, month, year) */
        const [existing] = await db
          .select({ id: payrollTable.id })
          .from(payrollTable)
          .where(and(
            eq(payrollTable.employeeId, employeeId),
            eq(payrollTable.month, d.month),
            eq(payrollTable.year, d.year),
          ));

        if (existing) {
          await db.update(payrollTable).set({
            baseSalary:  String(d.basesalary),
            bonus:       String(d.bonus),
            deductions:  String(d.deductions),
            netSalary:   String(netSalary),
            status:      d.status,
            notes:       d.notes ?? null,
          }).where(eq(payrollTable.id, existing.id));
          result.updated++;
        } else {
          await db.insert(payrollTable).values({
            employeeId,
            month:       d.month,
            year:        d.year,
            baseSalary:  String(d.basesalary),
            bonus:       String(d.bonus),
            deductions:  String(d.deductions),
            netSalary:   String(netSalary),
            status:      d.status,
            notes:       d.notes ?? null,
          });
          result.imported++;
        }
      }

      await logActivity({
        userId: req.user?.id,
        action: "BULK_IMPORT",
        module: "payroll",
        description: `Bulk imported payroll: ${result.imported} added, ${result.updated} updated, ${result.errors.length} errors`,
      });

      res.json(result);
    } catch (err) { next(err); }
  },
);

/* GET /bulk/payroll/export */
router.get(
  "/bulk/payroll/export",
  ...payRole,
  async (_req, res: Response, next: NextFunction): Promise<void> => {
    try {
      const records = await db
        .select({
          payroll: payrollTable,
          employeeEmail: employeesTable.email,
          employeeName:  employeesTable.name,
        })
        .from(payrollTable)
        .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id));

      const headers = ["employeeEmail", "employeeName", "month", "year", "baseSalary", "bonus", "deductions", "netSalary", "status", "notes"];
      const rows = records.map((r) => [
        r.employeeEmail ?? "",
        r.employeeName  ?? "",
        r.payroll.month,
        r.payroll.year,
        Number(r.payroll.baseSalary),
        Number(r.payroll.bonus),
        Number(r.payroll.deductions),
        Number(r.payroll.netSalary),
        r.payroll.status,
        r.payroll.notes ?? "",
      ]);
      sendCsvResponse(res, "payroll-export.csv", headers, rows);
    } catch (err) { next(err); }
  },
);

export default router;
