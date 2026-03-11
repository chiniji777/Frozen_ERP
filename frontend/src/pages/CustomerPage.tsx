import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
}

const emptyForm = { name: '', email: '', phone: '', address: '' };

export default function CustomerPage() {
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const load = () => {
    setLoading(true);
    api.get<Customer[]>('/customers')
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, email: c.email, phone: c.phone, address: c.address });
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (editing) {
      await api.put(`/customers/${editing.id}`, form);
    } else {
      await api.post('/customers', form);
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.del(`/customers/${deleteTarget.id}`);
    setDeleteTarget(null);
    load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">👥 ลูกค้า</h1>

      <DataTable
        columns={[
          { key: 'id', label: 'รหัส' },
          { key: 'name', label: 'ชื่อ' },
          { key: 'email', label: 'อีเมล' },
          { key: 'phone', label: 'โทรศัพท์' },
          { key: 'address', label: 'ที่อยู่' },
        ]}
        data={data}
        getId={(c) => c.id}
        searchPlaceholder="ค้นหาลูกค้า..."
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(c) => setDeleteTarget(c)}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">โทรศัพท์</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่</label>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">
              ยกเลิก
            </button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
              {editing ? 'บันทึก' : 'เพิ่ม'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        message={`ต้องการลบลูกค้า "${deleteTarget?.name}" ใช่ไหม?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
