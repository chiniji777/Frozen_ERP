import { Hono } from "hono";
import { db } from "../db.js";
import { companySettings } from "../schema.js";
import { eq, sql } from "drizzle-orm";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";

const settingsRoute = new Hono();

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

settingsRoute.get("/", async (c) => {
  const row = await db.select().from(companySettings).where(eq(companySettings.id, 1)).get();
  if (!row) return c.json({});
  return c.json(row);
});

settingsRoute.put("/", async (c) => {
  const body = await c.req.json();
  const existing = await db.select().from(companySettings).where(eq(companySettings.id, 1)).get();
  if (!existing) return c.json({ error: "Settings not found" }, 404);
  await db.update(companySettings).set({
    companyName: body.companyName ?? existing.companyName,
    companyNameEn: body.companyNameEn ?? existing.companyNameEn,
    address: body.address ?? existing.address,
    addressEn: body.addressEn ?? existing.addressEn,
    taxId: body.taxId ?? existing.taxId,
    phone: body.phone ?? existing.phone,
    email: body.email ?? existing.email,
    website: body.website ?? existing.website,
    branch: body.branch ?? existing.branch,
    logoUrl: body.logoUrl ?? existing.logoUrl,
    updatedAt: sql`datetime('now')`,
  }).where(eq(companySettings.id, 1)).run();
  return c.json({ ok: true });
});

settingsRoute.post("/logo", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("logo");
  if (!file || !(file instanceof File)) {
    return c.json({ error: "No file uploaded" }, 400);
  }

  if (file.size > MAX_LOGO_SIZE) {
    return c.json({ error: "Logo too large (max 2MB)" }, 400);
  }

  if (!file.type || !ALLOWED_MIME_TYPES.has(file.type)) {
    return c.json({ error: "Only PNG/JPG/GIF/WebP allowed" }, 400);
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  if (!ALLOWED_EXTS.has(ext)) {
    return c.json({ error: "File type not allowed" }, 400);
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const filename = `logo_${Date.now()}.${ext}`;
  const filepath = join(UPLOAD_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  const logoUrl = `/api/settings/logo/${filename}`;
  await db.update(companySettings).set({
    logoUrl,
    updatedAt: sql`datetime('now')`,
  }).where(eq(companySettings.id, 1)).run();

  return c.json({ ok: true, logoUrl });
});

settingsRoute.get("/logo/:filename", async (c) => {
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
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";
    return new Response(data, {
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

export { settingsRoute };
