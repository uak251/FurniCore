import { Router } from "express";
import multer from "multer";
import csvParser from "csv-parser";
import { Parser as Json2CsvParser } from "json2csv";
import { Readable } from "node:stream";
import {
  db,
  inventoryTable,
  supplierQuotesTable,
  manufacturingTasksTable,
  employeesTable,
  suppliersTable,
  customerOrdersTable,
  transactionsTable,
  notificationsTable,
} from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { logger } from "../lib/logger";

const router = Router();
const adminOnly = requireRole("admin");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const MODULE_CONFIG = {
  inventory: {
    table: inventoryTable,
    required: ["name", "type", "unit", "quantity", "reorderLevel", "unitCost"],
    optional: ["supplierId"],
  },
  procurement: {
    table: supplierQuotesTable,
    required: ["supplierId", "quantity", "unitPrice", "totalPrice", "status"],
    optional: ["inventoryItemId", "notes", "description"],
  },
  production: {
    table: manufacturingTasksTable,
    required: ["title", "status"],
    optional: ["productId", "assigneeId", "description", "estimatedHours", "actualHours", "progress"],
  },
  hr: {
    table: employeesTable,
    required: ["name", "baseSalary", "hireDate"],
    optional: ["email", "phone", "department", "position", "userId", "isActive"],
  },
  supplier: {
    table: suppliersTable,
    required: ["name"],
    optional: ["email", "phone", "address", "contactPerson", "status", "rating", "paymentTerms", "notes"],
  },
  customer: {
    table: customerOrdersTable,
    required: ["status"],
    optional: ["customerId", "totalAmount", "notes"],
  },
  accounting: {
    table: transactionsTable,
    required: ["type", "description", "amount", "transactionDate"],
    optional: ["supplierId", "reference", "accountId", "journalEntryId"],
  },
  notifications: {
    table: notificationsTable,
    required: ["title", "message"],
    optional: ["userId", "type", "link", "isRead"],
  },
};

