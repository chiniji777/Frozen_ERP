import { Hono } from "hono";
import { db } from "../db.js";
import { salesOrders, soItems, soPaymentTerms, soAttachments, products, customers } from "../schema.js";
import { eq, like, sql } from "drizzle-orm";
import { generateRunningNumber } from "../utils.js";
import { join, basename } from "path";
import { mkdir, unlink } from "fs/promises";

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/msword", "text/plain", "text/csv",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
  const attachments = await db.select().from(soAttachments).where(eq(soAttachments.salesOrderId, id)).all();
  return c.json({ ...o, customer, items, paymentTerms: paymentTermsRows, attachments });
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
    poNumber: body.poNumber || null,
    poDate: body.poDate || null,
    poNotes: body.poNotes || null,
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
    poNumber: body.poNumber ?? existing.poNumber,
    poDate: body.poDate ?? existing.poDate,
    poNotes: body.poNotes ?? existing.poNotes,
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

// === Attachments ===
const ATTACHMENTS_DIR = join(process.cwd(), "data", "attachments");

salesOrdersRoute.post("/:id/attachments", async (c) => {
  const id = Number(c.req.param("id"));
  const o = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).get();
  if (!o) return c.json({ error: "Sales order not found" }, 404);

  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) return c.json({ error: "file required" }, 400);
  if (file.size > MAX_FILE_SIZE) return c.json({ error: "File too large (max 10MB)" }, 400);
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) return c.json({ error: `File type not allowed: ${file.type}` }, 400);

  await mkdir(ATTACHMENTS_DIR, { recursive: true });
  const ext = file.name.split(".").pop() || "bin";
  const filename = `so-${id}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await Bun.write(join(ATTACHMENTS_DIR, filename), buffer);

  const result = await db.insert(soAttachments).values({
    salesOrderId: id,
    filename,
    originalName: file.name,
    mimeType: file.type || null,
    size: file.size,
  }).run();

  return c.json({ ok: true, id: Number(result.lastInsertRowid), filename }, 201);
});

salesOrdersRoute.get("/:id/attachments", async (c) => {
  const id = Number(c.req.param("id"));
  const rows = await db.select().from(soAttachments).where(eq(soAttachments.salesOrderId, id)).all();
  return c.json(rows);
});

salesOrdersRoute.delete("/:soId/attachments/:attId", async (c) => {
  const attId = Number(c.req.param("attId"));
  const att = await db.select().from(soAttachments).where(eq(soAttachments.id, attId)).get();
  if (!att) return c.json({ error: "Attachment not found" }, 404);
  try { await unlink(join(ATTACHMENTS_DIR, att.filename)); } catch {}
  await db.delete(soAttachments).where(eq(soAttachments.id, attId)).run();
  return c.json({ ok: true });
});

// === Print ===
salesOrdersRoute.get("/:id/print", async (c) => {
  const id = Number(c.req.param("id"));
  const o = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).get();
  if (!o) return c.json({ error: "Sales order not found" }, 404);
  const customer = await db.select().from(customers).where(eq(customers.id, o.customerId)).get();
  const items = await db.select({
    id: soItems.id, itemCode: soItems.itemCode, quantity: soItems.quantity,
    unitPrice: soItems.unitPrice, uom: soItems.uom, weight: soItems.weight,
    amount: soItems.amount, productName: products.name,
  }).from(soItems).leftJoin(products, eq(soItems.productId, products.id))
    .where(eq(soItems.salesOrderId, id)).all();
  const paymentTermsRows = await db.select().from(soPaymentTerms).where(eq(soPaymentTerms.salesOrderId, id)).all();

  const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8"><title>Sales Order ${o.orderNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Sarabun', 'Segoe UI', sans-serif; font-size: 13px; color: #333; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e40af; padding-bottom: 15px; margin-bottom: 15px; }
  .company h1 { font-size: 20px; color: #1e40af; } .company p { font-size: 11px; color: #666; }
  .doc-info { text-align: right; } .doc-info h2 { font-size: 18px; color: #1e40af; margin-bottom: 5px; }
  .doc-info p { font-size: 12px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
  .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
  .info-box h4 { font-size: 11px; color: #1e40af; text-transform: uppercase; margin-bottom: 6px; }
  .info-box p { font-size: 12px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  thead th { background: #1e40af; color: white; padding: 8px 6px; font-size: 11px; text-align: left; }
  tbody td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .text-right { text-align: right; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 15px; }
  .totals-box { width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
  .totals-row.grand { border-top: 2px solid #1e40af; font-size: 16px; font-weight: bold; color: #1e40af; padding-top: 8px; }
  .footer { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px; }
  .footer-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
  .footer-box h4 { font-size: 11px; color: #1e40af; text-transform: uppercase; margin-bottom: 6px; }
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
    <h2>ใบสั่งขาย / Sales Order</h2>
    <p><strong>${escapeHtml(o.orderNumber)}</strong></p>
    <p>วันที่: ${escapeHtml(o.date) || "-"}</p>
    <p>สถานะ: ${escapeHtml(o.status)}</p>
    ${o.poNumber ? `<p>PO#: ${escapeHtml(o.poNumber)}</p>` : ""}
    ${o.poDate ? `<p>PO Date: ${escapeHtml(o.poDate)}</p>` : ""}
  </div>
