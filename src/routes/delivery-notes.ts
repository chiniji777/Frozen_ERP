import { Hono } from "hono";
import { db } from "../db";
import { deliveryNotes, dnItems, salesOrders, soItems, products } from "../schema";
import { eq, sql } from "drizzle-orm";
import { generateRunningNumber } from "../utils";

const deliveryNotesRoute = new Hono();

deliveryNotesRoute.get("/", (c) => {
  const notes = db.select().from(deliveryNotes).all();
  return c.json(notes.map(dn => {
    const items = db.select().from(dnItems).where(eq(dnItems.deliveryNoteId, dn.id)).all();
    return { ...dn, items };
  }));
});

deliveryNotesRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.salesOrderId) return c.json({ error: "salesOrderId required" }, 400);
  const so = db.select().from(salesOrders).where(eq(salesOrders.id, body.salesOrderId)).get();
  if (!so) return c.json({ error: "Sales order not found" }, 404);
  if (so.status !== "confirmed") return c.json({ error: "Sales order must be confirmed" }, 400);

  const dnNumber = generateRunningNumber("DN", "delivery_notes", "dn_number");
  const result = db.insert(deliveryNotes).values({
    salesOrderId: body.salesOrderId, dnNumber, notes: body.notes || null,
  }).run();
  const dnId = Number(result.lastInsertRowid);

  const items = db.select().from(soItems).where(eq(soItems.salesOrderId, body.salesOrderId)).all();
  for (const item of items) {
    db.insert(dnItems).values({ deliveryNoteId: dnId, productId: item.productId, quantity: item.quantity }).run();
  }
  return c.json({ ok: true, id: dnId, dnNumber }, 201);
});

deliveryNotesRoute.post("/:id/ship", (c) => {
  const id = Number(c.req.param("id"));
  const dn = db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id)).get();
  if (!dn) return c.json({ error: "Delivery note not found" }, 404);
  if (dn.status !== "pending") return c.json({ error: "Can only ship pending DN" }, 400);
  db.update(deliveryNotes).set({ status: "shipped", shippedAt: sql`datetime('now')`, updatedAt: sql`datetime('now')` }).where(eq(deliveryNotes.id, id)).run();
  return c.json({ ok: true, status: "shipped" });
});

deliveryNotesRoute.post("/:id/deliver", (c) => {
  const id = Number(c.req.param("id"));
  const dn = db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id)).get();
  if (!dn) return c.json({ error: "Delivery note not found" }, 404);
  if (dn.status === "delivered") return c.json({ error: "Already delivered" }, 400);

  const items = db.select().from(dnItems).where(eq(dnItems.deliveryNoteId, id)).all();
  for (const item of items) {
    const product = db.select().from(products).where(eq(products.id, item.productId)).get();
    if (!product) return c.json({ error: `Product ID ${item.productId} not found` }, 400);
    if (product.stock < item.quantity) {
      return c.json({ error: `Insufficient stock for ${product.name}: need ${item.quantity}, have ${product.stock}` }, 400);
    }
  }
  for (const item of items) {
    db.update(products).set({ stock: sql`stock - ${item.quantity}`, updatedAt: sql`datetime('now')` }).where(eq(products.id, item.productId)).run();
  }

  db.update(deliveryNotes).set({ status: "delivered", deliveredAt: sql`datetime('now')`, updatedAt: sql`datetime('now')` }).where(eq(deliveryNotes.id, id)).run();
  db.update(salesOrders).set({ status: "delivered", updatedAt: sql`datetime('now')` }).where(eq(salesOrders.id, dn.salesOrderId)).run();
  return c.json({ ok: true, status: "delivered", message: "Stock deducted" });
});

export { deliveryNotesRoute };
