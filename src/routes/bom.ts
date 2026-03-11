import { Hono } from "hono";
import { db } from "../db.js";
import { bom, bomItems, rawMaterials, products } from "../schema.js";
import { eq, sql } from "drizzle-orm";

const bomRoute = new Hono();

bomRoute.get("/", async (c) => {
  const boms = await db.select().from(bom).all();
  const result = [];
  for (const b of boms) {
    const items = await db.select({
      id: bomItems.id,
      rawMaterialId: bomItems.rawMaterialId,
      quantity: bomItems.quantity,
      unit: bomItems.unit,
      materialName: rawMaterials.name,
      pricePerUnit: rawMaterials.pricePerUnit,
    }).from(bomItems)
      .leftJoin(rawMaterials, eq(bomItems.rawMaterialId, rawMaterials.id))
      .where(eq(bomItems.bomId, b.id))
      .all();
    const product = await db.select().from(products).where(eq(products.id, b.productId)).get();
    result.push({ ...b, product, items });
  }
  return c.json(result);
});

bomRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await db.select().from(bom).where(eq(bom.id, id)).get();
  if (!b) return c.json({ error: "BOM not found" }, 404);
  const items = await db.select({
    id: bomItems.id,
    rawMaterialId: bomItems.rawMaterialId,
    quantity: bomItems.quantity,
    unit: bomItems.unit,
    materialName: rawMaterials.name,
    pricePerUnit: rawMaterials.pricePerUnit,
  }).from(bomItems)
    .leftJoin(rawMaterials, eq(bomItems.rawMaterialId, rawMaterials.id))
    .where(eq(bomItems.bomId, id))
    .all();
  const product = await db.select().from(products).where(eq(products.id, b.productId)).get();
  return c.json({ ...b, product, items });
});

bomRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.productId || !body.name) return c.json({ error: "productId and name required" }, 400);
  if (!body.items?.length) return c.json({ error: "items required (at least 1)" }, 400);
  const result = await db.insert(bom).values({
    productId: body.productId,
    name: body.name,
    description: body.description || null,
  }).run();
  const bomId = Number(result.lastInsertRowid);
  for (const item of body.items) {
    if (!item.rawMaterialId || !item.quantity) continue;
    await db.insert(bomItems).values({
      bomId,
      rawMaterialId: item.rawMaterialId,
      quantity: item.quantity,
      unit: item.unit || "kg",
    }).run();
  }
  return c.json({ ok: true, id: bomId }, 201);
});

bomRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(bom).where(eq(bom.id, id)).get();
  if (!existing) return c.json({ error: "BOM not found" }, 404);
  const body = await c.req.json();
  await db.update(bom).set({
    productId: body.productId ?? existing.productId,
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    updatedAt: sql`datetime('now')`,
  }).where(eq(bom.id, id)).run();
  if (body.items) {
    await db.delete(bomItems).where(eq(bomItems.bomId, id)).run();
    for (const item of body.items) {
      if (!item.rawMaterialId || !item.quantity) continue;
      await db.insert(bomItems).values({
        bomId: id,
        rawMaterialId: item.rawMaterialId,
        quantity: item.quantity,
        unit: item.unit || "kg",
      }).run();
    }
  }
  return c.json({ ok: true });
});

bomRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(bom).where(eq(bom.id, id)).get();
  if (!existing) return c.json({ error: "BOM not found" }, 404);
  await db.delete(bomItems).where(eq(bomItems.bomId, id)).run();
  await db.delete(bom).where(eq(bom.id, id)).run();
  return c.json({ ok: true });
});

export { bomRoute };
