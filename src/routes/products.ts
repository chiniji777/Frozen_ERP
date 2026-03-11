import { Hono } from "hono";
import { db } from "../db";
import { products } from "../schema";
import { eq, like, or, and, sql } from "drizzle-orm";

const productsRoute = new Hono();

// GET /api/products — list + search + filter by category
productsRoute.get("/", (c) => {
  const q = c.req.query("q")?.trim();
  const category = c.req.query("category")?.trim();

  let conditions: any[] = [];
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(or(like(products.name, pattern), like(products.sku, pattern)));
  }
  if (category) {
    conditions.push(eq(products.category, category));
  }

  if (conditions.length > 0) {
    const rows = db.select().from(products).where(and(...conditions)).all();
    return c.json(rows);
  }
  return c.json(db.select().from(products).all());
});

// GET /api/products/:id
productsRoute.get("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const row = db.select().from(products).where(eq(products.id, id)).get();
  if (!row) return c.json({ error: "Product not found" }, 404);
  return c.json(row);
});

// POST /api/products
productsRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name required" }, 400);
  const result = db.insert(products).values({
    name: body.name,
    sku: body.sku || null,
    category: body.category || null,
    salePrice: body.salePrice ?? 0,
    unit: body.unit || "ชิ้น",
    stock: body.stock ?? 0,
    imageUrl: body.imageUrl || null,
  }).run();
  return c.json({ ok: true, id: result.lastInsertRowid }, 201);
});

// PUT /api/products/:id
productsRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = db.select().from(products).where(eq(products.id, id)).get();
  if (!existing) return c.json({ error: "Product not found" }, 404);

  const body = await c.req.json();
  db.update(products).set({
    name: body.name ?? existing.name,
    sku: body.sku ?? existing.sku,
    category: body.category ?? existing.category,
    salePrice: body.salePrice ?? existing.salePrice,
    unit: body.unit ?? existing.unit,
    stock: body.stock ?? existing.stock,
    imageUrl: body.imageUrl ?? existing.imageUrl,
    updatedAt: sql`datetime('now')`,
  }).where(eq(products.id, id)).run();
  return c.json({ ok: true });
});

// DELETE /api/products/:id
productsRoute.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const existing = db.select().from(products).where(eq(products.id, id)).get();
  if (!existing) return c.json({ error: "Product not found" }, 404);
  db.delete(products).where(eq(products.id, id)).run();
  return c.json({ ok: true });
});

export { productsRoute };
