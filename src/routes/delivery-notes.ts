import { Hono } from "hono";
import { db } from "../db.js";
import { deliveryNotes, dnItems, salesOrders, soItems, products, customers, deliveryPhotos, deliveryConfirmations } from "../schema.js";
import { eq, sql } from "drizzle-orm";
import { generateRunningNumber } from "../utils.js";
import { escapeHtml, fmt, getCompanyInfo, getSignatureInfo, companyHeader, signatureSection, wrapHtml, qrSection } from "../print-utils.js";
import { getOrCreateToken } from "./delivery-tracking.js";

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

  // Fetch delivery tracking data (photos + customer confirmations)
  const photos = await db.select().from(deliveryPhotos)
    .where(eq(deliveryPhotos.deliveryNoteId, dn.id)).all();
  const confirmations = await db.select().from(deliveryConfirmations)
    .where(eq(deliveryConfirmations.deliveryNoteId, dn.id)).all();

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
    delivery_photos: photos.map(p => ({
      id: p.id,
      photoUrl: p.photoUrl,
      latitude: p.latitude,
      longitude: p.longitude,
      takenAt: p.takenAt,
      notes: p.notes,
    })),
    delivery_confirmations: confirmations.map(c => ({
      id: c.id,
      signatureUrl: c.signatureUrl,
      latitude: c.latitude,
      longitude: c.longitude,
      confirmedAt: c.confirmedAt,
    })),
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
  const body = await c.req.json().catch(() => ({}));
  await db.update(deliveryNotes).set({
    status: "shipped",
    shippedAt: sql`datetime('now')`,
    confirmedBy: body.userId || null,
    confirmedAt: sql`datetime('now')`,
    updatedAt: sql`datetime('now')`,
  }).where(eq(deliveryNotes.id, id)).run();
  return c.json({ ok: true, status: "shipped" });
});

deliveryNotesRoute.post("/:id/deliver", async (c) => {
  const id = Number(c.req.param("id"));
  const dn = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id)).get();
  if (!dn) return c.json({ error: "Delivery note not found" }, 404);
  if (dn.status === "delivered") return c.json({ error: "Already delivered" }, 400);
  const items = await db.select().from(dnItems).where(eq(dnItems.deliveryNoteId, id)).all();
  // Deduct stock (allow negative — อนุญาตให้ติดลบได้)
  for (const item of items) {
    await db.update(products).set({ stock: sql`stock - ${item.quantity}`, updatedAt: sql`datetime('now')` }).where(eq(products.id, item.productId)).run();
  }
  await db.update(deliveryNotes).set({ status: "delivered", deliveredAt: sql`datetime('now')`, updatedAt: sql`datetime('now')` }).where(eq(deliveryNotes.id, id)).run();
  await db.update(salesOrders).set({ status: "delivered", updatedAt: sql`datetime('now')` }).where(eq(salesOrders.id, dn.salesOrderId)).run();
  return c.json({ ok: true, status: "delivered", message: "Stock deducted" });
});

