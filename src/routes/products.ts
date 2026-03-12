import { Hono } from "hono";
import { db } from "../db.js";
import { products } from "../schema.js";
import { eq, like, or, and, sql } from "drizzle-orm";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";

const productsRoute = new Hono();

const UPLOAD_DIR = join(process.cwd(), "data", "uploads", "products");
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

productsRoute.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  const category = c.req.query("category")?.trim();
  let conditions: any[] = [];
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(or(
      like(products.name, pattern),
      like(products.sku, pattern),
      like(products.rawMaterial, pattern),
      like(products.description, pattern),
    ));
  }
  if (category) {
    conditions.push(eq(products.category, category));
  }
  if (conditions.length > 0) {
    return c.json(await db.select().from(products).where(and(...conditions)).all());
  }
  return c.json(await db.select().from(products).all());
});

productsRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db.select().from(products).where(eq(products.id, id)).get();
  if (!row) return c.json({ error: "Product not found" }, 404);
  return c.json(row);
});

productsRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name required" }, 400);
  const result = await db.insert(products).values({
    name: body.name,
    sku: body.sku || null,
    category: body.category || null,
    salePrice: body.salePrice ?? 0,
    unit: body.unit || "piece",
    stock: body.stock ?? 0,
    imageUrl: body.imageUrl || null,
    rawMaterial: body.rawMaterial || null,
    rawMaterialYield: body.rawMaterialYield ?? null,
    description: body.description || null,
    hasVat: body.hasVat ?? 1,
  }).run();
  return c.json({ ok: true, id: Number(result.lastInsertRowid) }, 201);
});

productsRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(products).where(eq(products.id, id)).get();
  if (!existing) return c.json({ error: "Product not found" }, 404);
  const body = await c.req.json();
  await db.update(products).set({
    name: body.name ?? existing.name,
    sku: body.sku ?? existing.sku,
    category: body.category ?? existing.category,
    salePrice: body.salePrice ?? existing.salePrice,
    unit: body.unit ?? existing.unit,
    stock: body.stock ?? existing.stock,
    imageUrl: body.imageUrl ?? existing.imageUrl,
    rawMaterial: body.rawMaterial ?? existing.rawMaterial,
    rawMaterialYield: body.rawMaterialYield ?? existing.rawMaterialYield,
    description: body.description ?? existing.description,
    hasVat: body.hasVat ?? existing.hasVat,
    updatedAt: sql`datetime('now')`,
  }).where(eq(products.id, id)).run();
  return c.json({ ok: true });
});

productsRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(products).where(eq(products.id, id)).get();
  if (!existing) return c.json({ error: "Product not found" }, 404);
  await db.delete(products).where(eq(products.id, id)).run();
  return c.json({ ok: true });
});

// --- Auto-generate SKU ---
productsRoute.get("/next-sku", async (c) => {
  const category = c.req.query("category")?.trim() || "PRD";
  const prefix = category.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
  const rows = await db.select({ sku: products.sku }).from(products).all();
  const nums = rows
    .map((r) => r.sku)
    .filter((s): s is string => !!s && s.startsWith(prefix))
    .map((s) => parseInt(s.replace(prefix, ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return c.json({ sku: `${prefix}${String(next).padStart(4, "0")}` });
});

// --- Upload product image ---
productsRoute.post("/upload-image", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("image");
  if (!file || !(file instanceof File)) {
    return c.json({ error: "No file uploaded" }, 400);
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return c.json({ error: "Image too large (max 5MB)" }, 400);
  }
  if (!file.type || !ALLOWED_MIME_TYPES.has(file.type)) {
    return c.json({ error: "Only PNG/JPG/GIF/WebP allowed" }, 400);
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  if (!ALLOWED_EXTS.has(ext)) {
    return c.json({ error: "File type not allowed" }, 400);
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `product_${Date.now()}.${ext}`;
  const filepath = join(UPLOAD_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);
  const imageUrl = `/api/products/image/${filename}`;
  return c.json({ ok: true, imageUrl });
});

// --- Serve product image ---
productsRoute.get("/image/:filename", async (c) => {
  const rawFilename = c.req.param("filename");
  const filename = basename(rawFilename).replace(/\0/g, "");
  if (filename !== rawFilename) {
    return c.json({ error: "Invalid filename" }, 400);
  }
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTS.has(ext)) {
    return c.json({ error: "Invalid file type" }, 400);
  }
  const filepath = join(UPLOAD_DIR, filename);
  try {
    const data = await readFile(filepath);
    const mimeMap: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      gif: "image/gif", webp: "image/webp",
    };
    return new Response(data, {
      headers: { "Content-Type": mimeMap[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

export { productsRoute };
