import { Hono } from "hono";
import { db } from "../db";
import { rawMaterials } from "../schema";
import { eq, like, sql } from "drizzle-orm";

const rawMaterialsRoute = new Hono();

// GET /api/raw-materials — list + search
rawMaterialsRoute.get("/", (c) => {
  const q = c.req.query("q")?.trim();
  if (q) {
    const pattern = `%${q}%`;
    const rows = db.select().from(rawMaterials).where(like(rawMaterials.name, pattern)).all();
    return c.json(rows);
  }
  return c.json(db.select().from(rawMaterials).all());
});

// GET /api/raw-materials/:id
rawMaterialsRoute.get("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const row = db.select().from(rawMaterials).where(eq(rawMaterials.id, id)).get();
  if (!row) return c.json({ error: "Raw material not found" }, 404);
  return c.json(row);
});

// POST /api/raw-materials
rawMaterialsRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name required" }, 400);
  const result = db.insert(rawMaterials).values({
    name: body.name,
    pricePerUnit: body.pricePerUnit ?? 0,
    unit: body.unit || "กก.",
    stock: body.stock ?? 0,
    supplier: body.supplier || null,
    notes: body.notes || null,
  }).run();
  return c.json({ ok: true, id: result.lastInsertRowid }, 201);
});

// PUT /api/raw-materials/:id
rawMaterialsRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = db.select().from(rawMaterials).where(eq(rawMaterials.id, id)).get();
  if (!existing) return c.json({ error: "Raw material not found" }, 404);

  const body = await c.req.json();
  db.update(rawMaterials).set({
    name: body.name ?? existing.name,
    pricePerUnit: body.pricePerUnit ?? existing.pricePerUnit,
    unit: body.unit ?? existing.unit,
    stock: body.stock ?? existing.stock,
    supplier: body.supplier ?? existing.supplier,
    notes: body.notes ?? existing.notes,
    updatedAt: sql`datetime('now')`,
  }).where(eq(rawMaterials.id, id)).run();
  return c.json({ ok: true });
});

// DELETE /api/raw-materials/:id
rawMaterialsRoute.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const existing = db.select().from(rawMaterials).where(eq(rawMaterials.id, id)).get();
  if (!existing) return c.json({ error: "Raw material not found" }, 404);
  db.delete(rawMaterials).where(eq(rawMaterials.id, id)).run();
  return c.json({ ok: true });
});

export { rawMaterialsRoute };
