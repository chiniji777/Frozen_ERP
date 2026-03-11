import { Hono } from "hono";
import { db } from "../db.js";
import { productionOrders, products } from "../schema.js";
import { eq, desc } from "drizzle-orm";

const costsRoute = new Hono();

costsRoute.get("/product/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const product = await db.select().from(products).where(eq(products.id, id)).get();
  if (!product) return c.json({ error: "Product not found" }, 404);
  const latest = await db.select().from(productionOrders)
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

costsRoute.get("/margin", async (c) => {
  const allProducts = await db.select().from(products).all();
  const result = [];
  for (const p of allProducts) {
    const latest = await db.select().from(productionOrders)
      .where(eq(productionOrders.productId, p.id))
      .orderBy(desc(productionOrders.createdAt))
      .limit(1)
      .get();
    const costPerUnit = latest?.costPerUnit ?? 0;
    const margin = p.salePrice - costPerUnit;
    const marginPct = p.salePrice > 0 ? (margin / p.salePrice) * 100 : 0;
    result.push({
      id: p.id, name: p.name, sku: p.sku, salePrice: p.salePrice,
      costPerUnit, margin, marginPercent: Math.round(marginPct * 100) / 100,
    });
  }
  return c.json(result);
});

costsRoute.get("/history/:productId", async (c) => {
  const productId = Number(c.req.param("productId"));
  const product = await db.select().from(products).where(eq(products.id, productId)).get();
  if (!product) return c.json({ error: "Product not found" }, 404);
  const history = await db.select().from(productionOrders)
    .where(eq(productionOrders.productId, productId))
    .orderBy(desc(productionOrders.createdAt))
    .all();
  return c.json({ product, history });
});

export { costsRoute };
