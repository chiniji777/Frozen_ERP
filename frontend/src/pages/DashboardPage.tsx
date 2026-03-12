import { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

interface DashboardData {
  salesSummary: { today: number; thisMonth: number; thisYear: number };
  profitSummary: { revenue: number; cost: number; grossProfit: number; margin: number };
  topCustomers: { id: number; name: string; totalOrders: number; totalAmount: number }[];
  topProducts: { id: number; name: string; totalSold: number; totalRevenue: number }[];
  statusSummary: {
    so: Record<string, number>;
    invoice: Record<string, number>;
    payment: Record<string, number>;
  };
  commissionSummary: { partner: string; totalSales: number; totalCommission: number; orders: number }[];
  revenueByMonth: { month: string; revenue: number; cost: number; profit: number }[];
  expenseByCategory: { category: string; total: number }[];
}

const PIE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<DashboardData>('/dashboard')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;
  if (!data) return <div className="text-center py-10 text-gray-400">ไม่สามารถโหลดข้อมูลได้</div>;

  const { salesSummary, profitSummary, statusSummary, topCustomers, topProducts, commissionSummary, revenueByMonth, expenseByCategory } = data;

  const marginColor = profitSummary.margin >= 30 ? 'text-green-600' : profitSummary.margin >= 10 ? 'text-yellow-600' : 'text-red-600';
  const pendingSO = (statusSummary.so.draft ?? 0) + (statusSummary.so.confirmed ?? 0);
  const unpaidIV = (statusSummary.invoice.sent ?? 0) + (statusSummary.invoice.overdue ?? 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">📊 แดชบอร์ด</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card icon="💰" label="ยอดขายวันนี้" value={`฿${salesSummary.today.toLocaleString()}`} sub={`เดือนนี้: ฿${salesSummary.thisMonth.toLocaleString()}`} color="bg-blue-500" />
        <Card icon="📈" label="กำไรขั้นต้น" value={`฿${profitSummary.grossProfit.toLocaleString()}`} sub={<span className={marginColor}>Margin {profitSummary.margin.toFixed(1)}%</span>} color="bg-green-500" />
        <Card icon="📝" label="SO รอดำเนินการ" value={String(pendingSO)} sub={`ร่าง: ${statusSummary.so.draft ?? 0} / ยืนยัน: ${statusSummary.so.confirmed ?? 0}`} color="bg-yellow-500" />
        <Card icon="📄" label="Invoice ค้างชำระ" value={String(unpaidIV)} sub={`ส่งแล้ว: ${statusSummary.invoice.sent ?? 0} / เกินกำหนด: ${statusSummary.invoice.overdue ?? 0}`} color="bg-red-500" />
      </div>

      {/* Status Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">สถานะเอกสาร</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatusGroup title="ใบสั่งขาย (SO)" items={statusSummary.so} />
          <StatusGroup title="ใบแจ้งหนี้ (Invoice)" items={statusSummary.invoice} />
          <StatusGroup title="การชำระเงิน" items={statusSummary.payment} />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Trend */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Revenue Trend</h2>
          {revenueByMonth.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `฿${Number(v ?? 0).toLocaleString()}`} />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="รายได้" stroke="#6366f1" strokeWidth={2} />
                <Line type="monotone" dataKey="cost" name="ต้นทุน" stroke="#f59e0b" strokeWidth={2} />
                <Line type="monotone" dataKey="profit" name="กำไร" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-10">ไม่พบข้อมูล</p>}
        </div>

        {/* Expense Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">ค่าใช้จ่ายตามหมวด</h2>
          {expenseByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={expenseByCategory} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {expenseByCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `฿${Number(v ?? 0).toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-10">ไม่พบข้อมูล</p>}
        </div>
      </div>

      {/* Tables: Top Customers + Top Products + Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Customers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">👥 Top 5 ลูกค้า</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left py-2 text-gray-500">ชื่อ</th><th className="text-right py-2 text-gray-500">ออเดอร์</th><th className="text-right py-2 text-gray-500">ยอด</th></tr></thead>
            <tbody>
              {topCustomers.slice(0, 5).map((c) => (
                <tr key={c.id} className="border-b border-gray-50">
                  <td className="py-2 text-gray-700">{c.name}</td>
                  <td className="py-2 text-right text-gray-600">{c.totalOrders}</td>
                  <td className="py-2 text-right font-medium">฿{c.totalAmount.toLocaleString()}</td>
                </tr>
              ))}
              {topCustomers.length === 0 && <tr><td colSpan={3} className="text-center py-4 text-gray-400">-</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">📦 Top 5 สินค้าขายดี</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left py-2 text-gray-500">ชื่อ</th><th className="text-right py-2 text-gray-500">ขายได้</th><th className="text-right py-2 text-gray-500">รายได้</th></tr></thead>
            <tbody>
              {topProducts.slice(0, 5).map((p) => (
                <tr key={p.id} className="border-b border-gray-50">
                  <td className="py-2 text-gray-700">{p.name}</td>
                  <td className="py-2 text-right text-gray-600">{p.totalSold}</td>
                  <td className="py-2 text-right font-medium">฿{p.totalRevenue.toLocaleString()}</td>
                </tr>
              ))}
              {topProducts.length === 0 && <tr><td colSpan={3} className="text-center py-4 text-gray-400">-</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Commission Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">💼 คอมมิชชั่น</h2>
          {commissionSummary.length > 0 ? (
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2 text-gray-500">เซลส์</th><th className="text-right py-2 text-gray-500">ออเดอร์</th><th className="text-right py-2 text-gray-500">คอมมิชชั่น</th></tr></thead>
              <tbody>
                {commissionSummary.map((c) => (
                  <tr key={c.partner} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700">{c.partner}</td>
                    <td className="py-2 text-right text-gray-600">{c.orders}</td>
                    <td className="py-2 text-right font-medium text-indigo-600">฿{c.totalCommission.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200 font-semibold">
                  <td className="py-2 text-gray-800">รวม</td>
                  <td className="py-2 text-right text-gray-600">{commissionSummary.reduce((s, c) => s + c.orders, 0)}</td>
                  <td className="py-2 text-right text-indigo-700">฿{commissionSummary.reduce((s, c) => s + c.totalCommission, 0).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          ) : <p className="text-gray-400 text-center py-4 text-sm">ยังไม่มีข้อมูลคอมมิชชั่น</p>}
        </div>
      </div>
    </div>
  );
}

function Card({ icon, label, value, sub, color }: { icon: string; label: string; value: string; sub: React.ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center text-white text-lg mb-3`}>{icon}</div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function StatusGroup({ title, items }: { title: string; items: Record<string, number> }) {
  const labels: Record<string, string> = {
    draft: 'ร่าง', confirmed: 'ยืนยัน', delivered: 'ส่งแล้ว', invoiced: 'ออก IV',
    sent: 'ส่งแล้ว', paid: 'ชำระแล้ว', overdue: 'เกินกำหนด', pending: 'รอ', completed: 'เสร็จ',
  };
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700', confirmed: 'bg-blue-100 text-blue-700', delivered: 'bg-green-100 text-green-700',
    invoiced: 'bg-purple-100 text-purple-700', sent: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700', pending: 'bg-yellow-100 text-yellow-700', completed: 'bg-green-100 text-green-700',
  };
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-600 mb-2">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {Object.entries(items).map(([key, val]) => (
          <span key={key} className={`px-2 py-1 rounded-full text-xs ${colors[key] ?? 'bg-gray-100 text-gray-700'}`}>
            {labels[key] ?? key}: {val}
          </span>
        ))}
      </div>
    </div>
  );
}
