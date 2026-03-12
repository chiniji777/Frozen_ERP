import { Hono } from "hono";
import { db } from "../db.js";
import { salesOrders, soItems, soPaymentTerms, products, customers } from "../schema.js";
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
    const paymentTermsRows = await db.select().from(soPaymentTerms).where(eq(soPaymentTerms.salesOrderId, o.id)).all();
    result.push({ ...o, customer, items, paymentTerms: paymentTermsRows });
  }
  return c.json(result);
});

salesOrdersRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const o = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).get();
  if (!o) return c.json({ error: "Sales order not found" }, 404);
  const customer = await db.select().from(customers).where(eq(customers.id, o.customerId)).get();
  const items = await db.select({
    id: soItems.id, productId: soItems.productId, itemCode: soItems.itemCode,
    quantity: soItems.quantity, unitPrice: soItems.unitPrice, rate: soItems.rate,
    uom: soItems.uom, weight: soItems.weight, amount: soItems.amount,
    productName: products.name, sku: products.sku,
  }).from(soItems).leftJoin(products, eq(soItems.productId, products.id))
    .where(eq(soItems.salesOrderId, id)).all();
  const paymentTermsRows = await db.select().from(soPaymentTerms).where(eq(soPaymentTerms.salesOrderId, id)).all();
  return c.json({ ...o, customer, items, paymentTerms: paymentTermsRows });
});

salesOrdersRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.customerId || !body.items?.length) return c.json({ error: "customerId and items required" }, 400);
  for (const item of body.items) {
    if (!item.quantity || item.quantity <= 0) return c.json({ error: "item quantity must be > 0" }, 400);
    if (item.unitPrice != null && item.unitPrice < 0) return c.json({ error: "item unitPrice must be >= 0" }, 400);
  }

  // Auto-fill from customer
  const customer = await db.select().from(customers).where(eq(customers.id, body.customerId)).get();
  const customerAddress = body.customerAddress ?? customer?.address ?? null;
  const shippingAddress = body.shippingAddress ?? customer?.address ?? null;
  const contactPerson = body.contactPerson ?? customer?.nickName ?? customer?.name ?? null;
  const contact = body.contact ?? customer?.phone ?? null;
  const mobileNo = body.mobileNo ?? customer?.phone ?? null;
  const salesPartner = body.salesPartner ?? customer?.salesPartner ?? null;
  const commissionRate = body.commissionRate ?? customer?.commissionRate ?? 0;

  const orderNumber = await generateRunningNumber("SO", "sales_orders", "order_number");
  let subtotal = 0;
  let totalQuantity = 0;
  let totalNetWeight = 0;
  const itemData: { productId: number; itemCode: string | null; quantity: number; unitPrice: number; rate: number | null; uom: string; weight: number; amount: number }[] = [];

  for (const item of body.items) {
    const product = await db.select().from(products).where(eq(products.id, item.productId)).get();
    const unitPrice = item.unitPrice ?? product?.salePrice ?? 0;
    const amount = unitPrice * item.quantity;
    const weight = item.weight ?? 0;
    subtotal += amount;
    totalQuantity += item.quantity;
    totalNetWeight += weight;
    itemData.push({
      productId: item.productId,
      itemCode: item.itemCode ?? product?.sku ?? null,
      quantity: item.quantity,
      unitPrice,
      rate: item.rate ?? null,
      uom: item.uom ?? "Pcs.",
      weight,
      amount,
    });
  }

  const vatRate = body.vatRate ?? 7;
  const vatAmount = Math.round(subtotal * vatRate / 100 * 100) / 100;
  const totalAmount = subtotal + vatAmount;
  const totalCommission = Math.round(subtotal * commissionRate / 100 * 100) / 100;

  const result = await db.insert(salesOrders).values({
    customerId: body.customerId,
    orderNumber,
    date: body.date ?? new Date().toISOString().split("T")[0],
    deliveryStartDate: body.deliveryStartDate ?? null,
    deliveryEndDate: body.deliveryEndDate ?? null,
    customerAddress,
    shippingAddressName: body.shippingAddressName ?? null,
    shippingAddress,
    contactPerson,
    contact,
    mobileNo,
    warehouse: "Ladprao 43 - FFP",
    subtotal,
    vatRate,
    vatAmount,
    totalAmount,
    totalQuantity,
    totalNetWeight,
    paymentTermsTemplate: body.paymentTermsTemplate ?? customer?.paymentTerms ?? null,
    salesPartner,
    commissionRate,
    totalCommission,
    notes: body.notes || null,
  }).run();

  const soId = Number(result.lastInsertRowid);

  for (const item of itemData) {
    await db.insert(soItems).values({ salesOrderId: soId, ...item }).run();
  }

  // Insert payment terms if provided
  if (body.paymentTerms?.length) {
    for (const pt of body.paymentTerms) {
      await db.insert(soPaymentTerms).values({
        salesOrderId: soId,
        paymentTerm: pt.paymentTerm ?? null,
        description: pt.description ?? null,
        dueDate: pt.dueDate ?? null,
        invoicePortion: pt.invoicePortion ?? null,
        paymentAmount: pt.paymentAmount ?? null,
      }).run();
    }
  }

  return c.json({ ok: true, id: soId, orderNumber, subtotal, vatAmount, totalAmount, totalQuantity, totalNetWeight, totalCommission }, 201);
});

salesOrdersRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).get();
  if (!existing) return c.json({ error: "Sales order not found" }, 404);
  if (existing.status !== "draft") return c.json({ error: "Can only edit draft orders" }, 400);
  const body = await c.req.json();

  // Recalculate if items provided
  let subtotal = existing.subtotal;
  let totalQuantity = existing.totalQuantity ?? 0;
  let totalNetWeight = existing.totalNetWeight ?? 0;

  if (body.items?.length) {
    // Delete old items and re-insert
    await db.delete(soItems).where(eq(soItems.salesOrderId, id)).run();
    subtotal = 0;
    totalQuantity = 0;
    totalNetWeight = 0;

    for (const item of body.items) {
      const product = await db.select().from(products).where(eq(products.id, item.productId)).get();
      const unitPrice = item.unitPrice ?? product?.salePrice ?? 0;
      const amount = unitPrice * item.quantity;
      const weight = item.weight ?? 0;
      subtotal += amount;
      totalQuantity += item.quantity;
      totalNetWeight += weight;
      await db.insert(soItems).values({
        salesOrderId: id,
        productId: item.productId,
        itemCode: item.itemCode ?? product?.sku ?? null,
        quantity: item.quantity,
        unitPrice,
        rate: item.rate ?? null,
        uom: item.uom ?? "Pcs.",
        weight,
        amount,
      }).run();
    }
  }

  const vatRate = body.vatRate ?? existing.vatRate;
  const vatAmount = Math.round(subtotal * vatRate / 100 * 100) / 100;
  const totalAmount = subtotal + vatAmount;
  const commissionRate = body.commissionRate ?? existing.commissionRate ?? 0;
  const totalCommission = Math.round(subtotal * commissionRate / 100 * 100) / 100;

  // Update payment terms if provided
  if (body.paymentTerms) {
    await db.delete(soPaymentTerms).where(eq(soPaymentTerms.salesOrderId, id)).run();
    for (const pt of body.paymentTerms) {
      await db.insert(soPaymentTerms).values({
        salesOrderId: id,
        paymentTerm: pt.paymentTerm ?? null,
        description: pt.description ?? null,
        dueDate: pt.dueDate ?? null,
        invoicePortion: pt.invoicePortion ?? null,
        paymentAmount: pt.paymentAmount ?? null,
      }).run();
    }
  }

  await db.update(salesOrders).set({
    customerId: body.customerId ?? existing.customerId,
    date: body.date ?? existing.date,
    deliveryStartDate: body.deliveryStartDate ?? existing.deliveryStartDate,
    deliveryEndDate: body.deliveryEndDate ?? existing.deliveryEndDate,
    customerAddress: body.customerAddress ?? existing.customerAddress,
    shippingAddressName: body.shippingAddressName ?? existing.shippingAddressName,
    shippingAddress: body.shippingAddress ?? existing.shippingAddress,
    contactPerson: body.contactPerson ?? existing.contactPerson,
    contact: body.contact ?? existing.contact,
    mobileNo: body.mobileNo ?? existing.mobileNo,
    warehouse: "Ladprao 43 - FFP",
    subtotal,
    vatRate,
    vatAmount,
    totalAmount,
    totalQuantity,
    totalNetWeight,
    paymentTermsTemplate: body.paymentTermsTemplate ?? existing.paymentTermsTemplate,
    salesPartner: body.salesPartner ?? existing.salesPartner,
    commissionRate,
    totalCommission,
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
