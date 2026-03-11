import { Hono } from "hono";
import { db } from "../db";
import { payments, invoices } from "../schema";
import { eq, sql } from "drizzle-orm";
import { generateRunningNumber } from "../utils";

const paymentsRoute = new Hono();

paymentsRoute.get("/", (c) => {
  return c.json(db.select().from(payments).all());
});

paymentsRoute.get("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const p = db.select().from(payments).where(eq(payments.id, id)).get();
  if (!p) return c.json({ error: "Payment not found" }, 404);
  const invoice = db.select().from(invoices).where(eq(invoices.id, p.invoiceId)).get();
  return c.json({ ...p, invoice });
});

paymentsRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.invoiceId || !body.amount) return c.json({ error: "invoiceId and amount required" }, 400);
  const invoice = db.select().from(invoices).where(eq(invoices.id, body.invoiceId)).get();
  if (!invoice) return c.json({ error: "Invoice not found" }, 404);

  const paymentNumber = generateRunningNumber("PAY", "payments", "payment_number");
  const result = db.insert(payments).values({
    invoiceId: body.invoiceId, paymentNumber, amount: body.amount,
    method: body.method || "transfer", status: "completed",
    reference: body.reference || null, paidAt: sql`datetime('now')`, notes: body.notes || null,
  }).run();

  // Check if fully paid
  const allPayments = db.select().from(payments).where(eq(payments.invoiceId, body.invoiceId)).all();
  const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
  if (totalPaid >= invoice.totalAmount) {
    db.update(invoices).set({ status: "paid", updatedAt: sql`datetime('now')` }).where(eq(invoices.id, body.invoiceId)).run();
  }

  return c.json({ ok: true, id: Number(result.lastInsertRowid), paymentNumber, totalPaid, invoicePaid: totalPaid >= invoice.totalAmount }, 201);
});

export { paymentsRoute };
