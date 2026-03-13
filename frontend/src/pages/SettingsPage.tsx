import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

// ============ Company Profile Types ============
interface CompanyProfile {
  id: number;
  companyName: string;
  companyNameEn: string;
  address: string;
  addressEn: string;
  taxId: string;
  phone: string;
  email: string;
  website: string;
  branch: string;
  logoUrl: string;
  isDefault: number;
}

const emptyCompanyForm = {
  companyName: '', companyNameEn: '', address: '', addressEn: '',
  taxId: '', phone: '', email: '', website: '', branch: '', logoUrl: '',
};

// ============ UOM Types ============
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

const emptyUomForm: UomForm = { code: '', name: '', nameEn: '', category: '', sortOrder: 0 };
const UOM_CATEGORIES = ['น้ำหนัก', 'ปริมาตร', 'จำนวน', 'บรรจุ', 'อื่นๆ'];

// ============ Product Category Types ============
interface ProductCategory {
  id: number;
  name: string;
  description: string;
  sortOrder: number;
  isActive: number;
}

interface ProductCategoryForm {
  name: string;
  description: string;
  sortOrder: number;
}

const emptyProductCategoryForm: ProductCategoryForm = { name: '', description: '', sortOrder: 0 };

// ============ Tab Button ============
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-medium rounded-t-xl border-b-2 transition-colors ${
        active
          ? 'border-indigo-600 text-indigo-700 bg-white'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ============ Company Profiles Tab ============
function CompanyTab() {
  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyCompanyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadProfiles = async () => {
    try {
      const data = await api.get<CompanyProfile[]>('/settings/profiles');
      setProfiles(data);
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { loadProfiles(); }, []);

  const openAdd = () => { setEditId(null); setForm(emptyCompanyForm); setShowModal(true); };
  const openEdit = (p: CompanyProfile) => {
    setEditId(p.id);
    setForm({
      companyName: p.companyName || '', companyNameEn: p.companyNameEn || '',
      address: p.address || '', addressEn: p.addressEn || '',
      taxId: p.taxId || '', phone: p.phone || '', email: p.email || '',
      website: p.website || '', branch: p.branch || '', logoUrl: p.logoUrl || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (editId) await api.put(`/settings/profiles/${editId}`, form);
    else await api.post('/settings/profiles', form);
    setSaving(false);
    setShowModal(false);
    loadProfiles();
  };

  const handleSetDefault = async (id: number) => {
    await api.put(`/settings/profiles/${id}/set-default`, {});
    loadProfiles();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('ต้องการลบโปรไฟล์นี้?')) return;
    setDeleting(id);
    try { await api.del(`/settings/profiles/${id}`); } catch { /* blocked if default */ }
    setDeleting(null);
    loadProfiles();
  };

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('logo', file);
    const token = localStorage.getItem('token');
    const res = await fetch('/api/settings/logo', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json();
    if (data.logoUrl) setForm((f) => ({ ...f, logoUrl: data.logoUrl }));
    setUploading(false);
  };

  const inputCls = 'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm';

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">จัดการข้อมูลบริษัทที่ใช้ในเอกสาร</p>
        <button onClick={openAdd} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
          + เพิ่มบริษัท
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border p-10 text-center text-gray-400">
          ยังไม่มีข้อมูลบริษัท — กดปุ่ม "เพิ่มบริษัท" เพื่อเริ่มต้น
        </div>
      ) : (
        <div className="grid gap-4">
          {profiles.map((p) => (
            <div key={p.id} className={`bg-white rounded-xl border p-5 flex items-start gap-5 ${p.isDefault ? 'ring-2 ring-indigo-500 border-indigo-300' : ''}`}>
              <div className="w-16 h-16 rounded-lg border flex-shrink-0 flex items-center justify-center overflow-hidden bg-gray-50">
                {p.logoUrl ? <img src={p.logoUrl} alt="Logo" className="w-full h-full object-contain" /> : <span className="text-gray-300 text-xs">Logo</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-800 truncate">{p.companyName || 'ไม่ระบุชื่อ'}</h3>
                  {p.isDefault === 1 && <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700 font-medium">Default</span>}
                </div>
                {p.companyNameEn && <p className="text-sm text-gray-500 truncate">{p.companyNameEn}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                  {p.taxId && <span>Tax ID: {p.taxId}</span>}
                  {p.branch && <span>สาขา: {p.branch}</span>}
                  {p.phone && <span>โทร: {p.phone}</span>}
                  {p.email && <span>{p.email}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {p.isDefault !== 1 && (
                  <button onClick={() => handleSetDefault(p.id)} className="px-3 py-1.5 text-xs rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50">ตั้งเป็น Default</button>
                )}
                <button onClick={() => openEdit(p)} className="px-3 py-1.5 text-xs rounded-lg border text-gray-600 hover:bg-gray-50">แก้ไข</button>
                {p.isDefault !== 1 && (
                  <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id} className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50">ลบ</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <h2 className="text-lg font-bold text-gray-800 px-6 pt-6 pb-4 shrink-0">{editId ? 'แก้ไขข้อมูลบริษัท' : 'เพิ่มบริษัทใหม่'}</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto px-6 pb-6">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
                  {form.logoUrl ? <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain" /> : <span className="text-gray-400 text-xs text-center">โลโก้</span>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">โลโก้บริษัท</label>
                  <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} className="text-sm" />
                  {uploading && <p className="text-xs text-indigo-600 mt-1">กำลังอัปโหลด...</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">ชื่อบริษัท (ไทย)</label><input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">ชื่อบริษัท (อังกฤษ)</label><input value={form.companyNameEn} onChange={(e) => setForm({ ...form, companyNameEn: e.target.value })} className={inputCls} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่ (ไทย)</label><textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่ (อังกฤษ)</label><textarea rows={2} value={form.addressEn} onChange={(e) => setForm({ ...form, addressEn: e.target.value })} className={inputCls} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">เลขผู้เสียภาษี</label><input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">สาขา</label><input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">โทรศัพท์</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">เว็บไซต์</label><input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={saving} className="px-6 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'กำลังบันทึก...' : editId ? 'บันทึก' : 'เพิ่มบริษัท'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 text-sm rounded-lg border text-gray-600 hover:bg-gray-50">ยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ UOM Tab ============
function UomTab() {
  const [data, setData] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Uom | null>(null);
  const [form, setForm] = useState<UomForm>(emptyUomForm);
  const [deleteTarget, setDeleteTarget] = useState<Uom | null>(null);
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    api.get<Uom[]>('/uoms').then(setData).catch(() => setData([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  const openAdd = () => { setEditing(null); setForm(emptyUomForm); setModalOpen(true); };
  const openEdit = (u: Uom) => {
    setEditing(u);
    setForm({ code: u.code, name: u.name, nameEn: u.nameEn || '', category: u.category || '', sortOrder: u.sortOrder || 0 });
    setModalOpen(true);
  };

  const setField = (key: keyof UomForm, val: string | number) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/uoms/${editing.id}`, form); setToast('แก้ไขหน่วยนับสำเร็จ'); }
      else { await api.post('/uoms', form); setToast('เพิ่มหน่วยนับสำเร็จ'); }
      setModalOpen(false);
      load();
    } catch { setToast('ไม่สามารถบันทึกได้'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await api.del(`/uoms/${deleteTarget.id}`); setToast('ลบหน่วยนับสำเร็จ'); }
    catch { setToast('ไม่สามารถลบได้'); }
    setDeleteTarget(null);
    load();
  };

  const inputCls = 'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm';

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">จัดการหน่วยนับสำหรับสินค้าและวัตถุดิบ</p>
        <button onClick={openAdd} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
          + เพิ่มหน่วยนับ
        </button>
      </div>

      {data.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border p-10 text-center text-gray-400">ยังไม่มีหน่วยนับ</div>
      ) : (
        <div className="grid gap-3">
          {data.map((u) => (
            <div key={u.id} className="bg-white rounded-xl border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-700 font-bold text-sm">{u.code}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800">{u.name}</div>
                <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                  {u.nameEn && <span>{u.nameEn}</span>}
                  {u.category && <span className="px-1.5 py-0.5 bg-gray-100 rounded">{u.category}</span>}
                  {u.isDefault ? <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Default</span> : null}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => openEdit(u)} className="px-3 py-1.5 text-xs rounded-lg border text-gray-600 hover:bg-gray-50">แก้ไข</button>
                <button onClick={() => setDeleteTarget(u)} className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-500 hover:bg-red-50">ลบ</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'แก้ไขหน่วยนับ' : 'เพิ่มหน่วยนับใหม่'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">รหัส (Code)</label><input required value={form.code} onChange={(e) => setField('code', e.target.value)} className={inputCls} placeholder="เช่น kg, pcs, box" disabled={!!editing} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ (ไทย)</label><input required value={form.name} onChange={(e) => setField('name', e.target.value)} className={inputCls} placeholder="เช่น กิโลกรัม, ชิ้น" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ (อังกฤษ)</label><input value={form.nameEn} onChange={(e) => setField('nameEn', e.target.value)} className={inputCls} placeholder="เช่น Kilogram, Piece" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">หมวด</label>
            <select value={form.category} onChange={(e) => setField('category', e.target.value)} className={inputCls}>
              <option value="">-- เลือกหมวด --</option>
              {UOM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">ลำดับการแสดง</label><input type="number" value={form.sortOrder} onChange={(e) => setField('sortOrder', Number(e.target.value))} className={inputCls} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{editing ? 'บันทึก' : 'เพิ่มหน่วยนับ'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} message={`ต้องการลบหน่วยนับ "${deleteTarget?.name}" (${deleteTarget?.code}) ใช่ไหม?`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />

      {toast && <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in">{toast}</div>}
    </div>
  );
}

// ============ Profile / Signature Tab ============
function ProfileTab() {
  const [user, setUser] = useState<{ id: number; displayName: string; email: string; phone?: string; signatureUrl?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    api.get<{ user: typeof user }>('/auth/me').then((res) => setUser(res.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('signature', file);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/auth/users/${user.id}/signature`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (data.signatureUrl) {
        setUser((u) => u ? { ...u, signatureUrl: data.signatureUrl } : u);
        setToast('อัปโหลดลายเซ็นสำเร็จ');
      } else {
        setToast('อัปโหลดไม่สำเร็จ');
      }
    } catch {
      setToast('เกิดข้อผิดพลาด');
    }
    setUploading(false);
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;
  if (!user) return <div className="text-center py-10 text-gray-400">ไม่พบข้อมูลผู้ใช้</div>;

  return (
    <div>
      <div className="bg-white rounded-xl border p-6 max-w-xl">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">{user.displayName}</h3>
        <p className="text-sm text-gray-500 mb-6">{user.email}{user.phone ? ` | ${user.phone}` : ''}</p>

        <div className="border-t pt-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">🖊️ ลายเซ็นสำหรับเอกสาร</h4>
          <p className="text-xs text-gray-400 mb-4">ลายเซ็นจะแสดงในเอกสาร SO, DN, Invoice, Receipt เมื่อคุณเป็นผู้อนุมัติ</p>

          <div className="flex items-start gap-6">
            <div className="w-48 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50">
              {user.signatureUrl ? (
                <img src={user.signatureUrl} alt="ลายเซ็น" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-gray-400 text-xs text-center px-2">ยังไม่มีลายเซ็น<br/>กรุณาอัปโหลด</span>
              )}
            </div>
            <div>
              <label className="inline-block px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer font-medium">
                {uploading ? '⏳ กำลังอัปโหลด...' : '📤 อัปโหลดลายเซ็น'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
              </label>
              <p className="text-xs text-gray-400 mt-2">รองรับ PNG, JPG — แนะนำพื้นหลังโปร่งใส</p>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg">{toast}</div>}
    </div>
  );
}

// ============ Product Category Tab ============
function ProductCategoryTab() {
  const [data, setData] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [form, setForm] = useState<ProductCategoryForm>(emptyProductCategoryForm);
  const [deactivateTarget, setDeactivateTarget] = useState<ProductCategory | null>(null);
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    api.get<ProductCategory[]>('/product-categories').then(setData).catch(() => setData([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  const openAdd = () => { setEditing(null); setForm(emptyProductCategoryForm); setModalOpen(true); };
  const openEdit = (cat: ProductCategory) => {
    setEditing(cat);
    setForm({ name: cat.name, description: cat.description || '', sortOrder: cat.sortOrder || 0 });
    setModalOpen(true);
  };

  const setField = (key: keyof ProductCategoryForm, val: string | number) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/product-categories/${editing.id}`, form); setToast('แก้ไขหมวดหมู่สำเร็จ'); }
      else { await api.post('/product-categories', form); setToast('เพิ่มหมวดหมู่สำเร็จ'); }
      setModalOpen(false);
      load();
    } catch { setToast('ไม่สามารถบันทึกได้'); }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try { await api.patch(`/product-categories/${deactivateTarget.id}/deactivate`, {}); setToast('ปิดการใช้งานหมวดหมู่สำเร็จ'); }
    catch { setToast('ไม่สามารถปิดการใช้งานได้'); }
    setDeactivateTarget(null);
    load();
  };

  const inputCls = 'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm';

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">จัดการหมวดหมู่สินค้าสำหรับใช้ในหน้าสินค้า</p>
        <button onClick={openAdd} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">+ เพิ่มหมวดหมู่</button>
      </div>
      {data.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border p-10 text-center text-gray-400">ยังไม่มีหมวดหมู่สินค้า</div>
      ) : (
        <div className="grid gap-3">
          {data.map((cat) => (
            <div key={cat.id} className="bg-white rounded-xl border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0"><span className="text-lg">🏷️</span></div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800">{cat.name}</div>
                <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                  {cat.description && <span>{cat.description}</span>}
                  <span className="px-1.5 py-0.5 bg-gray-100 rounded">ลำดับ: {cat.sortOrder}</span>
                  {cat.isActive ? <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded">ใช้งาน</span> : <span className="px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">ปิดใช้งาน</span>}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => openEdit(cat)} className="px-3 py-1.5 text-xs rounded-lg border text-gray-600 hover:bg-gray-50">แก้ไข</button>
                {cat.isActive === 1 && <button onClick={() => setDeactivateTarget(cat)} className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-500 hover:bg-red-50">ปิดใช้งาน</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">ชื่อหมวดหมู่</label><input required value={form.name} onChange={(e) => setField('name', e.target.value)} className={inputCls} placeholder="เช่น อาหารแช่แข็ง, ของสด" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">คำอธิบาย</label><textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} className={inputCls} placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">ลำดับการแสดง</label><input type="number" value={form.sortOrder} onChange={(e) => setField('sortOrder', Number(e.target.value))} className={inputCls} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{editing ? 'บันทึก' : 'เพิ่มหมวดหมู่'}</button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog open={!!deactivateTarget} message={`ต้องการปิดการใช้งานหมวดหมู่ "${deactivateTarget?.name}" ใช่ไหม?`} onConfirm={handleDeactivate} onCancel={() => setDeactivateTarget(null)} />
      {toast && <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in">{toast}</div>}
    </div>
  );
}

// ============ Recurring Expense Category Tab ============
function RecurringCategoryTab() {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ idx: number; name: string } | null>(null);
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    api.get<string[]>('/recurring-expenses/categories').then(setCategories).catch(() => setCategories([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  const openAdd = () => { setEditingIdx(null); setFormName(''); setModalOpen(true); };
  const openEdit = (idx: number) => { setEditingIdx(idx); setFormName(categories[idx]); setModalOpen(true); };

  const save = async (updated: string[]) => {
    try { await api.put('/recurring-expenses/categories', updated); setCategories(updated); return true; }
    catch { setToast('ไม่สามารถบันทึกได้'); return false; }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    if (!name) return;
    let updated: string[];
    if (editingIdx !== null) {
      updated = categories.map((c, i) => i === editingIdx ? name : c);
    } else {
      if (categories.includes(name)) { setToast('ประเภทนี้มีอยู่แล้ว'); return; }
      updated = [...categories, name];
    }
    if (await save(updated)) {
      setToast(editingIdx !== null ? 'แก้ไขประเภทสำเร็จ' : 'เพิ่มประเภทสำเร็จ');
      setModalOpen(false);
    }
  };

  const handleDelete = async () => {
    if (deleteTarget === null) return;
    const updated = categories.filter((_, i) => i !== deleteTarget.idx);
    if (await save(updated)) setToast('ลบประเภทสำเร็จ');
    setDeleteTarget(null);
  };

  const inputCls = 'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm';

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">จัดการประเภทค่าใช้จ่ายประจำเดือน</p>
        <button onClick={openAdd} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">+ เพิ่มประเภท</button>
      </div>
      {categories.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border p-10 text-center text-gray-400">ยังไม่มีประเภทค่าใช้จ่าย</div>
      ) : (
        <div className="grid gap-3">
          {categories.map((cat, idx) => (
            <div key={idx} className="bg-white rounded-xl border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0"><span className="text-lg">📅</span></div>
              <div className="flex-1 min-w-0"><div className="font-medium text-gray-800">{cat}</div></div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => openEdit(idx)} className="px-3 py-1.5 text-xs rounded-lg border text-gray-600 hover:bg-gray-50">แก้ไข</button>
                <button onClick={() => setDeleteTarget({ idx, name: cat })} className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-500 hover:bg-red-50">ลบ</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingIdx !== null ? 'แก้ไขประเภท' : 'เพิ่มประเภทใหม่'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">ชื่อประเภท</label><input required value={formName} onChange={(e) => setFormName(e.target.value)} className={inputCls} placeholder="เช่น ค่าเช่า, สาธารณูปโภค" /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{editingIdx !== null ? 'บันทึก' : 'เพิ่มประเภท'}</button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog open={!!deleteTarget} message={`ต้องการลบประเภท "${deleteTarget?.name}" ใช่ไหม?`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      {toast && <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in">{toast}</div>}
    </div>
  );
}

// ============ Main Settings Page with Tabs ============
export default function SettingsPage() {
  const [tab, setTab] = useState<'company' | 'uom' | 'profile' | 'productCat' | 'recurringCat'>('company');

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">⚙️ ตั้งค่า</h1>

      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        <TabButton active={tab === 'company'} onClick={() => setTab('company')} icon="🏢" label="ข้อมูลบริษัท" />
        <TabButton active={tab === 'uom'} onClick={() => setTab('uom')} icon="📏" label="หน่วยนับ" />
        <TabButton active={tab === 'productCat'} onClick={() => setTab('productCat')} icon="🏷️" label="หมวดหมู่สินค้า" />
        <TabButton active={tab === 'recurringCat'} onClick={() => setTab('recurringCat')} icon="📅" label="ประเภทค่าใช้จ่ายประจำ" />
        <TabButton active={tab === 'profile'} onClick={() => setTab('profile')} icon="🖊️" label="โปรไฟล์ / ลายเซ็น" />
      </div>

      {tab === 'company' && <CompanyTab />}
      {tab === 'uom' && <UomTab />}
      {tab === 'productCat' && <ProductCategoryTab />}
      {tab === 'recurringCat' && <RecurringCategoryTab />}
      {tab === 'profile' && <ProfileTab />}
    </div>
  );
}
