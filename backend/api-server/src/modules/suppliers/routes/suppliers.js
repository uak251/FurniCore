import { Router } from "express";
import { eq, ilike, sql, or, isNull, and } from "drizzle-orm";
import { db, suppliersTable, supplierQuotesTable, usersTable } from "@workspace/db";
import { CreateSupplierBody, UpdateSupplierBody, GetSupplierParams, UpdateSupplierParams, DeleteSupplierParams, ListSuppliersQueryParams, GetSupplierQuotesParams } from "@workspace/api-zod";
import { authenticate, requireRole } from "../../../middlewares/authenticate";
import { hashPassword } from "../../../lib/auth";
// Suppliers table is internal — supplier-role users must use /supplier-portal/* instead.
// Must align with Layout.jsx (accountant can open /suppliers; role string is `accountant`, not `accounts`).
const internalOnly = requireRole("admin", "manager", "accountant", "employee");
import { logActivity } from "../../../lib/activityLogger";
const router = Router();
let suppliersStorageReady;
async function ensureSuppliersStorage() {
    if (!suppliersStorageReady) {
        suppliersStorageReady = (async () => {
            await db.execute(sql `
        CREATE TABLE IF NOT EXISTS suppliers (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          address TEXT
        );
      `);
            await db.execute(sql `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person TEXT;`);
            await db.execute(sql `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS status TEXT;`);
            await db.execute(sql `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS rating TEXT;`);
            await db.execute(sql `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms TEXT;`);
            await db.execute(sql `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes TEXT;`);
        })().catch((err) => {
            suppliersStorageReady = undefined;
            throw err;
        });
    }
    await suppliersStorageReady;
}
function toSupplier(s) {
    if (!s)
        return null;
    const ratingRaw = s.rating;
    const ratingNum = ratingRaw != null && ratingRaw !== "" ? Number(ratingRaw) : null;
    return {
        id: Number(s.id),
        name: s.name ?? "",
        email: s.email ?? null,
        phone: s.phone ?? null,
        address: s.address ?? null,
        contactPerson: s.contactPerson ?? null,
        status: s.status ?? null,
        rating: ratingNum != null && Number.isFinite(ratingNum) ? ratingNum : null,
        paymentTerms: s.paymentTerms ?? null,
        notes: s.notes ?? null,
    };
}
function trimStr(v) {
    if (v == null)
        return null;
    const t = String(v).trim();
    return t.length ? t : null;
}
/** Full row for INSERT — strips unknown keys and coerces `rating` to text. */
function normalizeSupplierWrite(body) {
    const b = body && typeof body === "object" ? body : {};
    const ratingNum = Number(b.rating);
    const ratingStr = Number.isFinite(ratingNum) ? String(ratingNum) : null;
    return {
        name: trimStr(b.name) ?? "",
        email: trimStr(b.email),
        phone: trimStr(b.phone),
        address: trimStr(b.address),
        contactPerson: trimStr(b.contactPerson),
        status: trimStr(b.status) ?? "active",
        rating: ratingStr,
        paymentTerms: trimStr(b.paymentTerms),
        notes: trimStr(b.notes),
    };
}
/** Partial fields for PATCH — only keys present in `body`. */
function normalizeSupplierPatch(body) {
    const b = body && typeof body === "object" ? body : {};
    const out = {};
    if ("name" in b)
        out.name = trimStr(b.name) ?? "";
    if ("email" in b)
        out.email = trimStr(b.email);
    if ("phone" in b)
        out.phone = trimStr(b.phone);
    if ("address" in b)
        out.address = trimStr(b.address);
    if ("contactPerson" in b)
        out.contactPerson = trimStr(b.contactPerson);
    if ("status" in b)
        out.status = trimStr(b.status);
    if ("paymentTerms" in b)
        out.paymentTerms = trimStr(b.paymentTerms);
    if ("notes" in b)
        out.notes = trimStr(b.notes);
    if ("rating" in b) {
        const ratingNum = Number(b.rating);
        out.rating = Number.isFinite(ratingNum) ? String(ratingNum) : null;
    }
    return out;
}
function pgErrorCode(err) {
    return err && typeof err === "object" && "code" in err ? String(err.code) : "";
}
function toQuote(q, supplierName) {
    return {
        ...q,
        supplierName,
        quantity: Number(q.quantity),
        unitPrice: Number(q.unitPrice),
        totalPrice: Number(q.totalPrice),
        itemName: null,
        validUntil: q.validUntil?.toISOString() ?? null,
        lockedAt: q.lockedAt?.toISOString() ?? null,
        approvedAt: q.approvedAt?.toISOString() ?? null,
        paidAt: q.paidAt?.toISOString() ?? null,
    };
}
function isSchemaOrRelationError(err) {
    const msg = String(err?.message ?? "");
    return /column .* does not exist|relation .* does not exist|Failed query/i.test(msg);
}
router.get("/suppliers", authenticate, internalOnly, async (req, res) => {
    try {
        await ensureSuppliersStorage();
        const params = ListSuppliersQueryParams.safeParse(req.query);
        let query = db.select().from(suppliersTable).$dynamic();
        const conditions = [];
        if (params.success && params.data.search) {
            conditions.push(ilike(suppliersTable.name, `%${params.data.search}%`));
        }
        const statusRaw = String(req.query.status ?? "all").toLowerCase();
        if (statusRaw === "active") {
            conditions.push(
                or(
                    eq(suppliersTable.status, "active"),
                    isNull(suppliersTable.status),
                    eq(suppliersTable.status, ""),
                ),
            );
        }
        else if (statusRaw === "inactive") {
            conditions.push(eq(suppliersTable.status, "inactive"));
        }
        else if (statusRaw === "blacklisted") {
            conditions.push(eq(suppliersTable.status, "blacklisted"));
        }
        if (conditions.length === 1) {
            query = query.where(conditions[0]);
        }
        else if (conditions.length > 1) {
            query = query.where(and(...conditions));
        }
        const suppliers = await query;
        res.json(suppliers.map(toSupplier));
    }
    catch (err) {
        if (isSchemaOrRelationError(err)) {
            res.json([]);
            return;
        }
        throw err;
    }
});
router.post("/suppliers", authenticate, internalOnly, async (req, res) => {
    const parsed = CreateSupplierBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const row = normalizeSupplierWrite(parsed.data);
    if (!row.name) {
        res.status(400).json({ error: "SUPPLIER_NAME_REQUIRED", message: "Company name is required." });
        return;
    }
    const portalPassword = typeof parsed.data.portalPassword === "string" ? parsed.data.portalPassword.trim() : "";
    if (portalPassword && !row.email) {
        res.status(400).json({
            error: "SUPPLIER_EMAIL_REQUIRED_FOR_PORTAL",
            message: "Email is required when setting a supplier portal password so the account can log in.",
        });
        return;
    }
    try {
        await ensureSuppliersStorage();
        const [supplier] = await db.insert(suppliersTable).values(row).returning();
        if (!supplier) {
            res.status(500).json({ error: "SUPPLIER_INSERT_FAILED", message: "Could not create supplier." });
            return;
        }
        let portalUser = null;
        if (portalPassword && row.email) {
            const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, row.email));
            if (existing) {
                portalUser = { created: false, reason: "EMAIL_IN_USE", message: "Supplier saved; a user with this email already exists. Link or reset password under Admin → Users." };
            }
            else {
                const displayName = trimStr(parsed.data.contactPerson) ?? supplier.name;
                const passwordHash = await hashPassword(portalPassword);
                await db.insert(usersTable).values({
                    name: displayName,
                    email: row.email,
                    passwordHash,
                    role: "supplier",
                    isActive: true,
                    isVerified: true,
                });
                portalUser = { created: true };
            }
        }
        await logActivity({ userId: req.user?.id, action: "CREATE", module: "suppliers", description: `Created supplier ${supplier.name}`, newData: { ...toSupplier(supplier), portalUser } });
        res.status(201).json({ ...toSupplier(supplier), portalUser });
    }
    catch (err) {
        const code = pgErrorCode(err);
        if (code === "23505") {
            res.status(409).json({ error: "SUPPLIER_DUPLICATE", message: "A supplier with this email or key already exists." });
            return;
        }
        if (code === "23502") {
            res.status(400).json({ error: "SUPPLIER_CONSTRAINT", message: String(err?.message ?? "Invalid supplier data.") });
            return;
        }
        if (isSchemaOrRelationError(err)) {
            res.status(503).json({
                error: "SUPPLIERS_DB_SCHEMA",
                message: "Suppliers storage is not ready (run database migrations).",
            });
            return;
        }
        res.status(500).json({
            error: "SUPPLIER_CREATE_FAILED",
            message: String(err?.message ?? "Could not create supplier."),
        });
    }
});
router.get("/suppliers/:id", authenticate, internalOnly, async (req, res) => {
    const params = GetSupplierParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    await ensureSuppliersStorage();
    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
    if (!supplier) {
        res.status(404).json({ error: "Supplier not found" });
        return;
    }
    res.json(toSupplier(supplier));
});
router.get("/suppliers/:id/quotes", authenticate, internalOnly, async (req, res) => {
    const params = GetSupplierQuotesParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    await ensureSuppliersStorage();
    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
    if (!supplier) {
        res.status(404).json({ error: "Supplier not found" });
        return;
    }
    const quotes = await db.select().from(supplierQuotesTable).where(eq(supplierQuotesTable.supplierId, params.data.id));
    res.json(quotes.map(q => toQuote(q, supplier.name)));
});
router.patch("/suppliers/:id", authenticate, internalOnly, async (req, res) => {
    const params = UpdateSupplierParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = UpdateSupplierBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const updateData = normalizeSupplierPatch(parsed.data);
    if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: "NO_FIELDS", message: "No fields to update." });
        return;
    }
    if ("name" in updateData && !String(updateData.name ?? "").trim()) {
        res.status(400).json({ error: "SUPPLIER_NAME_REQUIRED", message: "Company name cannot be empty." });
        return;
    }
    try {
        await ensureSuppliersStorage();
        const [old] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
        const [supplier] = await db.update(suppliersTable).set(updateData).where(eq(suppliersTable.id, params.data.id)).returning();
        if (!supplier) {
            res.status(404).json({ error: "Supplier not found" });
            return;
        }
        await logActivity({ userId: req.user?.id, action: "UPDATE", module: "suppliers", description: `Updated supplier ${supplier.name}`, oldData: toSupplier(old), newData: toSupplier(supplier) });
        res.json(toSupplier(supplier));
    }
    catch (err) {
        const code = pgErrorCode(err);
        if (code === "23505") {
            res.status(409).json({ error: "SUPPLIER_DUPLICATE", message: "Update would conflict with an existing supplier." });
            return;
        }
        if (isSchemaOrRelationError(err)) {
            res.status(503).json({ error: "SUPPLIERS_DB_SCHEMA", message: "Suppliers storage is not ready (run database migrations)." });
            return;
        }
        res.status(500).json({ error: "SUPPLIER_UPDATE_FAILED", message: String(err?.message ?? "Could not update supplier.") });
    }
});
router.delete("/suppliers/:id", authenticate, internalOnly, async (req, res) => {
    const params = DeleteSupplierParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    await ensureSuppliersStorage();
    const [supplier] = await db.delete(suppliersTable).where(eq(suppliersTable.id, params.data.id)).returning();
    if (!supplier) {
        res.status(404).json({ error: "Supplier not found" });
        return;
    }
    await logActivity({ userId: req.user?.id, action: "DELETE", module: "suppliers", description: `Deleted supplier ${supplier.name}` });
    res.sendStatus(204);
});
export default router;
