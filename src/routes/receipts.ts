import { Hono } from "hono";
import { db } from "../db.js";
import { receipts, payments, invoices, customers, salesOrders, companySettings } from "../schema.js";
import { eq } from "drizzle-orm";
import { generateRunningNumber } from "../utils.js";
import { escapeHtml, fmt, getCompanyInfo, companyHeader, signatureSection, wrapHtml } from "../print-utils.js";

const receiptsRoute = new Hono();

// GET /receipts — list all
receiptsRoute.get("/", async (c) => {
  const rows = await db.select().from(receipts).all();
  return c.json(rows);
});

// GET /receipts/:id — detail with payment + invoice
receiptsRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const r = await db.select().from(receipts).where(eq(receipts.id, id)).get();
  if (!r) return c.json({ error: "Receipt not found" }, 404);
  const payment = await db.select().from(payments).where(eq(payments.id, r.paymentId)).get();
  const invoice = payment ? await db.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).get() : null;
  return c.json({ ...r, payment, invoice });
});

// POST /receipts — สร้าง Receipt จาก Payment + เลือกหัวบิล
receiptsRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.paymentId) return c.json({ error: "paymentId required" }, 400);

  const payment = await db.select().from(payments).where(eq(payments.id, body.paymentId)).get();
  if (!payment) return c.json({ error: "Payment not found" }, 404);

  const existing = await db.select().from(receipts).where(eq(receipts.paymentId, body.paymentId)).get();
  if (existing) return c.json({ error: "Receipt already exists for this payment", receiptId: existing.id }, 409);

  let companyName = body.receiptCompanyName || null;
  let address = body.receiptAddress || null;
  let taxId = body.receiptTaxId || null;

  if (!companyName) {
    const invoice = await db.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).get();
    if (invoice) {
      const so = await db.select().from(salesOrders).where(eq(salesOrders.id, invoice.salesOrderId)).get();
      if (so) {
        const customer = await db.select().from(customers).where(eq(customers.id, so.customerId)).get();
        if (customer) {
          companyName = companyName || customer.name;
          address = address || customer.address;
          taxId = taxId || customer.taxId;
        }
      }
    }
  }

  const receiptNumber = await generateRunningNumber("RCP", "receipts", "receipt_number");
  const result = await db.insert(receipts).values({
    paymentId: body.paymentId,
    receiptNumber,
    amount: payment.amount,
    receiptCompanyName: companyName,
    receiptAddress: address,
    receiptTaxId: taxId,
  }).run();

  return c.json({
    ok: true,
    id: Number(result.lastInsertRowid),
    receiptNumber,
    amount: payment.amount,
    receiptCompanyName: companyName,
    receiptAddress: address,
    receiptTaxId: taxId,
  }, 201);
});

// === Print Receipt (HTML) ===
receiptsRoute.get("/:id/print", async (c) => {
  const id = Number(c.req.param("id"));
  const companyId = c.req.query("companyId") ? Number(c.req.query("companyId")) : undefined;
  const r = await db.select().from(receipts).where(eq(receipts.id, id)).get();
  if (!r) return c.json({ error: "Receipt not found" }, 404);

  const company = await getCompanyInfo(companyId);
  const payment = await db.select().from(payments).where(eq(payments.id, r.paymentId)).get();
  if (!payment) return c.json({ error: "Payment not found" }, 404);

  const invoice = await db.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).get();

  let customer: any = null;
  if (invoice) {
    const so = await db.select().from(salesOrders).where(eq(salesOrders.id, invoice.salesOrderId)).get();
    if (so) {
      customer = await db.select().from(customers).where(eq(customers.id, so.customerId)).get();
    }
  }

  const methodTh = payment.method === "transfer" ? "โอนเงิน" : payment.method === "cash" ? "เงินสด" : "เช็ค";

  const meta = `
    <span>วันที่ออก: ${escapeHtml(r.issuedAt?.slice(0, 10))}</span>
    ${invoice ? `<span>อ้างอิง INV: ${escapeHtml(invoice.invoiceNumber)}</span>` : ""}`;

  const body = `
  ${companyHeader(company, "receipt", r.receiptNumber, meta)}
  <div class="info-grid">
    <div class="info-card">
      <h4>ออกให้ / Issued To</h4>
      <p class="name">${escapeHtml(r.receiptCompanyName || customer?.name) || "-"}</p>
      ${(r.receiptAddress || customer?.address) ? `<p>${escapeHtml(r.receiptAddress || customer?.address)}</p>` : ""}
      ${(r.receiptTaxId || customer?.taxId) ? `<p>เลขประจำตัวผู้เสียภาษี: ${escapeHtml(r.receiptTaxId || customer?.taxId)}</p>` : ""}
    </div>
    <div class="info-card">
      <h4>รายละเอียดการชำระ / Payment Details</h4>
      <p>เลขที่การชำระ: ${escapeHtml(payment.paymentNumber)}</p>
      <p>วิธีชำระ: ${methodTh}</p>
      <p>วันที่ชำระ: ${escapeHtml(payment.paymentDate || payment.paidAt?.slice(0, 10) || "-")}</p>
      ${payment.bankName ? `<p>ธนาคาร: ${escapeHtml(payment.bankName)}</p>` : ""}
      ${payment.reference ? `<p>อ้างอิง: ${escapeHtml(payment.reference)}</p>` : ""}
    </div>
  </div>
  <table class="items-table">
    <thead><tr>
      <th>รายการ</th><th class="text-right">จำนวนเงิน</th>
    </tr></thead>
    <tbody>
      <tr>
        <td>ชำระค่าใบแจ้งหนี้ ${escapeHtml(invoice?.invoiceNumber || "-")}</td>
        <td class="text-right">${fmt(r.amount)}</td>
      </tr>
    </tbody>
  </table>
  <div class="totals-section"><div class="totals-box">
    <div class="totals-row grand"><span>ยอดรับทั้งสิ้น</span><span>฿${fmt(r.amount)}</span></div>
  </div></div>
  ${signatureSection("ผู้ชำระเงิน / Payer", "ผู้รับเงิน / Receiver")}`;

  return c.html(wrapHtml(`Receipt ${r.receiptNumber}`, "receipt", body));
});

export { receiptsRoute };
