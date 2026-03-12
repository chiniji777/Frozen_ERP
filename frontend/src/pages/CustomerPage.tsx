import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface Customer {
  id: number;
  code: string;
  name: string;
  fullName: string;
  nickName: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  territory: string;
  customerType: 'Company' | 'Individual';
  creditLimit: number;
  paymentTerms: string;
  salesPartner: string;
  commissionRate: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface CustomerForm {
  code: string;
  name: string;
  nickName: string;
  territory: string;
  customerType: 'Company' | 'Individual';
  phone: string;
  email: string;
  address: string;
  taxId: string;
  creditLimit: number;
  paymentTerms: string;
  salesPartner: string;
  commissionRate: number;
  notes: string;
}

const emptyForm: CustomerForm = {
  code: '', name: '', nickName: '', territory: '', customerType: 'Company',
  phone: '', email: '', address: '', taxId: '',
  creditLimit: 0, paymentTerms: '', salesPartner: '', commissionRate: 0, notes: '',
};

// --- Reusable InputField ---
const InputField = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '', required = false }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; disabled?: boolean; placeholder?: string; required?: boolean;
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      required={required}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm disabled:bg-gray-50 disabled:text-gray-400"
    />
  </div>
);

// --- Section wrapper ---
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-5">
    <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-1 border-b border-gray-200">{title}</h3>
    {children}
  </div>
);

