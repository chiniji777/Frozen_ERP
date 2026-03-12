import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface Expense {
  id: number;
  category: string;
  description: string;
  amount: number;
  date: string;
}

const emptyForm = { category: '', description: '', amount: '', date: '' };

export default function ExpensePage() {
  const [data, setData] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [filterCat, setFilterCat] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const load = () => {
    setLoading(true);
    api.get<Expense[]>('/expenses')
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const categories = [...new Set(data.map((e) => e.category).filter(Boolean))];

  const filtered = data.filter((e) => {
    if (filterCat && e.category !== filterCat) return false;
    if (filterFrom && e.date < filterFrom) return false;
    if (filterTo && e.date > filterTo) return false;
    return true;
  });

  const monthlyTotal = filtered.reduce((sum, e) => sum + Number(e.amount), 0);

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) }); setModalOpen(true); };
  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({ category: e.category, description: e.description, amount: String(e.amount), date: e.date?.slice(0, 10) || '' });
    setModalOpen(true);
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const body = { ...form, amount: Number(form.amount) };
    if (editing) {
      await api.put(`/expenses/${editing.id}`, body);
    } else {
      await api.post('/expenses', body);
    }
    setModalOpen(false); load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.del(`/expenses/${deleteTarget.id}`);
    setDeleteTarget(null); load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">💸 ค่าใช้จ่าย</h1>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">หมวด</label>
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm">
            <option value="">ทั้งหมด</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">จาก</label>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ถึง</label>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm" />
        </div>
        <div className="ml-auto bg-indigo-50 rounded-lg px-4 py-2">
          <span className="text-sm text-gray-500">ยอดรวม: </span>
          <span className="text-lg font-bold text-indigo-700">฿{monthlyTotal.toLocaleString()}</span>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'id', label: 'รหัส' },
          { key: 'date', label: 'วันที่', render: (e) => e.date?.slice(0, 10) || '-' },
          { key: 'category', label: 'หมวด' },
          { key: 'description', label: 'รายละเอียด' },
          { key: 'amount', label: 'จำนวนเงิน', render: (e) => `฿${Number(e.amount).toLocaleString()}` },
        ]}
        data={filtered}
        getId={(e) => e.id}
        searchPlaceholder="ค้นหาค่าใช้จ่าย..."
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(e) => setDeleteTarget(e)}
        onRowClick={openEdit}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่ายใหม่'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมวด</label>
            <input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="เช่น ค่าขนส่ง, ค่าน้ำไฟ" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท)</label>
              <input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{editing ? 'บันทึก' : 'เพิ่ม'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} message={`ต้องการลบค่าใช้จ่าย "${deleteTarget?.description}" ใช่ไหม?`}
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
