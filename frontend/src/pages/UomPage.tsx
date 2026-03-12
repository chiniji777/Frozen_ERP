import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface Uom {
  id: number;
  code: string;
  name: string;
  nameEn?: string;
  category?: string;
  isDefault?: number;
  sortOrder?: number;
}

interface UomForm {
  code: string;
  name: string;
  nameEn: string;
  category: string;
  sortOrder: number;
}

const emptyForm: UomForm = { code: '', name: '', nameEn: '', category: '', sortOrder: 0 };

const CATEGORIES = ['น้ำหนัก', 'ปริมาตร', 'จำนวน', 'บรรจุ', 'อื่นๆ'];

export default function UomPage() {
  const [data, setData] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Uom | null>(null);
  const [form, setForm] = useState<UomForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Uom | null>(null);
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    api.get<Uom[]>('/uoms')
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (u: Uom) => {
    setEditing(u);
    setForm({
      code: u.code,
      name: u.name,
      nameEn: u.nameEn || '',
      category: u.category || '',
      sortOrder: u.sortOrder || 0,
    });
    setModalOpen(true);
  };

  const setField = (key: keyof UomForm, val: string | number) => {
    setForm((f) => ({ ...f, [key]: val }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/uoms/${editing.id}`, form);
        setToast('แก้ไขหน่วยนับสำเร็จ');
      } else {
        await api.post('/uoms', form);
        setToast('เพิ่มหน่วยนับสำเร็จ');
      }
      setModalOpen(false);
      load();
    } catch {
      setToast('ไม่สามารถบันทึกได้');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/uoms/${deleteTarget.id}`);
      setToast('ลบหน่วยนับสำเร็จ');
    } catch {
      setToast('ไม่สามารถลบได้');
    }
    setDeleteTarget(null);
    load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  const inputCls = 'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">📏 จัดการหน่วยนับ (UOM)</h1>

      <DataTable
        columns={[
          { key: 'id', label: 'ID' },
          { key: 'code', label: 'รหัส' },
          { key: 'name', label: 'ชื่อ (ไทย)' },
          { key: 'nameEn', label: 'ชื่อ (อังกฤษ)' },
          { key: 'category', label: 'หมวด' },
          { key: 'sortOrder', label: 'ลำดับ' },
          {
            key: 'isDefault', label: 'Default',
            render: (u: Uom) => u.isDefault ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Default</span>
            ) : null,
          },
        ]}
        data={data}
        getId={(u) => u.id}
        searchPlaceholder="ค้นหาหน่วยนับ..."
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(u) => setDeleteTarget(u)}
        onRowClick={openEdit}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'แก้ไขหน่วยนับ' : 'เพิ่มหน่วยนับใหม่'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัส (Code)</label>
            <input required value={form.code} onChange={(e) => setField('code', e.target.value)}
              className={inputCls} placeholder="เช่น kg, pcs, box" disabled={!!editing} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ (ไทย)</label>
            <input required value={form.name} onChange={(e) => setField('name', e.target.value)}
              className={inputCls} placeholder="เช่น กิโลกรัม, ชิ้น, กล่อง" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ (อังกฤษ)</label>
            <input value={form.nameEn} onChange={(e) => setField('nameEn', e.target.value)}
              className={inputCls} placeholder="เช่น Kilogram, Piece, Box" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมวด</label>
            <select value={form.category} onChange={(e) => setField('category', e.target.value)} className={inputCls}>
              <option value="">-- เลือกหมวด --</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ลำดับการแสดง</label>
            <input type="number" value={form.sortOrder} onChange={(e) => setField('sortOrder', Number(e.target.value))}
              className={inputCls} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
              {editing ? 'บันทึก' : 'เพิ่มหน่วยนับ'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        message={`ต้องการลบหน่วยนับ "${deleteTarget?.name}" (${deleteTarget?.code}) ใช่ไหม?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
