import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
};

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["admin", "manager", "staff"] }).notNull().default("staff"),
  email: text("email"),
  ...timestamps,
});

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  taxId: text("tax_id"),
  notes: text("notes"),
  ...timestamps,
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sku: text("sku").unique(),
  category: text("category"),
  salePrice: real("sale_price").notNull().default(0),
  unit: text("unit").notNull().default("ชิ้น"),
  stock: real("stock").notNull().default(0),
  imageUrl: text("image_url"),
  ...timestamps,
});

export const rawMaterials = sqliteTable("raw_materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  pricePerUnit: real("price_per_unit").notNull().default(0),
  unit: text("unit").notNull().default("กก."),
  stock: real("stock").notNull().default(0),
  supplier: text("supplier"),
  notes: text("notes"),
  ...timestamps,
});

export const bom = sqliteTable("bom", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  ...timestamps,
});

export const bomItems = sqliteTable("bom_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bomId: integer("bom_id").notNull(),
  rawMaterialId: integer("raw_material_id").notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull().default("กก."),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const productionOrders = sqliteTable("production_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bomId: integer("bom_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: real("quantity").notNull(),
  status: text("status", { enum: ["draft", "in_progress", "completed", "cancelled"] }).notNull().default("draft"),
  laborCost: real("labor_cost").notNull().default(0),
  overheadCost: real("overhead_cost").notNull().default(0),
  totalMaterialCost: real("total_material_cost").notNull().default(0),
  totalCost: real("total_cost").notNull().default(0),
  costPerUnit: real("cost_per_unit").notNull().default(0),
  notes: text("notes"),
  ...timestamps,
});

export const salesOrders = sqliteTable("sales_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  orderNumber: text("order_number").notNull().unique(),
  status: text("status", { enum: ["draft", "confirmed", "delivered", "invoiced", "cancelled"] }).notNull().default("draft"),
  subtotal: real("subtotal").notNull().default(0),
  vatRate: real("vat_rate").notNull().default(7),
  vatAmount: real("vat_amount").notNull().default(0),
  totalAmount: real("total_amount").notNull().default(0),
  notes: text("notes"),
  ...timestamps,
});

export const soItems = sqliteTable("so_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  salesOrderId: integer("sales_order_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: real("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  amount: real("amount").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const deliveryNotes = sqliteTable("delivery_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  salesOrderId: integer("sales_order_id").notNull(),
  dnNumber: text("dn_number").notNull().unique(),
  status: text("status", { enum: ["pending", "shipped", "delivered"] }).notNull().default("pending"),
  shippedAt: text("shipped_at"),
  deliveredAt: text("delivered_at"),
  notes: text("notes"),
  ...timestamps,
});

export const dnItems = sqliteTable("dn_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deliveryNoteId: integer("delivery_note_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: real("quantity").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  salesOrderId: integer("sales_order_id").notNull(),
  deliveryNoteId: integer("delivery_note_id"),
  invoiceNumber: text("invoice_number").notNull().unique(),
  status: text("status", { enum: ["draft", "sent", "paid", "overdue"] }).notNull().default("draft"),
  subtotal: real("subtotal").notNull().default(0),
  vatRate: real("vat_rate").notNull().default(7),
  vatAmount: real("vat_amount").notNull().default(0),
  totalAmount: real("total_amount").notNull().default(0),
  dueDate: text("due_date"),
  notes: text("notes"),
  ...timestamps,
});

export const invoiceItems = sqliteTable("invoice_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: real("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  amount: real("amount").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").notNull(),
  paymentNumber: text("payment_number").notNull().unique(),
  amount: real("amount").notNull(),
  method: text("method", { enum: ["cash", "transfer", "cheque"] }).notNull().default("transfer"),
  status: text("status", { enum: ["pending", "completed"] }).notNull().default("pending"),
  reference: text("reference"),
  paidAt: text("paid_at"),
  notes: text("notes"),
  ...timestamps,
});

export const receipts = sqliteTable("receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paymentId: integer("payment_id").notNull(),
  receiptNumber: text("receipt_number").notNull().unique(),
  amount: real("amount").notNull(),
  issuedAt: text("issued_at").default(sql`(datetime('now'))`).notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category", { enum: ["material", "labor", "rent", "utilities", "other"] }).notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  date: text("date").notNull(),
  notes: text("notes"),
  ...timestamps,
});
