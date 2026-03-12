import { Hono } from "hono";
import { db } from "../db.js";
import { deliveryNotes, dnItems, salesOrders, soItems, products, customers } from "../schema.js";
import { eq, sql } from "drizzle-orm";
import { generateRunningNumber } from "../utils.js";

const deliveryNotesRoute = new Hono();

// Helper: enrich DN with customer/SO/product info
async function enrichDN(dn: typeof deliveryNotes.$inferSelect) {
  const items = await db.select({
    id: dnItems.id,
    deliveryNoteId: dnItems.deliveryNoteId,
    productId: dnItems.productId,
    quantity: dnItems.quantity,
    productName: products.name,
    itemCode: products.sku,
  }).from(dnItems)
    .leftJoin(products, eq(dnItems.productId, products.id))
    .where(eq(dnItems.deliveryNoteId, dn.id)).all();

  const formattedItems = items.map(it => ({
    ...it,
    product_name: it.productName,
    item_code: it.itemCode,
    uom: "Pcs.",
    weight: 0,
  }));

  let customerName = "";
  let soOrderNumber = "";
  if (dn.salesOrderId) {
    const so = await db.select().from(salesOrders).where(eq(salesOrders.id, dn.salesOrderId)).get();
    if (so) {
      soOrderNumber = so.orderNumber;
      const cust = await db.select().from(customers).where(eq(customers.id, so.customerId)).get();
      if (cust) customerName = cust.name;
    }
  }

  return {
    ...dn,
    dn_number: dn.dnNumber,
    sales_order_id: dn.salesOrderId,
    sales_order_ids: dn.salesOrderIds,
    so_order_number: soOrderNumber,
    customer_name: customerName,
    driver_phone: dn.driverPhone,
    pickup_point: dn.pickupPoint,
    created_at: dn.createdAt,
    items: formattedItems,
  };
}

deliveryNotesRoute.get("/", async (c) => {
  const notes = await db.select().from(deliveryNotes).all();
  const result = [];
  for (const dn of notes) {
    result.push(await enrichDN(dn));
  }
  return c.json(result);
});

deliveryNotesRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const dn = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id)).get();
  if (!dn) return c.json({ error: "Delivery note not found" }, 404);
  return c.json(await enrichDN(dn));
});

deliveryNotesRoute.post("/", async (c) => {
  const body = await c.req.json();
  // Support multi-SO: accept salesOrderIds (array) or salesOrderId (single)
  const soIds: number[] = body.salesOrderIds?.length
    ? body.salesOrderIds.map(Number)
    : body.salesOrderId ? [Number(body.salesOrderId)] : [];
  if (soIds.length === 0) return c.json({ error: "salesOrderId or salesOrderIds required" }, 400);

  // Validate all SOs exist and are confirmed
  for (const soId of soIds) {
    const so = await db.select().from(salesOrders).where(eq(salesOrders.id, soId)).get();
    if (!so) return c.json({ error: `Sales order ${soId} not found` }, 404);
    if (so.status !== "confirmed") return c.json({ error: `Sales order ${soId} must be confirmed` }, 400);
  }

  const dnNumber = await generateRunningNumber("DN", "delivery_notes", "dn_number");
  const result = await db.insert(deliveryNotes).values({
    salesOrderId: soIds[0],
    salesOrderIds: JSON.stringify(soIds),
    dnNumber,
    driverPhone: body.driverPhone || null,
    pickupPoint: body.pickupPoint || null,
    notes: body.notes || null,
  }).run();
  const dnId = Number(result.lastInsertRowid);

  // Collect items from all SOs
  for (const soId of soIds) {
    const items = await db.select().from(soItems).where(eq(soItems.salesOrderId, soId)).all();
    for (const item of items) {
      await db.insert(dnItems).values({ deliveryNoteId: dnId, productId: item.productId, quantity: item.quantity }).run();
    }
  }
  return c.json({ ok: true, id: dnId, dnNumber }, 201);
});

deliveryNotesRoute.post("/:id/ship", async (c) => {
  const id = Number(c.req.param("id"));
  const dn = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id)).get();
  if (!dn) return c.json({ error: "Delivery note not found" }, 404);
  if (dn.status !== "pending") return c.json({ error: "Can only ship pending DN" }, 400);
  await db.update(deliveryNotes).set({ status: "shipped", shippedAt: sql`datetime('now')`, updatedAt: sql`datetime('now')` }).where(eq(deliveryNotes.id, id)).run();
  return c.json({ ok: true, status: "shipped" });
});

deliveryNotesRoute.post("/:id/deliver", async (c) => {
  const id = Number(c.req.param("id"));
  const dn = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id)).get();
  if (!dn) return c.json({ error: "Delivery note not found" }, 404);
  if (dn.status === "delivered") return c.json({ error: "Already delivered" }, 400);
  const items = await db.select().from(dnItems).where(eq(dnItems.deliveryNoteId, id)).all();
  for (const item of items) {
    const product = await db.select().from(products).where(eq(products.id, item.productId)).get();
    if (!product) return c.json({ error: `Product ID ${item.productId} not found` }, 400);
    if (product.stock < item.quantity) {
      return c.json({ error: `Insufficient stock for ${product.name}: need ${item.quantity}, have ${product.stock}` }, 400);
    }
  }
  for (const item of items) {
    await db.update(products).set({ stock: sql`stock - ${item.quantity}`, updatedAt: sql`datetime('now')` }).where(eq(products.id, item.productId)).run();
  }
  await db.update(deliveryNotes).set({ status: "delivered", deliveredAt: sql`datetime('now')`, updatedAt: sql`datetime('now')` }).where(eq(deliveryNotes.id, id)).run();
  await db.update(salesOrders).set({ status: "delivered", updatedAt: sql`datetime('now')` }).where(eq(salesOrders.id, dn.salesOrderId)).run();
  return c.json({ ok: true, status: "delivered", message: "Stock deducted" });
});

export { deliveryNotesRoute };
