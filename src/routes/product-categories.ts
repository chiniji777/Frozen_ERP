import { Hono } from "hono";
import { db } from "../db.js";
import { productCategories } from "../schema.js";
import { eq, asc } from "drizzle-orm";

const productCategoriesRoute = new Hono();

// GET /api/product-categories — list (optional ?active=1 filter)
productCategoriesRoute.get("/", async (c) => {
  const active = c.req.query("active");
  let query = db.select().from(productCategories).orderBy(asc(productCategories.sortOrder), asc(productCategories.id));

  if (active === "1") {
    const all = await query.all();
    return c.json(all.filter((r) => r.isActive === 1));
  }

  const all = await query.all();
  return c.json(all);
});

// POST /api/product-categories — create
productCategoriesRoute.post("/", async (c) => {
  const body = await c.req.json();
  const { name, description, sortOrder } = body;

  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }

  const existing = await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.name, name)).get();
  if (existing) {
    return c.json({ error: "Category name already exists" }, 409);
  }

  const result = await db.insert(productCategories).values({
    name,
    description: description || null,
    sortOrder: sortOrder || 0,
  }).returning({ id: productCategories.id });

  return c.json({ ok: true, id: result[0].id }, 201);
});

// PUT /api/product-categories/:id — update
productCategoriesRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();

  const existing = await db.select().from(productCategories).where(eq(productCategories.id, id)).get();
  if (!existing) {
    return c.json({ error: "Category not found" }, 404);
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  updates.updatedAt = new Date().toISOString().replace("T", " ").slice(0, 19);

  await db.update(productCategories).set(updates).where(eq(productCategories.id, id));
  return c.json({ ok: true });
});

// PATCH /api/product-categories/:id/deactivate — soft deactivate
productCategoriesRoute.patch("/:id/deactivate", async (c) => {
  const id = Number(c.req.param("id"));

  const existing = await db.select().from(productCategories).where(eq(productCategories.id, id)).get();
  if (!existing) {
    return c.json({ error: "Category not found" }, 404);
  }

  await db.update(productCategories).set({
    isActive: 0,
    updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
  }).where(eq(productCategories.id, id));

  return c.json({ ok: true });
});

export { productCategoriesRoute };
