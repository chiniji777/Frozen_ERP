import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { searchByZipcode, searchByDistrict, type ThaiAddress } from '../utils/thaiAddress';

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
  district?: string;
  amphoe?: string;
  province?: string;
  zipcode?: string;
  customerType: 'Company' | 'Individual';
  creditLimit: number;
  paymentTerms: string;
  salesPartner: string;
  commissionRate: number;
  notes: string;
  locations: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LocationItem {
  name: string;
  address: string;
}

interface CustomerForm {
  code: string;
  name: string;
  nickName: string;
  customerType: 'Company' | 'Individual';
  phone: string;
  email: string;
  address: string;
  district: string;
  amphoe: string;
  province: string;
  zipcode: string;
  taxId: string;
  creditLimit: number;
  paymentTerms: string;
  salesPartner: string;
  commissionRate: number;
  notes: string;
  locations: LocationItem[];
}

const emptyForm: CustomerForm = {
  code: '', name: '', nickName: '', customerType: 'Company',
  phone: '', email: '', address: '', district: '', amphoe: '', province: '', zipcode: '',
  taxId: '', creditLimit: 0, paymentTerms: '', salesPartner: '', commissionRate: 0, notes: '',
  locations: [],
};

const PAYMENT_TERMS = [
  'ชำระก่อนส่ง',
  'ชำระหลังส่ง',
  'เครดิต 7 วัน (นับจากวันส่งสินค้า)',
  'เครดิต 14 วัน (นับจากวันส่งสินค้า)',
  'เครดิต 30 วัน (นับจากวันส่งสินค้า)',
  'เครดิต 45 วัน (นับจากวันส่งสินค้า)',
  'เครดิต 60 วัน (นับจากวันส่งสินค้า)',
  'เครดิต 90 วัน (นับจากวันส่งสินค้า)',
];

const PAYMENT_TERMS_MAP: Record<string, string> = {
  'Cash': 'ชำระก่อนส่ง',
  'Net 7': 'เครดิต 7 วัน (นับจากวันส่งสินค้า)',
  'Net 14': 'เครดิต 14 วัน (นับจากวันส่งสินค้า)',
  'Net 15': 'เครดิต 14 วัน (นับจากวันส่งสินค้า)',
  'Net 30': 'เครดิต 30 วัน (นับจากวันส่งสินค้า)',
  'Net 45': 'เครดิต 45 วัน (นับจากวันส่งสินค้า)',
  'Net 60': 'เครดิต 60 วัน (นับจากวันส่งสินค้า)',
  'Net 90': 'เครดิต 90 วัน (นับจากวันส่งสินค้า)',
};

const mapPaymentTerms = (val: string): string => {
  if (!val) return '';
  if (PAYMENT_TERMS.includes(val)) return val;
  return PAYMENT_TERMS_MAP[val] || val;
};