function toCamelHeader(header) {
  const normalized = String(header ?? "").trim();
  if (!normalized) return "";
  return normalized
    .replace(/^[A-Z]/, (m) => m.toLowerCase())
    .replace(/[_\-\s]+([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());
}

function parseBoolean(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes"].includes(raw)) return true;
  if (["false", "0", "no"].includes(raw)) return false;
  return undefined;
}

function normalizeValue(key, value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (/(id|quantity|progress)$/i.test(key)) {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }
  if (/(amount|price|salary|hours)/i.test(key)) {
    const num = Number(value);
    return Number.isFinite(num) ? String(num) : undefined;
  }
  if (/(date|at)$/i.test(key)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (/is[A-Z]/.test(key)) {
    const bool = parseBoolean(value);
    return bool === undefined ? undefined : bool;
  }
  return String(value).trim();
}

function templateExampleRow(moduleKey) {
  const examples = {
    inventory: {
      name: "Sample Item",
      type: "raw",
      unit: "pcs",
      quantity: "10",
      reorderLevel: "5",
      unitCost: "12.50",
      supplierId: "1",
    },
    procurement: {
      supplierId: "1",
      quantity: "10",
      unitPrice: "20.00",
      totalPrice: "200.00",
      status: "pending",
      inventoryItemId: "1",
      notes: "Sample quote",
      description: "Sample procurement row",
    },
    production: {
      title: "Sample Task",
      status: "pending",
      productId: "1",
      assigneeId: "1",
      description: "Sample production step",
      estimatedHours: "6",
      actualHours: "0",
      progress: "0",
    },
    hr: {
      name: "Sample Employee",
      baseSalary: "1200",
      hireDate: "2026-01-01",
      email: "sample.employee@furnicore.com",
      phone: "0000000000",
      department: "Operations",
      position: "Operator",
      userId: "1",
      isActive: "true",
    },
    supplier: {
      name: "Sample Supplier",
      email: "supplier@example.com",
      phone: "0000000000",
      address: "Sample street",
      contactPerson: "Supplier Admin",
      status: "active",
      rating: "5",
      paymentTerms: "NET30",
      notes: "Sample supplier row",
    },
    customer: {
      status: "pending",
      customerId: "1",
      totalAmount: "1500.00",
      notes: "Sample customer order",
    },
    accounting: {
      type: "income",
      description: "Sample accounting row",
      amount: "100.00",
      transactionDate: "2026-04-01T00:00:00.000Z",
      supplierId: "1",
      reference: "INV-001",
      accountId: "1",
      journalEntryId: "1",
    },
    notifications: {
      title: "Sample notification",
      message: "Sample message body",
      userId: "1",
      type: "info",
      link: "/notifications",
      isRead: "false",
    },
  };
  return examples[moduleKey] ?? {};
}

async function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(csvParser({ mapHeaders: ({ header }) => toCamelHeader(header) }))
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

router.post("/:module/import-csv", authenticate, adminOnly, upload.single("file"), async (req, res) => {
  const moduleKey = req.params.module;
  const config = MODULE_CONFIG[moduleKey];
  if (!config) {
    res.status(404).json({ error: "Route not found" });
    return;
  }

  if (!req.file?.buffer) {
    res.status(400).json({ error: "CSV_FILE_REQUIRED", message: "Attach CSV as multipart field 'file'." });
    return;
  }

  try {
    const parsedRows = await parseCsvBuffer(req.file.buffer);
    if (!parsedRows.length) {
      res.status(400).json({ error: "CSV_EMPTY", message: "CSV has no rows." });
      return;
    }

    const records = [];
    for (const row of parsedRows) {
      const normalized = {};
      for (const field of [...config.required, ...config.optional]) {
        const value = normalizeValue(field, row[field]);
        if (value !== undefined) normalized[field] = value;
      }

      if (moduleKey === "notifications" && !normalized.userId) {
        normalized.userId = req.user?.id;
      }
      if (moduleKey === "procurement" && !normalized.totalPrice) {
        const qty = Number(normalized.quantity ?? 0);
        const unit = Number(normalized.unitPrice ?? 0);
        normalized.totalPrice = String(qty * unit);
      }

      const missingRequired = config.required.filter((field) => normalized[field] === undefined);
      if (missingRequired.length > 0) {
        res.status(400).json({
          error: "CSV_VALIDATION_ERROR",
          message: `Missing required fields: ${missingRequired.join(", ")}`,
        });
        return;
      }
      records.push(normalized);
    }

    await db.insert(config.table).values(records);
    res.json({ ok: true, module: moduleKey, imported: records.length });
  } catch (err) {
    logger.error({ err: err?.message, module: moduleKey }, "csv_import_failed");
    res.status(400).json({ error: "CSV_IMPORT_FAILED", message: "Malformed CSV or incompatible data." });
  }
});

router.get("/:module/export-csv", authenticate, adminOnly, async (req, res) => {
  const moduleKey = req.params.module;
  const config = MODULE_CONFIG[moduleKey];
  if (!config) {
    res.status(404).json({ error: "Route not found" });
    return;
  }

  try {
    const rows = await db.select().from(config.table);
    const records = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
      ),
    );
    const fields = records.length
      ? Array.from(new Set(records.flatMap((r) => Object.keys(r))))
      : [...config.required, ...config.optional];
    const parser = new Json2CsvParser({ fields });
    const csv = parser.parse(records);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${moduleKey}-export.csv"`);
    res.status(200).send(csv);
  } catch (err) {
    logger.error({ err: err?.message, module: moduleKey }, "csv_export_failed");
    res.status(500).json({ error: "CSV_EXPORT_FAILED" });
  }
});

router.get("/:module/csv-template", authenticate, adminOnly, async (req, res) => {
  const moduleKey = req.params.module;
  const config = MODULE_CONFIG[moduleKey];
  if (!config) {
    res.status(404).json({ error: "Route not found" });
    return;
  }

  try {
    const fields = [...config.required, ...config.optional];
    const parser = new Json2CsvParser({ fields });
    const csv = parser.parse([templateExampleRow(moduleKey)]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${moduleKey}-template.csv"`);
    res.status(200).send(csv);
  } catch (err) {
    logger.error({ err: err?.message, module: moduleKey }, "csv_template_failed");
    res.status(500).json({ error: "CSV_TEMPLATE_FAILED" });
  }
});

export default router;
