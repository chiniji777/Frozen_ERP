import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface RawMaterial {
  id: number;
  name: string;
  unit: string;
  price_per_unit: number;
}

interface BomItem {
  raw_material_id: number;
  quantity: number;
  unit: string;
  raw_material_name?: string;
  price_per_unit?: number;
}

interface Product {
  id: number;
  name: string;
}

interface Bom {
  id: number;
  name: string;
  product_id: number;
  product_name?: string;
  items: BomItem[];
  total_cost?: number;
}

export default function BomPage() {
  const [data, setData] = useState<Bom[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Bom | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bom | null>(null);

  const [formName, setFormName] = useState('');
  const [formProductId, setFormProductId] = useState<number | ''>('');
  const [formItems, setFormItems] = useState<BomItem[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [boms, prods, mats] = await Promise.all([
        api.get<Bom[]>('/bom').catch(() => []),
        api.get<Product[]>('/products').catch(() => []),
        api.get<RawMaterial[]>('/raw-materials').catch(() => []),
      ]);
      setData(boms);
      setProducts(prods);
      setMaterials(mats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const calcTotal = (items: BomItem[]) =>
    items.reduce((sum, it) => {
      const mat = materials.find((m) => m.id === it.raw_material_id);
      return sum + (mat ? mat.price_per_unit * it.quantity : 0);
    }, 0);

  const openAdd = () => {
    setEditing(null);
    setFormName('');
    setFormProductId('');
    setFormItems([{ raw_material_id: 0, quantity: 1, unit: '' }]);
    setModalOpen(true);
  };

  const openEdit = (b: Bom) => {
    setEditing(b);
    setFormName(b.name);
    setFormProductId(b.product_id);
    setFormItems(b.items.length > 0 ? b.items : [{ raw_material_id: 0, quantity: 1, unit: '' }]);
    setModalOpen(true);
  };

  const addItem = () => setFormItems([...formItems, { raw_material_id: 0, quantity: 1, unit: '' }]);
  const removeItem = (i: number) => setFormItems(formItems.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, val: unknown) => {
    const next = [...formItems];
    (next[i] as Record<string, unknown>)[field] = val;
    if (field === 'raw_material_id') {
      const mat = materials.find((m) => m.id === Number(val));
      if (mat) next[i].unit = mat.unit;
    }
    setFormItems(next);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name: formName,
      product_id: Number(formProductId),
      items: formItems.filter((it) => it.raw_material_id > 0).map((it) => ({
        raw_material_id: it.raw_material_id,
        quantity: Number(it.quantity),
      })),
    };
    if (editing) {
      await api.put(`/bom/${editing.id}`, body);
    } else {
      await api.post('/bom', body);
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.del(`/bom/${deleteTarget.id}`);
    setDeleteTarget(null);
    load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">📋 BOM (Bill of Materials)</h1>

      <DataTable
        columns={[
          { key: 'id', label: 'รหัส' },
          { key: 'name', label: 'ชื่อ BOM' },
          { key: 'product_name', label: 'สินค้า', render: (b) => b.product_name || products.find((p) => p.id === b.product_id)?.name || '-' },
          { key: 'items', label: 'วัตถุดิบ', render: (b) => `${b.items?.length ?? 0} รายการ` },
          { key: 'total_cost', label: 'ต้นทุนรวม', render: (b) => `฿${(b.total_cost ?? calcTotal(b.items ?? [])).toLocaleString()}` },
        ]}
        data={data}
        getId={(b) => b.id}
        searchPlaceholder="ค้นหา BOM..."
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(b) => setDeleteTarget(b)}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'แก้ไข BOM' : 'สร้าง BOM ใหม่'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ BOM</label>
            <input required value={formName} onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">สินค้า</label>
            <select required value={formProductId} onChange={(e) => setFormProductId(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="">-- เลือกสินค้า --</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">วัตถุดิบ</label>
              <button type="button" onClick={addItem} className="text-xs text-indigo-600 hover:text-indigo-800">+ เพิ่มรายการ</button>
            </div>
            <div className="flex flex-col gap-2">
              {formItems.map((item, i) => {
                const mat = materials.find((m) => m.id === item.raw_material_id);
                const lineCost = mat ? mat.price_per_unit * item.quantity : 0;
                return (
                  <div key={i} className="flex gap-2 items-center">
                    <select value={item.raw_material_id} onChange={(e) => updateItem(i, 'raw_material_id', Number(e.target.value))}
                      className="flex-1 px-2 py-1.5 border rounded-lg text-sm">
                      <option value={0}>-- เลือกวัตถุดิบ --</option>
                      {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                      className="w-20 px-2 py-1.5 border rounded-lg text-sm text-right" />
                    <span className="text-xs text-gray-500 w-10">{item.unit || mat?.unit || ''}</span>
                    <span className="text-xs text-gray-400 w-20 text-right">฿{lineCost.toLocaleString()}</span>
                    {formItems.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-right text-sm font-semibold text-indigo-700">
              ต้นทุนรวม: ฿{calcTotal(formItems).toLocaleString()}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{editing ? 'บันทึก' : 'สร้าง'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        message={`ต้องการลบ BOM "${deleteTarget?.name}" ใช่ไหม?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
