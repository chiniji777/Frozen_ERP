import { Hono } from "hono";
import { db } from "../db.js";
import { expenses } from "../schema.js";
import { eq, sql } from "drizzle-orm";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";
import { generateRunningNumber } from "../utils.js";

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

// GET / — list expenses (with status + month filter)
expensesRoute.get("/", async (c) => {
  const category = c.req.query("category")?.trim();
  const status = c.req.query("status")?.trim();
  const from = c.req.query("from")?.trim();
  const to = c.req.query("to")?.trim();
  let rows = await db.select().from(expenses).all();
  if (category) rows = rows.filter(r => r.category === category);
  if (status) rows = rows.filter(r => r.status === status);
  if (from) rows = rows.filter(r => r.date >= from);
  if (to) rows = rows.filter(r => r.date <= to);

  // Compute overdue display status
  const now = new Date().toISOString().slice(0, 10);
  const result = rows.map(r => ({
    ...r,
    displayStatus: r.status === "pending" && r.dueDate && r.dueDate < now ? "overdue" : r.status,
  }));

  return c.json(result);
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

export { expensesRoute };
