import { Hono } from "hono";
import { db } from "../db.js";
import { productionOrders, bom, bomItems, rawMaterials, products, purchaseOrders, poItems } from "../schema.js";
import { eq, sql } from "drizzle-orm";

const productionRoute = new Hono();

productionRoute.get("/", async (c) => {
  const orders = await db.select().from(productionOrders).all();
  const result = [];
  for (const o of orders) {
    const product = await db.select().from(products).where(eq(products.id, o.productId)).get();
    const b = await db.select().from(bom).where(eq(bom.id, o.bomId)).get();
    result.push({ ...o, product, bom: b });
  }
  return c.json(result);
});

productionRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const o = await db.select().from(productionOrders).where(eq(productionOrders.id, id)).get();
  if (!o) return c.json({ error: "Production order not found" }, 404);
  const product = await db.select().from(products).where(eq(products.id, o.productId)).get();
  const b = await db.select().from(bom).where(eq(bom.id, o.bomId)).get();
  const items = await db.select({
    id: bomItems.id,
    rawMaterialId: bomItems.rawMaterialId,
    quantity: bomItems.quantity,
    unit: bomItems.unit,
    materialName: rawMaterials.name,
    pricePerUnit: rawMaterials.pricePerUnit,
  }).from(bomItems)
    .leftJoin(rawMaterials, eq(bomItems.rawMaterialId, rawMaterials.id))
    .where(eq(bomItems.bomId, o.bomId))
    .all();
  return c.json({
    ...o, product, bom: b, bomItems: items,
    costBreakdown: {
      materialCost: o.totalMaterialCost, laborCost: o.laborCost,
      overheadCost: o.overheadCost, totalCost: o.totalCost, costPerUnit: o.costPerUnit,
    },
  });
});

productionRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.quantity) return c.json({ error: "quantity required" }, 400);
  if (!body.bomId && !body.productId) return c.json({ error: "bomId or productId required" }, 400);
  if (body.quantity <= 0) return c.json({ error: "quantity must be > 0" }, 400);
  if (body.laborCost != null && body.laborCost < 0) return c.json({ error: "laborCost must be >= 0" }, 400);
  if (body.overheadCost != null && body.overheadCost < 0) return c.json({ error: "overheadCost must be >= 0" }, 400);

  let bomId = body.bomId;
  // If productId provided, auto-find the first BOM for that product
  if (!bomId && body.productId) {
    const product = await db.select().from(products).where(eq(products.id, body.productId)).get();
    if (!product) return c.json({ error: "Product not found" }, 404);
    const firstBom = await db.select().from(bom).where(eq(bom.productId, body.productId)).get();
    if (!firstBom) return c.json({ error: `No BOM found for product ID ${body.productId}` }, 404);
    bomId = firstBom.id;
  }

  const b = await db.select().from(bom).where(eq(bom.id, bomId)).get();
  if (!b) return c.json({ error: "BOM not found" }, 404);
  const items = await db.select({
    quantity: bomItems.quantity,
    pricePerUnit: rawMaterials.pricePerUnit,
  }).from(bomItems)
    .leftJoin(rawMaterials, eq(bomItems.rawMaterialId, rawMaterials.id))
    .where(eq(bomItems.bomId, bomId))
    .all();
  const totalMaterialCost = items.reduce((sum, item) => {
    return sum + (item.quantity || 0) * (item.pricePerUnit || 0) * body.quantity;
  }, 0);
  const laborCost = body.laborCost || 0;
  const overheadCost = body.overheadCost || 0;
  const totalCost = totalMaterialCost + laborCost + overheadCost;
  const costPerUnit = body.quantity > 0 ? totalCost / body.quantity : 0;
  const result = await db.insert(productionOrders).values({
    bomId, productId: b.productId, quantity: body.quantity,
    status: "draft", laborCost, overheadCost, totalMaterialCost, totalCost, costPerUnit,
    notes: body.notes || null,
  }).run();
  return c.json({ ok: true, id: Number(result.lastInsertRowid), totalMaterialCost, totalCost, costPerUnit }, 201);
});

productionRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(productionOrders).where(eq(productionOrders.id, id)).get();
  if (!existing) return c.json({ error: "Production order not found" }, 404);
  if (existing.status === "completed") return c.json({ error: "Cannot edit completed order" }, 400);
  const body = await c.req.json();
  await db.update(productionOrders).set({
    quantity: body.quantity ?? existing.quantity,
    laborCost: body.laborCost ?? existing.laborCost,
    overheadCost: body.overheadCost ?? existing.overheadCost,
    notes: body.notes ?? existing.notes,
    updatedAt: sql`datetime('now')`,
  }).where(eq(productionOrders.id, id)).run();
  const updated = (await db.select().from(productionOrders).where(eq(productionOrders.id, id)).get())!;
  const items = await db.select({
    quantity: bomItems.quantity,
    pricePerUnit: rawMaterials.pricePerUnit,
  }).from(bomItems)
    .leftJoin(rawMaterials, eq(bomItems.rawMaterialId, rawMaterials.id))
    .where(eq(bomItems.bomId, updated.bomId))
    .all();
  const totalMaterialCost = items.reduce((sum, item) => {
    return sum + (item.quantity || 0) * (item.pricePerUnit || 0) * updated.quantity;
  }, 0);
  const totalCost = totalMaterialCost + updated.laborCost + updated.overheadCost;
  const costPerUnit = updated.quantity > 0 ? totalCost / updated.quantity : 0;
  await db.update(productionOrders).set({ totalMaterialCost, totalCost, costPerUnit }).where(eq(productionOrders.id, id)).run();
  return c.json({ ok: true, totalMaterialCost, totalCost, costPerUnit });
});