// --- Customer Type Badge ---
function TypeBadge({ type }: { type: string }) {
  const isCompany = type === 'Company';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
      isCompany ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
    }`}>
      {isCompany ? 'บริษัท' : 'บุคคล'}
    </span>
  );
}

// --- View Detail Modal ---
function ViewDetail({ customer, open, onClose }: { customer: Customer | null; open: boolean; onClose: () => void }) {
  if (!customer) return null;

  const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-1.5">
      <span className="text-xs font-medium text-gray-400 sm:w-32 shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{value || '-'}</span>
    </div>
  );

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
  const fmtMoney = (n: number) => n ? n.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '0.00';

  return (
    <Modal open={open} onClose={onClose} title={`รายละเอียดลูกค้า — ${customer.name}`}>
      <div className="space-y-4">
        <Section title="ข้อมูลทั่วไป">
          <InfoRow label="รหัส" value={customer.code} />
          <InfoRow label="ชื่อเต็ม" value={customer.fullName || customer.name} />
          <InfoRow label="ชื่อย่อ" value={customer.nickName} />
          <InfoRow label="พื้นที่" value={customer.territory} />
          <InfoRow label="ประเภท" value={<TypeBadge type={customer.customerType} />} />
        </Section>

        <Section title="ข้อมูลติดต่อ">
          <InfoRow label="โทรศัพท์" value={customer.phone} />
          <InfoRow label="อีเมล" value={customer.email} />
          <InfoRow label="ที่อยู่" value={customer.address} />
        </Section>

        <Section title="การเงิน">
          <InfoRow label="เลขผู้เสียภาษี" value={customer.taxId} />
          <InfoRow label="วงเงินเครดิต" value={`฿${fmtMoney(customer.creditLimit)}`} />
          <InfoRow label="เงื่อนไขชำระ" value={customer.paymentTerms} />
        </Section>

        <Section title="การขาย">
          <InfoRow label="พนักงานขาย" value={customer.salesPartner} />
          <InfoRow label="ค่าคอมมิชชั่น" value={customer.commissionRate ? `${customer.commissionRate}%` : '-'} />
        </Section>

        {customer.notes && (
          <Section title="หมายเหตุ">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
          </Section>
        )}

        <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
          สร้างเมื่อ {fmtDate(customer.createdAt)} · แก้ไขล่าสุด {fmtDate(customer.updatedAt)}
        </div>
      </div>
    </Modal>
  );
}

export default function CustomerPage() {
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [viewTarget, setViewTarget] = useState<Customer | null>(null);
  const [dbdLoading, setDbdLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [bulkDbdLoading, setBulkDbdLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<Customer[]>('/customers')
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      code: c.code || '', name: c.fullName || c.name, nickName: c.nickName || '',
      territory: c.territory || '', customerType: c.customerType || 'Company',
      phone: c.phone || '', email: c.email || '', address: c.address || '',
      taxId: c.taxId || '', creditLimit: c.creditLimit || 0,
      paymentTerms: c.paymentTerms || '', salesPartner: c.salesPartner || '',
      commissionRate: c.commissionRate || 0, notes: c.notes || '',
    });
    setModalOpen(true);
  };

  const setField = (key: keyof CustomerForm, val: string | number) => {
    setForm((f) => ({ ...f, [key]: val }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = { ...form, fullName: form.name };
    if (editing) {
      await api.put(`/customers/${editing.id}`, payload);
    } else {
      await api.post('/customers', payload);
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

  // --- DBD Lookup ---
  const handleDbdLookup = async () => {
    const taxId = form.taxId.replace(/\D/g, '');
    if (taxId.length !== 13) return;
    setDbdLoading(true);
    try {
      const res = await api.get<{ found: boolean; companyName?: string; address?: string; type?: string }>(
        `/dbd/lookup/${taxId}`
      );
      if (res.found) {
        setForm((f) => ({
          ...f,
          name: res.companyName || f.name,
          address: res.address || f.address,
          customerType: (res.type === 'Individual' ? 'Individual' : 'Company') as 'Company' | 'Individual',
        }));
        setToast('ดึงข้อมูลจาก DBD สำเร็จ');
      } else {
        setToast('ไม่พบข้อมูลบริษัทจาก DBD');
      }
    } catch {
      setToast('ไม่สามารถเชื่อมต่อ DBD ได้');
    } finally {
      setDbdLoading(false);
    }
  };

  // --- Bulk DBD Update ---
  const handleBulkDbdUpdate = async () => {
    const selected = data.filter((c) => selectedIds.has(c.id) && c.taxId?.replace(/\D/g, '').length === 13);
    if (selected.length === 0) {
      setToast('ไม่มีลูกค้าที่มี Tax ID 13 หลักให้อัปเดต');
      return;
    }
    setBulkDbdLoading(true);
    let successCount = 0;
    let failCount = 0;
    for (const customer of selected) {
      try {
        const taxId = customer.taxId.replace(/\D/g, '');
        const res = await api.get<{ found: boolean; companyName?: string; address?: string; type?: string }>(
          `/dbd/lookup/${taxId}`
        );
        if (res.found) {
          await api.put(`/customers/${customer.id}`, {
            ...customer,
            fullName: res.companyName || customer.fullName || customer.name,
            name: res.companyName || customer.name,
            address: res.address || customer.address,
            customerType: (res.type === 'Individual' ? 'Individual' : 'Company') as 'Company' | 'Individual',
          });
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }
    setBulkDbdLoading(false);
    setSelectedIds(new Set());
    load();
    setToast(`อัปเดต DBD สำเร็จ ${successCount} ราย${failCount > 0 ? ` ไม่พบ ${failCount} ราย` : ''}`);
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">👥 ลูกค้า</h1>

      <DataTable
        columns={[
          { key: 'code', label: 'รหัส' },
          { key: 'name', label: 'ชื่อ', render: (c: Customer) => c.fullName || c.name || '-' },
          { key: 'nickName', label: 'ชื่อย่อ' },
          { key: 'territory', label: 'พื้นที่' },
          { key: 'customerType', label: 'ประเภท', render: (c: Customer) => <TypeBadge type={c.customerType} /> },
          { key: 'phone', label: 'โทรศัพท์' },
        ]}
        data={data}
        getId={(c) => c.id}
        searchPlaceholder="ค้นหาลูกค้า..."
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(c) => setDeleteTarget(c)}
        onRowClick={openEdit}
        extraActions={(c: Customer) => (
          <button onClick={() => setViewTarget(c)} className="text-gray-500 hover:text-indigo-600 text-sm mr-1">
            ดูเพิ่ม
          </button>
        )}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        toolbarExtra={
          selectedIds.size > 0 ? (
            <button
              onClick={handleBulkDbdUpdate}
              disabled={bulkDbdLoading}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {bulkDbdLoading ? 'กำลังอัปเดต...' : `ค้น DBD (${selectedIds.size} ราย)`}
            </button>
          ) : undefined
        }
      />

      {/* View Detail Modal */}
      <ViewDetail customer={viewTarget} open={!!viewTarget} onClose={() => setViewTarget(null)} />

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}
      >
        <form onSubmit={handleSubmit} className="space-y-1">
          <Section title="ข้อมูลทั่วไป">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField label="รหัสลูกค้า" value={form.code} onChange={(v) => setField('code', v)} placeholder="C-001" />
              <InputField label="ชื่อ / ชื่อบริษัท" value={form.name} onChange={(v) => setField('name', v)} required />
              <InputField label="ชื่อย่อ" value={form.nickName} onChange={(v) => setField('nickName', v)} />
              <InputField label="พื้นที่" value={form.territory} onChange={(v) => setField('territory', v)} placeholder="กรุงเทพฯ" />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">ประเภทลูกค้า</label>
                <select
                  value={form.customerType}
                  onChange={(e) => setField('customerType', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                >
                  <option value="Company">บริษัท</option>
                  <option value="Individual">บุคคล</option>
                </select>
              </div>
            </div>
          </Section>

          <Section title="ข้อมูลติดต่อ">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField label="โทรศัพท์" value={form.phone} onChange={(v) => setField('phone', v)} />
              <InputField label="อีเมล" value={form.email} onChange={(v) => setField('email', v)} type="email" />
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">ที่อยู่</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"
                />
              </div>
            </div>
          </Section>

          <Section title="การเงิน">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">เลขผู้เสียภาษี (Tax ID)</label>
                <input
                  type="text"
                  value={form.taxId}
                  onChange={(e) => setField('taxId', e.target.value.replace(/\D/g, '').slice(0, 13))}
                  placeholder="1234567890123"
                  maxLength={13}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
                <button
                  type="button"
                  onClick={handleDbdLookup}
                  disabled={form.taxId.replace(/\D/g, '').length !== 13 || dbdLoading}
                  className="mt-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
                >
                  {dbdLoading ? (
                    <span className="flex items-center gap-1">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      กำลังค้น...
                    </span>
                  ) : 'ค้น DBD'}
                </button>
              </div>
              <InputField label="วงเงินเครดิต (บาท)" value={form.creditLimit} onChange={(v) => setField('creditLimit', Number(v))} type="number" />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">เงื่อนไขชำระเงิน</label>
                <select
                  value={form.paymentTerms}
                  onChange={(e) => setField('paymentTerms', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                >
                  <option value="">เลือก...</option>
                  <option value="Cash">เงินสด</option>
                  <option value="Net 7">Net 7</option>
                  <option value="Net 15">Net 15</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Net 45">Net 45</option>
                  <option value="Net 60">Net 60</option>
                  <option value="Net 90">Net 90</option>
                </select>
              </div>
            </div>
          </Section>

          <Section title="การขาย">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField label="พนักงานขาย" value={form.salesPartner} onChange={(v) => setField('salesPartner', v)} />
              <InputField label="ค่าคอมมิชชั่น (%)" value={form.commissionRate} onChange={(v) => setField('commissionRate', Number(v))} type="number" />
            </div>
          </Section>

          <Section title="หมายเหตุ">
            <textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={3}
              placeholder="บันทึกเพิ่มเติม..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"
            />
          </Section>

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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
