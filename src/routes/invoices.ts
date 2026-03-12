import { Hono } from "hono";
import { db } from "../db.js";
import { invoices, invoiceItems, salesOrders, soItems, customers, products, payments, receipts, deliveryNotes, dnItems } from "../schema.js";
import { eq, sql } from "drizzle-orm";
import { generateRunningNumber } from "../utils.js";
import { escapeHtml, fmt, getCompanyInfo, getSignatureInfo, companyHeader, signatureSection, wrapHtml, qrSection } from "../print-utils.js";
import { getOrCreateToken } from "./delivery-tracking.js";

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

  // Auto-create DN if none provided and no DN exists for this SO
  let autoDeliveryNoteId = deliveryNoteId;
  if (!autoDeliveryNoteId) {
    // Check if DN already exists for this SO
    const existingDn = await db.select().from(deliveryNotes)
      .where(eq(deliveryNotes.salesOrderId, salesOrderId)).get();
    if (existingDn) {
      autoDeliveryNoteId = existingDn.id;
    } else {
      // Auto-create DN
      const dnNumber = await generateRunningNumber("DN", "delivery_notes", "dn_number");
      const dnResult = await db.insert(deliveryNotes).values({
        salesOrderId,
        salesOrderIds: JSON.stringify([salesOrderId]),
        dnNumber,
        status: "delivered",
        deliveredAt: sql`datetime('now')`,
      }).run();
      autoDeliveryNoteId = Number(dnResult.lastInsertRowid);
      // Copy items from SO to DN
      const soItemsForDn = await db.select().from(soItems).where(eq(soItems.salesOrderId, salesOrderId)).all();
      for (const item of soItemsForDn) {
        await db.insert(dnItems).values({
          deliveryNoteId: autoDeliveryNoteId,
          productId: item.productId,
          quantity: item.quantity,
        }).run();
      }
    }
  }

  const invoiceNumber = await generateRunningNumber("IV", "invoices", "invoice_number");

  // Use items from SO
  const soItemRows = await db.select().from(soItems).where(eq(soItems.salesOrderId, salesOrderId)).all();

  let subtotal = 0;
  let vatableSubtotal = 0;
  const itemData: { productId: number; quantity: number; unitPrice: number; amount: number }[] = [];
  for (const item of soItemRows) {
    const amount = item.unitPrice * item.quantity;
    subtotal += amount;
    // Check product hasVat — only apply VAT to products with hasVat = 1
    const product = await db.select().from(products).where(eq(products.id, item.productId)).get();
    if (product?.hasVat === 1) vatableSubtotal += amount;
    itemData.push({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount,
    });
  }

  const vatRate = so.vatRate || 7;
  const vatAmount = Math.round(vatableSubtotal * vatRate / 100 * 100) / 100;
  const totalAmount = subtotal + vatAmount;

  const result = await db.insert(invoices).values({
    salesOrderId,
    deliveryNoteId: autoDeliveryNoteId,
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
  const body = await c.req.json().catch(() => ({}));
  await db.update(invoices).set({
    status: "sent",
    confirmedBy: body.userId || null,
    confirmedAt: sql`datetime('now')`,
    updatedAt: sql`datetime('now')`,
  }).where(eq(invoices.id, id)).run();
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

// === Print Invoice ===
invoicesRoute.get("/:id/print", async (c) => {
  const id = Number(c.req.param("id"));
  const companyId = c.req.query("companyId") ? Number(c.req.query("companyId")) : undefined;
  const iv = await db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!iv) return c.json({ error: "Invoice not found" }, 404);

  const company = await getCompanyInfo(companyId);
  const so = iv.salesOrderId
    ? await db.select().from(salesOrders).where(eq(salesOrders.id, iv.salesOrderId)).get()
    : null;
  const customer = so
    ? await db.select().from(customers).where(eq(customers.id, so.customerId)).get()
    : null;

  const items = await db.select({
    id: invoiceItems.id, productId: invoiceItems.productId, quantity: invoiceItems.quantity,
    unitPrice: invoiceItems.unitPrice, amount: invoiceItems.amount,
    productName: products.name, sku: products.sku,
  }).from(invoiceItems)
    .leftJoin(products, eq(invoiceItems.productId, products.id))
    .where(eq(invoiceItems.invoiceId, id)).all();

  const sig = await getSignatureInfo(iv.confirmedBy);
  if (sig && iv.confirmedAt) sig.date = iv.confirmedAt;

  const meta = `
    <span>วันที่: ${escapeHtml(iv.createdAt?.slice(0, 10))}</span>
    <span>สถานะ: ${escapeHtml(iv.status)}</span>
    ${so ? `<span>อ้างอิง SO: ${escapeHtml(so.orderNumber)}</span>` : ""}`;

  let body = `
  ${companyHeader(company, "inv", iv.invoiceNumber, meta)}
  <div class="info-grid">
    <div class="info-card">
      <h4>ลูกค้า / Customer</h4>
      <p class="name">${escapeHtml(customer?.name) || "-"}</p>
      ${customer?.fullName ? `<p>${escapeHtml(customer.fullName)}</p>` : ""}
      ${customer?.address ? `<p>${escapeHtml(customer.address)}</p>` : ""}
      ${customer?.taxId ? `<p>เลขประจำตัวผู้เสียภาษี: ${escapeHtml(customer.taxId)}</p>` : ""}
    </div>
    <div class="info-card">
      <h4>การชำระเงิน / Payment</h4>
      <p>ครบกำหนดชำระ: ${escapeHtml(iv.dueDate) || "ไม่ระบุ"}</p>
      ${iv.notes ? `<p>หมายเหตุ: ${escapeHtml(iv.notes)}</p>` : ""}
    </div>
  </div>
  <table class="items-table">
    <thead><tr>
      <th class="text-center">#</th><th>Item Code</th><th>รายการ</th>
      <th class="text-right">จำนวน</th><th class="text-right">ราคา/หน่วย</th><th class="text-right">จำนวนเงิน</th>
    </tr></thead>
    <tbody>${items.map((it, i) => `<tr>
      <td class="text-center">${i + 1}</td><td>${escapeHtml(it.sku) || "-"}</td><td>${escapeHtml(it.productName) || "-"}</td>
      <td class="text-right">${fmt(it.quantity)}</td><td class="text-right">${fmt(it.unitPrice)}</td><td class="text-right">${fmt(it.amount)}</td>
    </tr>`).join("")}</tbody>
  </table>
  <div class="totals-section"><div class="totals-box">
    <div class="totals-row"><span>ยอดรวม (Subtotal)</span><span>${fmt(iv.subtotal)}</span></div>
    <div class="totals-row"><span>VAT ${iv.vatRate}%</span><span>${fmt(iv.vatAmount)}</span></div>
    <div class="totals-row grand"><span>ยอดรวมทั้งสิ้น</span><span>฿${fmt(iv.totalAmount)}</span></div>
  </div></div>
  ${iv.notes ? `<div class="notes-box"><strong>หมายเหตุ:</strong> ${escapeHtml(iv.notes)}</div>` : ""}
  ${signatureSection("ผู้รับบริการ / Customer", "ผู้อนุมัติ / Authorized", sig)}`;

  // Add QR code if DN exists
  const dn = iv.deliveryNoteId
    ? await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, iv.deliveryNoteId)).get()
    : await db.select().from(deliveryNotes).where(eq(deliveryNotes.salesOrderId, iv.salesOrderId)).get();
  if (dn) {
    const token = await getOrCreateToken(dn.id, iv.salesOrderId);
    const baseUrl = c.req.header("X-Forwarded-Host") ? `https://${c.req.header("X-Forwarded-Host")}` : new URL(c.req.url).origin;
    body += qrSection(`${baseUrl}/track/${token}`, "สแกนเพื่อติดตามการส่ง / Scan to track delivery");
  }

  return c.html(wrapHtml(`Invoice ${iv.invoiceNumber}`, "inv", body, iv.status === "draft" ? "DRAFT" : undefined));
});

