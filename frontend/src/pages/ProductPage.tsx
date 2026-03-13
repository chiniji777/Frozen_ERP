import { useState, useEffect, useRef, type FormEvent } from 'react';
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
  hasVat: number;
  packingWeight: number | null;
  packingUnit: string;
}

const emptyForm = {
  name: '', category: '', salePrice: '', unit: 'KG',
  imageUrl: '', description: '', hasVat: '1',
  packingWeight: '', packingUnit: 'kg',
};

export default function ProductPage() {
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categoryList, setCategoryList] = useState<{ id: number; name: string }[]>([]);
  const [weightUoms, setWeightUoms] = useState<{ id: number; code: string; name: string }[]>([]);

  const load = () => {
    setLoading(true);
    api.get<Product[]>('/products')
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  const loadCategories = () => {
    api.get<{ id: number; name: string }[]>('/product-categories?active=1')
      .then(setCategoryList)
      .catch(() => setCategoryList([]));
  };

  const loadWeightUoms = () => {
    api.get<{ id: number; code: string; name: string; category?: string }[]>('/uoms')
      .then((uoms) => setWeightUoms(uoms.filter((u) => u.category === 'weight' || u.category === 'น้ำหนัก')))
      .catch(() => setWeightUoms([]));
  };

  useEffect(() => { load(); loadCategories(); loadWeightUoms(); }, []);

  const categories = categoryList.length > 0
    ? categoryList.map((c) => c.name)
    : [...new Set(data.map((p) => p.category).filter(Boolean))];

  const filtered = categoryFilter
    ? data.filter((p) => p.category === categoryFilter)
    : data;

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setImagePreview('');
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name || '',
      category: p.category || '',
      salePrice: String(p.salePrice ?? 0),
      unit: p.unit || 'ชิ้น',
      imageUrl: p.imageUrl || '',
      description: p.description || '',
      hasVat: String(p.hasVat ?? 1),
      packingWeight: p.packingWeight != null ? String(p.packingWeight) : '',
      packingUnit: p.packingUnit || 'kg',
    });
    setImagePreview(p.imageUrl || '');
    setModalOpen(true);
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/products/upload-image', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const result = await res.json();
      setForm((f) => ({ ...f, imageUrl: result.imageUrl }));
      setImagePreview(result.imageUrl);
    } catch {
      alert('อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    let sku: string | null = null;
    if (!editing) {
      // Auto-generate SKU for new products
      const prefix = form.category ? form.category.substring(0, 3).toUpperCase() : 'PRD';
      const res = await api.get<{ sku: string }>(`/products/next-sku?category=${encodeURIComponent(prefix)}`);
      sku = res.sku;
    }

    const body = {
      name: form.name,
      sku: editing ? editing.sku : sku,
      category: form.category || null,
      salePrice: Number(form.salePrice),
      unit: form.unit,
      imageUrl: form.imageUrl || null,
      rawMaterial: null,
      rawMaterialYield: null,
      description: form.description || null,
      hasVat: Number(form.hasVat),
      packingWeight: form.packingWeight ? Number(form.packingWeight) : null,
      packingUnit: form.packingUnit || 'kg',
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
    if (stock < 0) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">ติดลบ ({stock})</span>;
    if (stock === 0) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">หมด</span>;
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
          {
            key: 'imageUrl',
            label: 'รูป',
            render: (p) => p.imageUrl
              ? <img src={p.imageUrl} alt={p.name} className="w-10 h-10 rounded object-cover" />
              : <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs">—</div>,
          },
          { key: 'sku', label: 'รหัสสินค้า', filterable: true },
          { key: 'name', label: 'ชื่อสินค้า', filterable: true },
          { key: 'category', label: 'หมวดหมู่', filterable: true },
          { key: 'salePrice', label: 'ราคา', render: (p) => `฿${Number(p.salePrice).toLocaleString()}` },
          { key: 'unit', label: 'หน่วย' },
          { key: 'stock', label: 'คงเหลือ', render: (p) => stockBadge(p.stock) },
        ]}
        data={filtered}
        getId={(p) => p.id}
        searchPlaceholder="ค้นหาสินค้า..."
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(p) => setDeleteTarget(p)}
        onRowClick={openEdit}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {editing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รหัสสินค้า (SKU)</label>
              <input
                value={editing.sku || ''}
                disabled
                className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-400 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">รหัสสร้างอัตโนมัติ ไม่สามารถแก้ไขได้</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสินค้า</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                <option value="">-- เลือกหมวดหมู่ --</option>
                {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ราคาขาย (บาท)</label>
              <input type="number" step="0.01" required value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หน่วย</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                {weightUoms.length > 0 ? weightUoms.map((u) => (
                  <option key={u.id} value={u.code.toUpperCase()}>{u.code.toUpperCase()} ({u.name})</option>
                )) : (
                  <>
                    <option value="KG">KG (กิโลกรัม)</option>
                    <option value="G">G (กรัม)</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ภาษีมูลค่าเพิ่ม (VAT)</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="hasVat" value="1" checked={form.hasVat === '1'}
                  onChange={() => setForm({ ...form, hasVat: '1' })}
                  className="w-4 h-4 text-indigo-600" />
                <span className="text-sm text-gray-700">มี VAT 7%</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="hasVat" value="0" checked={form.hasVat === '0'}
                  onChange={() => setForm({ ...form, hasVat: '0' })}
                  className="w-4 h-4 text-indigo-600" />
                <span className="text-sm text-gray-700">ไม่มี VAT</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รูปสินค้า</label>
            <div className="flex items-center gap-4">
              {imagePreview && (
                <img src={imagePreview} alt="preview" className="w-16 h-16 rounded-lg object-cover border" />
              )}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  {uploading ? 'กำลังอัปโหลด...' : imagePreview ? 'เปลี่ยนรูป' : 'เลือกรูป'}
                </button>
                {imagePreview && (
                  <button
                    type="button"
                    onClick={() => { setForm((f) => ({ ...f, imageUrl: '' })); setImagePreview(''); }}
                    className="ml-2 px-3 py-2 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
                  >
                    ลบรูป
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">น้ำหนักต่อแพ็ค</label>
              <input type="number" step="0.01" value={form.packingWeight} onChange={(e) => setForm({ ...form, packingWeight: e.target.value })}
                placeholder="เช่น 0.5, 1, 2"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หน่วยน้ำหนัก</label>
              <select value={form.packingUnit} onChange={(e) => setForm({ ...form, packingUnit: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                {weightUoms.length > 0 ? weightUoms.map((u) => (
                  <option key={u.id} value={u.code.toLowerCase()}>{u.code.toLowerCase()} ({u.name})</option>
                )) : (
                  <>
                    <option value="kg">kg (กิโลกรัม)</option>
                    <option value="g">g (กรัม)</option>
                  </>
                )}
              </select>
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
