import { Hono } from "hono";
import { db } from "../db.js";
import { purchaseOrders, poItems, rawMaterials } from "../schema.js";
import { eq, sql } from "drizzle-orm";

const purchaseOrdersRoute = new Hono();

// POST / — create new PO
purchaseOrdersRoute.post("/", async (c) => {
  const body = await c.req.json();

  // Validate required fields
  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: "items array is required and must not be empty" }, 400);
  }

  for (const item of body.items) {
    if (!item.rawMaterialId || !item.quantity || item.quantity <= 0) {
      return c.json({ error: "Each item must have rawMaterialId and quantity > 0" }, 400);
    }
  }

  // Auto-gen PO number
  const poNumber = `PO-${Date.now()}`;

  // Calculate total
  const totalAmount = body.items.reduce((sum: number, item: any) => {
    const amount = (item.quantity || 0) * (item.unitPrice || 0);
    return sum + amount;
  }, 0);

  // Insert PO header
  const poResult = await db.insert(purchaseOrders).values({
    poNumber,
    productionOrderId: body.productionOrderId || null,
    status: "draft",
    supplier: body.supplier || null,
    totalAmount: Math.ceil(totalAmount * 100) / 100,
    notes: body.notes || null,
  }).run();
  const poId = Number(poResult.lastInsertRowid);

  // Insert PO items
  for (const item of body.items) {
    const amount = (item.quantity || 0) * (item.unitPrice || 0);
    await db.insert(poItems).values({
      purchaseOrderId: poId,
      rawMaterialId: item.rawMaterialId,
      quantity: item.quantity,
      unit: item.unit || "กก.",
      unitPrice: item.unitPrice || 0,
      amount: Math.ceil(amount * 100) / 100,
    }).run();
  }

  return c.json({ ok: true, id: poId, poNumber, totalAmount: Math.ceil(totalAmount * 100) / 100 }, 201);
});

// GET / — list all POs
purchaseOrdersRoute.get("/", async (c) => {
  const pos = await db.select().from(purchaseOrders).all();
  return c.json(pos);
});

// GET /:id — PO detail with items + material info
purchaseOrdersRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).get();
  if (!po) return c.json({ error: "Purchase order not found" }, 404);

  const items = await db.select({
    id: poItems.id,
    rawMaterialId: poItems.rawMaterialId,
    quantity: poItems.quantity,
    unit: poItems.unit,
    unitPrice: poItems.unitPrice,
    amount: poItems.amount,
    materialName: rawMaterials.name,
    currentStock: rawMaterials.stock,
  }).from(poItems)
    .leftJoin(rawMaterials, eq(poItems.rawMaterialId, rawMaterials.id))
    .where(eq(poItems.purchaseOrderId, id))
    .all();

  return c.json({ ...po, items });
});

// POST /:id/receive — receive PO, update raw material stock
purchaseOrdersRoute.post("/:id/receive", async (c) => {
  const id = Number(c.req.param("id"));
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).get();
  if (!po) return c.json({ error: "Purchase order not found" }, 404);
  if (po.status === "received") return c.json({ error: "Already received" }, 400);
  if (po.status === "cancelled") return c.json({ error: "Cannot receive cancelled PO" }, 400);

  const items = await db.select().from(poItems).where(eq(poItems.purchaseOrderId, id)).all();

  // Update raw material stock
  for (const item of items) {
    await db.update(rawMaterials).set({
      stock: sql`stock + ${item.quantity}`,
      updatedAt: sql`datetime('now')`,
    }).where(eq(rawMaterials.id, item.rawMaterialId)).run();
  }

  // Mark PO as received
  await db.update(purchaseOrders).set({
    status: "received",
    updatedAt: sql`datetime('now')`,
  }).where(eq(purchaseOrders.id, id)).run();

  return c.json({ ok: true, message: "PO received — raw material stock updated" });
});

// PATCH /:id/cancel — cancel PO (no delete)
purchaseOrdersRoute.patch("/:id/cancel", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).get();
  if (!po) return c.json({ error: "Purchase order not found" }, 404);
  if (po.status === "cancelled") return c.json({ error: "Already cancelled" }, 400);
  if (po.status === "received") return c.json({ error: "Cannot cancel received PO" }, 400);

  await db.update(purchaseOrders).set({
    status: "cancelled",
    cancelledAt: sql`datetime('now')`,
    cancelledBy: user?.userId ?? null,
    updatedAt: sql`datetime('now')`,
  }).where(eq(purchaseOrders.id, id)).run();

  return c.json({ ok: true, status: "cancelled" });
});

export { purchaseOrdersRoute };
