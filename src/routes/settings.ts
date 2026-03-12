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

// GET default profile (backward compat — used by invoice/DN/SO bill headers)
settingsRoute.get("/", async (c) => {
  const row = await db.select().from(companySettings).where(eq(companySettings.isDefault, 1)).get()
    || await db.select().from(companySettings).where(eq(companySettings.id, 1)).get();
  if (!row) return c.json({});
  return c.json(row);
});

// PUT default profile (backward compat)
settingsRoute.put("/", async (c) => {
  const body = await c.req.json();
  const existing = await db.select().from(companySettings).where(eq(companySettings.isDefault, 1)).get()
    || await db.select().from(companySettings).where(eq(companySettings.id, 1)).get();
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
  }).where(eq(companySettings.id, existing.id)).run();
  return c.json({ ok: true });
});

// === Company Profiles CRUD ===

// List all profiles
settingsRoute.get("/profiles", async (c) => {
  const rows = await db.select().from(companySettings).all();
  return c.json(rows);
});

// Create profile
settingsRoute.post("/profiles", async (c) => {
  const body = await c.req.json();
  const result = await db.insert(companySettings).values({
    companyName: body.companyName || null,
    companyNameEn: body.companyNameEn || null,
    address: body.address || null,
    addressEn: body.addressEn || null,
    taxId: body.taxId || null,
    phone: body.phone || null,
    email: body.email || null,
    website: body.website || null,
    branch: body.branch || null,
    logoUrl: body.logoUrl || null,
    isDefault: 0,
  }).run();
  return c.json({ ok: true, id: Number(result.lastInsertRowid) }, 201);
});

// Update profile
settingsRoute.put("/profiles/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const existing = await db.select().from(companySettings).where(eq(companySettings.id, id)).get();
  if (!existing) return c.json({ error: "Profile not found" }, 404);
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
  }).where(eq(companySettings.id, id)).run();
  return c.json({ ok: true });
});

// Set profile as default (clears others)
settingsRoute.put("/profiles/:id/set-default", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(companySettings).where(eq(companySettings.id, id)).get();
  if (!existing) return c.json({ error: "Profile not found" }, 404);
  await db.update(companySettings).set({ isDefault: 0 }).run();
  await db.update(companySettings).set({ isDefault: 1, updatedAt: sql`datetime('now')` }).where(eq(companySettings.id, id)).run();
  return c.json({ ok: true });
});

// Delete profile (blocked if default)
settingsRoute.delete("/profiles/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(companySettings).where(eq(companySettings.id, id)).get();
  if (!existing) return c.json({ error: "Profile not found" }, 404);
  if (existing.isDefault === 1) return c.json({ error: "Cannot delete default profile" }, 400);
  await db.delete(companySettings).where(eq(companySettings.id, id)).run();
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
