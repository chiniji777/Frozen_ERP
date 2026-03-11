import { Hono } from "hono";
import { db } from "../db";
import { invoices, invoiceItems, salesOrders, soItems, products } from "../schema";
import { eq, sql } from "drizzle-orm";
import { generateRunningNumber } from "../utils";

const invoicesRoute = new Hono();

invoicesRoute.get("/", (c) => {
  const status = c.req.query("status")?.trim();
  let rows = db.select().from(invoices).all();
  if (status) rows = rows.filter(r => r.status === status);
  return c.json(rows.map(iv => {
    const items = db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, iv.id)).all();
    return { ...iv, items };
  }));
});

invoicesRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.salesOrderId) return c.json({ error: "salesOrderId required" }, 400);
  const so = db.select().from(salesOrders).where(eq(salesOrders.id, body.salesOrderId)).get();
  if (!so) return c.json({ error: "Sales order not found" }, 404);

  const invoiceNumber = generateRunningNumber("IV", "invoices", "invoice_number");
  const result = db.insert(invoices).values({
    salesOrderId: body.salesOrderId, deliveryNoteId: body.deliveryNoteId || null,
    invoiceNumber, subtotal: so.subtotal, vatRate: so.vatRate, vatAmount: so.vatAmount, totalAmount: so.totalAmount,
    dueDate: body.dueDate || null, notes: body.notes || null,
  }).run();
  const ivId = Number(result.lastInsertRowid);

  const items = db.select().from(soItems).where(eq(soItems.salesOrderId, body.salesOrderId)).all();
  for (const item of items) {
    db.insert(invoiceItems).values({
      invoiceId: ivId, productId: item.productId, quantity: item.quantity,
      unitPrice: item.unitPrice, amount: item.amount,
    }).run();
  }

  db.update(salesOrders).set({ status: "invoiced", updatedAt: sql`datetime('now')` }).where(eq(salesOrders.id, body.salesOrderId)).run();
  return c.json({ ok: true, id: ivId, invoiceNumber, totalAmount: so.totalAmount }, 201);
});

invoicesRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!existing) return c.json({ error: "Invoice not found" }, 404);
  const body = await c.req.json();
  db.update(invoices).set({
    dueDate: body.dueDate ?? existing.dueDate,
    notes: body.notes ?? existing.notes,
    updatedAt: sql`datetime('now')`,
  }).where(eq(invoices.id, id)).run();
  return c.json({ ok: true });
});

invoicesRoute.post("/:id/send", (c) => {
  const id = Number(c.req.param("id"));
  const iv = db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!iv) return c.json({ error: "Invoice not found" }, 404);
  if (iv.status !== "draft") return c.json({ error: "Can only send draft invoices" }, 400);
  db.update(invoices).set({ status: "sent", updatedAt: sql`datetime('now')` }).where(eq(invoices.id, id)).run();
  return c.json({ ok: true, status: "sent" });
});

export { invoicesRoute };
