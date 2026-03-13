import { Hono } from "hono";
import { db } from "../db.js";
import { expenses, suppliers, printLogs, recurringExpenses } from "../schema.js";
import { eq, sql, desc } from "drizzle-orm";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";
import { generateRunningNumber } from "../utils.js";
import { escapeHtml, fmt, getCompanyInfo } from "../print-utils.js";

const expensesRoute = new Hono();

const CATEGORIES_FILE = join(process.cwd(), "data", "expense-categories.json");
const ATTACHMENT_DIR = join(process.cwd(), "data", "attachments");
const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const DEFAULT_CATEGORIES = [
  "ค่าขนส่ง",
  "ค่าน้ำมัน",
  "ค่าวัตถุดิบ",
  "ค่าบรรจุภัณฑ์",
  "ค่าสาธารณูปโภค",
  "ค่าแรงงาน",
  "อื่นๆ",
];

async function loadCategories(): Promise<string[]> {
  try {
    const data = await readFile(CATEGORIES_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

async function saveCategories(cats: string[]): Promise<void> {
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  await writeFile(CATEGORIES_FILE, JSON.stringify(cats, null, 2));
}

// GET /categories — list expense categories
expensesRoute.get("/categories", async (c) => {
  return c.json(await loadCategories());
});

// PUT /categories — update expense categories
expensesRoute.put("/categories", async (c) => {
  const body = await c.req.json();
  if (!Array.isArray(body.categories)) return c.json({ error: "categories array required" }, 400);
  const cats = body.categories.filter((c: unknown) => typeof c === "string" && c.trim()).map((c: string) => c.trim());
  await saveCategories(cats);
  return c.json({ ok: true, categories: cats });
});

// GET / — list expenses (with status + month filter), join supplier payment info
expensesRoute.get("/", async (c) => {
  const category = c.req.query("category")?.trim();
  const status = c.req.query("status")?.trim();
  const from = c.req.query("from")?.trim();
  const to = c.req.query("to")?.trim();

  let rows = await db.select({
    expense: expenses,
    supplier: {
      id: suppliers.id,
      name: suppliers.name,
      bankName: suppliers.bankName,
      bankAccountNumber: suppliers.bankAccountNumber,
      bankAccountName: suppliers.bankAccountName,
      promptPayId: suppliers.promptPayId,
      taxId: suppliers.taxId,
      address: suppliers.address,
      supplierType: suppliers.supplierType,
    },
  }).from(expenses).leftJoin(suppliers, eq(expenses.supplierId, suppliers.id)).all();

  if (category) rows = rows.filter(r => r.expense.category === category);
  if (status) rows = rows.filter(r => r.expense.status === status);
  if (from) rows = rows.filter(r => r.expense.date >= from);
  if (to) rows = rows.filter(r => r.expense.date <= to);

  const now = new Date().toISOString().slice(0, 10);
  const result = rows.map(r => ({
    ...r.expense,
    displayStatus: r.expense.status === "pending" && r.expense.dueDate && r.expense.dueDate < now ? "overdue" : r.expense.status,
    supplier: r.supplier || null,
  }));

  return c.json(result);
});

// GET /:id — single expense with supplier payment info
expensesRoute.get("/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db.select({
    expense: expenses,
    supplier: {
      id: suppliers.id,
      name: suppliers.name,
      bankName: suppliers.bankName,
      bankAccountNumber: suppliers.bankAccountNumber,
      bankAccountName: suppliers.bankAccountName,
      promptPayId: suppliers.promptPayId,
      taxId: suppliers.taxId,
      address: suppliers.address,
      supplierType: suppliers.supplierType,
    },
  }).from(expenses).leftJoin(suppliers, eq(expenses.supplierId, suppliers.id)).where(eq(expenses.id, id)).get();

  if (!row) return c.json({ error: "Expense not found" }, 404);

  const now = new Date().toISOString().slice(0, 10);
  let recurringInfo: { imageUrl?: string | null; bankName?: string | null; bankAccount?: string | null; accountName?: string | null; payTo?: string | null } | null = null;
  if (row.expense.recurringExpenseId) {
    const rec = await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, row.expense.recurringExpenseId)).get();
    if (rec) {
      recurringInfo = { imageUrl: rec.imageUrl, bankName: rec.bankName, bankAccount: rec.bankAccount, accountName: rec.accountName, payTo: rec.payTo };
    }
  }
  return c.json({
    ...row.expense,
    displayStatus: row.expense.status === "pending" && row.expense.dueDate && row.expense.dueDate < now ? "overdue" : row.expense.status,
    supplier: row.supplier || null,
    recurringInfo,
  });
});

