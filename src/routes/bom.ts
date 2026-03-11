import { Hono } from "hono";
import { db } from "../db";
import { bom, bomItems, rawMaterials, products } from "../schema";
import { eq, sql } from "drizzle-orm";

const bomRoute = new Hono();

// GET /api/bom — list all BOMs with items + raw material info
bomRoute.get("/", (c) => {
  const boms = db.select().from(bom).all();
  const result = boms.map((b) => {
    const items = db.select({
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
    const product = db.select().from(products).where(eq(products.id, b.productId)).get();
    return { ...b, product, items };
  });
  return c.json(result);
});

// GET /api/bom/:id — detail + items
bomRoute.get("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const b = db.select().from(bom).where(eq(bom.id, id)).get();
  if (!b) return c.json({ error: "BOM not found" }, 404);
  const items = db.select({
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
  const product = db.select().from(products).where(eq(products.id, b.productId)).get();
  return c.json({ ...b, product, items });
});

// POST /api/bom — create BOM + items
bomRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.productId || !body.name) return c.json({ error: "productId and name required" }, 400);
  if (!body.items?.length) return c.json({ error: "items required (at least 1)" }, 400);

  const result = db.insert(bom).values({
    productId: body.productId,
    name: body.name,
    description: body.description || null,
  }).run();
  const bomId = Number(result.lastInsertRowid);

  for (const item of body.items) {
    if (!item.rawMaterialId || !item.quantity) continue;
    db.insert(bomItems).values({
      bomId,
      rawMaterialId: item.rawMaterialId,
      quantity: item.quantity,
      unit: item.unit || "กก.",
    }).run();
  }

  return c.json({ ok: true, id: bomId }, 201);
});

// PUT /api/bom/:id — update BOM + replace items
bomRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = db.select().from(bom).where(eq(bom.id, id)).get();
  if (!existing) return c.json({ error: "BOM not found" }, 404);

  const body = await c.req.json();
  db.update(bom).set({
    productId: body.productId ?? existing.productId,
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    updatedAt: sql`datetime('now')`,
  }).where(eq(bom.id, id)).run();

  if (body.items) {
    db.delete(bomItems).where(eq(bomItems.bomId, id)).run();
    for (const item of body.items) {
      if (!item.rawMaterialId || !item.quantity) continue;
      db.insert(bomItems).values({
        bomId: id,
        rawMaterialId: item.rawMaterialId,
        quantity: item.quantity,
        unit: item.unit || "กก.",
      }).run();
    }
  }

  return c.json({ ok: true });
});

// DELETE /api/bom/:id
bomRoute.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const existing = db.select().from(bom).where(eq(bom.id, id)).get();
  if (!existing) return c.json({ error: "BOM not found" }, 404);
  db.delete(bomItems).where(eq(bomItems.bomId, id)).run();
  db.delete(bom).where(eq(bom.id, id)).run();
  return c.json({ ok: true });
});

export { bomRoute };