// === Print ===
deliveryNotesRoute.get("/:id/print", async (c) => {
  const id = Number(c.req.param("id"));
  const companyId = c.req.query("companyId") ? Number(c.req.query("companyId")) : undefined;
  const dn = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id)).get();
  if (!dn) return c.json({ error: "Delivery note not found" }, 404);

  const company = await getCompanyInfo(companyId);
  const items = await db.select({
    id: dnItems.id, productId: dnItems.productId, quantity: dnItems.quantity,
    productName: products.name, itemCode: products.sku, unit: products.unit,
  }).from(dnItems)
    .leftJoin(products, eq(dnItems.productId, products.id))
    .where(eq(dnItems.deliveryNoteId, id)).all();

  let customerName = "";
  let customerInfo = "";
  let soOrderNumber = "";
  let soPoNumber = "";
  if (dn.salesOrderId) {
    const so = await db.select().from(salesOrders).where(eq(salesOrders.id, dn.salesOrderId)).get();
    if (so) {
      soOrderNumber = so.orderNumber;
      soPoNumber = so.poNumber || "";
      const cust = await db.select().from(customers).where(eq(customers.id, so.customerId)).get();
      if (cust) {
        customerName = cust.name;
        customerInfo = `
          <p class="name">${escapeHtml(cust.name)}</p>
          ${cust.fullName ? `<p>${escapeHtml(cust.fullName)}</p>` : ""}
          ${cust.address ? `<p>${escapeHtml(cust.address)}</p>` : ""}
          ${cust.phone ? `<p>โทร: ${escapeHtml(cust.phone)}</p>` : ""}
          ${cust.taxId ? `<p>เลขประจำตัวผู้เสียภาษี: ${escapeHtml(cust.taxId)}</p>` : ""}`;
      }
    }
  }

  const sig = await getSignatureInfo(dn.confirmedBy);
  if (sig && dn.confirmedAt) sig.date = dn.confirmedAt;

  const meta = `
    <span>วันที่: ${escapeHtml(dn.createdAt?.slice(0, 10))}</span>
    <span>อ้างอิง SO: ${escapeHtml(soOrderNumber)}</span>
    ${soPoNumber ? `<span>PO#: ${escapeHtml(soPoNumber)}</span>` : ""}`;

  let body = `
  ${companyHeader(company, "dn", dn.dnNumber, meta)}
  <div class="info-grid">
    <div class="info-card">
      <h4>ลูกค้า / Customer</h4>
      ${customerInfo || '<p class="name">-</p>'}
    </div>
    <div class="info-card">
      <h4>ข้อมูลจัดส่ง / Shipping</h4>
      ${dn.driverPhone ? `<p>โทรคนขับ: ${escapeHtml(dn.driverPhone)}</p>` : ""}
      ${dn.pickupPoint ? `<p>จุดรับสินค้า: ${escapeHtml(dn.pickupPoint)}</p>` : ""}
      ${dn.shippedAt ? `<p>วันที่ส่ง: ${escapeHtml(dn.shippedAt.slice(0, 10))}</p>` : ""}
      ${dn.deliveredAt ? `<p>วันที่ถึง: ${escapeHtml(dn.deliveredAt.slice(0, 10))}</p>` : ""}
    </div>
  </div>
  <table class="items-table">
    <thead><tr>
      <th class="text-center">#</th><th>สินค้า</th><th class="text-right">จำนวน</th><th>หน่วย</th>
    </tr></thead>
    <tbody>${items.map((it, i) => `<tr>
      <td class="text-center">${i + 1}</td>
      <td>${escapeHtml(it.productName) || "-"}</td>
      <td class="text-right">${fmt(it.quantity)}</td><td>${escapeHtml(it.unit) || "ชิ้น"}</td>
    </tr>`).join("")}</tbody>
  </table>
  <div class="totals-section"><div class="totals-box">
    <div class="totals-row grand"><span>จำนวนรวม</span><span>${fmt(items.reduce((s, it) => s + it.quantity, 0))}</span></div>
  </div></div>
  ${dn.notes ? `<div class="notes-box"><strong>หมายเหตุ:</strong> ${escapeHtml(dn.notes)}</div>` : ""}
  ${signatureSection("ผู้รับสินค้า / Receiver", "ผู้ส่งสินค้า / Sender", sig)}`;

  // Add QR code for delivery tracking
  const token = await getOrCreateToken(dn.id, dn.salesOrderId);
  const baseUrl = c.req.header("X-Forwarded-Host") ? `https://${c.req.header("X-Forwarded-Host")}` : new URL(c.req.url).origin;
  body += await qrSection(`${baseUrl}/track/${token}`, "สแกนเพื่อติดตามการส่ง / Scan to track delivery");

  return c.html(wrapHtml(`Delivery Note ${dn.dnNumber}`, "dn", body, dn.status === "pending" ? "PENDING" : undefined));
});

