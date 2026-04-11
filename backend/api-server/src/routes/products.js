import { Router } from "express";
import { eq, ilike, and, desc } from "drizzle-orm";
import { z } from "zod";
import {
    db,
    productsTable,
    productCategoriesTable,
    productManufacturingEventsTable,
} from "@workspace/db";
import { UpdateProductBody, GetProductParams, UpdateProductParams, DeleteProductParams, GetProductCostingParams } from "@workspace/api-zod";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";
import { PRODUCT_STATUS_LABELS, MANUFACTURING_STAGE_LABELS, slugifyCategoryName } from "../lib/productCatalogConstants.js";
import {
    clampProgress,
    wipFieldsForStatus,
    isValidProductStatus,
    isValidStage,
    stageTransitionNote,
    insertManufacturingEvent,
    serializeManufacturingEvent,
} from "../lib/productManufacturing.js";

const router = Router();

const salesRoles = [authenticate, requireRole("admin", "manager", "sales_manager")];

/** Extended list query (category / operational status filters). */
const ListProductsQueryExtended = z
    .object({
        search: z.string().optional(),
        categoryId: z.coerce.number().int().positive().optional(),
        productStatus: z.enum(["AVAILABLE", "IN_SHOWROOM", "IN_FACTORY", "WORK_IN_PROCESS"]).optional(),
    })
    .passthrough();

const PatchProductBodyExtended = UpdateProductBody.merge(
    z.object({
        categoryId: z.number().int().positive().nullable().optional(),
        productStatus: z.enum(["AVAILABLE", "IN_SHOWROOM", "IN_FACTORY", "WORK_IN_PROCESS"]).optional(),
        wipStage: z
            .enum(["WOOD_STRUCTURE", "POSHISH", "POLISH", "FINISHING", "READY"])
            .nullable()
            .optional(),
        wipProgressPercent: z.number().int().min(0).max(100).nullable().optional(),
        wipDepartment: z.string().max(120).nullable().optional(),
        compareAtPrice: z.number().nonnegative().nullable().optional(),
        hotRank: z.number().int().nonnegative().nullable().optional(),
        favouriteRank: z.number().int().nonnegative().nullable().optional(),
        ratingAvg: z.number().min(0).max(5).nullable().optional(),
    }),
);

const CreateProductBodyExtended = z
    .object({
        name: z.string().min(1),
        description: z.string().optional(),
        sku: z.string().min(1),
        category: z.string().optional(),
        categoryId: z.number().int().positive().optional(),
        sellingPrice: z.number(),
        costPrice: z.number(),
        stockQuantity: z.number().int().optional(),
        productStatus: z.enum(["AVAILABLE", "IN_SHOWROOM", "IN_FACTORY", "WORK_IN_PROCESS"]).optional(),
    })
    .refine((b) => b.categoryId != null || (b.category && String(b.category).trim().length > 0), {
        message: "category or categoryId is required",
    });

function baseProduct(p) {
    return {
        ...p,
        sellingPrice: Number(p.sellingPrice),
        costPrice: Number(p.costPrice),
        compareAtPrice: p.compareAtPrice != null ? Number(p.compareAtPrice) : null,
        productStatus: p.productStatus ?? "AVAILABLE",
        wipStage: p.wipStage ?? null,
        wipProgressPercent: p.wipProgressPercent ?? null,
        wipDepartment: p.wipDepartment ?? null,
        hotRank: p.hotRank ?? null,
        favouriteRank: p.favouriteRank ?? null,
        ratingAvg: p.ratingAvg != null ? Number(p.ratingAvg) : null,
    };
}

/** Public / API shape with joined category metadata. */
function toProductDto(product, categoryRow) {
    const p = baseProduct(product);
    return {
        ...p,
        categoryName: categoryRow?.name ?? p.category,
        categorySlug: categoryRow?.slug ?? null,
        productStatusLabel: PRODUCT_STATUS_LABELS[p.productStatus] ?? p.productStatus,
        wipStageLabel:
            p.wipStage && MANUFACTURING_STAGE_LABELS[p.wipStage] ? MANUFACTURING_STAGE_LABELS[p.wipStage] : null,
    };
}

