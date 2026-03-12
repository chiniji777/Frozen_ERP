import { Hono } from "hono";
import { db } from "../db.js";
import { customers } from "../schema.js";
import { eq, inArray } from "drizzle-orm";
import { readFile } from "fs/promises";
import { join } from "path";

const dbdRoute = new Hono();

interface DbdJuristic {
  juristic_id?: string;
  juristic_name_th?: string;
  juristic_name_en?: string;
  juristic_type?: string;
  register_date?: string;
  juristic_status?: string;
  address_th?: string;
}

interface CustomerImport {
  "Full Name"?: string;
  "Nick Name"?: string;
  "Tax ID"?: string;
  "Territory"?: string;
  "Type"?: string;
}

interface LookupResult {
  found: boolean;
  taxId?: string;
  companyName?: string;
  companyNameEn?: string;
  address?: string;
  registeredDate?: string;
  status?: string;
  type?: string;
  source?: string;
}

// Cache for customers-import.json (loaded once)
let importCache: CustomerImport[] | null = null;

async function loadImportData(): Promise<CustomerImport[]> {
  if (importCache) return importCache;
  try {
    const raw = await readFile(join(process.cwd(), "data", "customers-import.json"), "utf-8");
    importCache = JSON.parse(raw) as CustomerImport[];
    return importCache;
  } catch {
    return [];
  }
}

// Shared lookup function — used by both GET and bulk-update
async function lookupTaxId(taxId: string): Promise<LookupResult> {
  // Try MOC DataAPI first (timeout 5s)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://dataapi.moc.go.th/juristic?juristic_id=${taxId}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json() as DbdJuristic | DbdJuristic[];
      const item = Array.isArray(data) ? data[0] : data;
      if (item?.juristic_id) {
        return {
          found: true,
          taxId: item.juristic_id,
          companyName: item.juristic_name_th || "",
          companyNameEn: item.juristic_name_en || "",
          address: item.address_th || "",
          registeredDate: item.register_date || "",
          status: item.juristic_status || "",
          type: item.juristic_type || "Company",
          source: "moc",
        };
      }
    }
  } catch {
    // MOC API failed or timed out
  }

  // Fallback 1: Creden API (timeout 5s)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://data.creden.co/company/search?tax_id=${taxId}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      if (data && typeof data === "object" && data.company_name) {
        return {
          found: true,
          taxId,
          companyName: String(data.company_name || ""),
          companyNameEn: String(data.company_name_en || ""),
          address: String(data.address || ""),
          registeredDate: String(data.registered_date || ""),
          status: String(data.status || ""),
          type: "Company",
          source: "creden",
        };
      }
    }
  } catch {
    // Creden API failed or timed out
  }

  // Fallback 2: Local customers-import.json
  try {
    const importData = await loadImportData();
    const match = importData.find((c) => c["Tax ID"] === taxId);
    if (match) {
      return {
        found: true,
        taxId,
        companyName: match["Full Name"] || "",
        companyNameEn: "",
        address: match["Territory"] || "",
        registeredDate: "",
        status: "",
        type: match["Type"] || "Company",
        source: "local",
      };
    }
  } catch {
    // Local fallback failed
  }

  return { found: false };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GET /api/dbd/lookup/:taxId
dbdRoute.get("/lookup/:taxId", async (c) => {
  const taxId = c.req.param("taxId").trim();

  if (!/^\d{13}$/.test(taxId)) {
    return c.json({ error: "Tax ID must be 13 digits" }, 400);
  }

  const result = await lookupTaxId(taxId);
  return c.json(result);
});

// POST /api/dbd/bulk-update — batch lookup + update customer records
dbdRoute.post("/bulk-update", async (c) => {
  const body = await c.req.json() as { customerIds?: number[] };

  if (!body.customerIds || !Array.isArray(body.customerIds) || body.customerIds.length === 0) {
    return c.json({ error: "customerIds array required" }, 400);
  }

  if (body.customerIds.length > 100) {
    return c.json({ error: "Max 100 customers per batch" }, 400);
  }

  // Fetch customers from DB
  const rows = await db.select().from(customers)
    .where(inArray(customers.id, body.customerIds))
    .all();

  const results: { id: number; name: string; taxId: string | null; status: string; companyName?: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.taxId || !/^\d{13}$/.test(row.taxId)) {
      results.push({ id: row.id, name: row.name, taxId: row.taxId, status: "skipped_no_valid_taxid" });
      continue;
    }

    // Rate limit: 200ms between external API calls (5 req/sec)
    if (i > 0) await delay(200);

    const lookup = await lookupTaxId(row.taxId);

    if (lookup.found && lookup.companyName) {
      await db.update(customers)
        .set({
          fullName: lookup.companyName,
          address: lookup.address || row.address,
          customerType: (lookup.type as "Company" | "Individual") || row.customerType,
          updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
        })
        .where(eq(customers.id, row.id))
        .run();

      results.push({
        id: row.id,
        name: row.name,
        taxId: row.taxId,
        status: "updated",
        companyName: lookup.companyName,
      });
    } else {
      results.push({ id: row.id, name: row.name, taxId: row.taxId, status: "not_found" });
    }
  }

  const updated = results.filter((r) => r.status === "updated").length;
  return c.json({
    total: rows.length,
    updated,
    skipped: rows.length - updated,
    results,
  });
});

export { dbdRoute };
