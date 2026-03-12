import { Hono } from "hono";
import { db } from "../db.js";
import { uoms } from "../schema.js";
import { eq, asc } from "drizzle-orm";

const uomRoute = new Hono();

// GET /api/uoms — list all
uomRoute.get("/", async (c) => {
  const all = await db.select().from(uoms).orderBy(asc(uoms.sortOrder), asc(uoms.id)).all();
  return c.json(all);
});

// POST /api/uoms — create
uomRoute.post("/", async (c) => {
  const body = await c.req.json();
  const { code, name, nameEn, category, isDefault, sortOrder } = body;

  if (!code || !name) {
    return c.json({ error: "code and name are required" }, 400);
  }

  const existing = await db.select({ id: uoms.id }).from(uoms).where(eq(uoms.code, code)).get();
  if (existing) {
    return c.json({ error: "UOM code already exists" }, 409);
  }

  const result = await db.insert(uoms).values({
    code,
    name,
    nameEn: nameEn || null,
    category: category || null,
    isDefault: isDefault || 0,
    sortOrder: sortOrder || 0,
  }).returning({ id: uoms.id });

  return c.json({ ok: true, id: result[0].id }, 201);
});

// PUT /api/uoms/:id — update
uomRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();

  const existing = await db.select().from(uoms).where(eq(uoms.id, id)).get();
  if (!existing) {
    return c.json({ error: "UOM not found" }, 404);
  }

  const updates: Record<string, unknown> = {};
  if (body.code !== undefined) updates.code = body.code;
  if (body.name !== undefined) updates.name = body.name;
  if (body.nameEn !== undefined) updates.nameEn = body.nameEn;
  if (body.category !== undefined) updates.category = body.category;
  if (body.isDefault !== undefined) updates.isDefault = body.isDefault;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  await db.update(uoms).set(updates).where(eq(uoms.id, id));
  return c.json({ ok: true });
});

// DELETE /api/uoms/:id — delete
uomRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));

  const existing = await db.select({ id: uoms.id }).from(uoms).where(eq(uoms.id, id)).get();
  if (!existing) {
    return c.json({ error: "UOM not found" }, 404);
  }

  await db.delete(uoms).where(eq(uoms.id, id));
  return c.json({ ok: true });
});

export { uomRoute };