// === Print Receipt from Invoice (for customers who need Invoice + Receipt together) ===
invoicesRoute.get("/:id/print-receipt", async (c) => {
  const id = Number(c.req.param("id"));
  const companyId = c.req.query("companyId") ? Number(c.req.query("companyId")) : undefined;
  const iv = await db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!iv) return c.json({ error: "Invoice not found" }, 404);

  const company = await getCompanyInfo(companyId);
  const so = iv.salesOrderId
    ? await db.select().from(salesOrders).where(eq(salesOrders.id, iv.salesOrderId)).get()
    : null;
  const customer = so
    ? await db.select().from(customers).where(eq(customers.id, so.customerId)).get()
    : null;

  // Get payments for this invoice
  const paymentRows = await db.select().from(payments).where(eq(payments.invoiceId, id)).all();
  const totalPaid = paymentRows.reduce((s, p) => s + p.amount, 0);

  const sig = await getSignatureInfo(iv.confirmedBy);
  if (sig && iv.confirmedAt) sig.date = iv.confirmedAt;

  const meta = `
    <span>วันที่: ${escapeHtml(new Date().toISOString().slice(0, 10))}</span>
    <span>อ้างอิง INV: ${escapeHtml(iv.invoiceNumber)}</span>`;

  const receiptNumber = paymentRows[0]
    ? `RCP-${iv.invoiceNumber.replace("IV", "")}`
    : `RCP-${iv.invoiceNumber.replace("IV", "")}`;

  const body = `
  ${companyHeader(company, "receipt", receiptNumber, meta)}
  <div class="info-grid">
    <div class="info-card">
      <h4>ออกให้ / Issued To</h4>
      <p class="name">${escapeHtml(customer?.fullName || customer?.name) || "-"}</p>
      ${customer?.address ? `<p>${escapeHtml(customer.address)}</p>` : ""}
      ${customer?.taxId ? `<p>เลขประจำตัวผู้เสียภาษี: ${escapeHtml(customer.taxId)}</p>` : ""}
    </div>
    <div class="info-card">
      <h4>อ้างอิง / Reference</h4>
      <p>เลขที่ใบแจ้งหนี้: ${escapeHtml(iv.invoiceNumber)}</p>
      ${so ? `<p>เลขที่ใบสั่งขาย: ${escapeHtml(so.orderNumber)}</p>` : ""}
      <p>ยอดในใบแจ้งหนี้: ฿${fmt(iv.totalAmount)}</p>
    </div>
  </div>
  <table class="items-table">
    <thead><tr>
      <th class="text-center">#</th><th>เลขที่การชำระ</th><th>วิธีชำระ</th><th>วันที่ชำระ</th>
      <th class="text-right">จำนวนเงิน</th>
    </tr></thead>
    <tbody>${paymentRows.length > 0 ? paymentRows.map((p, i) => `<tr>
      <td class="text-center">${i + 1}</td>
      <td>${escapeHtml(p.paymentNumber)}</td>
      <td>${escapeHtml(p.method === "transfer" ? "โอนเงิน" : p.method === "cash" ? "เงินสด" : "เช็ค")}</td>
      <td>${escapeHtml(p.paymentDate || p.paidAt?.slice(0, 10) || "-")}</td>
      <td class="text-right">${fmt(p.amount)}</td>
    </tr>`).join("") : `<tr><td colspan="5" class="text-center" style="padding:20px;color:#94a3b8">ยังไม่มีรายการชำระเงิน</td></tr>`}</tbody>
  </table>
  <div class="totals-section"><div class="totals-box">
    <div class="totals-row"><span>ยอดใบแจ้งหนี้</span><span>฿${fmt(iv.totalAmount)}</span></div>
    <div class="totals-row"><span>ชำระแล้ว</span><span>฿${fmt(totalPaid)}</span></div>
    <div class="totals-row grand"><span>ยอดรับทั้งสิ้น</span><span>฿${fmt(totalPaid)}</span></div>
  </div></div>
  ${signatureSection("ผู้ชำระเงิน / Payer", "ผู้รับเงิน / Receiver", sig)}`;

  return c.html(wrapHtml(`Receipt for ${iv.invoiceNumber}`, "receipt", body));
});

