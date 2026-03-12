import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";
import * as schema from "./schema.js";

// ⚠️ NOTHING runs at import time — all lazy!
// @libsql/client native bindings hang on Vercel, so we use dynamic import.
let _client: Client | null = null;
let _db: LibSQLDatabase<typeof schema> | null = null;

async function createLazyClient(): Promise<Client> {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url && process.env.VERCEL) {
    throw new Error("[db] TURSO_DATABASE_URL not set on Vercel!");
  }
  if (process.env.VERCEL || (url && url.startsWith("libsql://"))) {
    // Vercel / remote Turso → HTTP client (pure JS, no native bindings)
    const { createClient } = await import("@libsql/client/http");
    return createClient({ url: url!, authToken: process.env.TURSO_AUTH_TOKEN });
  } else {
    // Local dev → native client with file DB
    const { createClient } = await import("@libsql/client");
    return createClient({ url: url || "file:data/erp.db", authToken: process.env.TURSO_AUTH_TOKEN });
  }
}

export async function getClient(): Promise<Client> {
  if (!_client) {
    _client = await createLazyClient();
  }
  return _client;
}

export async function getDB(): Promise<LibSQLDatabase<typeof schema>> {
  if (!_db) {
    _db = drizzle(await getClient(), { schema });
  }
  return _db;
}

// Backward compat — Proxy for `import { db }`
// Only works AFTER initDB() has been called (via middleware)
export const db = new Proxy({} as LibSQLDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    if (!_db) {
      throw new Error("[db] Not initialized yet. Ensure API middleware ran initDB() first.");
    }
    return Reflect.get(_db, prop, receiver);
  },
});

// Initialize tables
async function migrateCustomers() {
  const client = await getClient();
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
  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code);
    CREATE INDEX IF NOT EXISTS idx_customers_territory ON customers(territory);
    CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
  `);
}

export async function initDB() {
  const client = await getClient();
  // Also populate _db so Proxy works
  if (!_db) {
    _db = drizzle(client, { schema });
  }
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      email TEXT NOT NULL UNIQUE,
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

    -- Indexes
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
  await migrateCompanySettings();
  await migrateUsers();
  // seedAdminUser uses Bun.password — skip on Vercel
  if (!process.env.VERCEL) {
    await seedAdminUser();
  }
}

async function migrateUsers() {
  const client = await getClient();
  try {
    await client.execute("ALTER TABLE users ADD COLUMN password TEXT");
  } catch {
    // column already exists
  }
}

async function seedAdminUser() {
  // Uses Bun.password.hash — only works in local Bun runtime
  const client = await getClient();
  const existing = await client.execute("SELECT id, password FROM users WHERE username = 'admin'");
  if (existing.rows.length === 0) {
    const hashed = await Bun.password.hash("admin123");
    await client.execute({
      sql: "INSERT INTO users (username, password, display_name, role, email) VALUES (?, ?, ?, ?, ?)",
      args: ["admin", hashed, "Admin", "admin", "admin@frozen-erp.local"],
    });
  } else if (!existing.rows[0].password) {
    const hashed = await Bun.password.hash("admin123");
    await client.execute({
      sql: "UPDATE users SET password = ? WHERE username = 'admin'",
      args: [hashed],
    });
  }
}

async function migrateCompanySettings() {
  const client = await getClient();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT,
      company_name_en TEXT,
      address TEXT,
      address_en TEXT,
      tax_id TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      branch TEXT,
      logo_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const existing = await client.execute("SELECT COUNT(*) as cnt FROM company_settings");
  const count = Number(existing.rows[0]?.cnt ?? 0);
  if (count === 0) {
    await client.execute(`
      INSERT INTO company_settings (company_name, company_name_en, branch)
      VALUES ('บริษัท โฟรเซ่น ฟู้ด พลัส จำกัด', 'Frozen Food Plus Co., Ltd.', 'สำนักงานใหญ่')
    `);
  }
}

async function migrateSalesOrders() {
  const client = await getClient();
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
  const client = await getClient();
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
  const client = await getClient();
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
  const client = await getClient();
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
