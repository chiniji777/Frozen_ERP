import { Hono } from "hono";
import { db } from "../db.js";
import { salesOrders, soItems, soPaymentTerms, soAttachments, products, customers, deliveryNotes, invoices } from "../schema.js";
import { eq, like, sql, and, ne } from "drizzle-orm";
import { generateRunningNumber } from "../utils.js";
import { join, basename } from "path";
import { mkdir, unlink } from "fs/promises";
import { escapeHtml, fmt, fmtBaht, calcDueDate, getCompanyInfo, getSignatureInfo, companyHeader, signatureSection, wrapHtml, qrSection, qrCodeImg } from "../print-utils.js";
import { getOrCreateToken } from "./delivery-tracking.js";

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
    uom: soItems.uom, weight: soItems.weight, packingDetail: soItems.packingDetail,
    amount: soItems.amount, productName: products.name, sku: products.sku,
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
  let vatableSubtotal = 0;
  let totalQuantity = 0;
  let totalNetWeight = 0;
  const itemData: { productId: number; itemCode: string | null; quantity: number; unitPrice: number; rate: number | null; uom: string; weight: number; packingDetail: string | null; amount: number }[] = [];

  for (const item of body.items) {
    const product = await db.select().from(products).where(eq(products.id, item.productId)).get();
    const unitPrice = item.unitPrice ?? product?.salePrice ?? 0;
    const amount = unitPrice * item.quantity;
    const weight = item.weight ?? 0;
    subtotal += amount;
    if (product?.hasVat === 1) vatableSubtotal += amount;
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
      packingDetail: item.packingDetail ?? null,
      amount,
    });
  }

  const vatRate = body.vatRate ?? 7;
  const vatAmount = Math.round(vatableSubtotal * vatRate / 100 * 100) / 100;
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

  let vatableSubtotal = 0;

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
      if (product?.hasVat === 1) vatableSubtotal += amount;
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
        packingDetail: item.packingDetail ?? null,
        amount,
      }).run();
    }
  } else {
    // Items not changed — recalculate vatableSubtotal from existing items
    const existingItems = await db.select().from(soItems).where(eq(soItems.salesOrderId, id)).all();
    for (const item of existingItems) {
      const product = await db.select().from(products).where(eq(products.id, item.productId)).get();
      if (product?.hasVat === 1) vatableSubtotal += item.amount;
    }
  }

  const vatRate = body.vatRate ?? existing.vatRate;
  const vatAmount = Math.round(vatableSubtotal * vatRate / 100 * 100) / 100;
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
  const body = await c.req.json().catch(() => ({}));
  const userId = body.userId || null;
  await db.update(salesOrders).set({
    status: "confirmed",
    confirmedBy: userId,
    confirmedAt: sql`datetime('now')`,
    updatedAt: sql`datetime('now')`,
  }).where(eq(salesOrders.id, id)).run();
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


// === Cancel SO ===
salesOrdersRoute.patch("/:id/cancel", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user") as { userId: number } | undefined;
  const so = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).get();
  if (!so) return c.json({ error: "Sales order not found" }, 404);
  if (so.status === "cancelled") return c.json({ error: "Already cancelled" }, 400);

  const activeDns = await db.select({ id: deliveryNotes.id }).from(deliveryNotes)
    .where(and(eq(deliveryNotes.salesOrderId, id), ne(deliveryNotes.status, "cancelled")))
    .all();
  if (activeDns.length > 0) return c.json({ error: "Cannot cancel — has active delivery notes" }, 400);

  const activeInvoices = await db.select({ id: invoices.id }).from(invoices)
    .where(and(eq(invoices.salesOrderId, id), ne(invoices.status, "cancelled")))
    .all();
  if (activeInvoices.length > 0) return c.json({ error: "Cannot cancel — has active invoices" }, 400);

  await db.update(salesOrders).set({
    status: "cancelled",
    cancelledAt: sql`datetime('now')`,
    cancelledBy: user?.userId ?? null,
    updatedAt: sql`datetime('now')`,
  }).where(eq(salesOrders.id, id)).run();

  return c.json({ ok: true, status: "cancelled" });
});