</div>
<div class="info-grid">
  <div class="info-box">
    <h4>ลูกค้า / Customer</h4>
    <p><strong>${escapeHtml(customer?.name) || "-"}</strong></p>
    ${customer?.fullName ? `<p>${escapeHtml(customer.fullName)}</p>` : ""}
    ${o.customerAddress ? `<p>${escapeHtml(o.customerAddress)}</p>` : ""}
    ${o.contactPerson ? `<p>ติดต่อ: ${escapeHtml(o.contactPerson)}</p>` : ""}
    ${o.contact ? `<p>โทร: ${escapeHtml(o.contact)}</p>` : ""}
    ${customer?.taxId ? `<p>Tax ID: ${escapeHtml(customer.taxId)}</p>` : ""}
  </div>
  <div class="info-box">
    <h4>การจัดส่ง / Delivery</h4>
    ${o.shippingAddressName ? `<p>${escapeHtml(o.shippingAddressName)}</p>` : ""}
    ${o.shippingAddress ? `<p>${escapeHtml(o.shippingAddress)}</p>` : ""}
    ${o.deliveryStartDate ? `<p>เริ่ม: ${escapeHtml(o.deliveryStartDate)}</p>` : ""}
    ${o.deliveryEndDate ? `<p>สิ้นสุด: ${escapeHtml(o.deliveryEndDate)}</p>` : ""}
    <p>คลัง: ${escapeHtml(o.warehouse) || "Ladprao 43 - FFP"}</p>
  </div>
</div>
<table>
  <thead><tr>
    <th>#</th><th>Item Code</th><th>รายการ</th><th>UOM</th>
    <th class="text-right">จำนวน</th><th class="text-right">น้ำหนัก(kg)</th>
    <th class="text-right">ราคา/หน่วย</th><th class="text-right">จำนวนเงิน</th>
  </tr></thead>
  <tbody>${items.map((it, i) => `<tr>
    <td>${i + 1}</td><td>${escapeHtml(it.itemCode) || "-"}</td><td>${escapeHtml(it.productName) || "-"}</td><td>${escapeHtml(it.uom) || "Pcs."}</td>
    <td class="text-right">${fmt(it.quantity)}</td><td class="text-right">${fmt(it.weight || 0)}</td>
    <td class="text-right">${fmt(it.unitPrice)}</td><td class="text-right">${fmt(it.amount)}</td>
  </tr>`).join("")}</tbody>
</table>
<div class="totals"><div class="totals-box">
  <div class="totals-row"><span>จำนวนรวม</span><span>${fmt(o.totalQuantity || 0)}</span></div>
  <div class="totals-row"><span>น้ำหนักรวม</span><span>${fmt(o.totalNetWeight || 0)} kg</span></div>
  <div class="totals-row"><span>ยอดรวม (Subtotal)</span><span>${fmt(o.subtotal)}</span></div>
  <div class="totals-row"><span>VAT ${o.vatRate}%</span><span>${fmt(o.vatAmount)}</span></div>
  <div class="totals-row grand"><span>ยอดรวมทั้งสิ้น</span><span>${fmt(o.totalAmount)}</span></div>
</div></div>
<div class="footer">
  <div class="footer-box">
    <h4>เงื่อนไขการชำระ / Payment Terms</h4>
    <p>${escapeHtml(o.paymentTermsTemplate) || "-"}</p>
    ${paymentTermsRows.length ? `<table style="margin-top:5px"><thead><tr><th>งวด</th><th>คำอธิบาย</th><th>กำหนด</th><th class="text-right">%</th><th class="text-right">จำนวน</th></tr></thead><tbody>${paymentTermsRows.map(pt => `<tr><td>${escapeHtml(pt.paymentTerm) || "-"}</td><td>${escapeHtml(pt.description) || "-"}</td><td>${escapeHtml(pt.dueDate) || "-"}</td><td class="text-right">${pt.invoicePortion || 0}</td><td class="text-right">${fmt(pt.paymentAmount || 0)}</td></tr>`).join("")}</tbody></table>` : ""}
    ${o.poNotes ? `<p style="margin-top:8px"><strong>หมายเหตุ PO:</strong> ${escapeHtml(o.poNotes)}</p>` : ""}
  </div>
  <div class="footer-box">
    <h4>ค่าคอมมิชชั่น / Commission</h4>
    <p>Sales Partner: ${escapeHtml(o.salesPartner) || "-"}</p>
    <p>Commission Rate: ${o.commissionRate || 0}%</p>
    <p>Total Commission: ${fmt(o.totalCommission || 0)}</p>
  </div>
</div>
${o.notes ? `<div style="margin-top:10px;padding:10px;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px"><strong>หมายเหตุ:</strong> ${escapeHtml(o.notes)}</div>` : ""}
<div class="sign-area">
  <div class="sign-box"><div class="sign-line">ผู้สั่งซื้อ / Customer</div></div>
  <div class="sign-box"><div class="sign-line">ผู้อนุมัติ / Authorized</div></div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;

  return c.html(html);
});

export { salesOrdersRoute };
