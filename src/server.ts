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
import { seedAdmin } from "./seed.js";
import { rateLimit } from "./rate-limit.js";

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

// Rate limit: login 5 attempts / 15 min, API 100 req / min
app.use("/api/auth/login", rateLimit({ max: 5, windowMs: 15 * 60 * 1000, keyPrefix: "login" }));
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

// Init DB + seed on startup
const _init = initDB().then(() => seedAdmin()).catch(console.error);

const port = 4000;
console.log(`[erp] Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