// === Print COA (Certificate of Analysis) ===
deliveryNotesRoute.get("/:id/coa", async (c) => {
  const id = Number(c.req.param("id"));
  const companyId = c.req.query("companyId") ? Number(c.req.query("companyId")) : undefined;
  const productId = c.req.query("productId") ? Number(c.req.query("productId")) : undefined;
  const dn = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id)).get();
  if (!dn) return c.json({ error: "Delivery note not found" }, 404);

  const company = await getCompanyInfo(companyId);
  const dnItemRows = await db.select({
    productId: dnItems.productId,
    quantity: dnItems.quantity,
    productName: products.name,
    sku: products.sku,
  }).from(dnItems)
    .leftJoin(products, eq(dnItems.productId, products.id))
    .where(eq(dnItems.deliveryNoteId, id)).all();

  // If productId specified, filter to that product; otherwise use first item
  const targetItem = productId
    ? dnItemRows.find(it => it.productId === productId) || dnItemRows[0]
    : dnItemRows[0];

  if (!targetItem) return c.json({ error: "No items in delivery note" }, 400);

  const today = new Date().toISOString().slice(0, 10);
  const lotNumber = c.req.query("lot") || `${today.replace(/-/g, "")}001`;

  const sig = await getSignatureInfo(dn.confirmedBy);
  if (sig && dn.confirmedAt) sig.date = dn.confirmedAt;

  const coaBody = `
  <div class="doc-header">
    <div class="company-info">
      <h1>${escapeHtml(company.companyNameEn)}</h1>
      <div class="sub">${escapeHtml(company.companyName)}</div>
      <div class="detail">
        ${company.address ? escapeHtml(company.address) + "<br>" : ""}
        ${company.taxId ? `เลขประจำตัวผู้เสียภาษี: ${escapeHtml(company.taxId)}` : ""}
        ${company.email ? `<br>Email: ${escapeHtml(company.email)}` : ""}
        ${company.phone ? ` | โทร: ${escapeHtml(company.phone)}` : ""}
      </div>
    </div>
    <div class="doc-title">
      <h2 style="color:#047857">CERTIFICATE OF ANALYSIS (COA)</h2>
    </div>
  </div>

  <div class="info-grid" style="margin-top:16px">
    <div class="info-card">
      <h4>ข้อมูลผลิตภัณฑ์ / Product Info</h4>
      <p><strong>Date:</strong> ${escapeHtml(today)}</p>
      <p><strong>Manufactured by:</strong> ${escapeHtml(company.companyNameEn)}</p>
      <p><strong>Lot Number:</strong> ${escapeHtml(lotNumber)}</p>
      <p><strong>Product:</strong> ${escapeHtml(targetItem.sku || targetItem.productName || "-")}</p>
    </div>
    <div class="info-card">
      <h4>อ้างอิง / Reference</h4>
      <p><strong>DN:</strong> ${escapeHtml(dn.dnNumber)}</p>
      <p><strong>Product Name:</strong> ${escapeHtml(targetItem.productName || "-")}</p>
      <p><strong>Quantity:</strong> ${fmt(targetItem.quantity)}</p>
    </div>
  </div>

  <h3 style="text-align:center; color:#047857; margin:16px 0 10px; font-size:14px; letter-spacing:2px">RESULT</h3>

  <table class="items-table">
    <thead><tr>
      <th class="text-center" style="width:40px">SR.</th>
      <th>DETAIL</th>
      <th>STANDARD</th>
      <th>RESULT</th>
    </tr></thead>
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

  <div style="margin-top:20px; padding-top:8px; border-top:1px solid #e2e8f0; text-align:center; font-size:9px; color:#94a3b8">
    ${escapeHtml(company.companyNameEn)} — ${escapeHtml(company.address)}<br>
    ${company.taxId ? `Tax ID: ${escapeHtml(company.taxId)} | ` : ""}${company.email ? `Email: ${escapeHtml(company.email)} | ` : ""}${company.phone ? `โทร: ${escapeHtml(company.phone)}` : ""}
  </div>`;

  return c.html(wrapHtml(`COA - ${targetItem.productName || targetItem.sku}`, "dn", coaBody));
});

export { deliveryNotesRoute };
