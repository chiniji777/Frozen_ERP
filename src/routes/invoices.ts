import { Hono } from "hono";
import { db } from "../db.js";
import { invoices, invoiceItems, salesOrders, soItems, customers, products } from "../schema.js";
import { eq, sql } from "drizzle-orm";
import { generateRunningNumber } from "../utils.js";

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const invoicesRoute = new Hono();

// Helper: enrich invoice with SO/customer/item details
async function enrichInvoice(iv: typeof invoices.$inferSelect) {
  const items = await db.select({
    id: invoiceItems.id,
    invoiceId: invoiceItems.invoiceId,
    productId: invoiceItems.productId,
    quantity: invoiceItems.quantity,
    unitPrice: invoiceItems.unitPrice,
    amount: invoiceItems.amount,
    productName: products.name,
    itemCode: products.sku,
  }).from(invoiceItems)
    .leftJoin(products, eq(invoiceItems.productId, products.id))
    .where(eq(invoiceItems.invoiceId, iv.id)).all();

  const formattedItems = items.map(it => ({
    ...it,
    product_name: it.productName,
    item_code: it.itemCode,
    unit_price: it.unitPrice,
    uom: "Pcs.",
  }));

  let customerName = "";
  let soOrderNumber = "";
  let billingCompany = "";
  let billingAddress = "";
  let billingTaxId = "";

  if (iv.salesOrderId) {
    const so = await db.select().from(salesOrders).where(eq(salesOrders.id, iv.salesOrderId)).get();
    if (so) {
      soOrderNumber = so.orderNumber;
      const cust = await db.select().from(customers).where(eq(customers.id, so.customerId)).get();
      if (cust) {
        customerName = cust.name;
        billingCompany = cust.fullName || cust.name;
        billingAddress = cust.address || "";
        billingTaxId = cust.taxId || "";
      }
    }
  }

  return {
    ...iv,
    customer_name: customerName,
    so_order_number: soOrderNumber,
    billing_company: billingCompany,
    billing_address: billingAddress,
    billing_tax_id: billingTaxId,
    invoice_number: iv.invoiceNumber,
    sales_order_id: iv.salesOrderId,
    delivery_note_id: iv.deliveryNoteId,
    subtotal: iv.subtotal,
    vat_rate: iv.vatRate,
    vat_amount: iv.vatAmount,
    total_amount: iv.totalAmount,
    due_date: iv.dueDate,
    created_at: iv.createdAt,
    items: formattedItems,
  };
}

invoicesRoute.get("/", async (c) => {
  const status = c.req.query("status")?.trim();
  let rows = await db.select().from(invoices).all();
  if (status) rows = rows.filter(r => r.status === status);
  const result = [];
  for (const iv of rows) {
    result.push(await enrichInvoice(iv));
  }
  return c.json(result);
});

invoicesRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const iv = await db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!iv) return c.json({ error: "Invoice not found" }, 404);
  return c.json(await enrichInvoice(iv));
});

invoicesRoute.post("/", async (c) => {
  const body = await c.req.json();
  const salesOrderId = body.salesOrderId ? Number(body.salesOrderId) : null;
  const deliveryNoteId = body.deliveryNoteId ? Number(body.deliveryNoteId) : null;

  if (!salesOrderId) return c.json({ error: "salesOrderId required" }, 400);

  const so = await db.select().from(salesOrders).where(eq(salesOrders.id, salesOrderId)).get();
  if (!so) return c.json({ error: "Sales order not found" }, 404);

  const invoiceNumber = await generateRunningNumber("IV", "invoices", "invoice_number");

  // Use items from SO
  const soItemRows = await db.select().from(soItems).where(eq(soItems.salesOrderId, salesOrderId)).all();

  let subtotal = 0;
  const itemData: { productId: number; quantity: number; unitPrice: number; amount: number }[] = [];
  for (const item of soItemRows) {
    const amount = item.unitPrice * item.quantity;
    subtotal += amount;
    itemData.push({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount,
    });
  }

  const vatRate = so.vatRate || 7;
  const vatAmount = Math.round(subtotal * vatRate / 100 * 100) / 100;
  const totalAmount = subtotal + vatAmount;

  const result = await db.insert(invoices).values({
    salesOrderId,
    deliveryNoteId,
    invoiceNumber,
    subtotal,
    vatRate,
    vatAmount,
    totalAmount,
    dueDate: body.dueDate || body.due_date || null,
    notes: body.notes || null,
  }).run();

  const ivId = Number(result.lastInsertRowid);

  for (const item of itemData) {
    await db.insert(invoiceItems).values({
      invoiceId: ivId,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
    }).run();
  }

  // Update SO status to invoiced
  await db.update(salesOrders).set({ status: "invoiced", updatedAt: sql`datetime('now')` }).where(eq(salesOrders.id, salesOrderId)).run();

  return c.json({ ok: true, id: ivId, invoiceNumber, totalAmount }, 201);
});

invoicesRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!existing) return c.json({ error: "Invoice not found" }, 404);
  const body = await c.req.json();
  await db.update(invoices).set({
    dueDate: body.dueDate ?? existing.dueDate,
    notes: body.notes ?? existing.notes,
    updatedAt: sql`datetime('now')`,
  }).where(eq(invoices.id, id)).run();
  return c.json({ ok: true });
});

invoicesRoute.post("/:id/send", async (c) => {
  const id = Number(c.req.param("id"));
  const iv = await db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!iv) return c.json({ error: "Invoice not found" }, 404);
  if (iv.status !== "draft") return c.json({ error: "Can only send draft invoices" }, 400);
  await db.update(invoices).set({ status: "sent", updatedAt: sql`datetime('now')` }).where(eq(invoices.id, id)).run();
  return c.json({ ok: true, status: "sent" });
});

invoicesRoute.post("/:id/pay", async (c) => {
  const id = Number(c.req.param("id"));
  const iv = await db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!iv) return c.json({ error: "Invoice not found" }, 404);
  if (iv.status !== "sent" && iv.status !== "overdue") return c.json({ error: "Can only pay sent/overdue invoices" }, 400);
  await db.update(invoices).set({ status: "paid", updatedAt: sql`datetime('now')` }).where(eq(invoices.id, id)).run();
  return c.json({ ok: true, status: "paid" });
});

invoicesRoute.post("/:id/cancel", async (c) => {
  const id = Number(c.req.param("id"));
  const iv = await db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!iv) return c.json({ error: "Invoice not found" }, 404);
  if (iv.status === "paid") return c.json({ error: "Cannot cancel paid invoice" }, 400);
  await db.update(invoices).set({ status: "cancelled", updatedAt: sql`datetime('now')` }).where(eq(invoices.id, id)).run();
  // Revert SO status back to confirmed if it was invoiced
  if (iv.salesOrderId) {
    const so = await db.select().from(salesOrders).where(eq(salesOrders.id, iv.salesOrderId)).get();
    if (so && so.status === "invoiced") {
      await db.update(salesOrders).set({ status: "confirmed", updatedAt: sql`datetime('now')` }).where(eq(salesOrders.id, iv.salesOrderId)).run();
    }
  }
  return c.json({ ok: true, status: "cancelled" });
});

