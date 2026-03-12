import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { Hono } from "hono";

process.env.TEST_DB_PATH = ":memory:";

let app: InstanceType<typeof Hono>;
let db: any;
let sql: any;

beforeAll(async () => {
  const dbMod = await import("../src/db.js");
  const orm = await import("drizzle-orm");
  db = dbMod.db;
  sql = orm.sql;
  await dbMod.initDB();

  const { suppliersRoute } = await import("../src/routes/suppliers.js");
  app = new Hono();
  app.route("/suppliers", suppliersRoute);
});

async function req(method: string, path: string, body?: any) {
  const opts: RequestInit = { method };
  if (body) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
  const clean = path.startsWith("/?") ? path.slice(1) : (path === "/" ? "" : path);
  return app.request(`http://localhost/suppliers${clean}`, opts);
}

describe("Suppliers Route", () => {
  beforeEach(async () => { await db.run(sql`DELETE FROM suppliers`); });

  test("POST creates supplier with auto-code", async () => {
    const res = await req("POST", "/", { name: "ABC Supplies Co." });
    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.ok).toBe(true);
    expect(json.id).toBeGreaterThan(0);
    expect(json.code).toContain("SUP-");
  });

  test("POST creates supplier with custom code", async () => {
    const res = await req("POST", "/", { name: "XYZ Ltd", code: "SUP-CUSTOM" });
    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.code).toBe("SUP-CUSTOM");
  });

  test("POST rejects missing name", async () => {
    expect((await req("POST", "/", { phone: "0812345678" })).status).toBe(400);
  });

  test("POST creates supplier with all fields", async () => {
    const res = await req("POST", "/", {
      name: "Full Supplier",
      fullName: "Full Supplier Company Limited",
      nickName: "FS",
      supplierType: "Company",
      phone: "0812345678",
      email: "contact@fs.com",
      address: "123 Test St",
      taxId: "1234567890123",
      paymentTerms: "Net 30",
      notes: "Test supplier",
    });
    expect(res.status).toBe(201);
    const { id } = await res.json() as any;

    // Verify all fields saved
    const detail = await req("GET", `/${id}`);
    const json = await detail.json() as any;
    expect(json.name).toBe("Full Supplier");
    expect(json.fullName).toBe("Full Supplier Company Limited");
    expect(json.nickName).toBe("FS");
    expect(json.phone).toBe("0812345678");
    expect(json.email).toBe("contact@fs.com");
    expect(json.taxId).toBe("1234567890123");
    expect(json.paymentTerms).toBe("Net 30");
  });

  test("GET returns empty initially", async () => {
    const json = await (await req("GET", "/")).json() as any[];
    expect(json.length).toBe(0);
  });

  test("GET returns all suppliers", async () => {
    await req("POST", "/", { name: "Supplier A" });
    await req("POST", "/", { name: "Supplier B" });
    const json = await (await req("GET", "/")).json() as any[];
    expect(json.length).toBe(2);
  });

  test("GET search by name", async () => {
    await req("POST", "/", { name: "Alpha Supplies" });
    await req("POST", "/", { name: "Beta Trading" });
    const json = await (await req("GET", "/?q=Alpha")).json() as any[];
    expect(json.length).toBe(1);
    expect(json[0].name).toBe("Alpha Supplies");
  });

  test("GET search by phone", async () => {
    await req("POST", "/", { name: "A", phone: "0891234567" });
    await req("POST", "/", { name: "B", phone: "0899999999" });
    const json = await (await req("GET", "/?q=089123")).json() as any[];
    expect(json.length).toBe(1);
  });

  test("GET /:id returns supplier", async () => {
    const create = await req("POST", "/", { name: "Detail Test" });
    const { id } = await create.json() as any;
    const res = await req("GET", `/${id}`);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.name).toBe("Detail Test");
  });

  test("GET /:id returns 404 for non-existent", async () => {
    expect((await req("GET", "/9999")).status).toBe(404);
  });

  test("PUT updates supplier", async () => {
    const create = await req("POST", "/", { name: "Old Name" });
    const { id } = await create.json() as any;
    expect((await req("PUT", `/${id}`, { name: "New Name", phone: "0811111111" })).status).toBe(200);
    const detail = await (await req("GET", `/${id}`)).json() as any;
    expect(detail.name).toBe("New Name");
    expect(detail.phone).toBe("0811111111");
  });

  test("PUT returns 404 for non-existent", async () => {
    expect((await req("PUT", "/9999", { name: "X" })).status).toBe(404);
  });

  test("DELETE removes supplier", async () => {
    const create = await req("POST", "/", { name: "To Delete" });
    const { id } = await create.json() as any;
    expect((await req("DELETE", `/${id}`)).status).toBe(200);
    expect((await (await req("GET", "/")).json() as any[]).length).toBe(0);
  });

  test("DELETE returns 404 for non-existent", async () => {
    expect((await req("DELETE", "/9999")).status).toBe(404);
  });
});
