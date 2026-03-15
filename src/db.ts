import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

// Simple local SQLite — no Turso, no Vercel workarounds
export const DB_PATH = "file:data/erp.db";

let _client: Client | null = null;
let _db: LibSQLDatabase<typeof schema> | null = null;

function getClient(): Client {
  if (!_client) {
    _client = createClient({ url: DB_PATH });
  }
  return _client;
}

export function getDB(): LibSQLDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getClient(), { schema });
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
  const client = getClient();
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
    ["locations", "TEXT"],
    ["sub_district", "TEXT"],
    ["district", "TEXT"],
    ["province", "TEXT"],
    ["zip_code", "TEXT"],
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
  const client = getClient();
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
      labor_cost REAL NOT NULL DEFAULT 0,
      overhead_cost REAL NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT NOT NULL,
      full_name TEXT,
      nick_name TEXT,
      supplier_type TEXT DEFAULT 'Company',
      phone TEXT,
      email TEXT,
      address TEXT,
      tax_id TEXT,
      payment_terms TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Supplier Indexes
    CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
    CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(code);
    CREATE INDEX IF NOT EXISTS idx_suppliers_tax_id ON suppliers(tax_id);

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
  await migratePayments();
  await migrateReceipts();
  await migratePurchaseOrders();
  await migrateUoms();
  await migrateRawMaterials();
  await migrateDeliveryNotes();
  await migrateInvoices();
  await migrateCancelSupport();
  await migrateExpenseFlow();
  await migrateRecurringExpenses();
  await migrateProductCategories();
  await migrateSupplierPayment();
  await migrateShortTermLoans();
  await migrateExpenseNumber();
  await migrateExpenseSupplier();
  await migrateWithholdingTax();
  await migratePrintLogs();
  await migrateLoginAttempts();
  await migrateDnItems();
  await seedAdminUser();
}

async function migrateSupplierPayment() {
  const client = getClient();
  const newCols: [string, string][] = [
    ["bank_name", "TEXT"],
    ["bank_account_number", "TEXT"],
    ["bank_account_name", "TEXT"],
    ["prompt_pay_id", "TEXT"],
    ["payment_notes", "TEXT"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE suppliers ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists
    }
  }
}

async function migrateUsers() {
  const client = getClient();
  const newCols: [string, string][] = [
    ["password", "TEXT"],
    ["phone", "TEXT"],
    ["google_id", "TEXT"],
    ["signature_url", "TEXT"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists
    }
  }
}

