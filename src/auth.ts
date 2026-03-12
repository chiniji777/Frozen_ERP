import { SignJWT, jwtVerify } from "jose";
import type { Context, Next } from "hono";

if (!process.env.JWT_SECRET) {
  throw new Error("[auth] JWT_SECRET not set! Cannot start server without it.");
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function signToken(payload: { userId: number; username: string; email: string; role: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as { userId: number; username: string; email: string; role: string };
}

export async function authMiddleware(c: Context, next: Next) {
  // Check Authorization header first
  const header = c.req.header("Authorization");
  let token: string | undefined;

  if (header?.startsWith("Bearer ")) {
    token = header.slice(7);
  } else {
    // Fallback: check query param (for window.open print routes)
    token = c.req.query("token") || undefined;
  }

  if (!token) {
    return c.json({ error: "Unauthorized — token required" }, 401);
  }
  try {
    const user = await verifyToken(token);
    c.set("user", user);
    return next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as { role: string } | undefined;
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: "Forbidden — insufficient role" }, 403);
    }
    return next();
  };
}
