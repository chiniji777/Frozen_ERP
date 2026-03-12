import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./routes/auth.js";
import { customersRoute } from "./routes/customers.js";
import { productsRoute } from "./routes/products.js";
import { rawMaterialsRoute } from "./routes/raw-materials.js";
import { bomRoute } from "./routes/bom.js";
import { productionRoute } from "./routes/production.js";
import { costsRoute } from "./routes/costs.js";
import { salesOrdersRoute } from "./routes/sales-orders.js";
import { deliveryNotesRoute } from "./routes/delivery-notes.js";
import { invoicesRoute } from "./routes/invoices.js";
import { paymentsRoute } from "./routes/payments.js";
import { receiptsRoute } from "./routes/receipts.js";
import { expensesRoute } from "./routes/expenses.js";
import { suppliersRoute } from "./routes/suppliers.js";
import { purchaseOrdersRoute } from "./routes/purchase-orders.js";
import { dashboardRoute } from "./routes/dashboard.js";
import { settingsRoute } from "./routes/settings.js";
import { dbdRoute } from "./routes/dbd.js";
import { ocrSlipRoute } from "./routes/ocr-slip.js";
import { authMiddleware } from "./auth.js";
import { initDB } from "./db.js";
import { rateLimit } from "./rate-limit.js";
import { join } from "path";
import { readFile, access } from "fs/promises";

export const app = new Hono();

// Global middleware
app.use("*", cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : ["https://frozen.mhorkub.com", "http://localhost:4001"],
  allowMethods: ["GET", "POST", "PUT", "DELETE"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Error handling
app.onError((err, c) => {
  console.error("[erp] Error:", err.message);
  return c.json({ error: "Internal server error" }, 500);
});

// Health check FIRST — no DB, no middleware, instant response
app.get("/api/health", (c) => c.json({ ok: true, service: "erp-backend" }));

// Lazy DB init — run once on first API request (not on cold start)
let dbReady: Promise<void> | null = null;
app.use("/api/*", async (c, next) => {
  // Skip DB init for health check
  if (c.req.path === "/api/health") return next();
  if (!dbReady) {
    dbReady = initDB().catch((err) => {
      console.error("[db] initDB failed:", err);
      dbReady = null; // retry next request
      throw err;
    });
  }
  try {
    await dbReady;
  } catch {
    return c.json({ error: "Database initialization failed" }, 503);
  }
  return next();
});

// Rate limit: login 5 attempts / 15 min, API 100 req / min
app.use("/api/auth/login", rateLimit({ max: 5, windowMs: 15 * 60 * 1000, keyPrefix: "auth-login" }));
app.use("/api/*", rateLimit({ max: 100, windowMs: 60 * 1000, keyPrefix: "api" }));

// Auth routes (public)
app.route("/api/auth", auth);

// Protected routes
app.use("/api/customers/*", authMiddleware);
app.use("/api/products/*", authMiddleware);
app.use("/api/raw-materials/*", authMiddleware);
app.route("/api/customers", customersRoute);
app.route("/api/products", productsRoute);
app.route("/api/raw-materials", rawMaterialsRoute);
app.use("/api/bom/*", authMiddleware);
app.use("/api/production/*", authMiddleware);
app.use("/api/costs/*", authMiddleware);
app.route("/api/bom", bomRoute);
app.route("/api/production", productionRoute);
app.route("/api/costs", costsRoute);
app.use("/api/sales-orders/*", authMiddleware);
app.use("/api/delivery-notes/*", authMiddleware);
app.use("/api/invoices/*", authMiddleware);
app.use("/api/payments/*", authMiddleware);
app.use("/api/receipts/*", authMiddleware);
app.use("/api/expenses/*", authMiddleware);
app.route("/api/sales-orders", salesOrdersRoute);
app.route("/api/delivery-notes", deliveryNotesRoute);
app.route("/api/invoices", invoicesRoute);
app.route("/api/payments", paymentsRoute);
app.route("/api/payments", ocrSlipRoute);
app.route("/api/receipts", receiptsRoute);
app.route("/api/expenses", expensesRoute);
app.route("/api/suppliers", suppliersRoute);
app.use("/api/purchase-orders/*", authMiddleware);
app.route("/api/purchase-orders", purchaseOrdersRoute);
app.use("/api/dashboard", authMiddleware);
app.route("/api/dashboard", dashboardRoute);
app.use("/api/settings", authMiddleware);
app.route("/api/settings", settingsRoute);
app.use("/api/dbd/*", authMiddleware);
app.use("/api/dbd/lookup/*", rateLimit({ max: 5, windowMs: 1000, keyPrefix: "dbd-lookup" }));
app.route("/api/dbd", dbdRoute);

// Serve attachment files
app.use("/api/attachments/*", authMiddleware);
app.get("/api/attachments/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (filename.includes("..") || filename.includes("/")) return c.json({ error: "Invalid filename" }, 400);
  const filePath = join(process.cwd(), "data", "attachments", filename);
  try {
    await access(filePath);
    const data = await readFile(filePath);
    return new Response(data, {
      headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `inline; filename="${filename}"` },
    });
  } catch { return c.json({ error: "File not found" }, 404); }
});

// Serve frontend static files (after all API routes)
import { serveStatic } from "hono/bun";
app.use("/*", serveStatic({ root: "./frontend/dist" }));

// SPA fallback — serve index.html for non-API routes
app.get("*", async (c) => {
  const html = await readFile(join(process.cwd(), "frontend", "dist", "index.html"), "utf-8");
  return c.html(html);
});

const port = Number(process.env.PORT) || 4001;
console.log(`[erp] Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
