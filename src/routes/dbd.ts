import { Hono } from "hono";
import { db } from "../db.js";
import { customers } from "../schema.js";
import { eq, inArray, sql } from "drizzle-orm";
import { readFile } from "fs/promises";
import { join } from "path";

const dbdRoute = new Hono();

// DBD OpenAPI response format
interface DbdAddressInfo {
  FullAddress?: string;
}

interface DbdResultItem {
  JuristicID?: string;
  JuristicName_TH?: string;
  JuristicName_EN?: string;
  JuristicType?: string;
  JuristicStatus?: string;
  RegisterDate?: string;
  RegisterCapital?: string;
  AddressInformations?: DbdAddressInfo[];
}

interface DbdResponse {
  ResultList?: DbdResultItem[];
}

// JuristicType → DB enum ("Company" | "Individual")
function mapJuristicType(code: string | undefined): "Company" | "Individual" {
  // All juristic persons from DBD are companies (not individuals)
  return "Company";
}

// JuristicType display labels (for response only, not stored in DB)
const JURISTIC_TYPE_LABELS: Record<string, string> = {
  "2": "ห้างหุ้นส่วนสามัญ",
  "3": "ห้างหุ้นส่วนจำกัด",
  "5": "บริษัทจำกัด",
  "7": "บริษัทมหาชนจำกัด",
};

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
  type?: "Company" | "Individual";
  typeLabel?: string;
  source?: string;
  warning?: string;
}

// In-memory cache — TTL 1 hour
const CACHE_TTL = 60 * 60 * 1000;
const lookupCache = new Map<string, { result: LookupResult; expiry: number }>();

function getCached(taxId: string): LookupResult | null {
  const entry = lookupCache.get(taxId);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    lookupCache.delete(taxId);
    return null;
  }
  return entry.result;
}

function setCache(taxId: string, result: LookupResult): void {
  // Cap cache size at 5000 entries
  if (lookupCache.size >= 5000) {
    const oldest = lookupCache.keys().next().value;
    if (oldest) lookupCache.delete(oldest);
  }
  lookupCache.set(taxId, { result, expiry: Date.now() + CACHE_TTL });
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

// DBD Proxy config — from environment variables
const DBD_PROXY_URL = process.env.DBD_PROXY_URL;
const DBD_PROXY_TOKEN = process.env.DBD_PROXY_TOKEN;

// Shared lookup function — used by both GET and bulk-update
async function lookupTaxId(taxId: string): Promise<LookupResult> {
  // Check in-memory cache first
  const cached = getCached(taxId);
  if (cached) return { ...cached, source: `cache(${cached.source})` };

  let externalFailed = false;

  // Primary: DBD Proxy — skip if env vars not configured
  if (DBD_PROXY_URL && DBD_PROXY_TOKEN) try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${DBD_PROXY_URL}/api/company/${taxId}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${DBD_PROXY_TOKEN}` },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const proxyResponse = await res.json() as { found: boolean; data: Record<string, string>; source: string };
      if (proxyResponse.found && proxyResponse.data) {
        const data = proxyResponse.data;
        const result: LookupResult = {
          found: true,
          taxId: data.tax_id || taxId,
          companyName: data.company_name || "",
          companyNameEn: data.company_name_en || "",
          address: data.address || "",
          registeredDate: data.registered_date || "",
          status: data.status || "",
          type: ["2", "3", "5", "7"].includes(data.jp_type_code) ? "Company" : "Individual",
          typeLabel: data.jp_type_desc || JURISTIC_TYPE_LABELS[data.jp_type_code || ""] || "",
          source: proxyResponse.source || "proxy",
        };
        setCache(taxId, result);
        return result;
      }
    } else {
      externalFailed = true;
    }
  } catch {
    externalFailed = true;
  }

  // Fallback 1: DBD OpenAPI direct (timeout 5s)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const headers: Record<string, string> = {};
    const apiKey = process.env.DBD_API_KEY;
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const res = await fetch(`https://openapi.dbd.go.th/api/v1/juristic_person/${taxId}`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json() as DbdResponse;
      const item = data?.ResultList?.[0];
      if (item?.JuristicID) {
        const addr = item.AddressInformations?.[0];
        const result: LookupResult = {
          found: true,
          taxId: item.JuristicID,
          companyName: item.JuristicName_TH || "",
          companyNameEn: item.JuristicName_EN || "",
          address: addr?.FullAddress || "",
          registeredDate: item.RegisterDate || "",
          status: item.JuristicStatus || "",
          type: mapJuristicType(item.JuristicType),
          typeLabel: JURISTIC_TYPE_LABELS[item.JuristicType || ""] || "",
          source: "dbd",
        };
        setCache(taxId, result);
        return result;
      }
    } else {
      externalFailed = true;
    }
  } catch {
    externalFailed = true;
  }

  // Fallback 2: Creden API (timeout 5s)
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
        const result: LookupResult = {
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
        setCache(taxId, result);
        return result;
      }
    } else {
      externalFailed = true;
    }
  } catch {
    externalFailed = true;
  }

  const warning = externalFailed ? "API ภายนอกไม่สามารถเชื่อมต่อได้ ใช้ข้อมูลในระบบแทน" : undefined;

  // Fallback 2: Local customers-import.json
  try {
    const importData = await loadImportData();
    const match = importData.find((c) => c["Tax ID"] === taxId);
    if (match) {
      const result: LookupResult = {
        found: true,
        taxId,
        companyName: match["Full Name"] || "",
        companyNameEn: "",
        address: match["Territory"] || "",
        registeredDate: "",
        status: "",
        type: (match["Type"] === "Individual" ? "Individual" : "Company"),
        source: "local",
        warning,
      };
      setCache(taxId, result);
      return result;
    }
  } catch {
    // Local fallback failed
  }

  // Fallback 3: DB lookup — search customers table directly
  try {
    const row = await db.select().from(customers).where(eq(customers.taxId, taxId)).get();
    if (row) {
      const result: LookupResult = {
        found: true,
        taxId,
        companyName: row.fullName || row.name,
        companyNameEn: "",
        address: row.address || "",
        registeredDate: "",
        status: "",
        type: row.customerType || "Company",
        source: "db",
        warning,
      };
      setCache(taxId, result);
      return result;
    }
  } catch {
    // DB lookup failed
  }

  return { found: false, warning };
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
          customerType: lookup.type || row.customerType,
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

