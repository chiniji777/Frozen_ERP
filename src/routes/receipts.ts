import { Hono } from "hono";
import { db } from "../db.js";
import { receipts, payments, invoices } from "../schema.js";
import { eq } from "drizzle-orm";
import { generateRunningNumber } from "../utils.js";

const receiptsRoute = new Hono();

receiptsRoute.get("/", async (c) => {
  return c.json(await db.select().from(receipts).all());
});

receiptsRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const r = await db.select().from(receipts).where(eq(receipts.id, id)).get();
  if (!r) return c.json({ error: "Receipt not found" }, 404);
  const payment = await db.select().from(payments).where(eq(payments.id, r.paymentId)).get();
  const invoice = payment ? await db.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).get() : null;
  return c.json({ ...r, payment, invoice });
});

receiptsRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.paymentId) return c.json({ error: "paymentId required" }, 400);
  const payment = await db.select().from(payments).where(eq(payments.id, body.paymentId)).get();
  if (!payment) return c.json({ error: "Payment not found" }, 404);
  const receiptNumber = await generateRunningNumber("RCP", "receipts", "receipt_number");
  const result = await db.insert(receipts).values({
    paymentId: body.paymentId, receiptNumber, amount: payment.amount,
  }).run();
  return c.json({ ok: true, id: Number(result.lastInsertRowid), receiptNumber }, 201);
});

export { receiptsRoute };
