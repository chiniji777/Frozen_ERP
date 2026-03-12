#!/usr/bin/env bun
import { Command } from "commander";
import { registerAuth } from "./commands/auth.js";
import { registerCrud } from "./commands/crud.js";
import { registerDashboard } from "./commands/dashboard.js";
import { setApiBase } from "./config.js";

const program = new Command();

program
  .name("frozen")
  .description("Frozen ERP CLI — AI-controllable command line interface")
  .version("1.0.0");

program
  .command("config")
  .description("Set CLI config")
  .option("--api-base <url>", "Set API base URL")
  .action((opts) => {
    if (opts.apiBase) {
      setApiBase(opts.apiBase);
      console.log(JSON.stringify({ ok: true, apiBase: opts.apiBase }));
    }
  });

// Auth commands
registerAuth(program);

// Dashboard
registerDashboard(program);

// CRUD resources (priority routes)
const resources = [
  { name: "customers", apiPath: "/customers", description: "Customer management" },
  { name: "products", apiPath: "/products", description: "Product management" },
  { name: "sales-orders", apiPath: "/sales-orders", description: "Sales order management" },
  { name: "raw-materials", apiPath: "/raw-materials", description: "Raw material management" },
  { name: "suppliers", apiPath: "/suppliers", description: "Supplier management" },
  { name: "purchase-orders", apiPath: "/purchase-orders", description: "Purchase order management" },
  { name: "invoices", apiPath: "/invoices", description: "Invoice management" },
  { name: "delivery-notes", apiPath: "/delivery-notes", description: "Delivery note management" },
  { name: "payments", apiPath: "/payments", description: "Payment management" },
  { name: "receipts", apiPath: "/receipts", description: "Receipt management" },
  { name: "expenses", apiPath: "/expenses", description: "Expense management" },
  { name: "bom", apiPath: "/bom", description: "Bill of Materials management" },
  { name: "production", apiPath: "/production", description: "Production order management" },
  { name: "uom", apiPath: "/uom", description: "Unit of measure management" },
];

for (const res of resources) {
  registerCrud(program, res);
}

program.parse();
