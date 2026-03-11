import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync } from "fs";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

const DATA_DIR = join(import.meta.dir, "../data");
mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new Database(join(DATA_DIR, "erp.db"));
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    email TEXT,
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
    unit TEXT NOT NULL DEFAULT 'ชิ้น',
    stock REAL NOT NULL DEFAULT 0,
    image_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS raw_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price_per_unit REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'กก.',
    stock REAL NOT NULL DEFAULT 0,
    supplier TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed default admin
async function seedAdmin() {
  const existing = db.select().from(schema.users).where(
    eq(schema.users.username, "admin")
  ).get();
  if (!existing) {
    const hashed = await Bun.password.hash("admin123", { algorithm: "bcrypt" });
    db.insert(schema.users).values({
      username: "admin",
      password: hashed,
      displayName: "Administrator",
      role: "admin",
      email: "admin@erp.local",
    }).run();
    console.log("[db] Default admin seeded (admin/admin123)");
  }
}

seedAdmin().catch(console.error);
