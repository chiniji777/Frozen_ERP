import { Hono } from "hono";
import { db } from "../db.js";
import { purchaseOrders, poItems, rawMaterials } from "../schema.js";
import { eq, sql } from "drizzle-orm";

const purchaseOrdersRoute = new Hono();

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

// DELETE /:id — delete non-received PO
purchaseOrdersRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).get();
  if (!po) return c.json({ error: "Purchase order not found" }, 404);
  if (po.status === "received") return c.json({ error: "Cannot delete received PO" }, 400);

  await db.delete(poItems).where(eq(poItems.purchaseOrderId, id)).run();
  await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id)).run();
  return c.json({ ok: true });
});

export { purchaseOrdersRoute };
