import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';

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

const emptyForm = {
  companyName: '', companyNameEn: '', address: '', addressEn: '',
  taxId: '', phone: '', email: '', website: '', branch: '', logoUrl: '',
};

export default function SettingsPage() {
  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
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

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (p: CompanyProfile) => {
    setEditId(p.id);
    setForm({
      companyName: p.companyName || '',
      companyNameEn: p.companyNameEn || '',
      address: p.address || '',
      addressEn: p.addressEn || '',
      taxId: p.taxId || '',
      phone: p.phone || '',
      email: p.email || '',
      website: p.website || '',
      branch: p.branch || '',
      logoUrl: p.logoUrl || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (editId) {
      await api.put(`/settings/profiles/${editId}`, form);
    } else {
      await api.post('/settings/profiles', form);
    }
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
    try {
      await api.del(`/settings/profiles/${id}`);
    } catch { /* blocked if default */ }
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
    if (data.logoUrl) {
      setForm((f) => ({ ...f, logoUrl: data.logoUrl }));
    }
    setUploading(false);
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  const inputCls = 'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm';

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Company Profiles</h1>
        <button onClick={openAdd} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
          + เพิ่มบริษัท
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
          ยังไม่มีข้อมูลบริษัท — กดปุ่ม &quot;เพิ่มบริษัท&quot; เพื่อเริ่มต้น
        </div>
      ) : (
        <div className="grid gap-4">
          {profiles.map((p) => (
            <div
              key={p.id}
              className={`bg-white rounded-xl border p-5 flex items-start gap-5 ${p.isDefault ? 'ring-2 ring-indigo-500 border-indigo-300' : ''}`}
            >
              <div className="w-16 h-16 rounded-lg border flex-shrink-0 flex items-center justify-center overflow-hidden bg-gray-50">
                {p.logoUrl ? (
                  <img src={p.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-gray-300 text-xs">Logo</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-800 truncate">{p.companyName || 'ไม่ระบุชื่อ'}</h3>
                  {p.isDefault === 1 && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700 font-medium">Default</span>
                  )}
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
                  <button
                    onClick={() => handleSetDefault(p.id)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50"
                  >
                    ตั้งเป็น Default
                  </button>
                )}
                <button
                  onClick={() => openEdit(p)}
                  className="px-3 py-1.5 text-xs rounded-lg border text-gray-600 hover:bg-gray-50"
                >
                  แก้ไข
                </button>
                {p.isDefault !== 1 && (
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={deleting === p.id}
                    className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    ลบ
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              {editId ? 'แก้ไขข้อมูลบริษัท' : 'เพิ่มบริษัทใหม่'}
            </h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
                  {form.logoUrl ? (
                    <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-gray-400 text-xs text-center">โลโก้</span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">โลโก้บริษัท</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }}
                    className="text-sm"
                  />
                  {uploading && <p className="text-xs text-indigo-600 mt-1">กำลังอัปโหลด...</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อบริษัท (ไทย)</label>
                  <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อบริษัท (อังกฤษ)</label>
                  <input value={form.companyNameEn} onChange={(e) => setForm({ ...form, companyNameEn: e.target.value })} className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่ (ไทย)</label>
                <textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่ (อังกฤษ)</label>
                <textarea rows={2} value={form.addressEn} onChange={(e) => setForm({ ...form, addressEn: e.target.value })} className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เลขประจำตัวผู้เสียภาษี</label>
                  <input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">สาขา</label>
                  <input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">โทรศัพท์</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เว็บไซต์</label>
                  <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className={inputCls} />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={saving} className="px-6 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'กำลังบันทึก...' : editId ? 'บันทึก' : 'เพิ่มบริษัท'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 text-sm rounded-lg border text-gray-600 hover:bg-gray-50">
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
