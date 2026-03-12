import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface User {
  id: number;
  username: string;
  displayName: string;
  email: string;
  phone?: string;
  role: string;
  active: boolean;
  createdAt?: string;
}

interface UserForm {
  username: string;
  displayName: string;
  email: string;
  phone: string;
  password: string;
  role: string;
}

const emptyForm: UserForm = { username: '', displayName: '', email: '', phone: '', password: '', role: 'user' };

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'user', label: 'User' },
  { value: 'viewer', label: 'Viewer' },
];

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: 'bg-red-100 text-red-700',
    manager: 'bg-purple-100 text-purple-700',
    user: 'bg-blue-100 text-blue-700',
    viewer: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[role] || colors.user}`}>
      {role}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
      active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {active ? 'ใช้งาน' : 'ปิดใช้งาน'}
    </span>
  );
}

export default function UserManagementPage() {
  const [data, setData] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    api.get<User[]>('/auth/users')
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
  const openEdit = (u: User) => {
    setEditing(u);
    setForm({
      username: u.username,
      displayName: u.displayName || '',
      email: u.email || '',
      phone: u.phone || '',
      password: '',
      role: u.role || 'user',
    });
    setModalOpen(true);
  };

  const setField = (key: keyof UserForm, val: string) => {
    setForm((f) => ({ ...f, [key]: val }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        const payload: Record<string, unknown> = {
          username: form.username,
          displayName: form.displayName,
          email: form.email,
          phone: form.phone,
          role: form.role,
        };
        if (form.password) payload.password = form.password;
        await api.put(`/auth/users/${editing.id}`, payload);
        setToast('แก้ไขผู้ใช้สำเร็จ');
      } else {
        await api.post('/auth/users', {
          username: form.username,
          displayName: form.displayName,
          email: form.email,
          phone: form.phone,
          password: form.password,
          role: form.role,
        });
        setToast('สร้างผู้ใช้สำเร็จ');
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
      await api.del(`/auth/users/${deleteTarget.id}`);
      setToast('ลบผู้ใช้สำเร็จ');
    } catch {
      setToast('ไม่สามารถลบได้');
    }
    setDeleteTarget(null);
    load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">👤 จัดการผู้ใช้</h1>

      <DataTable
        columns={[
          { key: 'id', label: 'ID' },
          { key: 'username', label: 'ชื่อผู้ใช้' },
          { key: 'displayName', label: 'ชื่อแสดง' },
          { key: 'email', label: 'อีเมล' },
          { key: 'phone', label: 'เบอร์โทร' },
          { key: 'role', label: 'บทบาท', render: (u: User) => <RoleBadge role={u.role} /> },
          { key: 'active', label: 'สถานะ', render: (u: User) => <StatusBadge active={u.active !== false} /> },
        ]}
        data={data}
        getId={(u) => u.id}
        searchPlaceholder="ค้นหาผู้ใช้..."
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(u) => setDeleteTarget(u)}
        onRowClick={openEdit}
      />

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ใช้ (Username)</label>
            <input required value={form.username} onChange={(e) => setField('username', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              placeholder="username" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อแสดง (Display Name)</label>
            <input required value={form.displayName} onChange={(e) => setField('displayName', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              placeholder="ชื่อ-นามสกุล" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
            <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              placeholder="user@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทร</label>
            <input type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              placeholder="0812345678" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {editing ? 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่าน'}
            </label>
            <input type="password" value={form.password} onChange={(e) => setField('password', e.target.value)}
              required={!editing}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              placeholder="••••••••" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">บทบาท (Role)</label>
            <select value={form.role} onChange={(e) => setField('role', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
              {editing ? 'บันทึก' : 'สร้างผู้ใช้'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        message={`ต้องการลบผู้ใช้ "${deleteTarget?.displayName || deleteTarget?.username}" ใช่ไหม?`}
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