async function ensureCategoryForName(name) {
    const n = String(name ?? "").trim() || "Uncategorized";
    const [existing] = await db
        .select()
        .from(productCategoriesTable)
        .where(eq(productCategoriesTable.name, n))
        .limit(1);
    if (existing) return existing;
    let slug = slugifyCategoryName(n);
    const [collision] = await db.select().from(productCategoriesTable).where(eq(productCategoriesTable.slug, slug)).limit(1);
    if (collision) slug = `${slug}-${Date.now().toString(36)}`;
    const [created] = await db
        .insert(productCategoriesTable)
        .values({ name: n, slug, sortOrder: 0 })
        .returning();
    return created;
}

router.get("/products", authenticate, async (req, res) => {
    const ext = ListProductsQueryExtended.safeParse(req.query);
    if (!ext.success) {
        res.status(400).json({ error: ext.error.message });
        return;
    }
    const { search, categoryId, productStatus } = ext.data;

    let q = db
        .select({ p: productsTable, c: productCategoriesTable })
        .from(productsTable)
        .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
        .$dynamic();

    const conditions = [];
    if (search) conditions.push(ilike(productsTable.name, `%${search}%`));
    if (categoryId) conditions.push(eq(productsTable.categoryId, categoryId));
    if (productStatus) conditions.push(eq(productsTable.productStatus, productStatus));
    if (conditions.length === 1) q = q.where(conditions[0]);
    else if (conditions.length > 1) q = q.where(and(...conditions));

    const rows = await q;
    res.json(rows.map(({ p, c }) => toProductDto(p, c)));
});

router.post("/products", authenticate, async (req, res) => {
    const parsed = CreateProductBodyExtended.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const d = parsed.data;
    let categoryId = d.categoryId ?? null;
    let categoryLabel = d.category;
    if (categoryId) {
        const [cat] = await db.select().from(productCategoriesTable).where(eq(productCategoriesTable.id, categoryId)).limit(1);
        if (!cat) {
            res.status(400).json({ error: "Invalid categoryId" });
            return;
        }
        categoryLabel = cat.name;
    } else {
        const cat = await ensureCategoryForName(d.category);
        categoryId = cat.id;
        categoryLabel = cat.name;
    }
    const status = d.productStatus ?? "AVAILABLE";
    const [product] = await db
        .insert(productsTable)
        .values({
            name: d.name,
            description: d.description ?? null,
            sku: d.sku,
            category: categoryLabel,
            categoryId,
            productStatus: status,
            sellingPrice: String(d.sellingPrice),
            costPrice: String(d.costPrice),
            stockQuantity: d.stockQuantity ?? 0,
            ...wipFieldsForStatus(status),
        })
        .returning();
    const [catRow] = await db
        .select()
        .from(productCategoriesTable)
        .where(eq(productCategoriesTable.id, product.categoryId ?? 0))
        .limit(1);
    await logActivity({
        userId: req.user?.id,
        action: "CREATE",
        module: "products",
        description: `Created product ${product.name}`,
        newData: toProductDto(product, catRow ?? null),
    });
    res.status(201).json(toProductDto(product, catRow ?? null));
});

router.get("/products/:id", authenticate, async (req, res) => {
    const params = GetProductParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [row] = await db
        .select({ p: productsTable, c: productCategoriesTable })
        .from(productsTable)
        .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
        .where(eq(productsTable.id, params.data.id));
    if (!row) {
        res.status(404).json({ error: "Product not found" });
        return;
    }
    res.json(toProductDto(row.p, row.c));
});

