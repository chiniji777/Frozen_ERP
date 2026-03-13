import { Hono } from "hono";
import { db } from "../db.js";
import { recurringExpenses, recurringExpensePayments, expenses } from "../schema.js";
import { eq, and, sql } from "drizzle-orm";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const recurringExpensesRoute = new Hono();

// Map Thai recurring categories → English expense enum
const CATEGORY_TO_EXPENSE: Record<string, "material" | "labor" | "rent" | "utilities" | "other"> = {
  "ค่าเช่า": "rent",
  "สาธารณูปโภค": "utilities",
  "ค่าแรงงาน": "labor",
  "ผ่อนชำระ": "other",
  "ประกัน": "other",
  "บริการ": "other",
  "อื่นๆ": "other",
  "ค่าวัตถุดิบ": "material",
};

function mapToExpenseCategory(thaiCategory: string): "material" | "labor" | "rent" | "utilities" | "other" {
  return CATEGORY_TO_EXPENSE[thaiCategory] || "other";
}

const CATEGORIES_FILE = join(process.cwd(), "data", "recurring-expense-categories.json");

const DEFAULT_CATEGORIES = [
  "ค่าเช่า",
  "สาธารณูปโภค",
  "ผ่อนชำระ",
  "ประกัน",
  "บริการ",
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

// GET /categories
recurringExpensesRoute.get("/categories", async (c) => {
  return c.json(await loadCategories());
});

// PUT /categories
recurringExpensesRoute.put("/categories", async (c) => {
  const body = await c.req.json();
  if (!Array.isArray(body.categories)) return c.json({ error: "categories array required" }, 400);
  const cats = body.categories
    .filter((v: unknown) => typeof v === "string" && v.trim())
    .map((v: string) => v.trim());
  await saveCategories(cats);
  return c.json({ ok: true, categories: cats });
});

// GET /summary — สรุปยอดรวม
recurringExpensesRoute.get("/summary", async (c) => {
  const month = c.req.query("month") || new Date().toISOString().slice(0, 7);

  const activeItems = await db.select().from(recurringExpenses)
    .where(eq(recurringExpenses.isActive, 1)).all();

  const monthPayments = await db.select().from(recurringExpensePayments)
    .where(eq(recurringExpensePayments.month, month)).all();

  const totalDue = activeItems.reduce((sum, r) => sum + r.amount, 0);
  const totalPaidMonth = monthPayments
    .filter(p => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);
  const totalPending = totalDue - totalPaidMonth;
  const totalRemainingDebt = activeItems.reduce((sum, r) => sum + (r.remainingDebt ?? 0), 0);

  return c.json({
    month,
    totalDue,
    totalPaid: totalPaidMonth,
    totalPending,
    totalRemainingDebt,
    activeCount: activeItems.length,
  });
});

// GET /monthly?month=2026-03 — ดึงรายการเดือนนั้น + สร้าง pending อัตโนมัติ
recurringExpensesRoute.get("/monthly", async (c) => {
  const month = c.req.query("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month required (YYYY-MM)" }, 400);
  }

  const activeItems = await db.select().from(recurringExpenses)
    .where(eq(recurringExpenses.isActive, 1)).all();

  // Get existing payments for this month
  const existingPayments = await db.select().from(recurringExpensePayments)
    .where(eq(recurringExpensePayments.month, month)).all();

  const existingMap = new Map(existingPayments.map(p => [p.recurringExpenseId, p]));

  // Auto-create pending entries for active items that don't have one yet
  for (const item of activeItems) {
    if (!existingMap.has(item.id)) {
      // Check date range
      if (item.startDate && month < item.startDate.slice(0, 7)) continue;
      if (item.endDate && month > item.endDate.slice(0, 7)) continue;

      await db.insert(recurringExpensePayments).values({
        recurringExpenseId: item.id,
        month,
        amount: item.amount,
        status: "pending",
        paymentMethod: item.paymentMethod,
      }).run();
    }
  }

  // Re-fetch all payments for this month (including newly created)
  const allPayments = await db.select().from(recurringExpensePayments)
    .where(eq(recurringExpensePayments.month, month)).all();

  // Join with recurring expense info
  const result = [];
  for (const payment of allPayments) {
    const item = await db.select().from(recurringExpenses)
      .where(eq(recurringExpenses.id, payment.recurringExpenseId)).get();
    if (!item) continue;

    // Determine overdue status
    let displayStatus = payment.status;
    if (payment.status === "pending" && item.dueDay) {
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      if (month < currentMonth || (month === currentMonth && now.getDate() > item.dueDay)) {
        displayStatus = "overdue";
      }
    }

    result.push({
      id: payment.id,
      paymentId: payment.id,
      recurringExpenseId: item.id,
      name: item.name,
      category: item.category,
      payTo: item.payTo,
      dueDay: item.dueDay,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod || item.paymentMethod,
      status: payment.status,
      displayStatus,
      paidAt: payment.paidAt,
      slipImage: payment.slipImage,
      notes: payment.notes,
      totalDebt: item.totalDebt,
      totalPaid: item.totalPaid,
      remainingDebt: item.remainingDebt,
      ref1: item.ref1,
      ref2: item.ref2,
      bankAccount: item.bankAccount,
      bankName: item.bankName,
      accountName: item.accountName,
      imageUrl: item.imageUrl,
    });
  }

  return c.json(result);
});

