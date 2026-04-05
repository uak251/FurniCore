import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import { CreateProductBody, UpdateProductBody, GetProductParams, UpdateProductParams, DeleteProductParams, ListProductsQueryParams, GetProductCostingParams } from "@workspace/api-zod";
import { authenticate, AuthRequest } from "../middlewares/authenticate";
import { logActivity } from "../lib/activityLogger";

const router: IRouter = Router();

function toProduct(p: typeof productsTable.$inferSelect) {
  return { ...p, sellingPrice: Number(p.sellingPrice), costPrice: Number(p.costPrice) };
}

router.get("/products", authenticate, async (req, res): Promise<void> => {
  const params = ListProductsQueryParams.safeParse(req.query);
  let query = db.select().from(productsTable).$dynamic();
  if (params.success && params.data.search) {
    query = query.where(ilike(productsTable.name, `%${params.data.search}%`));
  }
  const products = await query;
  res.json(products.map(toProduct));
});

router.post("/products", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [product] = await db.insert(productsTable).values({
    ...parsed.data,
    sellingPrice: String(parsed.data.sellingPrice),
    costPrice: String(parsed.data.costPrice),
    stockQuantity: parsed.data.stockQuantity ?? 0,
  }).returning();
  await logActivity({ userId: req.user?.id, action: "CREATE", module: "products", description: `Created product ${product.name}`, newData: toProduct(product) });
  res.status(201).json(toProduct(product));
});

router.get("/products/:id", authenticate, async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(toProduct(product));
});

router.get("/products/:id/costing", authenticate, async (req, res): Promise<void> => {
  const params = GetProductCostingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  const materialCost = Number(product.costPrice) * 0.6;
  const laborCost = Number(product.costPrice) * 0.4;
  const totalCost = Number(product.costPrice);
  const sellingPrice = Number(product.sellingPrice);
  const profitAmount = sellingPrice - totalCost;
  const profitMargin = totalCost > 0 ? (profitAmount / sellingPrice) * 100 : 0;
  res.json({ productId: product.id, productName: product.name, materialCost, laborCost, totalCost, sellingPrice, profitMargin: Math.round(profitMargin * 100) / 100, profitAmount });
});

router.patch("/products/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [old] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.sellingPrice !== undefined) updateData.sellingPrice = String(parsed.data.sellingPrice);
  if (parsed.data.costPrice !== undefined) updateData.costPrice = String(parsed.data.costPrice);
  const [product] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  await logActivity({ userId: req.user?.id, action: "UPDATE", module: "products", description: `Updated product ${product.name}`, oldData: toProduct(old), newData: toProduct(product) });
  res.json(toProduct(product));
});

router.delete("/products/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [product] = await db.delete(productsTable).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  await logActivity({ userId: req.user?.id, action: "DELETE", module: "products", description: `Deleted product ${product.name}` });
  res.sendStatus(204);
});

export default router;