async function migrateUoms() {
  const client = getClient();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS uoms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_en TEXT,
      category TEXT,
      is_default INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_uoms_code ON uoms(code);
    CREATE INDEX IF NOT EXISTS idx_uoms_category ON uoms(category);
  `);
  // Seed default UOMs
  const existing = await client.execute("SELECT COUNT(*) as cnt FROM uoms");
  const count = Number(existing.rows[0]?.cnt ?? 0);
  if (count === 0) {
    await client.executeMultiple(`
      INSERT INTO uoms (code, name, name_en, category, is_default, sort_order) VALUES ('kg', 'กิโลกรัม', 'Kilogram', 'weight', 1, 1);
      INSERT INTO uoms (code, name, name_en, category, sort_order) VALUES ('g', 'กรัม', 'Gram', 'weight', 2);
      INSERT INTO uoms (code, name, name_en, category, sort_order) VALUES ('ton', 'ตัน', 'Ton', 'weight', 3);
      INSERT INTO uoms (code, name, name_en, category, is_default, sort_order) VALUES ('pcs', 'ชิ้น', 'Piece', 'quantity', 1, 4);
      INSERT INTO uoms (code, name, name_en, category, sort_order) VALUES ('box', 'กล่อง', 'Box', 'quantity', 5);
      INSERT INTO uoms (code, name, name_en, category, sort_order) VALUES ('pack', 'แพ็ค', 'Pack', 'quantity', 6);
      INSERT INTO uoms (code, name, name_en, category, sort_order) VALUES ('bag', 'ถุง', 'Bag', 'quantity', 7);
      INSERT INTO uoms (code, name, name_en, category, sort_order) VALUES ('bottle', 'ขวด', 'Bottle', 'quantity', 8);
      INSERT INTO uoms (code, name, name_en, category, sort_order) VALUES ('can', 'กระป๋อง', 'Can', 'quantity', 9);
      INSERT INTO uoms (code, name, name_en, category, sort_order) VALUES ('tray', 'ถาด', 'Tray', 'quantity', 10);
    `);
  }
}

async function migrateRawMaterials() {
  const client = getClient();
  try {
    await client.execute("ALTER TABLE raw_materials ADD COLUMN code TEXT");
  } catch {
    // column already exists
  }
}

async function seedAdminUser() {
  const client = getClient();
  // Only seed admin if users table is completely empty (fresh DB)
  const userCount = await client.execute("SELECT COUNT(*) as cnt FROM users");
  const count = Number(userCount.rows[0]?.cnt ?? 0);
  if (count === 0) {
    const hashed = await Bun.password.hash("admin123");
    await client.execute({
      sql: "INSERT INTO users (username, password, display_name, role, email) VALUES (?, ?, ?, ?, ?)",
      args: ["admin", hashed, "Admin", "admin", "admin@frozen-erp.local"],
    });
  }
}

async function migrateCompanySettings() {
  const client = getClient();
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
  const client = getClient();
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
    ["locations", "TEXT"],
    ["total_commission", "REAL DEFAULT 0"],
    ["po_number", "TEXT"],
    ["po_date", "TEXT"],
    ["po_notes", "TEXT"],
    ["confirmed_by", "INTEGER"],
    ["confirmed_at", "TEXT"],
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
  const client = getClient();
  const newCols: [string, string][] = [
    ["item_code", "TEXT"],
    ["rate", "REAL"],
    ["uom", "TEXT DEFAULT 'Pcs.'"],
    ["weight", "REAL DEFAULT 0"],
    ["packing_detail", "TEXT"],
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
  const client = getClient();
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

async function migratePayments() {
  const client = getClient();
  const newCols: [string, string][] = [
    ["slip_image", "TEXT"],
    ["payment_date", "TEXT"],
    ["bank_name", "TEXT"],
    ["payer_name", "TEXT"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE payments ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists — skip
    }
  }
}

async function migrateReceipts() {
  const client = getClient();
  const newCols: [string, string][] = [
    ["receipt_company_name", "TEXT"],
    ["receipt_address", "TEXT"],
    ["receipt_tax_id", "TEXT"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE receipts ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists — skip
    }
  }
}

async function migratePurchaseOrders() {
  const client = getClient();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL UNIQUE,
      production_order_id INTEGER,
      status TEXT NOT NULL DEFAULT 'draft',
      supplier TEXT,
      total_amount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS po_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL,
      raw_material_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'กก.',
      unit_price REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_po_items_po ON po_items(purchase_order_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_production ON purchase_orders(production_order_id);

    -- Delivery Tracking (QR Code)
    CREATE TABLE IF NOT EXISTS delivery_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      delivery_note_id INTEGER NOT NULL,
      sales_order_id INTEGER,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS delivery_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_note_id INTEGER NOT NULL,
      token_id INTEGER,
      photo_url TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      taken_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS delivery_confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_note_id INTEGER NOT NULL,
      token_id INTEGER,
      signature_url TEXT,
      latitude REAL,
      longitude REAL,
      mac_address TEXT,
      user_agent TEXT,
      confirmed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_delivery_tokens_token ON delivery_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_delivery_tokens_dn ON delivery_tokens(delivery_note_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_photos_dn ON delivery_photos(delivery_note_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_confirmations_dn ON delivery_confirmations(delivery_note_id);
  `);
}

async function migrateDeliveryNotes() {
  const client = getClient();
  const newCols: [string, string][] = [
    ["confirmed_by", "INTEGER"],
    ["confirmed_at", "TEXT"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE delivery_notes ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists — skip
    }
  }
}

async function migrateInvoices() {
  const client = getClient();
  const newCols: [string, string][] = [
    ["confirmed_by", "INTEGER"],
    ["confirmed_at", "TEXT"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE invoices ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists — skip
    }
  }
}

async function migrateProducts() {
  const client = getClient();
  const newCols: [string, string][] = [
    ["raw_material", "TEXT"],
    ["raw_material_yield", "REAL"],
    ["description", "TEXT"],
    ["has_vat", "INTEGER DEFAULT 1"],
    ["packing_weight", "REAL"],
    ["packing_unit", "TEXT DEFAULT 'kg'"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE products ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists — skip
    }
  }
}

