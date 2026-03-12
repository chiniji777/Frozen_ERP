import { Hono } from "hono";
import { db } from "../db.js";
import { expenses } from "../schema.js";
import { eq, sql } from "drizzle-orm";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";

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

// GET / — list expenses
expensesRoute.get("/", async (c) => {
  const category = c.req.query("category")?.trim();
  const from = c.req.query("from")?.trim();
  const to = c.req.query("to")?.trim();
  let rows = await db.select().from(expenses).all();
  if (category) rows = rows.filter(r => r.category === category);
  if (from) rows = rows.filter(r => r.date >= from);
  if (to) rows = rows.filter(r => r.date <= to);
  return c.json(rows);
});

// POST / — create expense
expensesRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.category || !body.description || body.amount == null || !body.date) {
    return c.json({ error: "category, description, amount, date required" }, 400);
  }
  if (body.amount <= 0) return c.json({ error: "amount must be > 0" }, 400);
  const result = await db.insert(expenses).values({
    category: body.category, description: body.description,
    amount: body.amount, date: body.date, notes: body.notes || null,
    slipImage: body.slipImage || null,
  }).run();
  return c.json({ ok: true, id: Number(result.lastInsertRowid) }, 201);
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
    notes: body.notes ?? existing.notes,
    slipImage: body.slipImage !== undefined ? body.slipImage : existing.slipImage,
    updatedAt: sql`datetime('now')`,
  }).where(eq(expenses.id, id)).run();
  return c.json({ ok: true });
});

// DELETE /:id
expensesRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!existing) return c.json({ error: "Expense not found" }, 404);
  await db.delete(expenses).where(eq(expenses.id, id)).run();
  return c.json({ ok: true });
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
