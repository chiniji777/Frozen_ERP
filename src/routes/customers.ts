import { Hono } from "hono";
import { db } from "../db.js";
import { customers } from "../schema.js";
import { eq, like, or, sql } from "drizzle-orm";

const customersRoute = new Hono();

customersRoute.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  if (q) {
    const pattern = `%${q}%`;
    const rows = await db.select().from(customers)
      .where(or(
        like(customers.name, pattern),
        like(customers.phone, pattern),
        like(customers.code, pattern),
        like(customers.fullName, pattern),
        like(customers.nickName, pattern),
        like(customers.territory, pattern),
        like(customers.email, pattern),
        like(customers.salesPartner, pattern),
      ))
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
    code: body.code || null,
    name: body.name,
    fullName: body.fullName || null,
    nickName: body.nickName || null,
    address: body.address || null,
    phone: body.phone || null,
    email: body.email || null,
    taxId: body.taxId || null,
    territory: body.territory || null,
    customerType: body.customerType || "Company",
    creditLimit: body.creditLimit ?? 0,
    paymentTerms: body.paymentTerms || null,
    salesPartner: body.salesPartner || null,
    commissionRate: body.commissionRate ?? 0,
    notes: body.notes || null,
    locations: body.locations ? (typeof body.locations === "string" ? body.locations : JSON.stringify(body.locations)) : null,
  }).run();
  return c.json({ ok: true, id: Number(result.lastInsertRowid) }, 201);
});

customersRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(customers).where(eq(customers.id, id)).get();
  if (!existing) return c.json({ error: "Customer not found" }, 404);
  const body = await c.req.json();
  await db.update(customers).set({
    code: body.code ?? existing.code,
    name: body.name ?? existing.name,
    fullName: body.fullName ?? existing.fullName,
    nickName: body.nickName ?? existing.nickName,
    address: body.address ?? existing.address,
    phone: body.phone ?? existing.phone,
    email: body.email ?? existing.email,
    taxId: body.taxId ?? existing.taxId,
    territory: body.territory ?? existing.territory,
    customerType: body.customerType ?? existing.customerType,
    creditLimit: body.creditLimit ?? existing.creditLimit,
    paymentTerms: body.paymentTerms ?? existing.paymentTerms,
    salesPartner: body.salesPartner ?? existing.salesPartner,
    commissionRate: body.commissionRate ?? existing.commissionRate,
    notes: body.notes ?? existing.notes,
    locations: body.locations !== undefined ? (typeof body.locations === "string" ? body.locations : JSON.stringify(body.locations)) : existing.locations,
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

// POST /api/customers/import — bulk import
customersRoute.post("/import", async (c) => {
  const body = await c.req.json();
  const rows = body.customers;
  if (!Array.isArray(rows) || rows.length === 0) {
    return c.json({ error: "customers array required" }, 400);
  }

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row.name || row.fullName;
    if (!name) { skipped++; continue; }

    // Check duplicate by code
    if (row.code) {
      const existing = await db.select({ id: customers.id }).from(customers).where(eq(customers.code, row.code)).get();
      if (existing) { skipped++; continue; }
    }

    try {
      await db.insert(customers).values({
        code: row.code || null,
        name,
        fullName: row.fullName || null,
        nickName: row.nickName || null,
        address: row.address || null,
        phone: row.phone || null,
        email: row.email || null,
        taxId: row.taxId || null,
        territory: row.territory || null,
        customerType: row.customerType || "Company",
        creditLimit: row.creditLimit ?? 0,
        paymentTerms: row.paymentTerms || null,
        salesPartner: row.salesPartner || null,
        commissionRate: row.commissionRate ?? 0,
        notes: row.notes || null,
        locations: row.locations ? (typeof row.locations === "string" ? row.locations : JSON.stringify(row.locations)) : null,
      }).run();
      imported++;
    } catch {
      skipped++;
    }
  }

  return c.json({ ok: true, imported, skipped });
});

export { customersRoute };