async function migrateExpenseFlow() {
  const client = getClient();
  const newCols: [string, string][] = [
    ["due_date", "TEXT"],
    ["paid_at", "TEXT"],
    ["slip_image", "TEXT"],
    ["payment_method", "TEXT"],
    ["recurring_expense_id", "INTEGER"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE expenses ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists
    }
  }
  // Migrate status: active → pending (for existing rows)
  await client.execute("UPDATE expenses SET status = 'pending' WHERE status = 'active'");
}

async function migrateRecurringExpenses() {
  const client = getClient();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      due_day INTEGER,
      pay_to TEXT,
      payment_method TEXT,
      total_debt REAL DEFAULT 0,
      total_paid REAL DEFAULT 0,
      remaining_debt REAL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS recurring_expense_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recurring_expense_id INTEGER NOT NULL,
      expense_id INTEGER,
      month TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_at TEXT,
      status TEXT DEFAULT 'pending',
      slip_image TEXT,
      payment_method TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active ON recurring_expenses(is_active);
    CREATE INDEX IF NOT EXISTS idx_recurring_expenses_category ON recurring_expenses(category);
    CREATE INDEX IF NOT EXISTS idx_rec_payments_recurring ON recurring_expense_payments(recurring_expense_id);
    CREATE INDEX IF NOT EXISTS idx_rec_payments_month ON recurring_expense_payments(month);
    CREATE INDEX IF NOT EXISTS idx_rec_payments_status ON recurring_expense_payments(status);
  `);
  // Add new columns if not exists
  const newCols: [string, string][] = [
    ["image_url", "TEXT"],
    ["ref1", "TEXT"],
    ["ref2", "TEXT"],
    ["bank_account", "TEXT"],
    ["bank_name", "TEXT"],
    ["account_name", "TEXT"],
    ["total_amount", "REAL DEFAULT 0"],
    ["principal_amount", "REAL DEFAULT 0"],
    ["has_withholding_tax", "INTEGER DEFAULT 0"],
    ["wht_form_type", "TEXT"],
    ["wht_income_type", "TEXT"],
    ["wht_income_description", "TEXT"],
    ["wht_rate", "REAL"],
    ["supplier_id", "INTEGER"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE recurring_expenses ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists
    }
  }
}

async function migrateProductCategories() {
  const client = getClient();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_product_categories_name ON product_categories(name);
    CREATE INDEX IF NOT EXISTS idx_product_categories_active ON product_categories(is_active);
  `);
}

async function migrateCancelSupport() {
  const client = getClient();
  const cancelCols = {
    sales_orders: [
      ["cancelled_at", "TEXT"],
      ["cancelled_by", "INTEGER"],
    ],
    expenses: [
      ["status", "TEXT DEFAULT 'active'"],
      ["cancelled_at", "TEXT"],
      ["cancelled_by", "INTEGER"],
    ],
    purchase_orders: [
      ["cancelled_at", "TEXT"],
      ["cancelled_by", "INTEGER"],
    ],
  };
  for (const [table, cols] of Object.entries(cancelCols)) {
    for (const [col, type] of cols) {
      try {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      } catch {
        // column already exists
      }
    }
  }
}

async function migrateExpenseSupplier() {
  const client = getClient();
  try {
    await client.execute("ALTER TABLE expenses ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)");
  } catch {
    // column already exists
  }
  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON expenses(supplier_id);
  `);
}

async function migrateShortTermLoans() {
  const client = getClient();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS short_term_loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      borrower_name TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      image_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS loan_repayments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      image_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_loans_status ON short_term_loans(status);
    CREATE INDEX IF NOT EXISTS idx_loan_repayments_loan ON loan_repayments(loan_id);
  `);
}

