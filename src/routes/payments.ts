import { Hono } from "hono";
import { db } from "../db.js";
import { payments, invoices, customers, salesOrders } from "../schema.js";
import { eq, sql, and, inArray } from "drizzle-orm";
import { generateRunningNumber } from "../utils.js";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";

const paymentsRoute = new Hono();

// Helper: คำนวณยอดจ่ายทั้งหมดของ invoice แล้ว update status
async function updateInvoicePaymentStatus(invoiceId: number) {
  const invoice = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) return;
  const allPayments = await db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).all();
  const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
  let newStatus = invoice.status;
  if (totalPaid >= invoice.totalAmount) {
    newStatus = "paid";
  } else if (totalPaid > 0) {
    newStatus = "partially_paid";
  }
  if (newStatus !== invoice.status) {
    await db.update(invoices).set({ status: newStatus, updatedAt: sql`datetime('now')` }).where(eq(invoices.id, invoiceId)).run();
  }
  return { totalPaid, invoiceTotal: invoice.totalAmount, isPaid: totalPaid >= invoice.totalAmount };
}

// GET /payments — list all with invoice/customer info
paymentsRoute.get("/", async (c) => {
  const rows = await db.select().from(payments).all();
  const result = [];
  for (const p of rows) {
    const inv = await db.select().from(invoices).where(eq(invoices.id, p.invoiceId)).get();
    let customerName = "";
    if (inv?.salesOrderId) {
      const so = await db.select().from(salesOrders).where(eq(salesOrders.id, inv.salesOrderId)).get();
      if (so) {
        const cust = await db.select().from(customers).where(eq(customers.id, so.customerId)).get();
        if (cust) customerName = cust.name;
      }
    }
    result.push({
      ...p,
      invoice_id: p.invoiceId,
      invoice_number: inv?.invoiceNumber || "",
      customer_name: customerName,
      invoice_status: inv?.status || "",
      slip_url: p.slipImage ? `/api/attachments/${p.slipImage.replace("attachments/", "")}` : null,
      created_at: p.createdAt,
    });
  }
  return c.json(result);
});

// GET /payments/:id — detail with invoice info
paymentsRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const p = await db.select().from(payments).where(eq(payments.id, id)).get();
  if (!p) return c.json({ error: "Payment not found" }, 404);
  const invoice = await db.select().from(invoices).where(eq(invoices.id, p.invoiceId)).get();
  return c.json({ ...p, invoice });
});

// POST /payments — วิธีที่ 1: เลือก Invoice → กรอกจำนวน → เคลียร์
paymentsRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.invoiceId || !body.amount) return c.json({ error: "invoiceId and amount required" }, 400);
  if (body.amount <= 0) return c.json({ error: "amount must be > 0" }, 400);

  const invoice = await db.select().from(invoices).where(eq(invoices.id, body.invoiceId)).get();
  if (!invoice) return c.json({ error: "Invoice not found" }, 404);

  // ตรวจยอดคงเหลือ
  const existingPayments = await db.select().from(payments).where(eq(payments.invoiceId, body.invoiceId)).all();
  const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = invoice.totalAmount - totalPaid;
  if (body.amount > remaining + 0.01) {
    return c.json({ error: `Amount exceeds remaining balance (${remaining.toFixed(2)})` }, 400);
  }

  const paymentNumber = await generateRunningNumber("PAY", "payments", "payment_number");
  const result = await db.insert(payments).values({
    invoiceId: body.invoiceId,
    paymentNumber,
    amount: body.amount,
    method: body.method || "transfer",
    status: "completed",
    reference: body.reference || null,
    paidAt: sql`datetime('now')`,
    slipImage: body.slipImage || null,
    paymentDate: body.paymentDate || null,
    bankName: body.bankName || null,
    payerName: body.payerName || null,
    notes: body.notes || null,
  }).run();

  const status = await updateInvoicePaymentStatus(body.invoiceId);
  return c.json({
    ok: true,
    id: Number(result.lastInsertRowid),
    paymentNumber,
    totalPaid: status?.totalPaid,
    remaining: (status?.invoiceTotal ?? 0) - (status?.totalPaid ?? 0),
    invoicePaid: status?.isPaid,
  }, 201);
});

