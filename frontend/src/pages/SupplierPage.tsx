import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface Supplier {
  id: number;
  code: string;
  name: string;
  fullName: string;
  nickName: string;
  supplierType: 'Company' | 'Individual';
  phone: string;
  email: string;
  address: string;
  taxId: string;
  paymentTerms: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  paymentMethod: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface SupplierForm {
  name: string;
  fullName: string;
  nickName: string;
  supplierType: 'Company' | 'Individual';
  phone: string;
  email: string;
  address: string;
  taxId: string;
  paymentTerms: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  paymentMethod: string;
  notes: string;
}

const emptyForm: SupplierForm = {
  name: '', fullName: '', nickName: '', supplierType: 'Company',
  phone: '', email: '', address: '', taxId: '', paymentTerms: '',
  bankName: '', bankAccountNumber: '', bankAccountName: '', paymentMethod: '',
  notes: '',
};

const PAYMENT_TERMS = [
  'ชำระก่อนส่ง',
  'ชำระหลังส่ง',
  'เครดิต 7 วัน',
  'เครดิต 14 วัน',
  'เครดิต 30 วัน',
  'เครดิต 45 วัน',
  'เครดิต 60 วัน',
  'เครดิต 90 วัน',
];

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
      type === 'Company' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
    }`}>
      {type === 'Company' ? 'บริษัท' : 'บุคคล'}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ViewDetail({ supplier, open, onClose }: { supplier: Supplier | null; open: boolean; onClose: () => void }) {
  if (!supplier) return null;

  const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-1.5">
      <span className="text-xs font-medium text-gray-400 sm:w-32 shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{value || '-'}</span>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={`รายละเอียดผู้ขาย — ${supplier.name}`}>
      <div className="space-y-4">
        <Section title="ข้อมูลทั่วไป">
          <InfoRow label="รหัส" value={supplier.code} />
          <InfoRow label="ชื่อ" value={supplier.name} />
          <InfoRow label="ชื่อเต็ม" value={supplier.fullName} />
          <InfoRow label="ชื่อย่อ" value={supplier.nickName} />
          <InfoRow label="ประเภท" value={<TypeBadge type={supplier.supplierType} />} />
        </Section>

        <Section title="ข้อมูลติดต่อ">
          <InfoRow label="โทรศัพท์" value={supplier.phone} />
          <InfoRow label="อีเมล" value={supplier.email} />
          <InfoRow label="ที่อยู่" value={supplier.address} />
        </Section>

        <Section title="การเงิน">
          <InfoRow label="เลขผู้เสียภาษี" value={supplier.taxId} />
          <InfoRow label="เงื่อนไขชำระ" value={supplier.paymentTerms} />
          <InfoRow label="ช่องทางชำระ" value={supplier.paymentMethod} />
          <InfoRow label="ธนาคาร" value={supplier.bankName} />
          <InfoRow label="เลขที่บัญชี" value={supplier.bankAccountNumber} />
          <InfoRow label="ชื่อบัญชี" value={supplier.bankAccountName} />
        </Section>

        {supplier.notes && (
          <Section title="หมายเหตุ">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{supplier.notes}</p>
          </Section>
        )}
      </div>
    </Modal>
  );
}

export default function SupplierPage() {
  const [data, setData] = useState<Supplier[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [viewTarget, setViewTarget] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [toast, setToast] = useState('');
  const [dbdLoading, setDbdLoading] = useState(false);

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

  const load = () => {
    api.get<Supplier[]>('/suppliers').then(setData).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const lookupDBD = async () => {
    const taxId = form.taxId.trim();
    if (!/^\d{13}$/.test(taxId)) {
      showToast('กรุณากรอกเลขผู้เสียภาษี 13 หลัก');
      return;
    }
    setDbdLoading(true);
    try {
      const res = await api.get<{
        found: boolean;
        companyName?: string;
        companyNameEn?: string;
        address?: string;
        type?: 'Company' | 'Individual';
        phone?: string;
        source?: string;
        warning?: string;
      }>(`/dbd/lookup/${taxId}`);
      if (res.found) {
        setForm((f) => ({
          ...f,
          name: res.companyName || f.name,
          fullName: res.companyName || f.fullName,
          address: res.address || f.address,
          supplierType: res.type || f.supplierType,
          phone: res.phone || f.phone,
        }));
        showToast(`พบข้อมูล: ${res.companyName} (${res.source})`);
      } else {
        showToast(res.warning || 'ไม่พบข้อมูลจาก DBD');
      }
    } catch {
      showToast('เชื่อมต่อ DBD ไม่สำเร็จ');
    } finally {
      setDbdLoading(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name || '',
      fullName: s.fullName || '',
      nickName: s.nickName || '',
      supplierType: s.supplierType || 'Company',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      taxId: s.taxId || '',
      paymentTerms: s.paymentTerms || '',
      bankName: s.bankName || '',
      bankAccountNumber: s.bankAccountNumber || '',
      bankAccountName: s.bankAccountName || '',
      paymentMethod: s.paymentMethod || '',
      notes: s.notes || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/suppliers/${editing.id}`, form);
        showToast('แก้ไขผู้ขายสำเร็จ');
      } else {
        await api.post('/suppliers', form);
        showToast('เพิ่มผู้ขายสำเร็จ');
      }
      setModalOpen(false);
      load();
    } catch {
      showToast('เกิดข้อผิดพลาด');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/suppliers/${deleteTarget.id}`);
      showToast('ลบผู้ขายสำเร็จ');
      setDeleteTarget(null);
      load();
    } catch {
      showToast('เกิดข้อผิดพลาด');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">ผู้ขาย (Suppliers)</h1>

      <DataTable
        columns={[
          { key: 'code', label: 'รหัส' },
          { key: 'name', label: 'ชื่อผู้ขาย' },
          { key: 'supplierType', label: 'ประเภท', render: (s) => <TypeBadge type={(s as Supplier).supplierType || 'Company'} /> },
          { key: 'phone', label: 'โทรศัพท์' },
          { key: 'email', label: 'อีเมล' },
          { key: 'paymentTerms', label: 'เงื่อนไขชำระ' },
        ]}
        data={data}
        getId={(s) => s.id}
        searchPlaceholder="ค้นหาผู้ขาย..."
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(s) => setDeleteTarget(s)}
        onRowClick={(s) => setViewTarget(s)}
      />

      <ViewDetail supplier={viewTarget} open={!!viewTarget} onClose={() => setViewTarget(null)} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'แก้ไขผู้ขาย' : 'เพิ่มผู้ขายใหม่'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อผู้ขาย *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อเต็ม</label>
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อย่อ</label>
              <input value={form.nickName} onChange={(e) => setForm({ ...form, nickName: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ประเภท</label>
              <select value={form.supplierType} onChange={(e) => setForm({ ...form, supplierType: e.target.value as 'Company' | 'Individual' })} className={inputCls}>
                <option value="Company">บริษัท</option>
                <option value="Individual">บุคคล</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">โทรศัพท์</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">อีเมล</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">เลขผู้เสียภาษี</label>
              <div className="flex gap-2">
                <input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                  placeholder="กรอก 13 หลัก แล้วกดค้น DBD"
                  className={inputCls} />
                <button type="button" onClick={lookupDBD} disabled={dbdLoading}
                  className="px-3 py-2 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap font-medium">
                  {dbdLoading ? '⏳ กำลังค้น...' : '🔍 ค้น DBD'}
                </button>
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">ที่อยู่</label>
              <textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">เงื่อนไขชำระ</label>
              <select value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} className={inputCls}>
                <option value="">-- เลือก --</option>
                {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ช่องทางชำระเงิน</label>
              <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className={inputCls}>
                <option value="">-- เลือก --</option>
                <option value="โอนเงิน">โอนเงิน</option>
                <option value="เงินสด">เงินสด</option>
                <option value="เช็ค">เช็ค</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ธนาคาร</label>
              <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="เช่น กสิกรไทย, กรุงเทพ" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">เลขที่บัญชี</label>
              <input value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} placeholder="เลขที่บัญชีธนาคาร" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อบัญชี</label>
              <input value={form.bankAccountName} onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })} placeholder="ชื่อเจ้าของบัญชี" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
            <button type="submit" className="px-6 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
              {editing ? 'บันทึก' : 'เพิ่ม'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        message={`ต้องการลบ "${deleteTarget?.name}" ใช่ไหม?`}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