function parseLocations(raw: string | null): LocationItem[] {
  if (!raw) return [];
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

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

        {(() => {
          const locs = parseLocations(customer.locations);
          if (locs.length === 0) return null;
          return (
            <Section title="สถานที่จัดส่ง">
              {locs.map((loc, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5">
                  <span className="text-xs font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded shrink-0">{i + 1}</span>
                  <div>
                    <span className="text-sm font-medium text-gray-800">{loc.name}</span>
                    {loc.address && <p className="text-xs text-gray-500 mt-0.5">{loc.address}</p>}
                  </div>
                </div>
              ))}
            </Section>
          );
        })()}

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
  const [, setDbdLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [bulkDbdLoading, setBulkDbdLoading] = useState(false);
  const [addrSuggestions, setAddrSuggestions] = useState<ThaiAddress[]>([]);
  const [showAddrDropdown, setShowAddrDropdown] = useState(false);
  const [salesPartners, setSalesPartners] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ taxId: string; name: string; province?: string; status?: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchDetectedType, setSearchDetectedType] = useState('');
  const [searchHighlight, setSearchHighlight] = useState(-1);
  const addrRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    api.get<Customer[]>('/customers')
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Extract unique salesPartners from loaded data
  useEffect(() => {
    const partners = [...new Set(data.map((c) => c.salesPartner).filter(Boolean))].sort();
    setSalesPartners(partners);
  }, [data]);

  // Close address dropdown + search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addrRef.current && !addrRef.current.contains(e.target as Node)) setShowAddrDropdown(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearchDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Debounce smart search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]); setShowSearchDropdown(false); setSearchDetectedType('');
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.get<{ results: { taxId: string; name: string; province?: string; status?: string }[]; detectedType?: string }>(`/dbd/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults((res.results || []).slice(0, 10));
        setSearchDetectedType(res.detectedType || 'อัตโนมัติ');
        setShowSearchDropdown(true);
        setSearchHighlight(-1);
      } catch {
        setSearchResults([]); setShowSearchDropdown(false);
      } finally {
        setSearchLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Select search result → auto-fill via DBD lookup
  const handleSearchSelect = useCallback(async (taxId: string) => {
    setShowSearchDropdown(false);
    setSearchQuery('');
    setDbdLoading(true);
    try {
      const res = await api.get<{ found: boolean; companyName?: string; companyNameEn?: string; address?: string;
        type?: string; province?: string; district?: string; subDistrict?: string;
        zipCode?: string; phone?: string; capital?: string; businessType?: string;
        registeredDate?: string; status?: string; typeLabel?: string }>(`/dbd/lookup/${taxId}`);
      if (res.found) {
        setForm((f) => ({
          ...f,
          taxId,
          name: res.companyName || f.name,
          nickName: res.companyNameEn || f.nickName,
          address: res.address || f.address,
          province: res.province || f.province,
          amphoe: res.district || f.amphoe,
          district: res.subDistrict || f.district,
          zipcode: res.zipCode || f.zipcode,
          phone: res.phone || f.phone,
          customerType: (res.type === 'Individual' ? 'Individual' : 'Company') as 'Company' | 'Individual',
        }));
        setToast(`ดึงข้อมูล ${res.companyName || 'บริษัท'} สำเร็จ`);
      } else {
        setToast('ไม่พบข้อมูลบริษัทจาก DBD');
      }
    } catch {
      setToast('ไม่สามารถเชื่อมต่อ DBD ได้');
    } finally {
      setDbdLoading(false);
    }
  }, []);

  // Search keyboard handler
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSearchDropdown || searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchHighlight((h) => (h + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchHighlight((h) => (h <= 0 ? searchResults.length - 1 : h - 1));
    } else if (e.key === 'Enter' && searchHighlight >= 0) {
      e.preventDefault();
      handleSearchSelect(searchResults[searchHighlight].taxId);
    } else if (e.key === 'Escape') {
      setShowSearchDropdown(false);
    }
  }, [showSearchDropdown, searchResults, searchHighlight, handleSearchSelect]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setSearchQuery(''); setModalOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    // Parse address to extract district/amphoe/province/zipcode if stored in address field
    const addrParts = (c.address || '').split(' ');
    const maybeZip = addrParts[addrParts.length - 1];
    const hasZip = /^\d{5}$/.test(maybeZip);
    setForm({
      code: c.code || '', name: c.fullName || c.name, nickName: c.nickName || '',
      customerType: c.customerType || 'Company',
      phone: c.phone || '', email: c.email || '',
      address: c.address || '',
      district: c.district || '',
      amphoe: c.amphoe || '',
      province: c.province || '',
      zipcode: hasZip ? maybeZip : (c.zipcode || ''),
      taxId: c.taxId || '', creditLimit: c.creditLimit || 0,
      paymentTerms: mapPaymentTerms(c.paymentTerms || ''), salesPartner: c.salesPartner || '',
      commissionRate: c.commissionRate || 0, notes: c.notes || '',
      locations: parseLocations(c.locations),
    });
    setModalOpen(true);
  };

  const setField = (key: keyof CustomerForm, val: string | number) => {
    setForm((f) => ({ ...f, [key]: val }));
  };

  // Address auto-fill from zipcode or district search
  const handleZipcodeChange = (val: string) => {
    const zip = val.replace(/\D/g, '').slice(0, 5);
    setField('zipcode', zip);
    if (zip.length === 5) {
      const results = searchByZipcode(zip);
      setAddrSuggestions(results);
      if (results.length === 1) {
        selectAddress(results[0]);
      } else if (results.length > 1) {
        setShowAddrDropdown(true);
      }
    } else {
      setAddrSuggestions([]);
      setShowAddrDropdown(false);
    }
  };

  const handleDistrictSearch = (val: string) => {
    setField('district', val);
    if (val.length >= 2) {
      const results = searchByDistrict(val);
      setAddrSuggestions(results);
      setShowAddrDropdown(results.length > 0);
    } else {
      setAddrSuggestions([]);
      setShowAddrDropdown(false);
    }
  };

  const selectAddress = (addr: ThaiAddress) => {
    setForm((f) => ({
      ...f,
      district: addr.district,
      amphoe: addr.amphoe,
      province: addr.province,
      zipcode: addr.zipcode,
    }));
    setShowAddrDropdown(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Compose full address from parts
    const fullAddress = [form.address, form.district, form.amphoe, form.province, form.zipcode]
      .filter(Boolean).join(' ');
    const locs = form.locations.filter((l) => l.name.trim() || l.address.trim());
    const payload = { ...form, fullName: form.name, address: fullAddress, territory: form.province, locations: locs.length > 0 ? JSON.stringify(locs) : null };
    if (editing) {
      await api.put(`/customers/${editing.id}`, payload);
    } else {
      // code auto-generate: don't send code, let backend handle it
      await api.post('/customers', { ...payload, code: undefined });
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

  const updateLocation = (index: number, field: 'name' | 'address', value: string) => {
    setForm((f) => {
      const locs = [...f.locations];
      locs[index] = { ...locs[index], [field]: value };
      return { ...f, locations: locs };
    });
  };

  const removeLocation = (index: number) => {
    setForm((f) => ({ ...f, locations: f.locations.filter((_, i) => i !== index) }));
  };

  const addLocation = () => {
    setForm((f) => ({ ...f, locations: [...f.locations, { name: '', address: '' }] }));
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">👥 ลูกค้า</h1>

      <DataTable
        columns={[
          { key: 'code', label: 'รหัส', filterable: true },
          { key: 'name', label: 'ชื่อ', filterable: true, render: (c: Customer) => c.fullName || c.name || '-' },
          { key: 'nickName', label: 'ชื่อย่อ', filterable: true },
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
          {/* Smart Search Box */}
          <div className="mb-4 relative" ref={searchRef}>
            <label className="block text-xs font-semibold text-indigo-600 mb-1">ค้นหาอัจฉริยะ (DBD)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => searchResults.length > 0 && setShowSearchDropdown(true)}
                placeholder="ค้นหา Tax ID, ชื่อบริษัท, ชื่อกรรมการ, ที่อยู่..."
                className="flex-1 px-3 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-indigo-50/30"
              />
              <button
                type="button"
                onClick={() => { if (searchQuery.length >= 2) setSearchQuery((q) => q + ' '); }}
                disabled={searchLoading || searchQuery.length < 2}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 whitespace-nowrap transition-colors"
              >
                {searchLoading ? (
                  <span className="flex items-center gap-1">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ค้นหา
                  </span>
                ) : 'ค้นหา'}
              </button>
            </div>
            {searchDetectedType && searchQuery.length >= 2 && (
              <p className="text-xs text-gray-400 mt-1">ค้นด้วย: {searchDetectedType}</p>
            )}
            {showSearchDropdown && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                {searchResults.length === 0 && !searchLoading && (
                  <div className="px-4 py-3 text-sm text-gray-400 text-center">ไม่พบผลลัพธ์</div>
                )}
                {searchResults.map((r, i) => (
                  <button
                    key={r.taxId + i}
                    type="button"
                    onClick={() => handleSearchSelect(r.taxId)}
                    className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 transition-colors ${
                      i === searchHighlight ? 'bg-indigo-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium text-gray-800">{r.name}</div>
                    <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                      <span>Tax: {r.taxId}</span>
                      {r.province && <span>{r.province}</span>}
                      {r.status && (
                        <span className={r.status === 'ยังดำเนินกิจการอยู่' ? 'text-green-500' : 'text-red-400'}>{r.status}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Section title="ข้อมูลทั่วไป">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {editing && (
                <InputField label="รหัสลูกค้า" value={form.code} onChange={() => {}} disabled />
              )}
              <InputField label="ชื่อ / ชื่อบริษัท" value={form.name} onChange={(v) => setField('name', v)} required />
              <InputField label="ชื่อย่อ" value={form.nickName} onChange={(v) => setField('nickName', v)} />
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
                <label className="block text-xs font-medium text-gray-500 mb-1">ที่อยู่ (เลขที่ ถนน ซอย)</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  rows={2}
                  placeholder="เลขที่ ถนน ซอย..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">รหัสไปรษณีย์</label>
                <input
                  type="text"
                  value={form.zipcode}
                  onChange={(e) => handleZipcodeChange(e.target.value)}
                  placeholder="10110"
                  maxLength={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
              </div>
              <div className="relative" ref={addrRef}>
                <label className="block text-xs font-medium text-gray-500 mb-1">ตำบล/แขวง</label>
                <input
                  type="text"
                  value={form.district}
                  onChange={(e) => handleDistrictSearch(e.target.value)}
                  onFocus={() => addrSuggestions.length > 0 && setShowAddrDropdown(true)}
                  placeholder="พิมพ์ชื่อตำบล..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
                {showAddrDropdown && addrSuggestions.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {addrSuggestions.map((addr, i) => (
                      <button key={i} type="button" onClick={() => selectAddress(addr)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 border-b border-gray-50">
                        {addr.district} &rarr; {addr.amphoe} &rarr; {addr.province} {addr.zipcode}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <InputField label="อำเภอ/เขต" value={form.amphoe} onChange={(v) => setField('amphoe', v)} />
              <InputField label="จังหวัด" value={form.province} onChange={(v) => setField('province', v)} />
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
                  {PAYMENT_TERMS.map((term) => (
                    <option key={term} value={term}>{term}</option>
                  ))}
                </select>
              </div>
            </div>
          </Section>

          <Section title="การขาย">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">พนักงานขาย</label>
                <select
                  value={form.salesPartner}
                  onChange={(e) => setField('salesPartner', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                >
                  <option value="">เลือก...</option>
                  {salesPartners.map((sp) => (
                    <option key={sp} value={sp}>{sp}</option>
                  ))}
                </select>
              </div>
              <InputField label="ค่าคอมมิชชั่น (%)" value={form.commissionRate} onChange={(v) => setField('commissionRate', Number(v))} type="number" />
            </div>
          </Section>

          <Section title="สถานที่จัดส่ง">
            {form.locations.map((loc, i) => (
              <div key={i} className="flex gap-2 mb-2 items-start">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input type="text" value={loc.name} onChange={(e) => updateLocation(i, 'name', e.target.value)} placeholder="ชื่อจุดส่ง เช่น สาขาบางนา" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                  <input type="text" value={loc.address} onChange={(e) => updateLocation(i, 'address', e.target.value)} placeholder="ที่อยู่จัดส่ง" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <button type="button" onClick={() => removeLocation(i)} className="mt-1 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="ลบจุดส่ง">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            <button type="button" onClick={addLocation} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">+ เพิ่มจุดส่ง</button>
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