// === Print ===
salesOrdersRoute.get("/:id/print", async (c) => {
  const id = Number(c.req.param("id"));
  const companyId = c.req.query("companyId") ? Number(c.req.query("companyId")) : undefined;
  const o = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).get();
  if (!o) return c.json({ error: "Sales order not found" }, 404);

  const company = await getCompanyInfo(companyId);
  const customer = await db.select().from(customers).where(eq(customers.id, o.customerId)).get();
  const items = await db.select({
    id: soItems.id, itemCode: soItems.itemCode, quantity: soItems.quantity,
    unitPrice: soItems.unitPrice, uom: soItems.uom, weight: soItems.weight,
    amount: soItems.amount, productName: products.name,
  }).from(soItems).leftJoin(products, eq(soItems.productId, products.id))
    .where(eq(soItems.salesOrderId, id)).all();
  const paymentTermsRows = await db.select().from(soPaymentTerms).where(eq(soPaymentTerms.salesOrderId, id)).all();

  const sig = await getSignatureInfo(o.confirmedBy);
  if (sig && o.confirmedAt) sig.date = o.confirmedAt;

  const dueDate = calcDueDate(o.date, customer?.paymentTerms);
  const meta = `
    <span>วันที่: ${escapeHtml(o.date) || "-"}</span>
    ${dueDate ? `<span>ครบกำหนด: ${escapeHtml(dueDate)}</span>` : ""}
    ${o.poNumber ? `<span>PO#: ${escapeHtml(o.poNumber)}</span>` : ""}
    ${o.poDate ? `<span>PO Date: ${escapeHtml(o.poDate)}</span>` : ""}`;

  let body = `
  ${companyHeader(company, "so", o.orderNumber, meta)}
  <div class="info-grid">
    <div class="info-card">
      <h4>ลูกค้า / Customer</h4>
      <p class="name">${escapeHtml(customer?.name) || "-"}</p>
      ${customer?.fullName ? `<p>${escapeHtml(customer.fullName)}</p>` : ""}
      ${o.customerAddress ? `<p>${escapeHtml(o.customerAddress)}</p>` : (customer?.address ? `<p>${escapeHtml(customer.address)}</p>` : "")}
      ${o.contactPerson ? `<p>ติดต่อ: ${escapeHtml(o.contactPerson)}</p>` : ""}
      ${o.contact ? `<p>โทร: ${escapeHtml(o.contact)}</p>` : ""}
      ${customer?.taxId ? `<p>เลขประจำตัวผู้เสียภาษี: ${escapeHtml(customer.taxId)}</p>` : ""}
    </div>
    <div class="info-card">
      <h4>การจัดส่ง / Delivery</h4>
      ${o.shippingAddressName ? `<p>${escapeHtml(o.shippingAddressName)}</p>` : ""}
      ${o.shippingAddress ? `<p>${escapeHtml(o.shippingAddress)}</p>` : ""}
      ${o.deliveryStartDate ? `<p>เริ่ม: ${escapeHtml(o.deliveryStartDate)}</p>` : ""}
      ${o.deliveryEndDate ? `<p>สิ้นสุด: ${escapeHtml(o.deliveryEndDate)}</p>` : ""}
    </div>
  </div>
  <table class="items-table">
    <thead><tr>
      <th class="text-center">#</th><th>Item Code</th><th>รายการ</th><th>UOM</th>
      <th class="text-right">จำนวน</th><th class="text-right">น้ำหนัก(kg)</th>
      <th class="text-right">ราคา/หน่วย</th><th class="text-right">จำนวนเงิน</th>
    </tr></thead>
    <tbody>${items.map((it, i) => `<tr>
      <td class="text-center">${i + 1}</td><td>${escapeHtml(it.itemCode) || "-"}</td><td>${escapeHtml(it.productName) || "-"}</td><td>${escapeHtml(it.uom) || "Pcs."}</td>
      <td class="text-right">${fmt(it.quantity)}</td><td class="text-right">${fmt(it.weight || 0)}</td>
      <td class="text-right">${fmtBaht(it.unitPrice)}</td><td class="text-right">${fmtBaht(it.amount)}</td>
    </tr>`).join("")}</tbody>
  </table>
  <div class="totals-section"><div class="totals-box">
    <div class="totals-row"><span>จำนวนรวม</span><span>${fmt(o.totalQuantity || 0)}</span></div>
    <div class="totals-row"><span>น้ำหนักรวม</span><span>${fmt(o.totalNetWeight || 0)} kg</span></div>
    <div class="totals-row"><span>ยอดรวม (Subtotal)</span><span>${fmtBaht(o.subtotal)}</span></div>
    <div class="totals-row"><span>VAT ${o.vatRate}%</span><span>${fmtBaht(o.vatAmount)}</span></div>
    <div class="totals-row grand"><span>ยอดรวมทั้งสิ้น</span><span>${fmtBaht(o.totalAmount)}</span></div>
  </div></div>
  <div class="footer-grid">
    <div class="footer-card">
      <h4>เงื่อนไขการชำระ / Payment Terms</h4>
      <p>${escapeHtml(o.paymentTermsTemplate) || "-"}</p>
      ${paymentTermsRows.length ? `<table class="items-table" style="margin-top:5px"><thead><tr><th>งวด</th><th>คำอธิบาย</th><th>กำหนด</th><th class="text-right">%</th><th class="text-right">จำนวน</th></tr></thead><tbody>${paymentTermsRows.map(pt => `<tr><td>${escapeHtml(pt.paymentTerm) || "-"}</td><td>${escapeHtml(pt.description) || "-"}</td><td>${escapeHtml(pt.dueDate) || "-"}</td><td class="text-right">${pt.invoicePortion || 0}</td><td class="text-right">${fmtBaht(pt.paymentAmount || 0)}</td></tr>`).join("")}</tbody></table>` : ""}
    </div>
  </div>
  ${o.notes ? `<div class="notes-box"><strong>หมายเหตุ:</strong> ${escapeHtml(o.notes)}</div>` : ""}
  ${signatureSection("ผู้สั่งซื้อ / Customer", "ผู้อนุมัติ / Authorized", sig)}`;

  // Add QR code — always show, link to this print page
  const baseUrl = c.req.header("X-Forwarded-Host") ? `https://${c.req.header("X-Forwarded-Host")}` : new URL(c.req.url).origin;
  const dn = await db.select().from(deliveryNotes).where(eq(deliveryNotes.salesOrderId, id)).get();
  if (dn) {
    const token = await getOrCreateToken(dn.id, id);
    body += await qrSection(`${baseUrl}/track/${token}`, "สแกนเพื่อติดตามการส่ง / Scan to track delivery");
  } else {
    body += await qrSection(`${baseUrl}/api/sales-orders/${id}/print${companyId ? `?companyId=${companyId}` : ""}`, "สแกนเพื่อดูใบสั่งขาย / Scan to view Sales Order");
  }

  return c.html(wrapHtml(`Sales Order ${o.orderNumber}`, "so", body));
});

