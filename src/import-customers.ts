import XLSX from "xlsx";
import { db } from "./db.js";
import { customers } from "./schema.js";
import { initDB } from "./db.js";

const EXCEL_PATH = "/mnt/c/Users/User/Downloads/Customer.xlsx";

async function importCustomers() {
  // Init DB + migration first
  await initDB();

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows in Excel`);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const code = String(row["Name"] || "").trim();
    const fullName = String(row["Full Name"] || "").trim();
    const nickName = String(row["Nick Name"] || "").trim();
    const territory = String(row["Territory"] || "").trim();
    const type = String(row["Type"] || "Company").trim();
    const taxId = String(row["Tax ID"] || "").trim();
    const creditLimit = Number(row["Credit Limit"]) || 0;
    const paymentTerms = String(row["Default Payment Terms Template"] || "").trim();

    // name = code as identifier, fullName for display
    const name = fullName || code;
    if (!name) {
      skipped++;
      continue;
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
      console.error(`Error importing row ${code}: ${msg}`);
      skipped++;
    }
  }

  console.log(`Import complete: ${imported} imported, ${skipped} skipped`);
}

importCustomers().catch(console.error);