// POST / — create expense (status: pending by default)
expensesRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.category || !body.description || body.amount == null || !body.date) {
    return c.json({ error: "category, description, amount, date required" }, 400);
  }
  if (body.amount <= 0) return c.json({ error: "amount must be > 0" }, 400);
  // Auto-generate expense number: REC for recurring, EXP for regular
  const prefix = body.recurringExpenseId ? "REC" : "EXP";
  const expenseNumber = await generateRunningNumber(prefix, "expenses", "expense_number");
  const result = await db.insert(expenses).values({
    expenseNumber,
    category: body.category,
    description: body.description,
    amount: body.amount,
    date: body.date,
    dueDate: body.dueDate || null,
    paymentMethod: body.paymentMethod || null,
    recurringExpenseId: body.recurringExpenseId || null,
    supplierId: body.supplierId || null,
    hasWithholdingTax: body.hasWithholdingTax ? 1 : 0,
    whtFormType: body.whtFormType || null,
    whtIncomeType: body.whtIncomeType || null,
    whtIncomeDescription: body.whtIncomeDescription || null,
    whtRate: body.whtRate ?? null,
    whtAmount: body.whtAmount ?? null,
    whtNetAmount: body.whtNetAmount ?? null,
    whtDocNumber: body.hasWithholdingTax ? (body.whtDocNumber || await generateRunningNumber("WT", "expenses", "wht_doc_number")) : null,
    slipImage: body.slipImage || null,
    notes: body.notes || null,
    status: body.status || "pending",
  }).run();
  return c.json({ ok: true, id: Number(result.lastInsertRowid), expenseNumber }, 201);
});

// PUT /:id — update expense
expensesRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!existing) return c.json({ error: "Expense not found" }, 404);
  const body = await c.req.json();
  await db.update(expenses).set({
    category: body.category ?? existing.category,
    description: body.description ?? existing.description,
    amount: body.amount ?? existing.amount,
    date: body.date ?? existing.date,
    dueDate: body.dueDate !== undefined ? body.dueDate : existing.dueDate,
    paymentMethod: body.paymentMethod !== undefined ? body.paymentMethod : existing.paymentMethod,
    supplierId: body.supplierId !== undefined ? body.supplierId : existing.supplierId,
    hasWithholdingTax: body.hasWithholdingTax !== undefined ? (body.hasWithholdingTax ? 1 : 0) : existing.hasWithholdingTax,
    whtFormType: body.whtFormType !== undefined ? body.whtFormType : existing.whtFormType,
    whtIncomeType: body.whtIncomeType !== undefined ? body.whtIncomeType : existing.whtIncomeType,
    whtIncomeDescription: body.whtIncomeDescription !== undefined ? body.whtIncomeDescription : existing.whtIncomeDescription,
    whtRate: body.whtRate !== undefined ? body.whtRate : existing.whtRate,
    whtAmount: body.whtAmount !== undefined ? body.whtAmount : existing.whtAmount,
    whtNetAmount: body.whtNetAmount !== undefined ? body.whtNetAmount : existing.whtNetAmount,
    whtDocNumber: body.whtDocNumber !== undefined ? body.whtDocNumber : existing.whtDocNumber,
    slipImage: body.slipImage !== undefined ? body.slipImage : existing.slipImage,
    notes: body.notes ?? existing.notes,
    updatedAt: sql`datetime('now')`,
  }).where(eq(expenses.id, id)).run();
  return c.json({ ok: true });
});

