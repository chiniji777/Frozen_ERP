import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./routes/auth";
import { customersRoute } from "./routes/customers";
import { productsRoute } from "./routes/products";
import { rawMaterialsRoute } from "./routes/raw-materials";
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

const port = 4000;
console.log(`[erp] Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