// GET / — list recurring expenses (templates)
recurringExpensesRoute.get("/", async (c) => {
  const active = c.req.query("active");
  let rows = await db.select().from(recurringExpenses).all();
  if (active !== undefined) {
    rows = rows.filter(r => r.isActive === Number(active));
  }
  return c.json(rows);
});

// POST / — สร้าง recurring expense
recurringExpensesRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name || !body.category || body.amount == null) {
    return c.json({ error: "name, category, amount required" }, 400);
  }
  if (body.amount <= 0) return c.json({ error: "amount must be > 0" }, 400);

  const remainingDebt = (body.totalDebt || 0) - (body.totalPaid || 0);

  const result = await db.insert(recurringExpenses).values({
    name: body.name,
    category: body.category,
    amount: body.amount,
    dueDay: body.dueDay || null,
    payTo: body.payTo || null,
    paymentMethod: body.paymentMethod || null,
    totalDebt: body.totalDebt || 0,
    totalPaid: body.totalPaid || 0,
    remainingDebt: remainingDebt > 0 ? remainingDebt : 0,
    startDate: body.startDate || null,
    endDate: body.endDate || null,
    isActive: 1,
    notes: body.notes || null,
    ref1: body.ref1 || null,
    ref2: body.ref2 || null,
    bankAccount: body.bankAccount || null,
    bankName: body.bankName || null,
    accountName: body.accountName || null,
  }).run();

  return c.json({ ok: true, id: Number(result.lastInsertRowid) }, 201);
});

// PUT /:id — แก้ไข recurring expense
recurringExpensesRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json();
  const totalDebt = body.totalDebt ?? existing.totalDebt ?? 0;
  const totalPaid = body.totalPaid ?? existing.totalPaid ?? 0;
  const remainingDebt = totalDebt - totalPaid;

  await db.update(recurringExpenses).set({
    name: body.name ?? existing.name,
    category: body.category ?? existing.category,
    amount: body.amount ?? existing.amount,
    dueDay: body.dueDay !== undefined ? body.dueDay : existing.dueDay,
    payTo: body.payTo !== undefined ? body.payTo : existing.payTo,
    paymentMethod: body.paymentMethod !== undefined ? body.paymentMethod : existing.paymentMethod,
    totalDebt,
    totalPaid,
    remainingDebt: remainingDebt > 0 ? remainingDebt : 0,
    startDate: body.startDate !== undefined ? body.startDate : existing.startDate,
    endDate: body.endDate !== undefined ? body.endDate : existing.endDate,
    notes: body.notes !== undefined ? body.notes : existing.notes,
    ref1: body.ref1 !== undefined ? body.ref1 : existing.ref1,
    ref2: body.ref2 !== undefined ? body.ref2 : existing.ref2,
    bankAccount: body.bankAccount !== undefined ? body.bankAccount : existing.bankAccount,
    bankName: body.bankName !== undefined ? body.bankName : existing.bankName,
    accountName: body.accountName !== undefined ? body.accountName : existing.accountName,
    updatedAt: sql`datetime('now')`,
  }).where(eq(recurringExpenses.id, id)).run();

  return c.json({ ok: true });
});

