import { Hono } from "hono";
import { db } from "../db";
import { customers } from "../schema";
import { eq, like, or, sql } from "drizzle-orm";

const customersRoute = new Hono();

customersRoute.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  if (q) {
    const pattern = `%${q}%`;
    const rows = await db.select().from(customers)
      .where(or(like(customers.name, pattern), like(customers.phone, pattern)))
      .all();
    return c.json(rows);
  }
  return c.json(await db.select().from(customers).all());
});

customersRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db.select().from(customers).where(eq(customers.id, id)).get();
  if (!row) return c.json({ error: "Customer not found" }, 404);
  return c.json(row);
});

customersRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name required" }, 400);
  const result = await db.insert(customers).values({
    name: body.name,
    address: body.address || null,
    phone: body.phone || null,
    email: body.email || null,
    taxId: body.taxId || null,
    notes: body.notes || null,
  }).run();
  return c.json({ ok: true, id: Number(result.lastInsertRowid) }, 201);
});

customersRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(customers).where(eq(customers.id, id)).get();
  if (!existing) return c.json({ error: "Customer not found" }, 404);
  const body = await c.req.json();
  await db.update(customers).set({
    name: body.name ?? existing.name,
    address: body.address ?? existing.address,
    phone: body.phone ?? existing.phone,
    email: body.email ?? existing.email,
    taxId: body.taxId ?? existing.taxId,
    notes: body.notes ?? existing.notes,
    updatedAt: sql`datetime('now')`,
  }).where(eq(customers.id, id)).run();
  return c.json({ ok: true });
});

customersRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(customers).where(eq(customers.id, id)).get();
  if (!existing) return c.json({ error: "Customer not found" }, 404);
  await db.delete(customers).where(eq(customers.id, id)).run();
  return c.json({ ok: true });
});

export { customersRoute };