// Generate next customer code (AR00001, AR00002, ...)
async function nextCustomerCode(): Promise<string> {
  const last = await db.select({ code: customers.code }).from(customers)
    .where(sql`code LIKE 'AR%'`)
    .orderBy(sql`code DESC`)
    .limit(1)
    .get();
  const num = last?.code ? parseInt(last.code.replace("AR", ""), 10) + 1 : 1;
  return `AR${String(num).padStart(5, "0")}`;
}

// POST /api/dbd/save-to-customer — lookup tax ID then save/update customer
dbdRoute.post("/save-to-customer", async (c) => {
  const body = await c.req.json() as { taxId?: string; customerId?: number };

  if (!body.taxId || !/^\d{13}$/.test(body.taxId)) {
    return c.json({ error: "Valid 13-digit taxId required" }, 400);
  }

  const lookup = await lookupTaxId(body.taxId);

  if (!lookup.found) {
    return c.json({ error: "ไม่พบข้อมูลบริษัทจาก Tax ID นี้", lookup }, 404);
  }

  const now = sql`datetime('now')`;

  if (body.customerId) {
    const existing = await db.select().from(customers).where(eq(customers.id, body.customerId)).get();
    if (!existing) return c.json({ error: "Customer not found" }, 404);

    const duplicate = await db.select({ id: customers.id }).from(customers)
      .where(eq(customers.taxId, body.taxId))
      .get();
    if (duplicate && duplicate.id !== body.customerId) {
      return c.json({ error: "Tax ID นี้ถูกใช้โดยลูกค้ารายอื่นแล้ว", duplicateCustomerId: duplicate.id }, 409);
    }

    await db.update(customers)
      .set({
        taxId: body.taxId,
        fullName: lookup.companyName || existing.fullName,
        name: lookup.companyName || existing.name,
        address: lookup.address || existing.address,
        customerType: lookup.type || existing.customerType,
        updatedAt: now,
      })
      .where(eq(customers.id, body.customerId))
      .run();

    return c.json({ ok: true, action: "updated", customerId: body.customerId, lookup });
  }

  const existingByTax = await db.select().from(customers).where(eq(customers.taxId, body.taxId)).get();

  if (existingByTax) {
    await db.update(customers)
      .set({
        fullName: lookup.companyName || existingByTax.fullName,
        name: lookup.companyName || existingByTax.name,
        address: lookup.address || existingByTax.address,
        customerType: lookup.type || existingByTax.customerType,
        updatedAt: now,
      })
      .where(eq(customers.id, existingByTax.id))
      .run();

    return c.json({ ok: true, action: "updated", customerId: existingByTax.id, lookup });
  }

  const code = await nextCustomerCode();
  const result = await db.insert(customers).values({
    code,
    name: lookup.companyName || "",
    fullName: lookup.companyName || "",
    address: lookup.address || null,
    taxId: body.taxId,
    customerType: lookup.type || "Company",
  }).run();

  return c.json({ ok: true, action: "created", customerId: Number(result.lastInsertRowid), code, lookup }, 201);
});

// GET /api/dbd/search?q={query} — proxy search to DBD Proxy
dbdRoute.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ error: "Query parameter 'q' required" }, 400);
  if (!DBD_PROXY_URL || !DBD_PROXY_TOKEN) return c.json({ error: "DBD Proxy not configured" }, 503);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${DBD_PROXY_URL}/api/search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${DBD_PROXY_TOKEN}` },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const raw = await res.json() as { results?: Record<string, string>[] };
      const results = (raw.results || []).map((r) => ({
        taxId: r.tax_id || "",
        name: r.company_name || "",
        nameEn: r.company_name_en || "",
        province: r.province || "",
        status: r.status || "",
      }));
      return c.json({ results });
    }
    return c.json({ error: "DBD Proxy search failed", status: res.status }, 502);
  } catch {
    return c.json({ error: "Cannot connect to DBD Proxy" }, 503);
  }
});

export { dbdRoute };
