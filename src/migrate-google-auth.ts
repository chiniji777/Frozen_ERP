/**
 * Migration: Password Auth → Google OAuth
 *
 * สิ่งที่ทำ:
 * 1. สร้าง users table ใหม่ (ไม่มี password, มี email unique + google_id + avatar_url)
 * 2. ลบ user เก่าทั้งหมด (password-based users)
 * 3. User ใหม่จะถูกสร้างอัตโนมัติตอน login ผ่าน Google OAuth
 *
 * วิธีรัน: bun run src/migrate-google-auth.ts
 */

import { createClient } from "@libsql/client";

const client = createClient({
  url: "file:data/erp.db",
});

async function migrate() {
  console.log("[migrate] Starting Google Auth migration...");

  // Check if old users table has password column
  const tableInfo = await client.execute("PRAGMA table_info(users)");
  const hasPassword = tableInfo.rows.some(row => row.name === "password");

  if (!hasPassword) {
    console.log("[migrate] users table already migrated (no password column). Skipping.");
    return;
  }

  console.log("[migrate] Found old users table with password column. Migrating...");

  // Count old users
  const countResult = await client.execute("SELECT COUNT(*) as count FROM users");
  const oldCount = countResult.rows[0].count;
  console.log(`[migrate] Found ${oldCount} old user(s) to remove.`);

  // Recreate users table without password
  await client.executeMultiple(`
    -- Drop old users table
    DROP TABLE IF EXISTS users;

    -- Create new users table (no password, email required + unique)
    CREATE TABLE users (
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
  `);

  console.log("[migrate] users table recreated without password column.");
  console.log("[migrate] All old users removed. New users will be created on Google OAuth login.");
  console.log("[migrate] Only tanawat.pree@gmail.com is whitelisted.");
  console.log("[migrate] Done!");
}

migrate().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
