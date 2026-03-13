import { Hono } from "hono";
import { db } from "../db.js";
import { rawMaterials } from "../schema.js";
import { eq, like, sql } from "drizzle-orm";

const rawMaterialsRoute = new Hono();

rawMaterialsRoute.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  if (q) {
    const pattern = `%${q}%`;
    return c.json(await db.select().from(rawMaterials).where(like(rawMaterials.name, pattern)).all());
  }
  return c.json(await db.select().from(rawMaterials).all());
});

rawMaterialsRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db.select().from(rawMaterials).where(eq(rawMaterials.id, id)).get();
  if (!row) return c.json({ error: "Raw material not found" }, 404);
  return c.json(row);
});

rawMaterialsRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name required" }, 400);

  // Auto-generate code: RM-0001, RM-0002, ...
  let code = body.code || null;
  if (!code) {
    const last = await db.select({ code: rawMaterials.code })
      .from(rawMaterials)
      .where(like(rawMaterials.code, "RM-%"))
      .orderBy(sql`CAST(SUBSTR(code, 4) AS INTEGER) DESC`)
      .limit(1)
      .get();
    const nextNum = last?.code ? parseInt(last.code.replace("RM-", ""), 10) + 1 : 1;
    code = `RM-${String(nextNum).padStart(4, "0")}`;
  }

  const result = await db.insert(rawMaterials).values({
    code,
    name: body.name,
    pricePerUnit: body.pricePerUnit ?? 0,
    unit: body.unit || "kg",
    stock: 0,
    supplier: body.supplier || null,
    notes: body.notes || null,
  }).run();
  return c.json({ ok: true, id: Number(result.lastInsertRowid), code }, 201);
});

rawMaterialsRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(rawMaterials).where(eq(rawMaterials.id, id)).get();
  if (!existing) return c.json({ error: "Raw material not found" }, 404);
  const body = await c.req.json();
  await db.update(rawMaterials).set({
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

rawMaterialsRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(rawMaterials).where(eq(rawMaterials.id, id)).get();
  if (!existing) return c.json({ error: "Raw material not found" }, 404);
  await db.delete(rawMaterials).where(eq(rawMaterials.id, id)).run();
  return c.json({ ok: true });
});

export { rawMaterialsRoute };