// POST /payments/upload-slip — วิธีที่ 2: Upload สลิป/รูป → เก็บไฟล์ → return path
paymentsRoute.post("/upload-slip", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("slip") as File | null;
  const invoiceId = Number(formData.get("invoiceId"));
  const amount = Number(formData.get("amount"));

  if (!file) return c.json({ error: "slip file required" }, 400);
  if (!invoiceId || !amount || amount <= 0) return c.json({ error: "invoiceId and amount required" }, 400);

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: `Invalid file type: ${file.type}. Allowed: jpg, png, webp, pdf` }, 400);
  }

  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return c.json({ error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 10MB` }, 400);
  }

  const invoice = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) return c.json({ error: "Invoice not found" }, 404);

  // ตรวจยอดคงเหลือ
  const existingPayments = await db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).all();
  const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = invoice.totalAmount - totalPaid;
  if (amount > remaining + 0.01) {
    return c.json({ error: `Amount exceeds remaining balance (${remaining.toFixed(2)})` }, 400);
  }

  // Save file
  const allowedExts = ["jpg", "jpeg", "png", "webp", "pdf"];
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  if (!allowedExts.includes(ext)) {
    return c.json({ error: `Invalid file extension: .${ext}` }, 400);
  }
  const timestamp = Date.now();
  const filename = `slip_${invoiceId}_${timestamp}.${ext}`;
  const dir = join(process.cwd(), "data", "attachments");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, filename);
  const buffer = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(buffer));

  const slipPath = `attachments/${filename}`;
  const paymentNumber = await generateRunningNumber("PAY", "payments", "payment_number");

  const result = await db.insert(payments).values({
    invoiceId,
    paymentNumber,
    amount,
    method: (formData.get("method") as "cash" | "transfer" | "cheque") || "transfer",
    status: "completed",
    reference: (formData.get("reference") as string) || null,
    paidAt: sql`datetime('now')`,
    slipImage: slipPath,
    paymentDate: (formData.get("paymentDate") as string) || null,
    bankName: (formData.get("bankName") as string) || null,
    payerName: (formData.get("payerName") as string) || null,
    notes: (formData.get("notes") as string) || null,
  }).run();

  const status = await updateInvoicePaymentStatus(invoiceId);
  return c.json({
    ok: true,
    id: Number(result.lastInsertRowid),
    paymentNumber,
    slipImage: slipPath,
    totalPaid: status?.totalPaid,
    remaining: (status?.invoiceTotal ?? 0) - (status?.totalPaid ?? 0),
    invoicePaid: status?.isPaid,
  }, 201);
});

// POST /payments/suggest-match — วิธีที่ 3: ใส่ยอดเงิน → หา invoices ที่ยอดตรงกัน
paymentsRoute.post("/suggest-match", async (c) => {
  const body = await c.req.json();
  if (!body.amount || body.amount <= 0) return c.json({ error: "amount required and must be > 0" }, 400);
  const targetAmount = body.amount;

  // หา invoices ที่ยังไม่จ่ายครบ (draft, sent, partially_paid, overdue)
  const unpaidInvoices = await db.select().from(invoices)
    .where(sql`status IN ('draft','sent','partially_paid','overdue')`)
    .all();

  // คำนวณยอดคงเหลือแต่ละ invoice
  const invoicesWithBalance = [];
  for (const inv of unpaidInvoices) {
    const paid = await db.select().from(payments).where(eq(payments.invoiceId, inv.id)).all();
    const totalPaid = paid.reduce((sum, p) => sum + p.amount, 0);
    const remaining = inv.totalAmount - totalPaid;
    if (remaining > 0) {
      invoicesWithBalance.push({ ...inv, totalPaid, remaining: Math.round(remaining * 100) / 100 });
    }
  }

  // หา exact match — invoice เดียวที่ยอดตรง
  const exactMatches = invoicesWithBalance.filter(
    inv => Math.abs(inv.remaining - targetAmount) < 0.01
  );

  // หา combination match — หลาย invoices รวมกันตรงยอด (subset sum, จำกัด 10 ตัว)
  const combinations: typeof invoicesWithBalance[] = [];
  const sorted = [...invoicesWithBalance].sort((a, b) => a.remaining - b.remaining);
  const maxItems = Math.min(sorted.length, 10);

  // Simple greedy + exact pairs
  for (let i = 0; i < maxItems; i++) {
    for (let j = i + 1; j < maxItems; j++) {
      const sum = sorted[i].remaining + sorted[j].remaining;
      if (Math.abs(sum - targetAmount) < 0.01) {
        combinations.push([sorted[i], sorted[j]]);
      }
      // 3-invoice combo
      for (let k = j + 1; k < maxItems; k++) {
        const sum3 = sum + sorted[k].remaining;
        if (Math.abs(sum3 - targetAmount) < 0.01) {
          combinations.push([sorted[i], sorted[j], sorted[k]]);
        }
      }
    }
  }

  return c.json({
    targetAmount,
    exactMatches,
    combinations: combinations.slice(0, 5),
    allUnpaid: invoicesWithBalance,
  });
});

// POST /payments/batch — จ่ายหลาย invoices พร้อมกัน (จาก suggest-match)
paymentsRoute.post("/batch", async (c) => {
  const body = await c.req.json();
  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: "items array required: [{invoiceId, amount}]" }, 400);
  }

  // Pre-validate ทุก item ก่อนจ่าย — ถ้ามีตัวไหนเกินยอด reject ทั้ง batch
  const errors = [];
  for (const item of body.items) {
    if (!item.invoiceId || !item.amount || item.amount <= 0) {
      errors.push({ invoiceId: item.invoiceId, error: "invoiceId and amount > 0 required" });
      continue;
    }
    const inv = await db.select().from(invoices).where(eq(invoices.id, item.invoiceId)).get();
    if (!inv) { errors.push({ invoiceId: item.invoiceId, error: "Invoice not found" }); continue; }
    const existPay = await db.select().from(payments).where(eq(payments.invoiceId, item.invoiceId)).all();
    const paid = existPay.reduce((sum, p) => sum + p.amount, 0);
    const rem = inv.totalAmount - paid;
    if (item.amount > rem + 0.01) {
      errors.push({ invoiceId: item.invoiceId, error: `Amount ${item.amount} exceeds remaining ${rem.toFixed(2)}` });
    }
  }
  if (errors.length > 0) {
    return c.json({ error: "Validation failed", details: errors }, 400);
  }

  const results = [];
  for (const item of body.items) {
    if (!item.invoiceId || !item.amount || item.amount <= 0) continue;
    const invoice = await db.select().from(invoices).where(eq(invoices.id, item.invoiceId)).get();
    if (!invoice) continue;

    const paymentNumber = await generateRunningNumber("PAY", "payments", "payment_number");
    const result = await db.insert(payments).values({
      invoiceId: item.invoiceId,
      paymentNumber,
      amount: item.amount,
      method: body.method || "transfer",
      status: "completed",
      reference: body.reference || null,
      paidAt: sql`datetime('now')`,
      slipImage: body.slipImage || null,
      paymentDate: body.paymentDate || null,
      bankName: body.bankName || null,
      payerName: body.payerName || null,
      notes: body.notes || null,
    }).run();

    const status = await updateInvoicePaymentStatus(item.invoiceId);
    results.push({
      id: Number(result.lastInsertRowid),
      paymentNumber,
      invoiceId: item.invoiceId,
      amount: item.amount,
      invoicePaid: status?.isPaid,
    });
  }

  return c.json({ ok: true, payments: results }, 201);
});

export { paymentsRoute };