// === Print ===
invoicesRoute.get("/:id/print", async (c) => {
  const id = Number(c.req.param("id"));
  const iv = await db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!iv) return c.json({ error: "Invoice not found" }, 404);

  const so = iv.salesOrderId
    ? await db.select().from(salesOrders).where(eq(salesOrders.id, iv.salesOrderId)).get()
    : null;
  const customer = so
    ? await db.select().from(customers).where(eq(customers.id, so.customerId)).get()
    : null;

  const items = await db.select({
    id: invoiceItems.id,
    productId: invoiceItems.productId,
    quantity: invoiceItems.quantity,
    unitPrice: invoiceItems.unitPrice,
    amount: invoiceItems.amount,
    productName: products.name,
    sku: products.sku,
  }).from(invoiceItems)
    .leftJoin(products, eq(invoiceItems.productId, products.id))
    .where(eq(invoiceItems.invoiceId, id)).all();

  const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8"><title>Invoice ${iv.invoiceNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Sarabun', 'Segoe UI', sans-serif; font-size: 13px; color: #333; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #7c3aed; padding-bottom: 15px; margin-bottom: 15px; }
  .company h1 { font-size: 20px; color: #7c3aed; } .company p { font-size: 11px; color: #666; }
  .doc-info { text-align: right; } .doc-info h2 { font-size: 18px; color: #7c3aed; margin-bottom: 5px; }
  .doc-info p { font-size: 12px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
  .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
  .info-box h4 { font-size: 11px; color: #7c3aed; text-transform: uppercase; margin-bottom: 6px; }
  .info-box p { font-size: 12px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  thead th { background: #7c3aed; color: white; padding: 8px 6px; font-size: 11px; text-align: left; }
  tbody td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .text-right { text-align: right; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 15px; }
  .totals-box { width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
  .totals-row.grand { border-top: 2px solid #7c3aed; font-size: 16px; font-weight: bold; color: #7c3aed; padding-top: 8px; }
  .sign-area { display: flex; justify-content: space-between; margin-top: 40px; }
  .sign-box { text-align: center; width: 200px; }
  .sign-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 5px; font-size: 11px; }
  @media print { body { padding: 0; } @page { margin: 15mm; } }
</style></head><body>
<div class="header">
  <div class="company">
    <h1>Frozen Food Plus Co., Ltd.</h1>
    <p>บริษัท โฟรเซ่นฟู้ดพลัส จำกัด</p>
  </div>
  <div class="doc-info">
    <h2>ใบแจ้งหนี้ / Invoice</h2>
    <p><strong>${escapeHtml(iv.invoiceNumber)}</strong></p>
    <p>วันที่: ${escapeHtml(iv.createdAt?.slice(0, 10))}</p>
    <p>สถานะ: ${escapeHtml(iv.status)}</p>
    ${so ? `<p>อ้างอิง SO: ${escapeHtml(so.orderNumber)}</p>` : ""}
  </div>
</div>
<div class="info-grid">
  <div class="info-box">
    <h4>ลูกค้า / Customer</h4>
    <p><strong>${escapeHtml(customer?.name) || "-"}</strong></p>
    ${customer?.fullName ? `<p>${escapeHtml(customer.fullName)}</p>` : ""}
    ${customer?.address ? `<p>${escapeHtml(customer.address)}</p>` : ""}
    ${customer?.taxId ? `<p>Tax ID: ${escapeHtml(customer.taxId)}</p>` : ""}
  </div>
  <div class="info-box">
    <h4>การชำระเงิน / Payment</h4>
    <p>ครบกำหนดชำระ: ${escapeHtml(iv.dueDate) || "ไม่ระบุ"}</p>
    ${iv.notes ? `<p>หมายเหตุ: ${escapeHtml(iv.notes)}</p>` : ""}
  </div>
</div>
<table>
  <thead><tr>
    <th>#</th><th>Item Code</th><th>รายการ</th>
    <th class="text-right">จำนวน</th><th class="text-right">ราคา/หน่วย</th><th class="text-right">จำนวนเงิน</th>
  </tr></thead>
  <tbody>${items.map((it, i) => `<tr>
    <td>${i + 1}</td><td>${escapeHtml(it.sku) || "-"}</td><td>${escapeHtml(it.productName) || "-"}</td>
    <td class="text-right">${fmt(it.quantity)}</td><td class="text-right">${fmt(it.unitPrice)}</td><td class="text-right">${fmt(it.amount)}</td>
  </tr>`).join("")}</tbody>
</table>
<div class="totals"><div class="totals-box">
  <div class="totals-row"><span>ยอดรวม (Subtotal)</span><span>${fmt(iv.subtotal)}</span></div>
  <div class="totals-row"><span>VAT ${iv.vatRate}%</span><span>${fmt(iv.vatAmount)}</span></div>
  <div class="totals-row grand"><span>ยอดรวมทั้งสิ้น</span><span>${fmt(iv.totalAmount)}</span></div>
</div></div>
<div class="sign-area">
  <div class="sign-box"><div class="sign-line">ผู้รับบริการ / Customer</div></div>
  <div class="sign-box"><div class="sign-line">ผู้อนุมัติ / Authorized</div></div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;

  return c.html(html);
});

export { invoicesRoute };
