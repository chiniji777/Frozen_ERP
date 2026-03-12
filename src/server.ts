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
import { dashboardRoute } from "./routes/dashboard.js";
import { authMiddleware } from "./auth.js";
import { initDB } from "./db.js";
import { rateLimit } from "./rate-limit.js";
import { join } from "path";

export const app = new Hono();

// Global middleware
app.use("*", cors({
  origin: ["https://frozen.mhorkub.com"],
  allowMethods: ["GET", "POST", "PUT", "DELETE"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Error handling
app.onError((err, c) => {
  console.error("[erp] Error:", err.message);
  return c.json({ error: "Internal server error" }, 500);
});

// Health check
app.get("/api/health", (c) => c.json({ ok: true, service: "erp-backend" }));

// Rate limit: auth 10 attempts / 15 min, API 100 req / min
app.use("/api/auth/google", rateLimit({ max: 10, windowMs: 15 * 60 * 1000, keyPrefix: "auth" }));
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
app.route("/api/receipts", receiptsRoute);
app.route("/api/expenses", expensesRoute);
app.use("/api/dashboard", authMiddleware);
app.route("/api/dashboard", dashboardRoute);

// Serve attachment files
app.use("/api/attachments/*", authMiddleware);
app.get("/api/attachments/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (filename.includes("..") || filename.includes("/")) return c.json({ error: "Invalid filename" }, 400);
  const filePath = join(process.cwd(), "data", "attachments", filename);
  try {
    const file = Bun.file(filePath);
    if (!await file.exists()) return c.json({ error: "File not found" }, 404);
    return new Response(file.stream(), {
      headers: { "Content-Type": file.type || "application/octet-stream", "Content-Disposition": `inline; filename="${filename}"` },
    });
  } catch { return c.json({ error: "File not found" }, 404); }
});

// Init DB on startup
const _init = initDB().catch(console.error);

const port = 4000;
console.log(`[erp] Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
