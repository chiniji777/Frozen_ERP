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
      avatarUrl: user.avatarUrl,
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
  }).from(users).all();
  return c.json(allUsers);
});

export { auth };