async function migrateExpenseNumber() {
  const client = getClient();
  // Add expense_number column
  try {
    await client.execute("ALTER TABLE expenses ADD COLUMN expense_number TEXT");
  } catch {
    // column already exists
  }
  // Create unique index
  try {
    await client.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_number ON expenses(expense_number)");
  } catch {
    // index already exists
  }
  // Backfill existing expenses that don't have a number yet
  const rows = await client.execute("SELECT id, recurring_expense_id, date FROM expenses WHERE expense_number IS NULL ORDER BY id ASC");
  for (const row of rows.rows) {
    const id = row.id as number;
    const isRecurring = row.recurring_expense_id != null;
    const prefix = isRecurring ? "REC" : "EXP";
    const dateStr = ((row.date as string) || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
    const pattern = `${prefix}-${dateStr}-%`;
    const last = await client.execute({ sql: "SELECT expense_number FROM expenses WHERE expense_number LIKE ? ORDER BY expense_number DESC LIMIT 1", args: [pattern] });
    let seq = 1;
    if (last.rows.length > 0 && last.rows[0].expense_number) {
      const lastNum = (last.rows[0].expense_number as string).split("-").pop() || "0";
      seq = parseInt(lastNum, 10) + 1;
    }
    const expenseNumber = `${prefix}-${dateStr}-${String(seq).padStart(3, "0")}`;
    await client.execute({ sql: "UPDATE expenses SET expense_number = ? WHERE id = ?", args: [expenseNumber, id] });
  }
}

async function migratePrintLogs() {
  const client = getClient();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS print_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_type TEXT NOT NULL,
      ref_id INTEGER NOT NULL,
      ref_number TEXT,
      description TEXT,
      printed_by TEXT,
      printed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_print_logs_ref ON print_logs(doc_type, ref_id);
    CREATE INDEX IF NOT EXISTS idx_print_logs_date ON print_logs(printed_at);
  `);
}

async function migrateLoginAttempts() {
  const client = getClient();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      ip TEXT NOT NULL,
      user_agent TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
  `);
}

async function migrateDnItems() {
  const client = getClient();
  const newCols: [string, string][] = [
    ["uom", "TEXT DEFAULT 'Pcs.'"],
    ["weight", "REAL DEFAULT 0"],
  ];
  for (const [col, type] of newCols) {
    try {
      await client.execute(`ALTER TABLE dn_items ADD COLUMN ${col} ${type}`);
    } catch {
      // column already exists
    }
  }
  // Backfill existing dn_items from so_items data
  await client.execute(`
    UPDATE dn_items SET
      uom = COALESCE((
        SELECT si.uom FROM so_items si
        JOIN delivery_notes dn ON dn.id = dn_items.delivery_note_id
        WHERE si.sales_order_id = dn.sales_order_id AND si.product_id = dn_items.product_id
        LIMIT 1
      ), (SELECT p.unit FROM products p WHERE p.id = dn_items.product_id), 'Pcs.'),
      weight = COALESCE((
        SELECT si.weight FROM so_items si
        JOIN delivery_notes dn ON dn.id = dn_items.delivery_note_id
        WHERE si.sales_order_id = dn.sales_order_id AND si.product_id = dn_items.product_id
        LIMIT 1
      ), dn_items.quantity * COALESCE((SELECT p.packing_weight FROM products p WHERE p.id = dn_items.product_id), 0))
    WHERE uom = 'Pcs.' OR uom IS NULL
  `);
}

async function migrateWithholdingTax() {
  const client = getClient();
  const whtCols: [string, string][] = [
    ["has_withholding_tax", "INTEGER DEFAULT 0"],
    ["wht_form_type", "TEXT"],
    ["wht_income_type", "TEXT"],
    ["wht_income_description", "TEXT"],
    ["wht_rate", "REAL"],
    ["wht_amount", "REAL"],
    ["wht_net_amount", "REAL"],
    ["wht_doc_number", "TEXT"],
  ];
  for (const [col, def] of whtCols) {
    try { await client.execute(`ALTER TABLE expenses ADD COLUMN ${col} ${def}`); } catch (_) { /* exists */ }
  }

  // --- Add raw_material_id, product_id, item_type to expenses ---
  const itemCols: [string, string][] = [
    ["raw_material_id", "INTEGER"],
    ["product_id", "INTEGER"],
    ["item_type", "TEXT"],
    ["item_qty", "REAL"],
    ["item_price_per_unit", "REAL"],
  ];
  for (const [col, def] of itemCols) {
    try { await client.execute(`ALTER TABLE expenses ADD COLUMN ${col} ${def}`); } catch (_) { /* exists */ }
  }
}
