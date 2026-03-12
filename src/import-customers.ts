import { readFileSync } from "fs";
import { join } from "path";
import { db } from "./db.js";
import { customers } from "./schema.js";
import { eq } from "drizzle-orm";
import { initDB } from "./db.js";

const JSON_PATH = join(process.cwd(), "data", "customers-import.json");

interface CustomerRow {
  Sr: number;
  Name: string;
  "Full Name": string;
  "Nick Name"?: string;
  Territory?: string;
  Type?: string;
  "Tax ID"?: string;
  "Credit Limit"?: number;
  "Default Payment Terms Template"?: string;
}

async function importCustomers() {
  await initDB();

  const raw = readFileSync(JSON_PATH, "utf-8");
  const rows: CustomerRow[] = JSON.parse(raw);

  console.log(`[import] Found ${rows.length} rows in JSON`);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const code = (row.Name || "").trim();
    const fullName = (row["Full Name"] || "").trim();
    const nickName = (row["Nick Name"] || "").trim();
    const territory = (row.Territory || "").trim();
    const type = (row.Type || "Company").trim();
    const taxId = (row["Tax ID"] || "").trim();
    const creditLimit = Number(row["Credit Limit"]) || 0;
    const paymentTerms = (row["Default Payment Terms Template"] || "").trim();

    const name = fullName || code;
    if (!name) {
      skipped++;
      continue;
    }

    // Check duplicate by code
    if (code) {
      const existing = await db.select({ id: customers.id }).from(customers).where(eq(customers.code, code)).get();
      if (existing) {
        skipped++;
        continue;
      }
    }

    const customerType = type === "Individual" ? "Individual" : "Company";

    try {
      await db.insert(customers).values({
        code: code || null,
        name,
        fullName: fullName || null,
        nickName: nickName || null,
        territory: territory || null,
        customerType,
        taxId: taxId || null,
        creditLimit,
        paymentTerms: paymentTerms || null,
      }).run();
      imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[import] Error row ${code}: ${msg}`);
      skipped++;
    }
  }

  console.log(`[import] Done: ${imported} imported, ${skipped} skipped`);
}

importCustomers().catch(console.error);