// === COA (Certificate of Analysis) — print from SO ===
salesOrdersRoute.get("/:id/coa", async (c) => {
  const id = Number(c.req.param("id"));
  const companyId = c.req.query("companyId") ? Number(c.req.query("companyId")) : undefined;
  const productId = c.req.query("productId") ? Number(c.req.query("productId")) : undefined;
  const o = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).get();
  if (!o) return c.json({ error: "Sales order not found" }, 404);

  const company = await getCompanyInfo(companyId);
  const items = await db.select({
    productId: soItems.productId, quantity: soItems.quantity,
    productName: products.name, sku: products.sku, weight: soItems.weight,
    packingDetail: soItems.packingDetail,
  }).from(soItems)
    .leftJoin(products, eq(soItems.productId, products.id))
    .where(eq(soItems.salesOrderId, id)).all();

  const targetItem = productId
    ? items.find(it => it.productId === productId) || items[0]
    : items[0];
  if (!targetItem) return c.json({ error: "No items" }, 400);

  const mfgDate = o.date || new Date().toISOString().slice(0, 10);
  const lotNumber = c.req.query("lot") || `${mfgDate.replace(/-/g, "")}001`;

  const sig = await getSignatureInfo(o.confirmedBy);
  if (sig && o.confirmedAt) sig.date = o.confirmedAt;

  const coaBody = `
  <div class="doc-header">
    <div class="company-info">
      <h1>${escapeHtml(company.companyNameEn)}</h1>
      <div class="sub">${escapeHtml(company.companyName)}</div>
      <div class="detail">
        ${company.address ? escapeHtml(company.address) + "<br>" : ""}
        ${company.taxId ? `Tax ID: ${escapeHtml(company.taxId)}` : ""}
        ${company.email ? `<br>Email: ${escapeHtml(company.email)}` : ""}
        ${company.phone ? ` | Tel: ${escapeHtml(company.phone)}` : ""}
      </div>
    </div>
    <div class="doc-title">
      <h2 style="color:#1e40af">CERTIFICATE OF ANALYSIS (COA)</h2>
    </div>
  </div>
  <div class="info-grid" style="margin-top:16px">
    <div class="info-card">
      <h4>Product Information</h4>
      <p><strong>Date:</strong> ${escapeHtml(mfgDate)}</p>
      <p><strong>Manufactured by:</strong> ${escapeHtml(company.companyNameEn)}</p>
      <p><strong>Lot Number:</strong> ${escapeHtml(lotNumber)}</p>
      <p><strong>Product:</strong> ${escapeHtml(targetItem.sku || "-")}</p>
    </div>
    <div class="info-card">
      <h4>Reference</h4>
      <p><strong>SO:</strong> ${escapeHtml(o.orderNumber)}</p>
      <p><strong>Product Name:</strong> ${escapeHtml(targetItem.productName || "-")}</p>
      <p><strong>Quantity:</strong> ${fmt(targetItem.quantity)}</p>
      ${targetItem.packingDetail ? `<p><strong>Packing:</strong> ${escapeHtml(targetItem.packingDetail)}</p>` : ""}
    </div>
  </div>
  <h3 style="text-align:center;color:#1e40af;margin:16px 0 10px;font-size:14px;letter-spacing:2px">RESULT</h3>
  <table class="items-table">
    <thead><tr><th class="text-center" style="width:40px">SR.</th><th>DETAIL</th><th>STANDARD</th><th>RESULT</th></tr></thead>
    <tbody>
      <tr><td class="text-center">1.</td><td>Escherichia coli</td><td>MPN 10-100/1 g.</td><td>&lt;3</td></tr>
      <tr><td class="text-center">2.</td><td>Salmonella spp.</td><td>Not Detected</td><td>Not Detected</td></tr>
      <tr><td class="text-center">3.</td><td>Staphylococcus aureus</td><td>MPN &lt;100/1 g.</td><td>&lt;3</td></tr>
      <tr><td class="text-center">4.</td><td>Total Plate Count</td><td>&lt;5×10⁵/1 g.</td><td>1.4×10⁵</td></tr>
      <tr><td class="text-center">5.</td><td>Vibrio cholerae</td><td>Not Detected</td><td>Not Detected</td></tr>
      <tr><td class="text-center">6.</td><td>Histamine</td><td>&lt;200 mg/kg.</td><td>&lt;200 mg/kg.</td></tr>
    </tbody>
  </table>
  <div class="sign-section" style="justify-content:center">
    <div class="sign-block">
      <div class="sign-img">${sig?.signatureUrl ? `<img src="${escapeHtml(sig.signatureUrl)}" alt="signature">` : ""}</div>
      <div class="sign-line">Managing Director</div>
      <div class="sign-name">${sig?.name ? `( ${escapeHtml(sig.name)} )` : "( ................................ )"}</div>
      <div class="sign-date">${sig?.date ? `วันที่ ${escapeHtml(sig.date.slice(0, 10))}` : ""}</div>
    </div>
  </div>
  <div style="margin-top:20px;padding-top:8px;border-top:1px solid #e2e8f0;text-align:center;font-size:9px;color:#94a3b8">
    ${escapeHtml(company.companyNameEn)} — ${escapeHtml(company.address)}<br>
    ${company.taxId ? `Tax ID: ${escapeHtml(company.taxId)} | ` : ""}${company.email ? `Email: ${escapeHtml(company.email)}` : ""}
  </div>`;

  return c.html(wrapHtml(`COA - ${targetItem.sku || targetItem.productName}`, "so", coaBody));
});

