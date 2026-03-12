import { Hono } from "hono";
import { db } from "../db.js";
import { users } from "../schema.js";
import { eq } from "drizzle-orm";
import { signToken, authMiddleware } from "../auth.js";

const auth = new Hono();

// POST /api/auth/login — username + password
auth.post("/login", async (c) => {
  const body = await c.req.json();
  const { username, password } = body;

  if (!username || !password) {
    return c.json({ error: "username and password are required" }, 400);
  }

  const user = await db.select().from(users).where(eq(users.username, username)).get();
  if (!user || !user.password) {
    return c.json({ error: "Invalid username or password" }, 401);
  }

  const valid = await Bun.password.verify(password, user.password);
  if (!valid) {
    return c.json({ error: "Invalid username or password" }, 401);
  }

  const token = await signToken({
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  });

  return c.json({
    ok: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
  });
});

// GET /api/auth/me — verify token and return current user
auth.get("/me", authMiddleware, async (c) => {
  const tokenUser = c.get("user") as { userId: number; username: string; email: string; role: string };
  const user = await db.select().from(users).where(eq(users.id, tokenUser.userId)).get();
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      signatureUrl: user.signatureUrl,
    },
  });
});

// GET /api/auth/users — list all users (for dropdowns like Sales Team)
auth.get("/users", authMiddleware, async (c) => {
  const allUsers = await db.select({
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    role: users.role,
    email: users.email,
    phone: users.phone,
  }).from(users).all();
  // Frontend expects `active` field — all users in DB are active
  return c.json(allUsers.map((u) => ({ ...u, active: true })));
});

// POST /api/auth/users — create new user
auth.post("/users", authMiddleware, async (c) => {
  const body = await c.req.json();
  const { username, password, displayName, email, role, phone } = body;

  if (!username || !password || !displayName || !email) {
    return c.json({ error: "username, password, displayName, and email are required" }, 400);
  }

  // Check duplicate username
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
  if (existing) {
    return c.json({ error: "Username already exists" }, 409);
  }

  // Check duplicate email
  const existingEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existingEmail) {
    return c.json({ error: "Email already exists" }, 409);
  }

  const hashedPassword = await Bun.password.hash(password);

  const result = await db.insert(users).values({
    username,
    password: hashedPassword,
    displayName,
    email,
    phone: phone || null,
    role: role || "staff",
  }).returning({ id: users.id });

  return c.json({ ok: true, id: result[0].id }, 201);
});

// PUT /api/auth/users/:id — update user
auth.put("/users/:id", authMiddleware, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const { displayName, email, role, password, phone, username } = body;

  const existing = await db.select().from(users).where(eq(users.id, id)).get();
  if (!existing) {
    return c.json({ error: "User not found" }, 404);
  }

  const updates: Record<string, unknown> = {};
  if (username !== undefined) updates.username = username;
  if (displayName !== undefined) updates.displayName = displayName;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (role !== undefined) updates.role = role;
  if (password) updates.password = await Bun.password.hash(password);

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  await db.update(users).set(updates).where(eq(users.id, id));
  return c.json({ ok: true });
});

// POST /api/auth/users/:id/signature — upload signature image
auth.post("/users/:id/signature", authMiddleware, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(users).where(eq(users.id, id)).get();
  if (!existing) return c.json({ error: "User not found" }, 404);

  const formData = await c.req.formData();
  const file = formData.get("signature") as File | null;
  if (!file) return c.json({ error: "No signature file provided" }, 400);

  const { mkdir, writeFile } = await import("fs/promises");
  const { join } = await import("path");
  const dir = join(process.cwd(), "data", "signatures");
  await mkdir(dir, { recursive: true });

  const ext = file.name?.split(".").pop() || "png";
  const filename = `sig_${id}_${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, filename), buffer);

  const signatureUrl = `/api/signatures/${filename}`;
  await db.update(users).set({ signatureUrl }).where(eq(users.id, id));

  return c.json({ ok: true, signatureUrl });
});

// DELETE /api/auth/users/:id — delete user
auth.delete("/users/:id", authMiddleware, async (c) => {
  const id = Number(c.req.param("id"));

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).get();
  if (!existing) {
    return c.json({ error: "User not found" }, 404);
  }

  await db.delete(users).where(eq(users.id, id));
  return c.json({ ok: true });
});

export { auth };
