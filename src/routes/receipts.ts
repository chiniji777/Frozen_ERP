import { Hono } from "hono";
import { db } from "../db.js";
import { receipts, payments, invoices, customers, salesOrders, companySettings } from "../schema.js";
import { eq } from "drizzle-orm";
import { generateRunningNumber } from "../utils.js";

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

  // ตรวจว่ายังไม่มี receipt สำหรับ payment นี้
  const existing = await db.select().from(receipts).where(eq(receipts.paymentId, body.paymentId)).get();
  if (existing) return c.json({ error: "Receipt already exists for this payment", receiptId: existing.id }, 409);

  // ถ้าไม่ระบุหัวบิล → ดึงจาก customer ของ invoice
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

// GET /receipts/:id/print — Print-ready data endpoint
receiptsRoute.get("/:id/print", async (c) => {
  const id = Number(c.req.param("id"));
  const r = await db.select().from(receipts).where(eq(receipts.id, id)).get();
  if (!r) return c.json({ error: "Receipt not found" }, 404);

  const payment = await db.select().from(payments).where(eq(payments.id, r.paymentId)).get();
  if (!payment) return c.json({ error: "Payment not found" }, 404);

  const invoice = await db.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).get();

  // ดึง customer info
  let customer = null;
  if (invoice) {
    const so = await db.select().from(salesOrders).where(eq(salesOrders.id, invoice.salesOrderId)).get();
    if (so) {
      customer = await db.select().from(customers).where(eq(customers.id, so.customerId)).get();
    }
  }

  // ดึง company settings (ข้อมูลบริษัทผู้ออกใบเสร็จ)
  const company = await db.select().from(companySettings).get();

  return c.json({
    receipt: {
      id: r.id,
      receiptNumber: r.receiptNumber,
      amount: r.amount,
      issuedAt: r.issuedAt,
      receiptCompanyName: r.receiptCompanyName,
      receiptAddress: r.receiptAddress,
      receiptTaxId: r.receiptTaxId,
    },
    payment: {
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      amount: payment.amount,
      method: payment.method,
      paidAt: payment.paidAt,
      paymentDate: payment.paymentDate,
      bankName: payment.bankName,
      payerName: payment.payerName,
      reference: payment.reference,
    },
    invoice: invoice ? {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      subtotal: invoice.subtotal,
      vatRate: invoice.vatRate,
      vatAmount: invoice.vatAmount,
      totalAmount: invoice.totalAmount,
    } : null,
    customer: customer ? {
      id: customer.id,
      name: customer.name,
      address: customer.address,
      taxId: customer.taxId,
      phone: customer.phone,
    } : null,
    issuer: company ? {
      companyName: company.companyName,
      companyNameEn: company.companyNameEn,
      address: company.address,
      taxId: company.taxId,
      phone: company.phone,
      branch: company.branch,
      logoUrl: company.logoUrl,
    } : null,
  });
});

export { receiptsRoute };