productionRoute.post("/:id/complete", async (c) => {
  const id = Number(c.req.param("id"));
  const order = await db.select().from(productionOrders).where(eq(productionOrders.id, id)).get();
  if (!order) return c.json({ error: "Production order not found" }, 404);
  if (order.status === "completed") return c.json({ error: "Already completed" }, 400);
  if (order.status === "cancelled") return c.json({ error: "Cannot complete cancelled order" }, 400);
  const items = await db.select({
    rawMaterialId: bomItems.rawMaterialId,
    quantity: bomItems.quantity,
  }).from(bomItems).where(eq(bomItems.bomId, order.bomId)).all();
  // Deduct raw material stock (allow negative — อนุญาตให้ติดลบได้)
  for (const item of items) {
    const needed = item.quantity * order.quantity;
    await db.update(rawMaterials).set({
      stock: sql`stock - ${needed}`,
      updatedAt: sql`datetime('now')`,
    }).where(eq(rawMaterials.id, item.rawMaterialId)).run();
  }
  await db.update(products).set({
    stock: sql`stock + ${order.quantity}`,
    updatedAt: sql`datetime('now')`,
  }).where(eq(products.id, order.productId)).run();
  await db.update(productionOrders).set({
    status: "completed",
    updatedAt: sql`datetime('now')`,
  }).where(eq(productionOrders.id, id)).run();
  return c.json({ ok: true, message: "Production completed — stock updated" });
});

// POST /:id/purchase-orders — create PO from material shortfall
productionRoute.post("/:id/purchase-orders", async (c) => {
  const id = Number(c.req.param("id"));
  const order = await db.select().from(productionOrders).where(eq(productionOrders.id, id)).get();
  if (!order) return c.json({ error: "Production order not found" }, 404);
  if (order.status === "completed" || order.status === "cancelled") {
    return c.json({ error: `Cannot create PO for ${order.status} order` }, 400);
  }

  const body = await c.req.json();

  // Get BOM items with material info
  const items = await db.select({
    rawMaterialId: bomItems.rawMaterialId,
    quantity: bomItems.quantity,
    unit: bomItems.unit,
    materialName: rawMaterials.name,
    pricePerUnit: rawMaterials.pricePerUnit,
    stock: rawMaterials.stock,
  }).from(bomItems)
    .leftJoin(rawMaterials, eq(bomItems.rawMaterialId, rawMaterials.id))
    .where(eq(bomItems.bomId, order.bomId))
    .all();

  // Calculate shortfall per material
  const shortfallItems: { rawMaterialId: number; quantity: number; unit: string; unitPrice: number; amount: number }[] = [];
  for (const item of items) {
    const needed = item.quantity * order.quantity;
    const currentStock = item.stock ?? 0;
    const shortfall = needed - currentStock;
    if (shortfall > 0) {
      const unitPrice = item.pricePerUnit ?? 0;
      shortfallItems.push({
        rawMaterialId: item.rawMaterialId,
        quantity: Math.ceil(shortfall * 100) / 100,
        unit: item.unit,
        unitPrice,
        amount: Math.ceil(shortfall * unitPrice * 100) / 100,
      });
    }
  }

  if (shortfallItems.length === 0) {
    return c.json({ ok: true, message: "No shortfall — all materials in stock", poId: null });
  }

  const totalAmount = shortfallItems.reduce((sum, i) => sum + i.amount, 0);
  const poNumber = `PO-${Date.now()}`;

  const poResult = await db.insert(purchaseOrders).values({
    poNumber,
    productionOrderId: id,
    status: "draft",
    supplier: body.supplier || null,
    totalAmount: Math.ceil(totalAmount * 100) / 100,
    notes: body.notes || `Auto-generated from Production Order #${id}`,
  }).run();
  const poId = Number(poResult.lastInsertRowid);

  for (const item of shortfallItems) {
    await db.insert(poItems).values({
      purchaseOrderId: poId,
      rawMaterialId: item.rawMaterialId,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      amount: item.amount,
    }).run();
  }

  return c.json({ ok: true, poId, poNumber, totalAmount, items: shortfallItems }, 201);
});

export { productionRoute };