// PATCH /:id/deactivate — ปิดรายการ
recurringExpensesRoute.patch("/:id/deactivate", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (existing.isActive === 0) return c.json({ error: "Already deactivated" }, 400);

  await db.update(recurringExpenses).set({
    isActive: 0,
    updatedAt: sql`datetime('now')`,
  }).where(eq(recurringExpenses.id, id)).run();

  return c.json({ ok: true, status: "deactivated" });
});

// POST /:id/pay — จ่ายค่าใช้จ่ายประจำเดือน
recurringExpensesRoute.post("/:id/pay", async (c) => {
  const id = Number(c.req.param("id"));
  const recurring = await db.select().from(recurringExpenses).where(eq(recurringExpenses.id, id)).get();
  if (!recurring) return c.json({ error: "Recurring expense not found" }, 404);

  const body = await c.req.json();
  if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return c.json({ error: "month required (YYYY-MM)" }, 400);
  }

  const amount = body.amount || recurring.amount;
  if (amount <= 0) return c.json({ error: "amount must be > 0" }, 400);

  // Find or create payment record
  let payment = await db.select().from(recurringExpensePayments)
    .where(and(
      eq(recurringExpensePayments.recurringExpenseId, id),
      eq(recurringExpensePayments.month, body.month),
    )).get();

  if (payment && payment.status === "paid") {
    return c.json({ error: "Already paid for this month" }, 400);
  }

  // Create expense record (map Thai category → English enum)
  const expenseResult = await db.insert(expenses).values({
    category: mapToExpenseCategory(recurring.category),
    description: `${recurring.name} (${body.month})`,
    amount,
    date: body.paidAt || new Date().toISOString().slice(0, 10),
    notes: body.notes || `ค่าใช้จ่ายประจำ: ${recurring.name}`,
  }).run();
  const expenseId = Number(expenseResult.lastInsertRowid);

  const paidAt = body.paidAt || new Date().toISOString();

  if (payment) {
    // Update existing pending payment
    await db.update(recurringExpensePayments).set({
      expenseId,
      amount,
      paidAt,
      status: "paid",
      slipImage: body.slipImage || null,
      paymentMethod: body.paymentMethod || recurring.paymentMethod || null,
      notes: body.notes || null,
    ref1: body.ref1 || null,
    ref2: body.ref2 || null,
    bankAccount: body.bankAccount || null,
    bankName: body.bankName || null,
    accountName: body.accountName || null,
    }).where(eq(recurringExpensePayments.id, payment.id)).run();
  } else {
    // Create new payment record
    await db.insert(recurringExpensePayments).values({
      recurringExpenseId: id,
      expenseId,
      month: body.month,
      amount,
      paidAt,
      status: "paid",
      slipImage: body.slipImage || null,
      paymentMethod: body.paymentMethod || recurring.paymentMethod || null,
      notes: body.notes || null,
    ref1: body.ref1 || null,
    ref2: body.ref2 || null,
    bankAccount: body.bankAccount || null,
    bankName: body.bankName || null,
    accountName: body.accountName || null,
    }).run();
  }

  // Update totalPaid and remainingDebt
  const newTotalPaid = (recurring.totalPaid ?? 0) + amount;
  const newRemainingDebt = (recurring.totalDebt ?? 0) - newTotalPaid;

  await db.update(recurringExpenses).set({
    totalPaid: newTotalPaid,
    remainingDebt: newRemainingDebt > 0 ? newRemainingDebt : 0,
    updatedAt: sql`datetime('now')`,
  }).where(eq(recurringExpenses.id, id)).run();

  return c.json({ ok: true, expenseId, paidAt });
});


const UPLOAD_DIR = join(process.cwd(), "data", "uploads", "recurring-expenses");
const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

recurringExpensesRoute.post("/upload-image", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("image") as File | null;
  if (!file) return c.json({ error: "image file required" }, 400);
  if (!ALLOWED_MIME.has(file.type)) return c.json({ error: `Invalid type: ${file.type}` }, 400);
  if (file.size > MAX_FILE_SIZE) return c.json({ error: "Max 10MB" }, 400);
  let ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) ext = "jpg";
  const filename = `recurring_${Date.now()}.${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(UPLOAD_DIR, filename), buffer);
  return c.json({ ok: true, imageUrl: `recurring-expenses/image/${filename}` });
});

export { recurringExpensesRoute };