// PATCH /:id/pay — mark expense as paid
expensesRoute.patch("/:id/pay", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!existing) return c.json({ error: "Expense not found" }, 404);
  if (existing.status === "paid") return c.json({ error: "Already paid" }, 400);
  if (existing.status === "cancelled") return c.json({ error: "Cannot pay cancelled expense" }, 400);

  const body = await c.req.json().catch(() => ({}));
  const paidAt = body.paidAt || new Date().toISOString();

  await db.update(expenses).set({
    status: "paid",
    paidAt,
    slipImage: body.slipImage !== undefined ? body.slipImage : existing.slipImage,
    paymentMethod: body.paymentMethod !== undefined ? body.paymentMethod : existing.paymentMethod,
    updatedAt: sql`datetime('now')`,
  }).where(eq(expenses.id, id)).run();

  return c.json({ ok: true, status: "paid", paidAt });
});

// PATCH /:id/cancel — cancel expense (no delete)
expensesRoute.patch("/:id/cancel", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user") as { userId?: number } | undefined;
  const existing = await db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!existing) return c.json({ error: "Expense not found" }, 404);
  if (existing.status === "cancelled") return c.json({ error: "Already cancelled" }, 400);

  await db.update(expenses).set({
    status: "cancelled",
    cancelledAt: sql`datetime('now')`,
    cancelledBy: user?.userId ?? null,
    updatedAt: sql`datetime('now')`,
  }).where(eq(expenses.id, id)).run();

  return c.json({ ok: true, status: "cancelled" });
});

// PUT /:id/cancel — cancel expense (PUT alias for frontend compat)
expensesRoute.put("/:id/cancel", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user") as { userId?: number } | undefined;
  const existing = await db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!existing) return c.json({ error: "Expense not found" }, 404);
  if (existing.status === "cancelled") return c.json({ error: "Already cancelled" }, 400);

  await db.update(expenses).set({
    status: "cancelled",
    cancelledAt: sql`datetime('now')`,
    cancelledBy: user?.userId ?? null,
    updatedAt: sql`datetime('now')`,
  }).where(eq(expenses.id, id)).run();

  return c.json({ ok: true, status: "cancelled" });
});

// POST /upload-slip — upload expense slip image
expensesRoute.post("/upload-slip", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("slip") as File | null;
  if (!file) return c.json({ error: "slip file required" }, 400);
  if (!ALLOWED_MIME.has(file.type)) return c.json({ error: `Invalid type: ${file.type}` }, 400);
  if (file.size > MAX_FILE_SIZE) return c.json({ error: "Max 10MB" }, 400);

  let ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) ext = "jpg";
  const filename = `expense_slip_${Date.now()}.${ext}`;
  await mkdir(ATTACHMENT_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(ATTACHMENT_DIR, filename), buffer);

  return c.json({ ok: true, slipImage: `attachments/${filename}` });
});

