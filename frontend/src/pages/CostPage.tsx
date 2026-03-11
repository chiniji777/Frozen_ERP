import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface MarginItem {
  product_id: number;
  product_name: string;
  cost: number;
  selling_price: number;
  profit: number;
  margin: number;
}

interface CostHistory {
  product_name: string;
  entries: { date: string; cost: number }[];
}

export default function CostPage() {
  const [margins, setMargins] = useState<MarginItem[]>([]);
  const [history, setHistory] = useState<CostHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<MarginItem[]>('/costs/margins').catch(() => []),
      api.get<CostHistory[]>('/costs/history').catch(() => []),
    ]).then(([m, h]) => {
      setMargins(m.sort((a, b) => b.margin - a.margin));
      setHistory(h);
    }).finally(() => setLoading(false));
  }, []);

  const marginColor = (m: number) => {
    if (m >= 30) return 'bg-green-100 text-green-700';
    if (m >= 10) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const barColor = (m: number) => {
    if (m >= 30) return 'bg-green-500';
    if (m >= 10) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">💹 ต้นทุนและกำไร</h1>

      {/* Margin Analysis */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto mb-8">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-700">Margin Analysis</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">สินค้า</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">ต้นทุน</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">ราคาขาย</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">กำไร</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Margin</th>
              <th className="px-4 py-3 w-40"></th>
            </tr>
          </thead>
          <tbody>
            {margins.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : margins.map((item) => (
              <tr key={item.product_id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700 font-medium">{item.product_name}</td>
                <td className="px-4 py-3 text-right text-gray-600">฿{Number(item.cost).toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-gray-600">฿{Number(item.selling_price).toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-medium">{item.profit >= 0 ? '+' : ''}฿{Number(item.profit).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${marginColor(item.margin)}`}>
                    {item.margin.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${barColor(item.margin)}`} style={{ width: `${Math.min(100, Math.max(0, item.margin))}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cost History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-700">ประวัติต้นทุนผลิต</h2>
        </div>
        <div className="p-6">
          {history.length === 0 ? (
            <p className="text-center text-gray-400 py-4">ไม่พบข้อมูลประวัติต้นทุน</p>
          ) : (
            <div className="flex flex-col gap-6">
              {history.map((h) => (
                <div key={h.product_name}>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">{h.product_name}</h3>
                  <div className="flex items-end gap-1 h-24">
                    {h.entries.map((entry, i) => {
                      const maxCost = Math.max(...h.entries.map((e) => e.cost));
                      const height = maxCost > 0 ? (entry.cost / maxCost) * 100 : 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] text-gray-400">฿{entry.cost.toLocaleString()}</span>
                          <div className="w-full bg-indigo-400 rounded-t" style={{ height: `${height}%` }} title={`${entry.date}: ฿${entry.cost}`} />
                          <span className="text-[10px] text-gray-400 truncate w-full text-center">{entry.date.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
