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
