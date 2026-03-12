import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface Product {
  id: number;
  name: string;
  sku: string;
  category: string;
  salePrice: number;
  stock: number;
  unit: string;
  imageUrl: string;
  rawMaterial: string;
  rawMaterialYield: number | null;
  description: string;
}

const emptyForm = {
  name: '', sku: '', category: '', salePrice: '', stock: '', unit: 'ชิ้น',
  imageUrl: '', rawMaterial: '', rawMaterialYield: '', description: '',
};

export default function ProductPage() {
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');

  const load = () => {
    setLoading(true);
    api.get<Product[]>('/products')
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const categories = [...new Set(data.map((p) => p.category).filter(Boolean))];

  const filtered = categoryFilter
    ? data.filter((p) => p.category === categoryFilter)
    : data;

  const openAdd = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name || '',
      sku: p.sku || '',
      category: p.category || '',
      salePrice: String(p.salePrice ?? 0),
      stock: String(p.stock ?? 0),
      unit: p.unit || 'ชิ้น',
      imageUrl: p.imageUrl || '',
      rawMaterial: p.rawMaterial || '',
      rawMaterialYield: p.rawMaterialYield != null ? String(p.rawMaterialYield) : '',
      description: p.description || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name: form.name,
      sku: form.sku || null,
      category: form.category || null,
      salePrice: Number(form.salePrice),
      stock: Number(form.stock),
      unit: form.unit,
      imageUrl: form.imageUrl || null,
      rawMaterial: form.rawMaterial || null,
      rawMaterialYield: form.rawMaterialYield ? Number(form.rawMaterialYield) : null,
      description: form.description || null,
    };
    if (editing) {
      await api.put(`/products/${editing.id}`, body);
    } else {
      await api.post('/products', body);
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.del(`/products/${deleteTarget.id}`);
    setDeleteTarget(null);
    load();
  };

  const stockBadge = (stock: number) => {
    if (stock <= 0) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">หมด</span>;
    if (stock < 10) return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">เหลือน้อย ({stock})</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">{stock}</span>;
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">📦 สินค้า</h1>

      {categories.length > 0 && (
        <div className="mb-4 flex gap-2 flex-wrap">
          <button
            onClick={() => setCategoryFilter('')}
            className={`px-3 py-1 rounded-full text-xs border ${!categoryFilter ? 'bg-indigo-600 text-white border-indigo-600' : 'hover:bg-gray-50'}`}
          >
            ทั้งหมด
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs border ${categoryFilter === cat ? 'bg-indigo-600 text-white border-indigo-600' : 'hover:bg-gray-50'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <DataTable
        columns={[
          { key: 'sku', label: 'รหัสสินค้า' },
          { key: 'name', label: 'ชื่อสินค้า' },
          { key: 'category', label: 'หมวดหมู่' },
          { key: 'salePrice', label: 'ราคา', render: (p) => `฿${Number(p.salePrice).toLocaleString()}` },
          { key: 'rawMaterial', label: 'วัตถุดิบ' },
          { key: 'rawMaterialYield', label: 'Yield %', render: (p) => p.rawMaterialYield != null ? `${p.rawMaterialYield}%` : '-' },
          { key: 'unit', label: 'หน่วย' },
          { key: 'stock', label: 'คงเหลือ', render: (p) => stockBadge(p.stock) },
        ]}
        data={filtered}
        getId={(p) => p.id}
        searchPlaceholder="ค้นหาสินค้า..."
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(p) => setDeleteTarget(p)}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รหัสสินค้า (SKU)</label>
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสินค้า</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ราคาขาย (บาท)</label>
              <input type="number" step="0.01" required value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วัตถุดิบ</label>
              <input value={form.rawMaterial} onChange={(e) => setForm({ ...form, rawMaterial: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ผลผลิตวัตถุดิบ (Yield %)</label>
              <input type="number" step="0.01" value={form.rawMaterialYield} onChange={(e) => setForm({ ...form, rawMaterialYield: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หน่วย</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนคงเหลือ</label>
              <input type="number" required value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รูปสินค้า (URL)</label>
              <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">คำอธิบายสินค้า</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{editing ? 'บันทึก' : 'เพิ่ม'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        message={`ต้องการลบสินค้า "${deleteTarget?.name}" ใช่ไหม?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
