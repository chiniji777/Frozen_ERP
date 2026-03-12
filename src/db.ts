import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema.js";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:data/erp.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });

// Initialize tables
async function migrateCustomers() {
  const newCols = [
    ["code", "TEXT"],
    ["full_name", "TEXT"],
    ["nick_name", "TEXT"],
    ["territory", "TEXT"],
    ["customer_type", "TEXT DEFAULT 'Company'"],
    ["credit_limit", "REAL DEFAULT 0"],
    ["payment_terms", "TEXT"],
    ["sales_partner", "TEXT"],
    ["commission_rate", "REAL DEFAULT 0"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE customers ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists — skip
    }
  }
  // new indexes
  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code);
    CREATE INDEX IF NOT EXISTS idx_customers_territory ON customers(territory);
    CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
  `);
}

export async function initDB() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      email TEXT NOT NULL UNIQUE,
      google_id TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      tax_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE,
      category TEXT,
      sale_price REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'piece',
      stock REAL NOT NULL DEFAULT 0,
      image_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS raw_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price_per_unit REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'kg',
      stock REAL NOT NULL DEFAULT 0,
      supplier TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bom (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bom_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bom_id INTEGER NOT NULL,
      raw_material_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'kg',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS production_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bom_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      labor_cost REAL NOT NULL DEFAULT 0,
      overhead_cost REAL NOT NULL DEFAULT 0,
      total_material_cost REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      cost_per_unit REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sales_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      order_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal REAL NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 7,
      vat_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS so_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS delivery_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_order_id INTEGER NOT NULL,
      dn_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      shipped_at TEXT,
      delivered_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dn_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_note_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_order_id INTEGER NOT NULL,
      delivery_note_id INTEGER,
      invoice_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal REAL NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 7,
      vat_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      due_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      payment_number TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'transfer',
      status TEXT NOT NULL DEFAULT 'pending',
      reference TEXT,
      paid_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      receipt_number TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes for search optimization
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_raw_materials_name ON raw_materials(name);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_created ON sales_orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_so_items_so ON so_items(sales_order_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_so ON invoices(sales_order_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_iv ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_dn_items_dn ON dn_items(delivery_note_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_notes_so ON delivery_notes(sales_order_id);
    CREATE INDEX IF NOT EXISTS idx_bom_items_bom ON bom_items(bom_id);
    CREATE INDEX IF NOT EXISTS idx_production_product ON production_orders(product_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_receipts_payment ON receipts(payment_id);
  `);
  await migrateCustomers();
  await migrateProducts();
  await migrateSalesOrders();
  await migrateSoItems();
  await migrateSoPaymentTerms();
}

async function migrateSalesOrders() {
  const newCols: [string, string][] = [
    ["date", "TEXT"],
    ["delivery_start_date", "TEXT"],
    ["delivery_end_date", "TEXT"],
    ["customer_address", "TEXT"],
    ["shipping_address_name", "TEXT"],
    ["shipping_address", "TEXT"],
    ["contact_person", "TEXT"],
    ["contact", "TEXT"],
    ["mobile_no", "TEXT"],
    ["warehouse", "TEXT DEFAULT 'Ladprao 43 - FFP'"],
    ["total_quantity", "REAL DEFAULT 0"],
    ["total_net_weight", "REAL DEFAULT 0"],
    ["payment_terms_template", "TEXT"],
    ["sales_partner", "TEXT"],
    ["commission_rate", "REAL DEFAULT 0"],
    ["total_commission", "REAL DEFAULT 0"],
    ["po_number", "TEXT"],
    ["po_date", "TEXT"],
    ["po_notes", "TEXT"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE sales_orders ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists — skip
    }
  }
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS so_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_order_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_so_attachments_so ON so_attachments(sales_order_id);
  `);
}

async function migrateSoItems() {
  const newCols: [string, string][] = [
    ["item_code", "TEXT"],
    ["rate", "REAL"],
    ["uom", "TEXT DEFAULT 'Pcs.'"],
    ["weight", "REAL DEFAULT 0"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE so_items ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists — skip
    }
  }
}

async function migrateSoPaymentTerms() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS so_payment_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_order_id INTEGER NOT NULL,
      payment_term TEXT,
      description TEXT,
      due_date TEXT,
      invoice_portion REAL,
      payment_amount REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_so_payment_terms_so ON so_payment_terms(sales_order_id);
  `);
}

async function migrateProducts() {
  const newCols: [string, string][] = [
    ["raw_material", "TEXT"],
    ["raw_material_yield", "REAL"],
    ["description", "TEXT"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE products ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists — skip
    }
  }
}