// === Print COA (Certificate of Analysis) from Invoice ===
invoicesRoute.get("/:id/coa", async (c) => {
  const id = Number(c.req.param("id"));
  const companyId = c.req.query("companyId") ? Number(c.req.query("companyId")) : undefined;
  const productId = c.req.query("productId") ? Number(c.req.query("productId")) : undefined;
  const iv = await db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!iv) return c.json({ error: "Invoice not found" }, 404);

  const company = await getCompanyInfo(companyId);
  const items = await db.select({
    productId: invoiceItems.productId, quantity: invoiceItems.quantity,
    productName: products.name, sku: products.sku,
  }).from(invoiceItems)
    .leftJoin(products, eq(invoiceItems.productId, products.id))
    .where(eq(invoiceItems.invoiceId, id)).all();

  const targetItem = productId
    ? items.find(it => it.productId === productId) || items[0]
    : items[0];
  if (!targetItem) return c.json({ error: "No items" }, 400);

  const today = new Date().toISOString().slice(0, 10);
  const lotNumber = c.req.query("lot") || `${today.replace(/-/g, "")}001`;

  const sig = await getSignatureInfo(iv.confirmedBy);
  if (sig && iv.confirmedAt) sig.date = iv.confirmedAt;

  const coaBody = `
  <div class="doc-header">
    <div class="company-info">
      <h1>${escapeHtml(company.companyNameEn)}</h1>
      <div class="sub">${escapeHtml(company.companyName)}</div>
      <div class="detail">
        ${company.address ? escapeHtml(company.address) + "<br>" : ""}
        ${company.taxId ? `เลขประจำตัวผู้เสียภาษี: ${escapeHtml(company.taxId)}` : ""}
      </div>
    </div>
    <div class="doc-title">
      <h2 style="color:#7c3aed">CERTIFICATE OF ANALYSIS (COA)</h2>
    </div>
  </div>
  <div class="info-grid" style="margin-top:16px">
    <div class="info-card">
      <h4>Product Info</h4>
      <p><strong>Date:</strong> ${escapeHtml(today)}</p>
      <p><strong>Manufactured by:</strong> ${escapeHtml(company.companyNameEn)}</p>
      <p><strong>Lot Number:</strong> ${escapeHtml(lotNumber)}</p>
      <p><strong>Product:</strong> ${escapeHtml(targetItem.sku || targetItem.productName || "-")}</p>
    </div>
    <div class="info-card">
      <h4>Reference</h4>
      <p><strong>INV:</strong> ${escapeHtml(iv.invoiceNumber)}</p>
      <p><strong>Product Name:</strong> ${escapeHtml(targetItem.productName || "-")}</p>
    </div>
  </div>
  <h3 style="text-align:center;color:#7c3aed;margin:16px 0 10px;font-size:14px;letter-spacing:2px">RESULT</h3>
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
    </div>
  </div>
  <div style="margin-top:20px;padding-top:8px;border-top:1px solid #e2e8f0;text-align:center;font-size:9px;color:#94a3b8">
    ${escapeHtml(company.companyNameEn)} — ${escapeHtml(company.address)}
  </div>`;

  return c.html(wrapHtml(`COA - ${targetItem.productName}`, "inv", coaBody));
});

export { invoicesRoute };
