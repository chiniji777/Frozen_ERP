import { Hono } from "hono";
import { db } from "../db.js";
import { expenses, suppliers, printLogs, recurringExpenses } from "../schema.js";
import { eq, sql, desc, and } from "drizzle-orm";
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
    rawMaterialId: body.rawMaterialId || null,
    productId: body.productId || null,
    itemType: body.itemType || null,
    itemQty: body.itemQty ?? null,
    itemPricePerUnit: body.itemPricePerUnit ?? null,
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
    rawMaterialId: body.rawMaterialId !== undefined ? body.rawMaterialId : existing.rawMaterialId,
    productId: body.productId !== undefined ? body.productId : existing.productId,
    itemType: body.itemType !== undefined ? body.itemType : existing.itemType,
    itemQty: body.itemQty !== undefined ? body.itemQty : existing.itemQty,
    itemPricePerUnit: body.itemPricePerUnit !== undefined ? body.itemPricePerUnit : existing.itemPricePerUnit,
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
  const d = new Date(exp.date); // วันที่รายการ (ใช้ในตาราง detail)
  const thaiDate = `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
  // วันที่จ่ายเงิน (ใช้สำหรับ "ยื่นวันที่" + เดือนที่จ่ายเงินได้พึงประเมิน)
  const paidDate = exp.paidAt ? new Date(exp.paidAt) : d;

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

  // Income type: ลอง map จาก code ก่อน → fallback whtIncomeDescription → ใช้ description ของ expense
  const mappedIncome = incomeTypeMap[exp.whtIncomeType || ""];
  let incomeInfo: { section: string; desc: string };
  if (mappedIncome) {
    incomeInfo = mappedIncome;
  } else if (exp.whtIncomeDescription) {
    // whtIncomeDescription อาจมีรูปแบบ "ค่าบริการ / จ้างทำของ 40(8)" — ลอง parse section
    const sectionMatch = exp.whtIncomeDescription.match(/(\d+\([^)]+\)(?:\([^)]+\))?)/);
    incomeInfo = { section: sectionMatch ? sectionMatch[1] : "-", desc: escapeHtml(exp.whtIncomeDescription) };
  } else {
    // fallback ใช้ description ของ expense เอง
    incomeInfo = { section: "-", desc: escapeHtml(exp.description || "-") };
  }

  // Tax ID as individual digits for box display
  const companyTaxDigits = (company.taxId || "").replace(/[^0-9]/g, "").padEnd(13, " ").split("");
  const monthIndex = paidDate.getMonth(); // 0-11 ใช้เดือนที่จ่ายเงิน
  const thaiYear = paidDate.getFullYear() + 543;

  // Supplier tax ID digits for box display
  const supplierTaxDigits = (sup?.taxId || "").replace(/[^0-9]/g, "").padEnd(13, " ").split("");

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>${formTitle} - ${escapeHtml(exp.whtDocNumber || "")}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 10mm 12mm; }
  body { font-family: 'TH SarabunPSK', 'Sarabun', 'Noto Sans Thai', sans-serif; font-size: 15px; color: #000; line-height: 1.4; }
  .page { max-width: 210mm; margin: 0 auto; padding: 12px 16px; }

  /* Header */
  .header { position: relative; text-align: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid #2d8a6e; }
  .header .form-name { position: absolute; right: 0; top: 0; font-size: 36px; font-weight: bold; color: #2d8a6e; }
  .header .title { font-size: 16px; font-weight: bold; margin-top: 4px; }
  .header .subtitle { font-size: 13px; color: #333; }

  /* Tax ID boxes */
  .taxid-section { margin: 6px 0; }
  .taxid-label { font-size: 13px; font-weight: bold; }
  .tid-box { display: inline-block; width: 20px; height: 22px; border: 1.5px solid #2d8a6e; text-align: center; font-size: 15px; font-weight: bold; line-height: 22px; margin: 0 0.5px; background: #f0faf6; }
  .tid-dash { display: inline-block; width: 6px; text-align: center; font-size: 14px; font-weight: bold; }
  .branch-box { display: inline-block; width: 20px; height: 22px; border: 1.5px solid #2d8a6e; text-align: center; font-size: 14px; line-height: 22px; margin: 0 0.5px; background: #f0faf6; }

  /* Two-column layout */
  .two-col { display: flex; gap: 12px; margin: 8px 0; }
  .col-left { flex: 1; }
  .col-right { width: 320px; }

  /* Info fields */
  .info-row { margin: 4px 0; font-size: 13px; }
  .info-row .label { font-weight: bold; }
  .dotted { border-bottom: 1px dotted #000; display: inline-block; min-width: 100px; padding: 0 4px; font-size: 14px; }
  .dotted-long { border-bottom: 1px dotted #000; display: inline-block; width: 100%; padding: 0 4px; font-size: 14px; }
  .addr-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 2px 8px; font-size: 12px; margin: 4px 0; }
  .addr-grid .item { display: flex; align-items: baseline; gap: 2px; }
  .addr-grid .item .val { border-bottom: 1px dotted #000; flex: 1; padding: 0 3px; font-size: 13px; min-height: 18px; }

  /* Checkboxes */
  .cb { display: inline-block; width: 15px; height: 15px; border: 1.5px solid #000; vertical-align: middle; text-align: center; font-size: 11px; line-height: 15px; margin-right: 2px; }
  .cb.checked { background: #d4edda; }
  .cb.checked::after { content: "✓"; font-weight: bold; color: #1b5e20; }
  .tax-law { font-size: 13px; margin: 3px 0; }
  .tax-law.indent { margin-left: 18px; }
  .filing-row { margin-top: 6px; font-size: 13px; display: flex; gap: 20px; }

  /* Month grid */
  .month-section { margin: 8px 0; padding: 8px; border: 1.5px solid #2d8a6e; background: #fafffe; }
  .month-title { font-size: 13px; margin-bottom: 4px; }
  .month-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px 12px; font-size: 13px; }
  .month-item { display: flex; align-items: center; gap: 3px; }

  /* ใบแนบ section */
  .attach-section { margin: 8px 0; padding: 6px 10px; border: 1px solid #aaa; font-size: 13px; background: #fafafa; }

  /* Detail table (ใบแนบ) */
  .detail-header { font-size: 13px; font-weight: bold; background: #2d8a6e; color: #fff; padding: 4px 10px; }
  .detail-table { width: 100%; border-collapse: collapse; }
  .detail-table th, .detail-table td { border: 1px solid #000; padding: 4px 6px; font-size: 12px; }
  .detail-table th { background: #e8f5e9; font-weight: bold; text-align: center; font-size: 11px; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }

  /* Summary table */
  .summary-section { margin: 10px 0; }
  .summary-table { width: 60%; margin-left: auto; border-collapse: collapse; }
  .summary-table td { border: 1.5px solid #2d8a6e; padding: 4px 10px; font-size: 13px; }
  .summary-table .header-row td { background: #2d8a6e; color: #fff; font-weight: bold; text-align: center; }
  .summary-table .label-col { width: 70%; }
  .summary-table .amount-col { width: 30%; text-align: right; }
  .amount-box { border: 1.5px solid #2d8a6e; padding: 2px 8px; text-align: right; font-weight: bold; min-width: 120px; display: inline-block; }

  /* Signature */
  .signature-section { margin-top: 14px; text-align: center; font-size: 14px; position: relative; }
  .sig-line { margin-top: 30px; }
  .sig-dotted { border-bottom: 1px dotted #000; display: inline-block; width: 280px; }
  .stamp-box { position: absolute; right: 20px; top: 20px; width: 90px; height: 70px; border: 1.5px solid #999; text-align: center; font-size: 10px; color: #666; display: flex; align-items: center; justify-content: center; line-height: 1.3; }

  /* Footer */
  .footer { margin-top: 10px; padding-top: 6px; border-top: 2px solid #2d8a6e; display: flex; justify-content: space-between; font-size: 11px; color: #555; }
  .footer .rd-info { color: #2d8a6e; font-weight: bold; }

  .clearfix::after { content: ""; display: table; clear: both; }
  @media print {
    .no-print { display: none; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <!-- ===== HEADER ===== -->
  <div class="header">
    <div class="form-name">${formTitle.replace("ภ.ง.ด. ", "ภ.ง.ด.")}</div>
    <div class="title">แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย</div>
    <div class="subtitle">ตามมาตรา 3 เตรส และมาตรา 69 ทวิ</div>
    <div class="subtitle">และการเสียภาษีตามมาตรา 65 จัตวา แห่งประมวลรัษฎากร</div>
  </div>

  <!-- ===== เลขที่เอกสาร ===== -->
  ${exp.whtDocNumber ? `<div style="text-align:right; font-size:14px; margin-bottom:4px;"><strong>เลขที่เอกสาร:</strong> <span style="font-size:16px; color:#2d8a6e; font-weight:bold;">${escapeHtml(exp.whtDocNumber)}</span></div>` : ""}

  <!-- ===== TAX ID + นำส่งภาษีตาม (two columns) ===== -->
  <div class="two-col">
    <div class="col-left">
      <!-- Tax ID -->
      <div class="taxid-section">
        <div class="taxid-label">เลขประจำตัวผู้เสียภาษีอากร<br><small>(ของผู้มีหน้าที่หักภาษี ณ ที่จ่าย)</small></div>
        <div style="margin-top:3px">
          ${companyTaxDigits.map((digit, i) => {
            const box = '<span class="tid-box">' + (digit.trim() ? digit : "&nbsp;") + "</span>";
            const dash = (i === 0 || i === 4 || i === 9 || i === 11) ? '<span class="tid-dash">-</span>' : "";
            return box + dash;
          }).join("")}
        </div>
      </div>

      <!-- Company name + branch -->
      <div class="info-row" style="margin-top:6px">
        <span class="label">ชื่อผู้มีหน้าที่หักภาษี ณ ที่จ่าย (หน่วยงาน) :</span>
        <span class="dotted" style="min-width:250px">${escapeHtml(company.companyName)}</span>
        &nbsp; สาขาที่
        <span class="branch-box">0</span><span class="branch-box">0</span><span class="branch-box">0</span><span class="branch-box">0</span>
      </div>

      <!-- Address -->
      <div class="info-row">
        <span class="label">ที่อยู่ :</span>
        <span class="dotted" style="min-width:450px">${escapeHtml(company.address)}</span>
      </div>

      <!-- Filing type -->
      <div class="filing-row">
        <span><span class="cb checked"></span> ยื่นปกติ</span>
        <span><span class="cb"></span> ยื่นเพิ่มเติมครั้งที่ ........</span>
      </div>
    </div>

    <div class="col-right">
      <!-- นำส่งภาษีตาม -->
      <div style="font-size:13px; font-weight:bold; margin-bottom:4px; color:#2d8a6e;">นำส่งภาษีตาม</div>
      <div class="tax-law indent"><span class="cb checked"></span> (1) มาตรา 3 เตรส แห่งประมวลรัษฎากร</div>
      <div class="tax-law indent"><span class="cb"></span> (2) มาตรา 65 จัตวา แห่งประมวลรัษฎากร</div>
      <div class="tax-law indent"><span class="cb"></span> (3) มาตรา 69 ทวิ แห่งประมวลรัษฎากร</div>
    </div>
  </div>

  <!-- ===== MONTH GRID ===== -->
  <div class="month-section">
    <div class="month-title">
      <strong>เดือนที่จ่ายเงินได้พึงประเมิน</strong>
      <small>(ให้ทำเครื่องหมาย "✓" ลงใน "☐" หน้าชื่อเดือน)</small>
      พ.ศ. <strong>${thaiYear}</strong>
    </div>
    <div class="month-grid">
      ${thaiMonths.map((m, i) => `<div class="month-item"><span class="cb${i === monthIndex ? " checked" : ""}"></span> (${i + 1}) ${m}</div>`).join("\n      ")}
    </div>
  </div>

  <!-- ===== ใบแนบ reference ===== -->
  <div class="attach-section">
    <span class="cb checked"></span> <strong>ใบแนบ ${formTitle}</strong> ที่แนบมาพร้อมนี้ :
    จำนวน <strong>1</strong> ราย &nbsp; จำนวน <strong>1</strong> แผ่น
    <div style="margin-top:4px; font-size:12px; color:#555;">
      มีรายละเอียดการหักเป็นรายผู้มีเงินได้ ปรากฏตามใบแนบ ${formTitle}
    </div>
  </div>

  <!-- ===== DETAIL TABLE (ใบแนบ inline) ===== -->
  <div style="margin:8px 0;">
    <div class="detail-header">
      รายละเอียดการหักเป็นรายผู้มีเงินได้ (ใบแนบ ${formTitle})
    </div>
    <table class="detail-table">
      <thead>
        <tr>
          <th style="width:4%">ลำดับ</th>
          <th style="width:14%">เลขประจำตัว<br>ผู้เสียภาษีอากร</th>
          <th style="width:20%">ชื่อผู้มีเงินได้</th>
          <th style="width:18%">ที่อยู่ผู้มีเงินได้</th>
          <th style="width:10%">วันเดือนปี<br>ที่จ่าย</th>
          <th style="width:14%">ประเภทเงินได้<br>พึงประเมิน</th>
          <th style="width:10%">จำนวนเงิน<br>ที่จ่าย</th>
          <th style="width:10%">จำนวนเงิน<br>ภาษีที่หัก</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="text-center">1</td>
          <td class="text-center" style="font-size:11px">${escapeHtml(sup?.taxId || "-")}</td>
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

  <!-- ===== SUMMARY TABLE ===== -->
  <div class="summary-section">
    <table class="summary-table">
      <tr class="header-row"><td class="label-col">สรุปรายการภาษีที่นำส่ง</td><td class="amount-col">จำนวนเงิน</td></tr>
      <tr><td>1. รวมยอดเงินได้ทั้งสิ้น</td><td class="amount-col">${fmt(exp.amount)}</td></tr>
      <tr><td><strong>2. รวมยอดภาษีที่นำส่งทั้งสิ้น</strong></td><td class="amount-col"><strong>${fmt(exp.whtAmount)}</strong></td></tr>
      <tr><td>3. เงินเพิ่ม (ถ้ามี)</td><td class="amount-col">-</td></tr>
      <tr><td><strong>4. รวมยอดภาษีที่นำส่งทั้งสิ้น และเงินเพิ่ม (2. + 3.)</strong></td><td class="amount-col"><strong>${fmt(exp.whtAmount)}</strong></td></tr>
    </table>
  </div>

  <!-- ===== SIGNATURE ===== -->
  <div class="signature-section">
    <p>ข้าพเจ้าขอรับรองว่า รายการที่แจ้งไว้ข้างต้นนี้ เป็นรายการที่ถูกต้องและครบถ้วนทุกประการ</p>
    <div class="stamp-box">ประทับตรา<br>นิติบุคคล<br>(ถ้ามี)</div>
    <div class="sig-line">
      ลงชื่อ <span class="sig-dotted"></span> ผู้จ่ายเงิน
    </div>
    <div style="margin-top:4px">( <span class="sig-dotted"></span> )</div>
    <div style="margin-top:4px">ตำแหน่ง <span class="sig-dotted"></span></div>
    <div style="margin-top:4px">ยื่นวันที่ <span class="dotted" style="min-width:30px">${paidDate.getDate()}</span> เดือน <span class="dotted" style="min-width:100px">${thaiMonths[paidDate.getMonth()]}</span> พ.ศ. <span class="dotted" style="min-width:60px">${paidDate.getFullYear() + 543}</span></div>
  </div>

  <!-- ===== FOOTER ===== -->
  <div class="footer">
    <div>เลขที่เอกสาร: ${escapeHtml(exp.whtDocNumber || "-")} | ${escapeHtml(company.companyName)} | ออกโดยระบบ Frozen ERP</div>
    <div class="rd-info">สอบถามข้อมูลเพิ่มเติมได้ที่ศูนย์สารนิเทศสรรพากร RD Intelligence Center โทร. 1161</div>
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

// DELETE /print-logs/:logId — delete a print log (ต้องเหลืออย่างน้อย 1 รายการ)
expensesRoute.delete("/print-logs/:logId", async (c) => {
  const logId = Number(c.req.param("logId"));
  const log = await db.select().from(printLogs).where(eq(printLogs.id, logId)).get();
  if (!log) return c.json({ error: "Print log not found" }, 404);

  // นับจำนวน log ของ expense เดียวกัน
  const count = await db.select({ count: sql<number>`count(*)` }).from(printLogs)
    .where(and(eq(printLogs.docType, log.docType), eq(printLogs.refId, log.refId))).get();

  if ((count?.count || 0) <= 1) {
    return c.json({ error: "ลบไม่ได้ ต้องเหลือประวัติอย่างน้อย 1 รายการ" }, 400);
  }

  await db.delete(printLogs).where(eq(printLogs.id, logId)).run();
  return c.json({ ok: true });
});

export { expensesRoute };
