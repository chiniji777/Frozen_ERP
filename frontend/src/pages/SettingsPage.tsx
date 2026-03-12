import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';

interface CompanySettings {
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
}

const emptyForm = {
  companyName: '', companyNameEn: '', address: '', addressEn: '',
  taxId: '', phone: '', email: '', website: '', branch: '', logoUrl: '',
};

export default function SettingsPage() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get<CompanySettings>('/settings')
      .then((data) => {
        setForm({
          companyName: data.companyName || '',
          companyNameEn: data.companyNameEn || '',
          address: data.address || '',
          addressEn: data.addressEn || '',
          taxId: data.taxId || '',
          phone: data.phone || '',
          email: data.email || '',
          website: data.website || '',
          branch: data.branch || '',
          logoUrl: data.logoUrl || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await api.put('/settings', form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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

  const inputCls = "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm";

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">ตั้งค่าข้อมูลบริษัท</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 flex flex-col gap-5">
        <div className="flex items-center gap-6 mb-2">
          <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50">
            {form.logoUrl ? (
              <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <span className="text-gray-400 text-xs text-center">ยังไม่มีโลโก้</span>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">โลโก้บริษัท</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLogoUpload(f);
              }}
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
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          {saved && <span className="text-green-600 text-sm">บันทึกสำเร็จแล้ว</span>}
        </div>
      </form>
    </div>
  );
}