router.get("/products/:id/costing", authenticate, async (req, res) => {
    const params = GetProductCostingParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
    if (!product) {
        res.status(404).json({ error: "Product not found" });
        return;
    }
    const materialCost = Number(product.costPrice) * 0.6;
    const laborCost = Number(product.costPrice) * 0.4;
    const totalCost = Number(product.costPrice);
    const sellingPrice = Number(product.sellingPrice);
    const profitAmount = sellingPrice - totalCost;
    const profitMargin = totalCost > 0 ? (profitAmount / sellingPrice) * 100 : 0;
    res.json({
        productId: product.id,
        productName: product.name,
        materialCost,
        laborCost,
        totalCost,
        sellingPrice,
        profitMargin: Math.round(profitMargin * 100) / 100,
        profitAmount,
    });
});

/** Manufacturing timeline (sales / ops). */
router.get("/products/:id/manufacturing-history", ...salesRoles, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [p] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!p) {
        res.status(404).json({ error: "Product not found" });
        return;
    }
    const events = await db
        .select()
        .from(productManufacturingEventsTable)
        .where(eq(productManufacturingEventsTable.productId, id))
        .orderBy(desc(productManufacturingEventsTable.createdAt));
    res.json({
        productId: id,
        productName: p.name,
        events: events.map(serializeManufacturingEvent),
    });
});

