import { Hono } from "hono";
import { db } from "../db.js";
import { payments, invoices, customers, salesOrders } from "../schema.js";
import { eq, sql, like, or } from "drizzle-orm";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import Tesseract from "tesseract.js";

const ocrSlipRoute = new Hono();

// Helper: get unpaid invoices with balance + customer info
async function getUnpaidInvoicesWithBalance() {
  const unpaid = await db.select().from(invoices)
    .where(sql`status IN ('draft','sent','partially_paid','overdue')`)
    .all();
  const result = [];
  for (const inv of unpaid) {
    const paid = await db.select().from(payments).where(eq(payments.invoiceId, inv.id)).all();
    const totalPaid = paid.reduce((sum, p) => sum + p.amount, 0);
    const remaining = inv.totalAmount - totalPaid;
    if (remaining > 0) {
      const so = await db.select().from(salesOrders).where(eq(salesOrders.id, inv.salesOrderId)).get();
      const cust = so ? await db.select().from(customers).where(eq(customers.id, so.customerId)).get() : null;
      result.push({
        ...inv, totalPaid, remaining: Math.round(remaining * 100) / 100,
        customerName: cust?.name || cust?.fullName || "",
        customerId: cust?.id || null,
      });
    }
  }
  return result;
}

// Helper: find invoice combinations that sum to target amount
function findCombinations(items: { remaining: number; [k: string]: unknown }[], target: number, maxItems = 10) {
  const sorted = [...items].sort((a, b) => a.remaining - b.remaining).slice(0, maxItems);
  const combos: typeof items[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (Math.abs(sorted[i].remaining - target) < 0.01) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      if (Math.abs(sorted[i].remaining + sorted[j].remaining - target) < 0.01) {
        combos.push([sorted[i], sorted[j]]);
      }
      for (let k = j + 1; k < sorted.length; k++) {
        if (Math.abs(sorted[i].remaining + sorted[j].remaining + sorted[k].remaining - target) < 0.01) {
          combos.push([sorted[i], sorted[j], sorted[k]]);
        }
      }
    }
  }
  return combos.slice(0, 5);
}

// OCR: extract amount, date, payer from slip text
function parseSlipText(text: string) {
  // Amount
  const amountPatterns = [
    /(?:จำนวน|amount|ยอด|โอน|transfer|baht|บาท)[^\d]*?([\d,]+\.?\d{0,2})/i,
    /([\d,]+\.?\d{2})\s*(?:บาท|baht|thb)/i,
    /(?:฿|THB)\s*([\d,]+\.?\d{0,2})/i,
  ];
  let amount: number | null = null;
  for (const pat of amountPatterns) {
    const m = text.match(pat);
    if (m) { amount = parseFloat(m[1].replace(/,/g, "")); if (amount > 0) break; }
  }
  if (!amount) {
    const nums = [...text.matchAll(/([\d,]+\.\d{2})/g)]
      .map(m => parseFloat(m[1].replace(/,/g, "")))
      .filter(n => n > 0).sort((a, b) => b - a);
    if (nums.length > 0) amount = nums[0];
  }

  // Date
  const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/) ||
                    text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  const date = dateMatch ? dateMatch[0] : null;

  // Payer
  const payerMatch = text.match(/(?:จาก|from|ชื่อ|name)[:\s]*(.+)/i);
  const payer = payerMatch ? payerMatch[1].trim().slice(0, 100) : null;

  // Bank
  const banks = ["กสิกร", "ไทยพาณิชย์", "กรุงเทพ", "กรุงไทย", "ทหารไทย", "ออมสิน", "ธนชาต", "KBANK", "SCB", "BBL", "KTB", "TMB", "TTB", "BAY", "GSB"];
  let bankName: string | null = null;
  for (const b of banks) { if (text.toUpperCase().includes(b.toUpperCase())) { bankName = b; break; } }

  return { amount, date, payer, bankName };
}

// POST /ocr — upload slip → OCR → auto-match invoices
ocrSlipRoute.post("/ocr", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("slip") as File | null;
  if (!file) return c.json({ error: "slip file required" }, 400);

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) return c.json({ error: `Invalid type: ${file.type}` }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: "Max 10MB" }, 400);

  // Save file
  const allowedExts = ["jpg", "jpeg", "png", "webp"];
  let ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  if (!allowedExts.includes(ext)) ext = "jpg";
  const filename = `slip_ocr_${Date.now()}.${ext}`;
  const dir = join(process.cwd(), "data", "attachments");
  await mkdir(dir, { recursive: true });
  const buffer = await file.arrayBuffer();
  await writeFile(join(dir, filename), Buffer.from(buffer));
  const slipPath = `attachments/${filename}`;

  // OCR
  let ocrText = "";
  try {
    const result = await Tesseract.recognize(Buffer.from(buffer), "tha+eng");
    ocrText = result.data.text;
  } catch {
    return c.json({ error: "OCR failed", slipImage: slipPath }, 500);
  }

  const parsed = parseSlipText(ocrText);
  if (!parsed.amount || parsed.amount <= 0) {
    return c.json({ error: "ไม่สามารถอ่านยอดเงินจากสลิปได้", ocrText, parsed, slipImage: slipPath }, 422);
  }

  const allUnpaid = await getUnpaidInvoicesWithBalance();
  const exactMatches = allUnpaid.filter(inv => Math.abs(inv.remaining - parsed.amount!) < 0.01);

  // Match by payer name
  let customerMatches: typeof allUnpaid = [];
  if (parsed.payer && exactMatches.length === 0) {
    const escapedPayer = parsed.payer.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const pattern = `%${escapedPayer}%`;
    const matched = await db.select().from(customers)
      .where(or(like(customers.name, pattern), like(customers.fullName, pattern), like(customers.nickName, pattern)))
      .all();
    const custIds = matched.map(cu => cu.id);
    if (custIds.length > 0) customerMatches = allUnpaid.filter(inv => inv.customerId && custIds.includes(inv.customerId));
  }

  const comboSource = customerMatches.length > 0 ? customerMatches : allUnpaid;
  const combinations = findCombinations(comboSource, parsed.amount!);

  return c.json({
    ocrText, parsed, slipImage: slipPath,
    matches: { exactMatches, customerMatches: customerMatches.length > 0 ? customerMatches : undefined, combinations },
  });
});

// POST /match-amount — match by amount + optional customerId
ocrSlipRoute.post("/match-amount", async (c) => {
  const body = await c.req.json() as { amount?: number; customerId?: number };
  if (!body.amount || body.amount <= 0) return c.json({ error: "amount required and must be > 0" }, 400);

  const allUnpaid = await getUnpaidInvoicesWithBalance();
  const pool = body.customerId ? allUnpaid.filter(inv => inv.customerId === body.customerId) : allUnpaid;

  const exactMatches = pool.filter(inv => Math.abs(inv.remaining - body.amount!) < 0.01);
  const combinations = findCombinations(pool, body.amount!);

  const closest = [...pool]
    .map(inv => ({ ...inv, diff: Math.abs(inv.remaining - body.amount!) }))
    .sort((a, b) => a.diff - b.diff)
    .filter(inv => inv.diff / body.amount! < 0.1)
    .slice(0, 3);

  return c.json({
    targetAmount: body.amount,
    customerId: body.customerId || null,
    exactMatches,
    combinations,
    closest: exactMatches.length === 0 ? closest : undefined,
  });
});

export { ocrSlipRoute };
