import { Hono } from "hono";
import { db } from "../db";
import { customers } from "../schema";
import { eq, like, or, sql } from "drizzle-orm";

const customersRoute = new Hono();

// GET /api/customers — list + search
customersRoute.get("/", (c) => {
  const q = c.req.query("q")?.trim();
  if (q) {
    const pattern = `%${q}%`;
    const rows = db.select().from(customers)
      .where(or(like(customers.name, pattern), like(customers.phone, pattern)))
      .all();
    return c.json(rows);
  }
  return c.json(db.select().from(customers).all());
});

// GET /api/customers/:id
customersRoute.get("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const row = db.select().from(customers).where(eq(customers.id, id)).get();
  if (!row) return c.json({ error: "Customer not found" }, 404);
  return c.json(row);
});

// POST /api/customers
customersRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name required" }, 400);
  const result = db.insert(customers).values({
    name: body.name,
    address: body.address || null,
    phone: body.phone || null,
    email: body.email || null,
    taxId: body.taxId || null,
    notes: body.notes || null,
  }).run();
  return c.json({ ok: true, id: result.lastInsertRowid }, 201);
});

// PUT /api/customers/:id
customersRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = db.select().from(customers).where(eq(customers.id, id)).get();
  if (!existing) return c.json({ error: "Customer not found" }, 404);

  const body = await c.req.json();
  db.update(customers).set({
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

// DELETE /api/customers/:id
customersRoute.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const existing = db.select().from(customers).where(eq(customers.id, id)).get();
  if (!existing) return c.json({ error: "Customer not found" }, 404);
  db.delete(customers).where(eq(customers.id, id)).run();
  return c.json({ ok: true });
});

export { customersRoute };
