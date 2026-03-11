import { Hono } from "hono";
import { db } from "../db";
import { expenses } from "../schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const expensesRoute = new Hono();

expensesRoute.get("/", (c) => {
  const category = c.req.query("category")?.trim();
  const from = c.req.query("from")?.trim();
  const to = c.req.query("to")?.trim();
  let rows = db.select().from(expenses).all();
  if (category) rows = rows.filter(r => r.category === category);
  if (from) rows = rows.filter(r => r.date >= from);
  if (to) rows = rows.filter(r => r.date <= to);
  return c.json(rows);
});

expensesRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.category || !body.description || body.amount == null || !body.date) {
    return c.json({ error: "category, description, amount, date required" }, 400);
  }
  const result = db.insert(expenses).values({
    category: body.category, description: body.description,
    amount: body.amount, date: body.date, notes: body.notes || null,
  }).run();
  return c.json({ ok: true, id: Number(result.lastInsertRowid) }, 201);
});

expensesRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!existing) return c.json({ error: "Expense not found" }, 404);
  const body = await c.req.json();
  db.update(expenses).set({
    category: body.category ?? existing.category,
    description: body.description ?? existing.description,
    amount: body.amount ?? existing.amount,
    date: body.date ?? existing.date,
    notes: body.notes ?? existing.notes,
    updatedAt: sql`datetime('now')`,
  }).where(eq(expenses.id, id)).run();
  return c.json({ ok: true });
});

expensesRoute.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const existing = db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!existing) return c.json({ error: "Expense not found" }, 404);
  db.delete(expenses).where(eq(expenses.id, id)).run();
  return c.json({ ok: true });
});

export { expensesRoute };