// === Sticker (100mm x 70mm) — print from SO ===
salesOrdersRoute.get("/:id/sticker", async (c) => {
  const id = Number(c.req.param("id"));
  const companyId = c.req.query("companyId") ? Number(c.req.query("companyId")) : undefined;
  const productId = c.req.query("productId") ? Number(c.req.query("productId")) : undefined;
  const o = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).get();
  if (!o) return c.json({ error: "Sales order not found" }, 404);

  const company = await getCompanyInfo(companyId);
  const items = await db.select({
    productId: soItems.productId, quantity: soItems.quantity,
    productName: products.name, sku: products.sku, weight: soItems.weight,
    packingDetail: soItems.packingDetail,
    packingWeight: products.packingWeight,
    packingUnit: products.packingUnit,
  }).from(soItems)
    .leftJoin(products, eq(soItems.productId, products.id))
    .where(eq(soItems.salesOrderId, id)).all();

  // If productId, show single sticker; otherwise show all items
  const targetItems = productId
    ? items.filter(it => it.productId === productId)
    : items;
  if (targetItems.length === 0) return c.json({ error: "No items" }, 400);

  const mfgDate = o.date || new Date().toISOString().slice(0, 10);
  const lotBase = mfgDate.replace(/-/g, "");

  // Calculate EXP date (2 years from MFG)
  const mfgParts = mfgDate.split("-");
  const expYear = parseInt(mfgParts[0]) + 2;
  const expDate = `${expYear}-${mfgParts[1]}-${mfgParts[2]}`;

  const baseUrl = c.req.header("X-Forwarded-Host") ? `https://${c.req.header("X-Forwarded-Host")}` : new URL(c.req.url).origin;

  // Pre-generate QR codes for all items
  const qrSvgs = await Promise.all(targetItems.map((item) => {
    const stockUrl = `${baseUrl}/products?search=${encodeURIComponent(item.sku || item.productName || "")}`;
    return qrCodeImg(stockUrl, 120);
  }));

  const stickersHtml = targetItems.map((item, idx) => {
    const lot = `${lotBase}${String(idx + 1).padStart(3, "0")}`;
    const qrImg = qrSvgs[idx];
    return `
    <div class="sticker">
      <div class="sticker-header">${escapeHtml(company.companyNameEn)}</div>
      <div class="sticker-body">
        <div class="sticker-info">
          <div class="sticker-code">${escapeHtml(item.sku || "-")}</div>
          <div class="sticker-name">${escapeHtml(item.productName || "-")}</div>
          <div class="sticker-grid">
            <div><span class="label">MFG:</span> ${escapeHtml(mfgDate)}</div>
            <div><span class="label">EXP:</span> ${escapeHtml(expDate)}</div>
            <div><span class="label">Weight:</span> ${item.packingWeight ? `${item.packingWeight} ${item.packingUnit || 'kg'}` : (item.packingDetail ? escapeHtml(item.packingDetail) : `${item.weight || 0} kg`)}</div>
            <div><span class="label">Lot:</span> ${escapeHtml(lot)}</div>
          </div>
        </div>
        <div class="sticker-qr">${qrImg}</div>
      </div>
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="th"><head>
<meta charset="UTF-8">
<title>Sticker - ${o.orderNumber}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 10mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; }
  .sticker {
    width: 190mm; min-height: 260mm; padding: 12mm 15mm;
    border: 1px dashed #ccc;
    display: flex; flex-direction: column; justify-content: center;
    page-break-after: always;
  }
  .sticker:last-child { page-break-after: auto; }
  .sticker-header { font-size: 14px; color: #64748b; text-align: center; margin-bottom: 8mm; letter-spacing: 2px; text-transform: uppercase; }
  .sticker-body { display: flex; align-items: center; gap: 8mm; }
  .sticker-info { flex: 1; }
  .sticker-qr { flex-shrink: 0; text-align: center; }
  .sticker-code { font-size: 32px; font-weight: 800; color: #0f172a; letter-spacing: 2px; margin-bottom: 4mm; }
  .sticker-name { font-size: 22px; font-weight: 600; color: #334155; margin-bottom: 8mm; }
  .sticker-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm 12mm; font-size: 18px; color: #1e293b; padding: 8mm 10mm; background: #f8fafc; border-radius: 6mm; border: 1px solid #e2e8f0; }
  .label { font-weight: 700; color: #475569; }
  @media print { body { padding: 0; } .sticker { border: none; } }
  @media screen {
    body { background: #e2e8f0; padding: 20px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
    .sticker { background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 4px; }
  }
</style>
</head><body>
${stickersHtml}
<script>window.onload=()=>window.print()</script>
</body></html>`;

  return c.html(html);
});


// === Delete SO ===
salesOrdersRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const so = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).get();
  if (!so) return c.json({ error: "Sales order not found" }, 404);

  const dns = await db.select({ id: deliveryNotes.id }).from(deliveryNotes).where(eq(deliveryNotes.salesOrderId, id)).all();
  if (dns.length > 0) {
    return c.json({ error: "Cannot delete: has delivery notes. Delete them first.", relatedIds: dns.map(d => d.id) }, 400);
  }

  const ivs = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.salesOrderId, id)).all();
  if (ivs.length > 0) {
    return c.json({ error: "Cannot delete: has invoices. Delete them first.", relatedIds: ivs.map(i => i.id) }, 400);
  }

  await db.delete(soItems).where(eq(soItems.salesOrderId, id)).run();
  await db.delete(soPaymentTerms).where(eq(soPaymentTerms.salesOrderId, id)).run();
  await db.delete(soAttachments).where(eq(soAttachments.salesOrderId, id)).run();
  await db.delete(salesOrders).where(eq(salesOrders.id, id)).run();

  return c.json({ ok: true, deletedId: id });
});

export { salesOrdersRoute };
