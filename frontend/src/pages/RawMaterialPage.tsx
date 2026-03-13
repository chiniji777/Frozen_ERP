import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ComboBox from '../components/ComboBox';

interface Supplier { id: number; name: string; }

interface RawMaterial {
  id: number;
  code?: string;
  name: string;
  unit: string;
  stock: number;
  min_stock: number;
  pricePerUnit: number;
  supplier?: string;
  notes?: string;
}

const emptyForm = { name: '', unit: 'กก.', pricePerUnit: '', supplier: '', notes: '' };

export default function RawMaterialPage() {
  const [data, setData] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<RawMaterial | null>(null);
  const [supplierNames, setSupplierNames] = useState<string[]>([]);

  const UNIT_OPTIONS = ['กก.', 'กรัม', 'ลิตร', 'มล.', 'ชิ้น', 'แพ็ค', 'ถุง', 'กล่อง', 'ขวด', 'ถัง', 'ม้วน', 'แผ่น', 'เมตร'];

  const load = () => {
    setLoading(true);
    api.get<RawMaterial[]>('/raw-materials')
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get<Supplier[]>('/suppliers').then((list) => setSupplierNames(list.map((s) => s.name))).catch(() => {});
  }, []);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (m: RawMaterial) => {
    setEditing(m);
    setForm({
      name: m.name,
      unit: m.unit,
      pricePerUnit: String(m.pricePerUnit ?? 0),
      supplier: m.supplier || '',
      notes: m.notes || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      ...form,
      pricePerUnit: Number(form.pricePerUnit) || 0,
    };
    if (editing) {
      await api.put(`/raw-materials/${editing.id}`, body);
    } else {
      await api.post('/raw-materials', body);
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.del(`/raw-materials/${deleteTarget.id}`);
    setDeleteTarget(null);
    load();
  };

  const stockBadge = (m: RawMaterial) => {
    if (m.stock < 0) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">ติดลบ ({m.stock})</span>;
    if (m.stock === 0) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">หมด</span>;
    if (m.stock <= m.min_stock) return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">ต่ำกว่าขั้นต่ำ ({m.stock})</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">{m.stock}</span>;
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">🧱 วัตถุดิบ</h1>

      <DataTable
        columns={[
          { key: 'code', label: 'รหัส', filterable: true, render: (m: RawMaterial) => <span className="font-mono text-indigo-600">{m.code || '-'}</span> },
          { key: 'name', label: 'ชื่อวัตถุดิบ', filterable: true },
          { key: 'unit', label: 'หน่วย' },
          { key: 'stock', label: 'คงเหลือ', render: (m) => stockBadge(m) },
          { key: 'pricePerUnit', label: 'ราคา/หน่วย', render: (m: RawMaterial) => `฿${(Number(m.pricePerUnit) || 0).toLocaleString()}` },
          { key: 'supplier', label: 'ผู้จำหน่าย', filterable: true },
        ]}
        data={data}
        getId={(m) => m.id}
        searchPlaceholder="ค้นหาวัตถุดิบ..."
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(m) => setDeleteTarget(m)}
        onRowClick={openEdit}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'แก้ไขวัตถุดิบ' : 'เพิ่มวัตถุดิบใหม่'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {editing?.code && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รหัส (Code)</label>
              <input disabled value={editing.code} className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500 text-sm font-mono" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อวัตถุดิบ</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หน่วย</label>
              <ComboBox value={form.unit} onChange={(v) => setForm({ ...form, unit: v })}
                options={UNIT_OPTIONS} placeholder="เลือกหรือพิมพ์หน่วย" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ราคาต่อหน่วย (บาท)</label>
              <input type="number" step="0.01" required value={form.pricePerUnit} onChange={(e) => setForm({ ...form, pricePerUnit: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ผู้จำหน่าย</label>
            <ComboBox value={form.supplier} onChange={(v) => setForm({ ...form, supplier: v })}
              options={supplierNames} placeholder="เลือกหรือพิมพ์ชื่อผู้จำหน่าย" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
        message={`ต้องการลบวัตถุดิบ "${deleteTarget?.name}" ใช่ไหม?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
