import { Hono } from "hono";
import { db } from "../db.js";
import { shortTermLoans, loanRepayments } from "../schema.js";
import { eq, sql } from "drizzle-orm";

const loansRoute = new Hono();

// Compute remaining balance for a loan
async function getRepaymentTotal(loanId: number): Promise<number> {
  const repayments = await db.select().from(loanRepayments)
    .where(eq(loanRepayments.loanId, loanId)).all();
  return repayments.reduce((sum, r) => sum + r.amount, 0);
}

// GET / — list all loans + computed remainingBalance
loansRoute.get("/", async (c) => {
  const statusFilter = c.req.query("status");
  let rows = await db.select().from(shortTermLoans).all();
  if (statusFilter) {
    rows = rows.filter(r => r.status === statusFilter);
  }

  const result = [];
  for (const loan of rows) {
    const totalRepaid = await getRepaymentTotal(loan.id);
    result.push({
      ...loan,
      totalRepaid,
      remainingBalance: loan.amount - totalRepaid,
    });
  }
  return c.json(result);
});

// GET /:id — detail + repayments history
loansRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const loan = await db.select().from(shortTermLoans).where(eq(shortTermLoans.id, id)).get();
  if (!loan) return c.json({ error: "Loan not found" }, 404);

  const repayments = await db.select().from(loanRepayments)
    .where(eq(loanRepayments.loanId, id)).all();
  const totalRepaid = repayments.reduce((sum, r) => sum + r.amount, 0);

  return c.json({
    ...loan,
    totalRepaid,
    remainingBalance: loan.amount - totalRepaid,
    repayments,
  });
});

// POST / — สร้างรายการยืม
loansRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.borrowerName || !body.amount || !body.date) {
    return c.json({ error: "borrowerName, amount, date required" }, 400);
  }
  if (body.amount <= 0) return c.json({ error: "amount must be > 0" }, 400);

  const result = await db.insert(shortTermLoans).values({
    borrowerName: body.borrowerName,
    amount: body.amount,
    date: body.date,
    notes: body.notes || null,
    imageUrl: body.imageUrl || null,
    status: "active",
  }).run();

  return c.json({ ok: true, id: Number(result.lastInsertRowid) }, 201);
});

// PUT /:id — แก้ไข
loansRoute.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(shortTermLoans).where(eq(shortTermLoans.id, id)).get();
  if (!existing) return c.json({ error: "Loan not found" }, 404);

  const body = await c.req.json();
  await db.update(shortTermLoans).set({
    borrowerName: body.borrowerName ?? existing.borrowerName,
    amount: body.amount ?? existing.amount,
    date: body.date ?? existing.date,
    notes: body.notes !== undefined ? body.notes : existing.notes,
    imageUrl: body.imageUrl !== undefined ? body.imageUrl : existing.imageUrl,
    updatedAt: sql`datetime('now')`,
  }).where(eq(shortTermLoans.id, id)).run();

  return c.json({ ok: true });
});

// DELETE /:id — ลบ (เฉพาะไม่มี repayment)
loansRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const loan = await db.select().from(shortTermLoans).where(eq(shortTermLoans.id, id)).get();
  if (!loan) return c.json({ error: "Loan not found" }, 404);

  const repayments = await db.select().from(loanRepayments)
    .where(eq(loanRepayments.loanId, id)).all();
  if (repayments.length > 0) {
    return c.json({ error: "Cannot delete loan with repayments" }, 400);
  }

  await db.delete(shortTermLoans).where(eq(shortTermLoans.id, id)).run();
  return c.json({ ok: true, message: "Loan deleted" });
});

// POST /:id/repay — บันทึกการคืนเงิน
loansRoute.post("/:id/repay", async (c) => {
  const id = Number(c.req.param("id"));
  const loan = await db.select().from(shortTermLoans).where(eq(shortTermLoans.id, id)).get();
  if (!loan) return c.json({ error: "Loan not found" }, 404);
  if (loan.status === "closed") return c.json({ error: "Loan already closed" }, 400);

  const body = await c.req.json();
  if (!body.amount || !body.date) {
    return c.json({ error: "amount, date required" }, 400);
  }
  if (body.amount <= 0) return c.json({ error: "amount must be > 0" }, 400);

  const totalRepaid = await getRepaymentTotal(id);
  const remaining = loan.amount - totalRepaid;
  if (body.amount > remaining) {
    return c.json({ error: `Repayment exceeds remaining balance (${remaining})` }, 400);
  }

  await db.insert(loanRepayments).values({
    loanId: id,
    amount: body.amount,
    date: body.date,
    notes: body.notes || null,
    imageUrl: body.imageUrl || null,
  }).run();

  // Auto-close if fully repaid
  const newTotalRepaid = totalRepaid + body.amount;
  if (newTotalRepaid >= loan.amount) {
    await db.update(shortTermLoans).set({
      status: "closed",
      updatedAt: sql`datetime('now')`,
    }).where(eq(shortTermLoans.id, id)).run();
  }

  return c.json({
    ok: true,
    totalRepaid: newTotalRepaid,
    remainingBalance: loan.amount - newTotalRepaid,
    status: newTotalRepaid >= loan.amount ? "closed" : "active",
  });
});

export { loansRoute };
