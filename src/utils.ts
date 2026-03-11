import { db } from "./db";
import { sql } from "drizzle-orm";

export function generateRunningNumber(prefix: string, tableName: string, columnName: string): string {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const pattern = `${prefix}-${dateStr}-%`;
  const result = db.all(sql`SELECT ${sql.raw(columnName)} FROM ${sql.raw(tableName)} WHERE ${sql.raw(columnName)} LIKE ${pattern} ORDER BY ${sql.raw(columnName)} DESC LIMIT 1`) as any[];
  let seq = 1;
  if (result.length > 0) {
    const last = result[0][columnName] as string;
    const lastSeq = parseInt(last.split("-").pop() || "0", 10);
    seq = lastSeq + 1;
  }
  return `${prefix}-${dateStr}-${String(seq).padStart(3, "0")}`;
}
