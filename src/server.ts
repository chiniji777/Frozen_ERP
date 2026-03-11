import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./routes/auth";
import { customersRoute } from "./routes/customers";
import { productsRoute } from "./routes/products";
import { rawMaterialsRoute } from "./routes/raw-materials";
import { bomRoute } from "./routes/bom";
import { productionRoute } from "./routes/production";
import { costsRoute } from "./routes/costs";
import { salesOrdersRoute } from "./routes/sales-orders";
import { deliveryNotesRoute } from "./routes/delivery-notes";
import { invoicesRoute } from "./routes/invoices";
import { paymentsRoute } from "./routes/payments";
import { receiptsRoute } from "./routes/receipts";
import { expensesRoute } from "./routes/expenses";
import { authMiddleware } from "./auth";
import "./db"; // init DB + seed

const app = new Hono();

// Global middleware
app.use("*", cors());

// Error handling
app.onError((err, c) => {
  console.error("[erp] Error:", err.message);
  return c.json({ error: "Internal server error" }, 500);
});

// Health check
app.get("/api/health", (c) => c.json({ ok: true, service: "erp-backend" }));

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

const port = 4000;
console.log(`[erp] Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
