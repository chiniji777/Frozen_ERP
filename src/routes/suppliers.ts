import { Hono } from "hono";
import { db } from "../db.js";
import { suppliers } from "../schema.js";
import { eq, like, or, sql } from "drizzle-orm";
import { generateRunningNumber } from "../utils.js";

const suppliersRoute = new Hono();

// GET / — list all or search
suppliersRoute.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  if (q) {
    const pattern = `%${q}%`;
    const rows = await db.select().from(suppliers)
      .where(or(
        like(suppliers.name, pattern),
        like(suppliers.code, pattern),
        like(suppliers.fullName, pattern),
        like(suppliers.nickName, pattern),
        like(suppliers.phone, pattern),
        like(suppliers.email, pattern),
        like(suppliers.taxId, pattern),
      ))
      .all();
    return c.json(rows);
  }
  return c.json(await db.select().from(suppliers).all());
});

// GET /:id — detail
suppliersRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db.select().from(suppliers).where(eq(suppliers.id, id)).get();
  if (!row) return c.json({ error: "Supplier not found" }, 404);
  return c.json(row);
});

// POST / — create
suppliersRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name required" }, 400);

  // Auto-generate code if not provided
  const code = body.code || await generateRunningNumber("SUP", "suppliers", "code");

  const result = await db.insert(suppliers).values({
    code,
    name: body.name,
    fullName: body.fullName || null,
    nickName: body.nickName || null,
    supplierType: body.supplierType || "Company",
    phone: body.phone || null,
    email: body.email || null,
    address: body.address || null,
    taxId: body.taxId || null,
    paymentTerms: body.paymentTerms || null,
    notes: body.notes || null,
  }).run();
  return c.json({ ok: true, id: Number(result.lastInsertRowid), code }, 201);
});

// PUT /:id — update
suppliersRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(suppliers).where(eq(suppliers.id, id)).get();
  if (!existing) return c.json({ error: "Supplier not found" }, 404);
  const body = await c.req.json();
  await db.update(suppliers).set({
    code: body.code ?? existing.code,
    name: body.name ?? existing.name,
    fullName: body.fullName ?? existing.fullName,
    nickName: body.nickName ?? existing.nickName,
    supplierType: body.supplierType ?? existing.supplierType,
    phone: body.phone ?? existing.phone,
    email: body.email ?? existing.email,
    address: body.address ?? existing.address,
    taxId: body.taxId ?? existing.taxId,
    paymentTerms: body.paymentTerms ?? existing.paymentTerms,
    notes: body.notes ?? existing.notes,
    updatedAt: sql`datetime('now')`,
  }).where(eq(suppliers.id, id)).run();
  return c.json({ ok: true });
});

// DELETE /:id — delete
suppliersRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(suppliers).where(eq(suppliers.id, id)).get();
  if (!existing) return c.json({ error: "Supplier not found" }, 404);
  await db.delete(suppliers).where(eq(suppliers.id, id)).run();
  return c.json({ ok: true });
});

export { suppliersRoute };