router.patch("/products/:id", authenticate, async (req, res) => {
    const params = UpdateProductParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const parsed = PatchProductBodyExtended.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
    }
    const [old] = await db
        .select({ p: productsTable, c: productCategoriesTable })
        .from(productsTable)
        .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
        .where(eq(productsTable.id, params.data.id));
    if (!old) {
        res.status(404).json({ error: "Product not found" });
        return;
    }
    const oldP = old.p;
    const d = parsed.data;
    const updateData = {};
    if (d.name !== undefined) updateData.name = d.name;
    if (d.description !== undefined) updateData.description = d.description;
    if (d.sku !== undefined) updateData.sku = d.sku;
    if (d.sellingPrice !== undefined) updateData.sellingPrice = String(d.sellingPrice);
    if (d.costPrice !== undefined) updateData.costPrice = String(d.costPrice);
    if (d.stockQuantity !== undefined) updateData.stockQuantity = d.stockQuantity;
    if (d.isActive !== undefined) updateData.isActive = d.isActive;

    if (d.category !== undefined || d.categoryId !== undefined) {
        if (d.categoryId !== undefined && d.categoryId !== null) {
            const [cat] = await db
                .select()
                .from(productCategoriesTable)
                .where(eq(productCategoriesTable.id, d.categoryId))
                .limit(1);
            if (!cat) {
                res.status(400).json({ error: "Invalid categoryId" });
                return;
            }
            updateData.categoryId = cat.id;
            updateData.category = cat.name;
        } else if (d.category !== undefined) {
            const cat = await ensureCategoryForName(d.category);
            updateData.categoryId = cat.id;
            updateData.category = cat.name;
        }
    }

    let nextStatus = oldP.productStatus ?? "AVAILABLE";
    if (d.productStatus !== undefined) {
        if (!isValidProductStatus(d.productStatus)) {
            res.status(400).json({ error: "Invalid productStatus" });
            return;
        }
        nextStatus = d.productStatus;
        updateData.productStatus = d.productStatus;
        Object.assign(updateData, wipFieldsForStatus(d.productStatus));
    }

    if (d.wipStage !== undefined) {
        if (d.wipStage !== null && !isValidStage(d.wipStage)) {
            res.status(400).json({ error: "Invalid wipStage" });
            return;
        }
        updateData.wipStage = d.wipStage;
    }
    if (d.wipProgressPercent !== undefined) {
        const c = clampProgress(d.wipProgressPercent);
        updateData.wipProgressPercent = c;
    }
    if (d.wipDepartment !== undefined) updateData.wipDepartment = d.wipDepartment;

    if (d.compareAtPrice !== undefined) {
        updateData.compareAtPrice = d.compareAtPrice === null ? null : String(d.compareAtPrice);
    }
    if (d.hotRank !== undefined) updateData.hotRank = d.hotRank;
    if (d.favouriteRank !== undefined) updateData.favouriteRank = d.favouriteRank;
    if (d.ratingAvg !== undefined) {
        updateData.ratingAvg = d.ratingAvg === null ? null : String(d.ratingAvg);
    }

    const effectiveStatus = updateData.productStatus ?? nextStatus;
    if (effectiveStatus === "WORK_IN_PROCESS") {
        const mergedStage = d.wipStage !== undefined ? d.wipStage : oldP.wipStage;
        const mergedProgress =
            d.wipProgressPercent !== undefined ? clampProgress(d.wipProgressPercent) : oldP.wipProgressPercent;
        if (mergedStage === null || mergedStage === undefined) {
            updateData.wipStage = "WOOD_STRUCTURE";
        }
        if (mergedProgress === null || mergedProgress === undefined) {
            updateData.wipProgressPercent = 0;
        }
    }

    if (Object.keys(updateData).length === 0) {
        const [catRow] = await db
            .select()
            .from(productCategoriesTable)
            .where(eq(productCategoriesTable.id, oldP.categoryId ?? 0))
            .limit(1);
        res.json(toProductDto(oldP, catRow ?? null));
        return;
    }

    const [product] = await db
        .update(productsTable)
        .set(updateData)
        .where(eq(productsTable.id, params.data.id))
        .returning();

    const [catRow] = await db
        .select()
        .from(productCategoriesTable)
        .where(eq(productCategoriesTable.id, product.categoryId ?? 0))
        .limit(1);

    /* Audit trail for manufacturing-relevant changes */
    const uid = req.user?.id ?? null;
    if (d.productStatus !== undefined && d.productStatus !== oldP.productStatus) {
        await insertManufacturingEvent({
            productId: product.id,
            eventType: "status_change",
            fromStatus: oldP.productStatus,
            toStatus: d.productStatus,
            createdBy: uid,
            note: null,
        });
    }
    if (effectiveStatus === "WORK_IN_PROCESS") {
        if (d.wipStage !== undefined && d.wipStage !== oldP.wipStage) {
            const note = stageTransitionNote(oldP.wipStage, d.wipStage);
            await insertManufacturingEvent({
                productId: product.id,
                eventType: "stage_change",
                fromStage: oldP.wipStage,
                toStage: d.wipStage,
                createdBy: uid,
                note,
            });
        }
        if (d.wipProgressPercent !== undefined && clampProgress(d.wipProgressPercent) !== oldP.wipProgressPercent) {
            await insertManufacturingEvent({
                productId: product.id,
                eventType: "progress_update",
                fromProgress: oldP.wipProgressPercent,
                toProgress: clampProgress(d.wipProgressPercent),
                createdBy: uid,
                note: null,
            });
        }
        if (
            d.wipDepartment !== undefined &&
            (d.wipDepartment ?? null) !== (oldP.wipDepartment ?? null)
        ) {
            await insertManufacturingEvent({
                productId: product.id,
                eventType: "note",
                department: d.wipDepartment,
                note: "Department updated",
                createdBy: uid,
            });
        }
    }

    await logActivity({
        userId: uid,
        action: "UPDATE",
        module: "products",
        description: `Updated product ${product.name}`,
        oldData: toProductDto(oldP, old.c),
        newData: toProductDto(product, catRow ?? null),
    });
    res.json(toProductDto(product, catRow ?? null));
});

router.delete("/products/:id", authenticate, async (req, res) => {
    const params = DeleteProductParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: "Invalid id" });
        return;
    }
    const [product] = await db.delete(productsTable).where(eq(productsTable.id, params.data.id)).returning();
    if (!product) {
        res.status(404).json({ error: "Product not found" });
        return;
    }
    await logActivity({
        userId: req.user?.id,
        action: "DELETE",
        module: "products",
        description: `Deleted product ${product.name}`,
    });
    res.sendStatus(204);
});

export default router;
