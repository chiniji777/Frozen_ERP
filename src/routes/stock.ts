import { Hono } from "hono";
import { db } from "../db.js";
import { rawMaterials, products } from "../schema.js";
import { eq, sql } from "drizzle-orm";

const stockRoute = new Hono();

// GET / — สต็อครวม (วัตถุดิบ + สินค้า)
stockRoute.get("/", async (c) => {
  const tab = c.req.query("tab"); // "raw-materials" | "products" | undefined (= ทั้งหมด)

  let rawMaterialStock: any[] = [];
  let productStock: any[] = [];

  if (!tab || tab === "raw-materials") {
    const rows = await db.select().from(rawMaterials).all();
    rawMaterialStock = rows.map(r => ({
      id: r.id,
      type: "raw-material",
      code: r.code,
      name: r.name,
      stock: r.stock,
      unit: r.unit,
      pricePerUnit: r.pricePerUnit,
      stockValue: r.stock * r.pricePerUnit,
      supplier: r.supplier,
    }));
  }

  if (!tab || tab === "products") {
    const rows = await db.select().from(products).all();
    productStock = rows.map(p => ({
      id: p.id,
      type: "product",
      sku: p.sku,
      name: p.name,
      stock: p.stock,
      unit: p.unit,
      salePrice: p.salePrice,
      stockValue: p.stock * p.salePrice,
      category: p.category,
      imageUrl: p.imageUrl,
    }));
  }

  const totalRawMaterialValue = rawMaterialStock.reduce((sum, r) => sum + r.stockValue, 0);
  const totalProductValue = productStock.reduce((sum, p) => sum + p.stockValue, 0);

  return c.json({
    rawMaterials: rawMaterialStock,
    products: productStock,
    summary: {
      rawMaterialCount: rawMaterialStock.length,
      productCount: productStock.length,
      totalRawMaterialValue,
      totalProductValue,
      totalValue: totalRawMaterialValue + totalProductValue,
    },
  });
});

// POST /adjust — ปรับสต็อค (เพิ่ม/ลด)
stockRoute.post("/adjust", async (c) => {
  const body = await c.req.json();
  const { type, id, adjustment, reason } = body;

  if (!type || !id || adjustment == null) {
    return c.json({ error: "type, id, adjustment required" }, 400);
  }
  if (typeof adjustment !== "number" || adjustment === 0) {
    return c.json({ error: "adjustment must be non-zero number" }, 400);
  }

  if (type === "raw-material") {
    const item = await db.select().from(rawMaterials).where(eq(rawMaterials.id, id)).get();
    if (!item) return c.json({ error: "Raw material not found" }, 404);
    const newStock = item.stock + adjustment;
    if (newStock < 0) return c.json({ error: "Stock cannot go below 0" }, 400);
    await db.update(rawMaterials).set({
      stock: newStock,
      updatedAt: sql`datetime('now')`,
    }).where(eq(rawMaterials.id, id)).run();
    return c.json({ ok: true, type, id, previousStock: item.stock, newStock, adjustment, reason });
  }

  if (type === "product") {
    const item = await db.select().from(products).where(eq(products.id, id)).get();
    if (!item) return c.json({ error: "Product not found" }, 404);
    const newStock = item.stock + adjustment;
    if (newStock < 0) return c.json({ error: "Stock cannot go below 0" }, 400);
    await db.update(products).set({
      stock: newStock,
      updatedAt: sql`datetime('now')`,
    }).where(eq(products.id, id)).run();
    return c.json({ ok: true, type, id, previousStock: item.stock, newStock, adjustment, reason });
  }

  return c.json({ error: "type must be 'raw-material' or 'product'" }, 400);
});

export { stockRoute };
