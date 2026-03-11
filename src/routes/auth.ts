import { Hono } from "hono";
import { db } from "../db";
import { users } from "../schema";
import { eq } from "drizzle-orm";
import { signToken, authMiddleware, requireRole } from "../auth";

const auth = new Hono();

// POST /api/auth/login
auth.post("/login", async (c) => {
  const body = await c.req.json();
  const { username, password } = body;
  if (!username || !password) {
    return c.json({ error: "username and password required" }, 400);
  }

  const user = db.select().from(users).where(eq(users.username, username)).get();
  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await Bun.password.verify(password, user.password);
  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await signToken({ userId: user.id, username: user.username, role: user.role });
  return c.json({
    ok: true,
    token,
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
  });
});

// POST /api/auth/register (admin only)
auth.post("/register", authMiddleware, requireRole("admin"), async (c) => {
  const body = await c.req.json();
  const { username, password, displayName, role, email } = body;
  if (!username || !password || !displayName) {
    return c.json({ error: "username, password, displayName required" }, 400);
  }
  if (role && !["admin", "manager", "staff"].includes(role)) {
    return c.json({ error: "role must be admin, manager, or staff" }, 400);
  }

  const existing = db.select().from(users).where(eq(users.username, username)).get();
  if (existing) {
    return c.json({ error: "Username already exists" }, 409);
  }

  const hashed = await Bun.password.hash(password, { algorithm: "bcrypt" });
  const result = db.insert(users).values({
    username,
    password: hashed,
    displayName,
    role: role || "staff",
    email: email || null,
  }).run();

  return c.json({ ok: true, id: result.lastInsertRowid }, 201);
});

export { auth };
