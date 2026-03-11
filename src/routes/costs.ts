import { Hono } from "hono";
import { db } from "../db";
import { productionOrders, products } from "../schema";
import { eq, desc } from "drizzle-orm";

const costsRoute = new Hono();

// GET /api/costs/product/:id — latest cost per unit
costsRoute.get("/product/:id", (c) => {
  const id = Number(c.req.param("id"));
  const product = db.select().from(products).where(eq(products.id, id)).get();
  if (!product) return c.json({ error: "Product not found" }, 404);

  const latest = db.select().from(productionOrders)
    .where(eq(productionOrders.productId, id))
    .orderBy(desc(productionOrders.createdAt))
    .limit(1)
    .get();

  return c.json({
    product,
    latestCostPerUnit: latest?.costPerUnit ?? null,
    latestTotalCost: latest?.totalCost ?? null,
    latestProductionId: latest?.id ?? null,
  });
});

// GET /api/costs/margin — margin analysis for all products
costsRoute.get("/margin", (c) => {
  const allProducts = db.select().from(products).all();
  const result = allProducts.map((p) => {
    const latest = db.select().from(productionOrders)
      .where(eq(productionOrders.productId, p.id))
      .orderBy(desc(productionOrders.createdAt))
      .limit(1)
      .get();
    const costPerUnit = latest?.costPerUnit ?? 0;
    const margin = p.salePrice - costPerUnit;
    const marginPct = p.salePrice > 0 ? (margin / p.salePrice) * 100 : 0;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      salePrice: p.salePrice,
      costPerUnit,
      margin,
      marginPercent: Math.round(marginPct * 100) / 100,
    };
  });
  return c.json(result);
});

// GET /api/costs/history/:productId — production cost history
costsRoute.get("/history/:productId", (c) => {
  const productId = Number(c.req.param("productId"));
  const product = db.select().from(products).where(eq(products.id, productId)).get();
  if (!product) return c.json({ error: "Product not found" }, 404);

  const history = db.select().from(productionOrders)
    .where(eq(productionOrders.productId, productId))
    .orderBy(desc(productionOrders.createdAt))
    .all();

  return c.json({ product, history });
});

export { costsRoute };
