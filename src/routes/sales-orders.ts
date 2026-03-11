import { Hono } from "hono";
import { db } from "../db.js";
import { salesOrders, soItems, products, customers } from "../schema.js";
import { eq, like, sql } from "drizzle-orm";
import { generateRunningNumber } from "../utils.js";

const salesOrdersRoute = new Hono();

salesOrdersRoute.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  const status = c.req.query("status")?.trim();
  let orders = await db.select().from(salesOrders).all();
  if (status) orders = orders.filter(o => o.status === status);
  const result = [];
  for (const o of orders) {
    const customer = await db.select().from(customers).where(eq(customers.id, o.customerId)).get();
    if (q && customer && !customer.name.toLowerCase().includes(q.toLowerCase())) continue;
    const items = await db.select().from(soItems).where(eq(soItems.salesOrderId, o.id)).all();
    result.push({ ...o, customer, items });
  }
  return c.json(result);
});

salesOrdersRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const o = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).get();
  if (!o) return c.json({ error: "Sales order not found" }, 404);
  const customer = await db.select().from(customers).where(eq(customers.id, o.customerId)).get();
  const items = await db.select({
    id: soItems.id, productId: soItems.productId, quantity: soItems.quantity,
    unitPrice: soItems.unitPrice, amount: soItems.amount,
    productName: products.name, sku: products.sku,
  }).from(soItems).leftJoin(products, eq(soItems.productId, products.id))
    .where(eq(soItems.salesOrderId, id)).all();
  return c.json({ ...o, customer, items });
});

salesOrdersRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.customerId || !body.items?.length) return c.json({ error: "customerId and items required" }, 400);
  const orderNumber = await generateRunningNumber("SO", "sales_orders", "order_number");
  let subtotal = 0;
  const itemData: { productId: number; quantity: number; unitPrice: number; amount: number }[] = [];
  for (const item of body.items) {
    const product = await db.select().from(products).where(eq(products.id, item.productId)).get();
    const unitPrice = item.unitPrice ?? product?.salePrice ?? 0;
    const amount = unitPrice * item.quantity;
    subtotal += amount;
    itemData.push({ productId: item.productId, quantity: item.quantity, unitPrice, amount });
  }
  const vatRate = body.vatRate ?? 7;
  const vatAmount = Math.round(subtotal * vatRate / 100 * 100) / 100;
  const totalAmount = subtotal + vatAmount;
  const result = await db.insert(salesOrders).values({
    customerId: body.customerId, orderNumber, subtotal, vatRate, vatAmount, totalAmount,
    notes: body.notes || null,
  }).run();
  const soId = Number(result.lastInsertRowid);
  for (const item of itemData) {
    await db.insert(soItems).values({ salesOrderId: soId, ...item }).run();
  }
  return c.json({ ok: true, id: soId, orderNumber, subtotal, vatAmount, totalAmount }, 201);
});

salesOrdersRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).get();
  if (!existing) return c.json({ error: "Sales order not found" }, 404);
  if (existing.status !== "draft") return c.json({ error: "Can only edit draft orders" }, 400);
  const body = await c.req.json();
  await db.update(salesOrders).set({
    customerId: body.customerId ?? existing.customerId,
    notes: body.notes ?? existing.notes,
    updatedAt: sql`datetime('now')`,
  }).where(eq(salesOrders.id, id)).run();
  return c.json({ ok: true });
});

salesOrdersRoute.post("/:id/confirm", async (c) => {
  const id = Number(c.req.param("id"));
  const o = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).get();
  if (!o) return c.json({ error: "Sales order not found" }, 404);
  if (o.status !== "draft") return c.json({ error: "Can only confirm draft orders" }, 400);
  await db.update(salesOrders).set({ status: "confirmed", updatedAt: sql`datetime('now')` }).where(eq(salesOrders.id, id)).run();
  return c.json({ ok: true, status: "confirmed" });
});

export { salesOrdersRoute };
