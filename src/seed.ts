import { db } from "./db";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { hashPassword } from "./auth";

export async function seedAdmin() {
  const existing = await db.select().from(schema.users).where(
    eq(schema.users.username, "admin")
  ).get();
  if (!existing) {
    const hashed = await hashPassword("admin123");
    await db.insert(schema.users).values({
      username: "admin",
      password: hashed,
      displayName: "Administrator",
      role: "admin",
      email: "admin@erp.local",
    }).run();
    console.log("[db] Default admin seeded (admin/admin123)");
  }
}
