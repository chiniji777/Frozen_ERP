import { Hono } from "hono";
import { db } from "../db.js";
import { users } from "../schema.js";
import { eq } from "drizzle-orm";
import { signToken } from "../auth.js";

const ALLOWED_EMAILS = ["tanawat.pree@gmail.com"];

const auth = new Hono();

auth.post("/google", async (c) => {
  const body = await c.req.json();
  const { id_token } = body;

  if (!id_token) {
    return c.json({ error: "id_token is required" }, 400);
  }

  // Verify Google ID token
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    return c.json({ error: "Server misconfiguration: GOOGLE_CLIENT_ID not set" }, 500);
  }

  let googlePayload: { email: string; name: string; sub: string; picture?: string };
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`);
    if (!res.ok) {
      return c.json({ error: "Invalid Google token" }, 401);
    }
    const data = await res.json() as Record<string, string>;

    // Verify audience matches our client ID
    if (data.aud !== googleClientId) {
      return c.json({ error: "Token audience mismatch" }, 401);
    }

    googlePayload = {
      email: data.email,
      name: data.name || data.email.split("@")[0],
      sub: data.sub,
      picture: data.picture,
    };
  } catch {
    return c.json({ error: "Failed to verify Google token" }, 401);
  }

  // Check email whitelist
  if (!ALLOWED_EMAILS.includes(googlePayload.email)) {
    return c.json({ error: "Access denied — email not authorized" }, 403);
  }

  // Upsert user
  let user = await db.select().from(users).where(eq(users.email, googlePayload.email)).get();

  if (!user) {
    // Create new user
    const result = await db.insert(users).values({
      username: googlePayload.email.split("@")[0],
      displayName: googlePayload.name,
      role: "admin",
      email: googlePayload.email,
      googleId: googlePayload.sub,
      avatarUrl: googlePayload.picture || null,
    }).run();
    user = await db.select().from(users).where(eq(users.email, googlePayload.email)).get();
  } else {
    // Update existing user info
    await db.update(users).set({
      googleId: googlePayload.sub,
      avatarUrl: googlePayload.picture || user.avatarUrl,
      displayName: googlePayload.name || user.displayName,
    }).where(eq(users.id, user.id)).run();
  }

  if (!user) {
    return c.json({ error: "Failed to create user" }, 500);
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

export { auth };
