import type { Context, Next } from "hono";
import { db } from "./db.js";
import { loginAttempts } from "./schema.js";
import { eq, and, gte, desc, sql } from "drizzle-orm";

// Config
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

function getClientIP(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    || c.req.header("x-real-ip")
    || "unknown";
}

/**
 * Check if account is locked (too many failed attempts in lockout window)
 */
export async function isAccountLocked(username: string): Promise<{ locked: boolean; remainingMs: number }> {
  const windowStart = new Date(Date.now() - LOCKOUT_DURATION_MS).toISOString();

  const recentAttempts = await db
    .select({ count: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.username, username),
        eq(loginAttempts.success, 0),
        gte(loginAttempts.createdAt, windowStart)
      )
    )
    .get();

  const failCount = recentAttempts?.count ?? 0;

  if (failCount >= MAX_FAILED_ATTEMPTS) {
    // Find when the lockout window ends (based on earliest failed attempt in window)
    const oldestFail = await db
      .select({ createdAt: loginAttempts.createdAt })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, username),
          eq(loginAttempts.success, 0),
          gte(loginAttempts.createdAt, windowStart)
        )
      )
      .orderBy(loginAttempts.createdAt)
      .limit(1)
      .get();

    if (oldestFail) {
      const lockoutEnd = new Date(oldestFail.createdAt).getTime() + LOCKOUT_DURATION_MS;
      const remainingMs = Math.max(0, lockoutEnd - Date.now());
      if (remainingMs > 0) {
        return { locked: true, remainingMs };
      }
    }
  }

  return { locked: false, remainingMs: 0 };
}

/**
 * Get remaining login attempts before lockout
 */
export async function getRemainingAttempts(username: string): Promise<number> {
  const windowStart = new Date(Date.now() - LOCKOUT_DURATION_MS).toISOString();

  const recentFails = await db
    .select({ count: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.username, username),
        eq(loginAttempts.success, 0),
        gte(loginAttempts.createdAt, windowStart)
      )
    )
    .get();

  return Math.max(0, MAX_FAILED_ATTEMPTS - (recentFails?.count ?? 0));
}

/**
 * Log a login attempt
 */
export async function logLoginAttempt(opts: {
  username: string;
  ip: string;
  userAgent: string | undefined;
  success: boolean;
  reason: string;
}) {
  await db.insert(loginAttempts).values({
    username: opts.username,
    ip: opts.ip,
    userAgent: opts.userAgent || null,
    success: opts.success ? 1 : 0,
    reason: opts.reason,
  });
}

/**
 * Security headers middleware
 */
export async function securityHeaders(c: Context, next: Next) {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // HSTS only for production domain
  if (c.req.header("host")?.includes("mhorkub.com")) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

/**
 * Helper to extract client info from context
 */
export function getClientInfo(c: Context) {
  return {
    ip: getClientIP(c),
    userAgent: c.req.header("user-agent"),
  };
}