// GET /slip/:filename — serve slip image
expensesRoute.get("/slip/:filename", async (c) => {
  const rawFilename = c.req.param("filename");
  const filename = basename(rawFilename).replace(/\0/g, "");
  if (filename !== rawFilename) return c.json({ error: "Invalid filename" }, 400);
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTS.has(ext)) return c.json({ error: "Invalid file type" }, 400);
  try {
    const data = await readFile(join(ATTACHMENT_DIR, filename));
    const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
    return new Response(data, { headers: { "Content-Type": mimeMap[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" } });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

// GET /:id/print-wht — print withholding tax certificate (ภ.ง.ด. 3/53)
expensesRoute.get("/:id/print-wht", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db.select({
    expense: expenses,
    supplier: {
      id: suppliers.id, name: suppliers.name, fullName: suppliers.fullName,
      taxId: suppliers.taxId, address: suppliers.address, supplierType: suppliers.supplierType,
    },
  }).from(expenses).leftJoin(suppliers, eq(expenses.supplierId, suppliers.id)).where(eq(expenses.id, id)).get();

  if (!row) return c.json({ error: "Expense not found" }, 404);
  const exp = row.expense;
  if (!exp.hasWithholdingTax) return c.json({ error: "This expense has no withholding tax" }, 400);

  const company = await getCompanyInfo();
  const sup = row.supplier;
  const isPnd3 = exp.whtFormType === "pnd3";
  const formTitle = isPnd3 ? "ภ.ง.ด. 3" : "ภ.ง.ด. 53";
  const formSubtitle = isPnd3 ? "หนังสือรับรองการหักภาษี ณ ที่จ่าย (บุคคลธรรมดา)" : "หนังสือรับรองการหักภาษี ณ ที่จ่าย (นิติบุคคล)";

  // Thai date
  const thaiMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const d = new Date(exp.date);
  const thaiDate = `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;

  // Income type description
  const incomeDesc = escapeHtml(exp.whtIncomeDescription || exp.whtIncomeType || "-");

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>${formTitle} - ${escapeHtml(exp.whtDocNumber || "")}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 10mm 12mm; }
  body { font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; font-size: 13px; color: #000; line-height: 1.6; }
  .page { max-width: 210mm; margin: 0 auto; padding: 15px; }
  .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; }
  .header h1 { font-size: 18px; font-weight: bold; }
  .header h2 { font-size: 14px; font-weight: normal; color: #333; }
  .header .doc-no { font-size: 12px; margin-top: 5px; color: #555; }
  .section { margin-bottom: 12px; }
  .section-title { font-size: 12px; font-weight: bold; background: #f0f0f0; padding: 4px 8px; margin-bottom: 8px; border-left: 3px solid #333; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .info-box { border: 1px solid #ddd; border-radius: 4px; padding: 10px; }
  .info-box h4 { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
  .info-box .name { font-size: 14px; font-weight: bold; }
  .info-box p { font-size: 11px; color: #444; }
  table.wht-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  table.wht-table th, table.wht-table td { border: 1px solid #999; padding: 6px 10px; font-size: 12px; }
  table.wht-table th { background: #e8e8e8; font-weight: bold; text-align: center; font-size: 11px; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .summary { margin-top: 15px; border: 2px solid #333; border-radius: 6px; padding: 15px; }
  .summary-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
  .summary-row.total { font-size: 16px; font-weight: bold; border-top: 1px solid #ccc; padding-top: 8px; margin-top: 5px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 40px; text-align: center; }
  .sig-box { padding-top: 50px; border-top: 1px dotted #999; font-size: 11px; }
  .checkbox { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #333; margin-right: 5px; vertical-align: middle; text-align: center; font-size: 11px; line-height: 14px; }
  .checkbox.checked::after { content: "✓"; font-weight: bold; }
  .form-type { margin: 8px 0; font-size: 12px; }
  .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 8px; }
  @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>${formTitle}</h1>
    <h2>${formSubtitle}</h2>
    <div class="doc-no">เลขที่ ${escapeHtml(exp.whtDocNumber || "-")} &nbsp;&nbsp; วันที่ ${thaiDate}</div>
  </div>

  <div class="form-type">
    <span class="checkbox ${isPnd3 ? "checked" : ""}"></span> ภ.ง.ด. 3 (บุคคลธรรมดา)
    &nbsp;&nbsp;&nbsp;
    <span class="checkbox ${!isPnd3 ? "checked" : ""}"></span> ภ.ง.ด. 53 (นิติบุคคล)
  </div>

  <div class="section">
    <div class="info-grid">
      <div class="info-box">
        <h4>ผู้จ่ายเงิน (ผู้หักภาษี ณ ที่จ่าย)</h4>
        <p class="name">${escapeHtml(company.companyName)}</p>
        <p>${escapeHtml(company.address)}</p>
        <p>เลขประจำตัวผู้เสียภาษี: <strong>${escapeHtml(company.taxId || "-")}</strong></p>
        <p>สาขา: ${escapeHtml(company.branch)}</p>
      </div>
      <div class="info-box">
        <h4>ผู้รับเงิน (ผู้ถูกหักภาษี ณ ที่จ่าย)</h4>
        <p class="name">${escapeHtml(sup?.fullName || sup?.name || "-")}</p>
        <p>${escapeHtml(sup?.address || "-")}</p>
        <p>เลขประจำตัวผู้เสียภาษี: <strong>${escapeHtml(sup?.taxId || "-")}</strong></p>
        <p>ประเภท: ${escapeHtml(sup?.supplierType === "Individual" ? "บุคคลธรรมดา" : "นิติบุคคล")}</p>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">รายละเอียดการจ่ายเงิน</div>
    <table class="wht-table">
      <thead>
        <tr>
          <th style="width:40%">ประเภทเงินได้ที่จ่าย</th>
          <th style="width:15%">มาตรา</th>
          <th style="width:15%">จำนวนเงินที่จ่าย</th>
          <th style="width:15%">อัตราภาษี</th>
          <th style="width:15%">ภาษีที่หักไว้</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${incomeDesc}</td>
          <td class="text-center">${escapeHtml(exp.whtIncomeDescription?.match(/\d+\([^)]*\)(\([^)]*\))?/)?.[0] || "-")}</td>
          <td class="text-right">${fmt(exp.amount)}</td>
          <td class="text-center">${exp.whtRate || 0}%</td>
          <td class="text-right">${fmt(exp.whtAmount)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="summary">
    <div class="summary-row"><span>ยอดเงินที่จ่ายทั้งสิ้น</span><span>${fmt(exp.amount)} บาท</span></div>
    <div class="summary-row"><span>ภาษีที่หัก ณ ที่จ่าย (${exp.whtRate || 0}%)</span><span style="color:red">${fmt(exp.whtAmount)} บาท</span></div>
    <div class="summary-row total"><span>ยอดจ่ายจริง (สุทธิ)</span><span style="color:green">${fmt(exp.whtNetAmount)} บาท</span></div>
  </div>

  <div class="signatures">
    <div>
      <div class="sig-box">ผู้จ่ายเงิน (ลงชื่อ)</div>
      <p style="margin-top:5px;font-size:11px">${escapeHtml(company.companyName)}</p>
      <p style="font-size:10px;color:#666">วันที่ ${thaiDate}</p>
    </div>
    <div>
      <div class="sig-box">ผู้รับเงิน (ลงชื่อ)</div>
      <p style="margin-top:5px;font-size:11px">${escapeHtml(sup?.fullName || sup?.name || "-")}</p>
      <p style="font-size:10px;color:#666">วันที่ ....../....../......</p>
    </div>
  </div>

  <div class="footer">
    เอกสารนี้ออกโดยระบบ Nut Office ERP &mdash; ${formTitle} เลขที่ ${escapeHtml(exp.whtDocNumber || "-")}
  </div>
</div>
<script>window.onload=()=>window.print()</script>
</body>
</html>`;

  // Log the print
  await db.insert(printLogs).values({
    docType: "wht",
    refId: id,
    refNumber: exp.whtDocNumber || exp.expenseNumber || `EXP-${id}`,
    description: `ใบหัก ณ ที่จ่าย ${formTitle} — ${escapeHtml(exp.description)}`,
    printedBy: null,
  }).run();

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
});

// GET /:id/print-logs — get print history for an expense
expensesRoute.get("/:id/print-logs", async (c) => {
  const id = Number(c.req.param("id"));
  const logs = await db.select().from(printLogs)
    .where(eq(printLogs.refId, id))
    .orderBy(desc(printLogs.printedAt))
    .all();
  return c.json(logs);
});

// GET /print-logs/all — get all print logs (for summary page)
expensesRoute.get("/print-logs/all", async (c) => {
  const month = c.req.query("month");
  let logs = await db.select().from(printLogs).orderBy(desc(printLogs.printedAt)).all();
  if (month) {
    logs = logs.filter(l => l.printedAt.startsWith(month));
  }
  return c.json(logs);
});

export { expensesRoute };
