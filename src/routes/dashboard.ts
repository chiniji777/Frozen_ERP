import { Hono } from "hono";
import { db } from "../db";
import { salesOrders, soItems, invoices, payments, products, rawMaterials, customers, expenses, productionOrders } from "../schema";
import { eq } from "drizzle-orm";

const dashboardRoute = new Hono();
const LOW_STOCK_THRESHOLD = 10;

dashboardRoute.get("/", async (c) => {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = now.toISOString().slice(0, 7);
  const yearStr = now.toISOString().slice(0, 4);

  const allSO = await db.select().from(salesOrders).all();
  const salesSummary = {
    today: allSO.filter(o => o.createdAt.startsWith(todayStr)).reduce((s, o) => s + o.totalAmount, 0),
    thisMonth: allSO.filter(o => o.createdAt.startsWith(monthStr)).reduce((s, o) => s + o.totalAmount, 0),
    thisYear: allSO.filter(o => o.createdAt.startsWith(yearStr)).reduce((s, o) => s + o.totalAmount, 0),
  };

  const paidInvoices = (await db.select().from(invoices).all()).filter(i => i.status === "paid");
  const revenue = paidInvoices.reduce((s, i) => s + i.totalAmount, 0);
  const allProduction = (await db.select().from(productionOrders).all()).filter(p => p.status === "completed");
  const cost = allProduction.reduce((s, p) => s + p.totalCost, 0);
  const grossProfit = revenue - cost;
  const profitSummary = {
    revenue, cost, grossProfit,
    margin: revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0,
  };

  const customerMap = new Map<number, { name: string; totalOrders: number; totalAmount: number }>();
  for (const so of allSO) {
    const existing = customerMap.get(so.customerId);
    if (existing) {
      existing.totalOrders++;
      existing.totalAmount += so.totalAmount;
    } else {
      const cust = await db.select().from(customers).where(eq(customers.id, so.customerId)).get();
      customerMap.set(so.customerId, { name: cust?.name || "Unknown", totalOrders: 1, totalAmount: so.totalAmount });
    }
  }
  const topCustomers = [...customerMap.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 5);

  const allSOItems = await db.select().from(soItems).all();
  const productMap = new Map<number, { name: string; totalSold: number; totalRevenue: number }>();
  for (const item of allSOItems) {
    const existing = productMap.get(item.productId);
    if (existing) {
      existing.totalSold += item.quantity;
      existing.totalRevenue += item.amount;
    } else {
      const prod = await db.select().from(products).where(eq(products.id, item.productId)).get();
      productMap.set(item.productId, { name: prod?.name || "Unknown", totalSold: item.quantity, totalRevenue: item.amount });
    }
  }
  const topProducts = [...productMap.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 5);

  const allInvoices = await db.select().from(invoices).all();
  const allPayments = await db.select().from(payments).all();
  const statusSummary = {
    so: {
      draft: allSO.filter(o => o.status === "draft").length,
      confirmed: allSO.filter(o => o.status === "confirmed").length,
      delivered: allSO.filter(o => o.status === "delivered").length,
      invoiced: allSO.filter(o => o.status === "invoiced").length,
    },
    invoice: {
      draft: allInvoices.filter(i => i.status === "draft").length,
      sent: allInvoices.filter(i => i.status === "sent").length,
      paid: allInvoices.filter(i => i.status === "paid").length,
      overdue: allInvoices.filter(i => i.status === "overdue").length,
    },
    payment: {
      pending: allPayments.filter(p => p.status === "pending").length,
      completed: allPayments.filter(p => p.status === "completed").length,
    },
  };

  const stockAlerts: { type: string; id: number; name: string; stock: number; threshold: number }[] = [];
  const allProducts = await db.select().from(products).all();
  for (const p of allProducts) {
    if (p.stock < LOW_STOCK_THRESHOLD) {
      stockAlerts.push({ type: "product", id: p.id, name: p.name, stock: p.stock, threshold: LOW_STOCK_THRESHOLD });
    }
  }
  const allMaterials = await db.select().from(rawMaterials).all();
  for (const m of allMaterials) {
    if (m.stock < LOW_STOCK_THRESHOLD) {
      stockAlerts.push({ type: "raw_material", id: m.id, name: m.name, stock: m.stock, threshold: LOW_STOCK_THRESHOLD });
    }
  }

  const monthMap = new Map<string, { revenue: number; cost: number }>();
  for (const iv of paidInvoices) {
    const month = iv.createdAt.slice(0, 7);
    const existing = monthMap.get(month) || { revenue: 0, cost: 0 };
    existing.revenue += iv.totalAmount;
    monthMap.set(month, existing);
  }
  for (const po of allProduction) {
    const month = po.createdAt.slice(0, 7);
    const existing = monthMap.get(month) || { revenue: 0, cost: 0 };
    existing.cost += po.totalCost;
    monthMap.set(month, existing);
  }
  const revenueByMonth = [...monthMap.entries()]
    .map(([month, v]) => ({ month, revenue: v.revenue, cost: v.cost, profit: v.revenue - v.cost }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const allExpenses = await db.select().from(expenses).all();
  const expCatMap = new Map<string, number>();
  for (const e of allExpenses) {
    expCatMap.set(e.category, (expCatMap.get(e.category) || 0) + e.amount);
  }
  const expenseByCategory = [...expCatMap.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  return c.json({
    salesSummary, profitSummary, topCustomers, topProducts,
    statusSummary, stockAlerts, revenueByMonth, expenseByCategory,
  });
});

export { dashboardRoute };
