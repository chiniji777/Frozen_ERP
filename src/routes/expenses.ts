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

  // Tax ID as individual digits for box display
  const companyTaxDigits = (company.taxId || "").replace(/[^0-9]/g, "").padEnd(13, " ").split("");
  const monthIndex = d.getMonth(); // 0-11
  const thaiYear = d.getFullYear() + 543;

  // WHT income type mapping to มาตรา sections
  const incomeTypeMap: Record<string, { section: string; desc: string }> = {
    rent_property: { section: "40(5)(ก)", desc: "ค่าเช่าอสังหาริมทรัพย์" },
    service: { section: "40(8)", desc: "ค่าบริการ / จ้างทำของ" },
    transport: { section: "40(8)", desc: "ค่าขนส่ง" },
    advertising: { section: "40(8)", desc: "ค่าโฆษณา" },
    contractor: { section: "40(7)(8)", desc: "ค่ารับเหมา" },
    professional: { section: "40(6)", desc: "ค่าวิชาชีพอิสระ" },
    prize: { section: "40(8)", desc: "รางวัล/ส่วนลด" },
  };
  const incomeInfo = incomeTypeMap[exp.whtIncomeType || ""] || { section: "-", desc: incomeDesc };

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>${formTitle} - ${escapeHtml(exp.whtDocNumber || "")}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 8mm 10mm; }
  body { font-family: 'Sarabun', 'Noto Sans Thai', 'TH SarabunPSK', sans-serif; font-size: 14px; color: #000; line-height: 1.5; }
  .page { max-width: 210mm; margin: 0 auto; padding: 10px; border: 2px solid #4a7c59; }
  .header { text-align: center; margin-bottom: 10px; }
  .header .form-name { font-size: 28px; font-weight: bold; color: #4a7c59; float: right; margin-top: -5px; }
  .header .title { font-size: 14px; font-weight: bold; }
  .header .subtitle { font-size: 12px; color: #333; }
  .taxid-row { margin: 8px 0; }
  .taxid-label { font-size: 12px; font-weight: bold; }
  .taxid-box { display: inline-block; width: 20px; height: 22px; border: 1px solid #000; text-align: center; font-size: 14px; font-weight: bold; line-height: 22px; margin: 0 1px; }
  .taxid-dash { display: inline-block; width: 8px; text-align: center; font-size: 14px; }
  .branch-box { display: inline-block; width: 20px; height: 22px; border: 1px solid #000; text-align: center; font-size: 12px; line-height: 22px; margin: 0 1px; }
  .info-section { margin: 6px 0; font-size: 13px; }
  .info-section .label { font-weight: bold; }
  .dotted-line { border-bottom: 1px dotted #000; display: inline-block; min-width: 200px; padding: 0 5px; }
  .dotted-line-short { border-bottom: 1px dotted #000; display: inline-block; min-width: 80px; padding: 0 5px; }
  .checkbox-section { margin: 8px 0; padding: 6px 0; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; }
  .cb { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #000; vertical-align: middle; text-align: center; font-size: 12px; line-height: 16px; margin-right: 3px; }
  .cb.checked { background: #e8f5e9; }
  .cb.checked::after { content: "✓"; font-weight: bold; color: #2e7d32; }
  .right-section { float: right; margin-top: -80px; }
  .month-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px 15px; font-size: 12px; margin: 5px 0; }
  .month-item { display: flex; align-items: center; gap: 3px; }
  .tax-law { font-size: 12px; margin: 4px 0; }
  .summary-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  .summary-table td { border: 1px solid #000; padding: 5px 10px; font-size: 13px; }
  .summary-table .label-col { width: 70%; }
  .summary-table .amount-col { width: 30%; text-align: right; font-weight: bold; }
  .summary-header { background: #e8e8e8; font-weight: bold; text-align: center; }
  .detail-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .detail-table th, .detail-table td { border: 1px solid #000; padding: 4px 8px; font-size: 12px; }
  .detail-table th { background: #f0f0f0; font-weight: bold; text-align: center; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .signature-section { margin-top: 15px; text-align: center; font-size: 13px; }
  .sig-line { margin-top: 40px; }
  .sig-dotted { border-bottom: 1px dotted #000; display: inline-block; width: 250px; }
  .stamp-box { float: right; width: 100px; height: 80px; border: 1px solid #999; text-align: center; font-size: 10px; color: #999; line-height: 80px; margin-top: -60px; }
  .footer { margin-top: 10px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 5px; }
  .clearfix::after { content: ""; display: table; clear: both; }
  @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header clearfix">
    <div style="text-align:center">
      <div class="title">แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย</div>
      <div class="subtitle">ตามมาตรา 3 เตรส และมาตรา 69 ทวิ</div>
      <div class="subtitle">และการเสียภาษีตามมาตรา 65 จัตวา แห่งประมวลรัษฎากร</div>
    </div>
    <div class="form-name">${formTitle}</div>
  </div>

  <!-- Tax ID -->
  <div class="taxid-row">
    <span class="taxid-label">เลขประจำตัวผู้เสียภาษีอากร (ของผู้มีหน้าที่หักภาษี ณ ที่จ่าย)</span><br>
    ${companyTaxDigits.map((d, i) => `<span class="taxid-box">${d.trim() ? d : "&nbsp;"}</span>${i === 0 || i === 4 || i === 9 || i === 11 ? '<span class="taxid-dash">-</span>' : ""}`).join("")}
    &nbsp;&nbsp; สาขาที่ <span class="branch-box">0</span><span class="branch-box">0</span><span class="branch-box">0</span><span class="branch-box">0</span>
  </div>

  <!-- Company Info -->
  <div class="info-section">
    <span class="label">ชื่อผู้มีหน้าที่หักภาษี ณ ที่จ่าย (หน่วยงาน) :</span>
    <span class="dotted-line" style="min-width:350px">${escapeHtml(company.companyName)}</span>
  </div>
  <div class="info-section">
    <span class="label">ที่อยู่ :</span>
    <span class="dotted-line" style="min-width:500px">${escapeHtml(company.address)}</span>
  </div>

  <!-- Tax Law Section (right side) + Filing Type -->
  <div class="checkbox-section clearfix">
    <div style="float:right; font-size:12px; width:45%;">
      <div class="tax-law"><span class="cb checked"></span> นำส่งภาษีตาม</div>
      <div class="tax-law" style="margin-left:20px"><span class="cb checked"></span> (1) มาตรา 3 เตรส แห่งประมวลรัษฎากร</div>
      <div class="tax-law" style="margin-left:20px"><span class="cb"></span> (2) มาตรา 65 จัตวา แห่งประมวลรัษฎากร</div>
      <div class="tax-law" style="margin-left:20px"><span class="cb"></span> (3) มาตรา 69 ทวิ แห่งประมวลรัษฎากร</div>
      <div style="margin-top:5px">
        <span class="cb checked"></span> ยื่นปกติ &nbsp;&nbsp;
        <span class="cb"></span> ยื่นเพิ่มเติมครั้งที่ ......
      </div>
    </div>
    <div style="width:50%;">
      <div style="font-size:12px; margin-bottom:3px;">
        <strong>เดือนที่จ่ายเงินได้พึงประเมิน</strong> (ให้ทำเครื่องหมาย "✓" ลงใน "☐" หน้าชื่อเดือน) พ.ศ. <strong>${thaiYear}</strong>
      </div>
      <div class="month-grid">
        ${thaiMonths.map((m, i) => `<div class="month-item"><span class="cb${i === monthIndex ? " checked" : ""}"></span> (${i + 1}) ${m}</div>`).join("\n        ")}
      </div>
    </div>
  </div>

  <!-- ใบแนบ reference -->
  <div style="margin:8px 0; font-size:12px; padding:5px; border:1px solid #ddd; background:#fafafa;">
    <span class="cb checked"></span> <strong>ใบแนบ ${formTitle}</strong> ที่แนบมาพร้อมนี้ : จำนวน <strong>1</strong> ราย จำนวน <strong>1</strong> แผ่น
  </div>

  <!-- Detail Table (ใบแนบ inline) -->
  <div style="margin:8px 0;">
    <div style="font-size:12px; font-weight:bold; margin-bottom:4px; background:#e8e8e8; padding:3px 8px; border:1px solid #000; border-bottom:none;">
      รายละเอียดการหักเป็นรายผู้มีเงินได้ (ใบแนบ ${formTitle})
    </div>
    <table class="detail-table">
      <thead>
        <tr>
          <th style="width:5%">ลำดับ</th>
          <th style="width:15%">เลขประจำตัวผู้เสียภาษี</th>
          <th style="width:25%">ชื่อผู้มีเงินได้</th>
          <th style="width:15%">ที่อยู่</th>
          <th style="width:10%">วันเดือนปีที่จ่าย</th>
          <th style="width:10%">ประเภทเงินได้</th>
          <th style="width:10%">จำนวนเงินที่จ่าย</th>
          <th style="width:10%">จำนวนเงินภาษีที่หัก</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="text-center">1</td>
          <td class="text-center">${escapeHtml(sup?.taxId || "-")}</td>
          <td>${escapeHtml(sup?.fullName || sup?.name || "-")}</td>
          <td style="font-size:11px">${escapeHtml(sup?.address || "-")}</td>
          <td class="text-center">${thaiDate}</td>
          <td class="text-center" style="font-size:11px">${escapeHtml(incomeInfo.desc)}<br><small>มาตรา ${escapeHtml(incomeInfo.section)}</small></td>
          <td class="text-right">${fmt(exp.amount)}</td>
          <td class="text-right">${fmt(exp.whtAmount)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Summary Table -->
  <div style="margin:10px 0;">
    <table class="summary-table">
      <tr><td class="summary-header" colspan="2">สรุปรายการภาษีที่นำส่ง</td><td class="summary-header">จำนวนเงิน</td></tr>
      <tr><td class="label-col" colspan="2">1. รวมยอดเงินได้ทั้งสิ้น</td><td class="amount-col">${fmt(exp.amount)}</td></tr>
      <tr><td class="label-col" colspan="2">2. รวมยอดภาษีที่นำส่งทั้งสิ้น</td><td class="amount-col">${fmt(exp.whtAmount)}</td></tr>
      <tr><td class="label-col" colspan="2">3. เงินเพิ่ม (ถ้ามี)</td><td class="amount-col">-</td></tr>
      <tr><td class="label-col" colspan="2"><strong>4. รวมยอดภาษีที่นำส่งทั้งสิ้น และเงินเพิ่ม (2. + 3.)</strong></td><td class="amount-col"><strong>${fmt(exp.whtAmount)}</strong></td></tr>
    </table>
  </div>

  <!-- Signature -->
  <div class="signature-section">
    <p>ข้าพเจ้าขอรับรองว่า รายการที่แจ้งไว้ข้างต้นนี้ เป็นรายการที่ถูกต้องและครบถ้วนทุกประการ</p>
    <div class="sig-line">
      ลงชื่อ <span class="sig-dotted"></span> ผู้จ่ายเงิน
      <div class="stamp-box">ประทับตรา<br>นิติบุคคล<br>(ถ้ามี)</div>
    </div>
    <div style="margin-top:5px">( <span class="sig-dotted"></span> )</div>
    <div style="margin-top:5px">ตำแหน่ง <span class="sig-dotted"></span></div>
    <div style="margin-top:5px">ยื่นวันที่ ${d.getDate()} เดือน ${thaiMonths[d.getMonth()]} พ.ศ. ${thaiYear}</div>
  </div>

  <div class="footer">
    เลขที่เอกสาร: ${escapeHtml(exp.whtDocNumber || "-")} | ${escapeHtml(company.companyName)} | ออกโดยระบบ Frozen ERP
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
