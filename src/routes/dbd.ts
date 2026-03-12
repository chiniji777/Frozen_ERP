import { Hono } from "hono";

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

// GET /api/dbd/lookup/:taxId
dbdRoute.get("/lookup/:taxId", async (c) => {
  const taxId = c.req.param("taxId").trim();

  // Validate 13-digit tax ID
  if (!/^\d{13}$/.test(taxId)) {
    return c.json({ error: "Tax ID must be 13 digits" }, 400);
  }

  // Try MOC DataAPI first
  try {
    const res = await fetch(`https://dataapi.moc.go.th/juristic?juristic_id=${taxId}`);
    if (res.ok) {
      const data = await res.json() as DbdJuristic | DbdJuristic[];
      const item = Array.isArray(data) ? data[0] : data;
      if (item?.juristic_id) {
        return c.json({
          found: true,
          taxId: item.juristic_id,
          companyName: item.juristic_name_th || "",
          companyNameEn: item.juristic_name_en || "",
          address: item.address_th || "",
          registeredDate: item.register_date || "",
          status: item.juristic_status || "",
          type: item.juristic_type || "Company",
        });
      }
    }
  } catch {
    // MOC API failed, try fallback
  }

  // Fallback: Creden API
  try {
    const res = await fetch(`https://data.creden.co/company/search?tax_id=${taxId}`);
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      if (data && typeof data === "object" && data.company_name) {
        return c.json({
          found: true,
          taxId,
          companyName: String(data.company_name || ""),
          companyNameEn: String(data.company_name_en || ""),
          address: String(data.address || ""),
          registeredDate: String(data.registered_date || ""),
          status: String(data.status || ""),
          type: "Company",
        });
      }
    }
  } catch {
    // Fallback also failed
  }

  return c.json({ found: false });
});

export { dbdRoute };
