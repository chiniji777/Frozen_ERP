import { Hono } from "hono";
import { db } from "../db.js";
import { products } from "../schema.js";
import { eq, like, or, and, sql } from "drizzle-orm";

const productsRoute = new Hono();

productsRoute.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  const category = c.req.query("category")?.trim();
  let conditions: any[] = [];
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(or(
      like(products.name, pattern),
      like(products.sku, pattern),
      like(products.rawMaterial, pattern),
      like(products.description, pattern),
    ));
  }
  if (category) {
    conditions.push(eq(products.category, category));
  }
  if (conditions.length > 0) {
    return c.json(await db.select().from(products).where(and(...conditions)).all());
  }
  return c.json(await db.select().from(products).all());
});

productsRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db.select().from(products).where(eq(products.id, id)).get();
  if (!row) return c.json({ error: "Product not found" }, 404);
  return c.json(row);
});

productsRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name required" }, 400);
  const result = await db.insert(products).values({
    name: body.name,
    sku: body.sku || null,
    category: body.category || null,
    salePrice: body.salePrice ?? 0,
    unit: body.unit || "piece",
    stock: body.stock ?? 0,
    imageUrl: body.imageUrl || null,
    rawMaterial: body.rawMaterial || null,
    rawMaterialYield: body.rawMaterialYield ?? null,
    description: body.description || null,
  }).run();
  return c.json({ ok: true, id: Number(result.lastInsertRowid) }, 201);
});

productsRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(products).where(eq(products.id, id)).get();
  if (!existing) return c.json({ error: "Product not found" }, 404);
  const body = await c.req.json();
  await db.update(products).set({
    name: body.name ?? existing.name,
    sku: body.sku ?? existing.sku,
    category: body.category ?? existing.category,
    salePrice: body.salePrice ?? existing.salePrice,
    unit: body.unit ?? existing.unit,
    stock: body.stock ?? existing.stock,
    imageUrl: body.imageUrl ?? existing.imageUrl,
    rawMaterial: body.rawMaterial ?? existing.rawMaterial,
    rawMaterialYield: body.rawMaterialYield ?? existing.rawMaterialYield,
    description: body.description ?? existing.description,
    updatedAt: sql`datetime('now')`,
  }).where(eq(products.id, id)).run();
  return c.json({ ok: true });
});

productsRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(products).where(eq(products.id, id)).get();
  if (!existing) return c.json({ error: "Product not found" }, 404);
  await db.delete(products).where(eq(products.id, id)).run();
  return c.json({ ok: true });
});

export { productsRoute };
