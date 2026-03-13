import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface StockItem {
  id: number;
  type: string;
  code?: string;
  sku?: string;
  name: string;
  stock: number;
  unit: string;
  pricePerUnit?: number;
  salePrice?: number;
  stockValue: number;
  supplier?: string;
  category?: string;
}

interface StockData {
  rawMaterials: StockItem[];
  products: StockItem[];
  summary: {
    rawMaterialCount: number;
    productCount: number;
    totalRawMaterialValue: number;
    totalProductValue: number;
    totalValue: number;
  };
}

const stockBadge = (stock: number) => {
  if (stock < 0) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">ติดลบ ({stock})</span>;
  if (stock === 0) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">หมด</span>;
  if (stock < 10) return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">{stock}</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">{stock}</span>;
};

export default function StockPage() {
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'raw-materials' | 'products'>('raw-materials');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    api.get<StockData>('/stock')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;
  if (!data) return <div className="text-center py-10 text-red-400">ไม่สามารถโหลดข้อมูลได้</div>;

  const items = tab === 'raw-materials' ? data.rawMaterials : data.products;
  const filtered = search.trim()
    ? items.filter((it) => {
        const q = search.toLowerCase();
        return it.name.toLowerCase().includes(q)
          || (it.code?.toLowerCase().includes(q) ?? false)
          || (it.sku?.toLowerCase().includes(q) ?? false)
          || (it.supplier?.toLowerCase().includes(q) ?? false)
          || (it.category?.toLowerCase().includes(q) ?? false);
      })
    : items;

  const { summary } = data;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">📊 สต็อครวม</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-xs text-gray-500 mb-1">วัตถุดิบ</div>
          <div className="text-lg font-bold text-gray-800">{summary.rawMaterialCount} รายการ</div>
          <div className="text-sm text-gray-500">มูลค่า ฿{summary.totalRawMaterialValue.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-xs text-gray-500 mb-1">สินค้า</div>
          <div className="text-lg font-bold text-gray-800">{summary.productCount} รายการ</div>
          <div className="text-sm text-gray-500">มูลค่า ฿{summary.totalProductValue.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-indigo-200 p-4 bg-indigo-50">
          <div className="text-xs text-indigo-500 mb-1">มูลค่ารวม</div>
          <div className="text-lg font-bold text-indigo-700">฿{summary.totalValue.toLocaleString()}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => { setTab('raw-materials'); setSearch(''); }}
          className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
            tab === 'raw-materials' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🧱 วัตถุดิบ ({data.rawMaterials.length})
        </button>
        <button
          onClick={() => { setTab('products'); setSearch(''); }}
          className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
            tab === 'products' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📦 สินค้า ({data.products.length})
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder={tab === 'raw-materials' ? 'ค้นหาวัตถุดิบ...' : 'ค้นหาสินค้า...'}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm mb-4"
      />

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">รหัส</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">ชื่อ</th>
              {tab === 'raw-materials' && <th className="text-left px-4 py-3 font-semibold text-gray-600">ผู้จำหน่าย</th>}
              {tab === 'products' && <th className="text-left px-4 py-3 font-semibold text-gray-600">หมวดหมู่</th>}
              <th className="text-left px-4 py-3 font-semibold text-gray-600">หน่วย</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">คงเหลือ</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">ราคา/หน่วย</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">มูลค่า</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : (
              filtered.map((it) => (
                <tr key={`${it.type}-${it.id}`} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-indigo-600">{it.code || it.sku || '-'}</td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{it.name}</td>
                  {tab === 'raw-materials' && <td className="px-4 py-3 text-gray-600">{it.supplier || '-'}</td>}
                  {tab === 'products' && <td className="px-4 py-3 text-gray-600">{it.category || '-'}</td>}
                  <td className="px-4 py-3 text-gray-600">{it.unit}</td>
                  <td className="px-4 py-3 text-right">{stockBadge(it.stock)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">฿{((it.pricePerUnit || it.salePrice || 0)).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-medium">฿{it.stockValue.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
