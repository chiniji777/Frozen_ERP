import { useState, useEffect, useRef, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface RecurringExpense {
  id: number;
  name: string;
  category: string;
  amount: number;
  dueDay: number;
  payTo: string;
  paymentMethod: string;
  totalDebt: number;
  totalPaid: number;
  remainingDebt: number;
  startDate: string;
  endDate: string | null;
  isActive: number;
  notes: string;
  ref1: string;
  ref2: string;
  bankName: string;
  bankAccount: string;
  accountName: string;
  imageUrl: string | null;
  hasWithholdingTax: number;
  whtFormType: string | null;
  whtIncomeType: string | null;
  whtIncomeDescription: string | null;
  whtRate: number | null;
  supplierId: number | null;
}

interface MonthlyItem {
  id: number;
  paymentId: number;
  recurringExpenseId: number;
  expenseId: number | null;
  expenseStatus: string | null;
  sentToExpense: boolean;
  month: string;
  amount: number;
  paidAt: string | null;
  status: 'pending' | 'paid';
  slipImage: string | null;
  paymentMethod: string;
  notes: string;
  name: string;
  category: string;
  dueDay: number;
  payTo: string;
}

interface Summary {
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  totalRemainingDebt: number;
}

interface TemplateForm {
  name: string;
  category: string;
  amount: string;
  dueDay: string;
  payTo: string;
  paymentMethod: string;
  totalDebt: string;
  startDate: string;
  endDate: string;
  notes: string;
  ref1: string;
  ref2: string;
  bankName: string;
  bankAccount: string;
  accountName: string;
  imageUrl: string;
  hasWithholdingTax: boolean;
  whtFormType: string;
  whtIncomeType: string;
  whtRate: string;
  supplierId: string;
}

interface PayForm {
  amount: string;
  paidAt: string;
  paymentMethod: string;
  notes: string;
  slipImage: string;
}

const emptyTemplateForm: TemplateForm = {
  name: '', category: '', amount: '', dueDay: '', payTo: '',
  paymentMethod: '', totalDebt: '', startDate: '', endDate: '', notes: '',
  ref1: '', ref2: '', bankName: '', bankAccount: '', accountName: '', imageUrl: '',
  hasWithholdingTax: false, whtFormType: 'pnd53', whtIncomeType: '', whtRate: '', supplierId: '',
};

const WHT_INCOME_TYPES = [
  { code: 'rent_property', label: 'ค่าเช่าอสังหาริมทรัพย์', section: '40(5)(ก)', rate: 5 },
  { code: 'service', label: 'ค่าบริการ / จ้างทำของ', section: '40(8)', rate: 3 },
  { code: 'transport', label: 'ค่าขนส่ง', section: '40(8)', rate: 1 },
  { code: 'advertising', label: 'ค่าโฆษณา', section: '40(8)', rate: 2 },
  { code: 'contractor', label: 'ค่ารับเหมา', section: '40(7)(8)', rate: 3 },
  { code: 'professional', label: 'ค่าวิชาชีพอิสระ', section: '40(6)', rate: 3 },
  { code: 'prize', label: 'รางวัล/ส่วนลด', section: '40(8)', rate: 5 },
] as const;

const emptyPayForm: PayForm = {
  amount: '', paidAt: '', paymentMethod: '', notes: '', slipImage: '',
};

const CATEGORIES = ['ค่าเช่า', 'สาธารณูปโภค', 'ผ่อนชำระ', 'ประกัน', 'บริการ', 'อื่นๆ'];
const PAYMENT_METHODS = ['โอน', 'เงินสด', 'เช็ค', 'หักบัญชี', 'บัตรเครดิต'];

export default function RecurringExpensePage() {
  const [monthlyItems, setMonthlyItems] = useState<MonthlyItem[]>([]);
  const [templates, setTemplates] = useState<RecurringExpense[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalDue: 0, totalPaid: 0, totalPending: 0, totalRemainingDebt: 0 });
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState(() => String(new Date().getFullYear()));
  const [filterMonthNum, setFilterMonthNum] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const selectedMonth = `${filterYear}-${filterMonthNum}`;

  // Template modal
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringExpense | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplateForm);

  // Pay modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [payingItem, _setPayingItem] = useState<MonthlyItem | null>(null);
  const [payForm, setPayForm] = useState<PayForm>(emptyPayForm);

  // Deactivate confirm
  const [deactivateTarget, setDeactivateTarget] = useState<MonthlyItem | null>(null);

  const [toast, setToast] = useState('');
  const [uploading, setUploading] = useState(false);
  const [slipPreview, setSlipPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<string[]>(CATEGORIES);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [templateImagePreview, setTemplateImagePreview] = useState('');
  const [templateImageUploading, setTemplateImageUploading] = useState(false);
  const templateImageRef = useRef<HTMLInputElement>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [detailItem, setDetailItem] = useState<RecurringExpense | null>(null);
  const [detailMonthly, setDetailMonthly] = useState<MonthlyItem | null>(null);
  const [editingMonthly, setEditingMonthly] = useState(false);
  const [editMonthlyForm, setEditMonthlyForm] = useState({ amount: '', paymentMethod: '', notes: '' });

  const loadMonthly = () => {
    setLoading(true);
    Promise.all([
      api.get<MonthlyItem[]>(`/recurring-expenses/monthly?month=${selectedMonth}`),
      api.get<Summary>(`/recurring-expenses/summary?month=${selectedMonth}`),
      api.get<RecurringExpense[]>(`/recurring-expenses`),
    ])
      .then(([items, sum, tmpls]) => {
        setMonthlyItems(items);
        setSummary(sum);
        if (Array.isArray(tmpls)) setTemplates(tmpls);
      })
      .catch(() => {
        setMonthlyItems([]);
        setSummary({ totalDue: 0, totalPaid: 0, totalPending: 0, totalRemainingDebt: 0 });
      })
      .finally(() => setLoading(false));
  };

  const loadCategories = () => {
    api.get<string[]>('/recurring-expenses/categories')
      .then(setCategories)
      .catch(() => setCategories(CATEGORIES));
  };

  const loadSuppliers = () => {
    api.get<{ id: number; name: string }[]>('/suppliers')
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  };

  useEffect(() => { loadMonthly(); loadCategories(); loadSuppliers(); }, [selectedMonth]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Template modal
  const openAddTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({ ...emptyTemplateForm, startDate: new Date().toISOString().slice(0, 10) });
    setTemplateImagePreview('');
    setTemplateModalOpen(true);
  };

  const openEditTemplate = (item: MonthlyItem) => {
    api.get<RecurringExpense>(`/recurring-expenses`).then((list) => {
      // Find the template from list
      const templates = list as unknown as RecurringExpense[];
      const tmpl = Array.isArray(templates) ? templates.find(t => t.id === item.recurringExpenseId) : null;
      if (tmpl) {
        setEditingTemplate(tmpl);
        setTemplateForm({
          name: tmpl.name, category: tmpl.category, amount: String(tmpl.amount),
          dueDay: String(tmpl.dueDay || ''), payTo: tmpl.payTo || '',
          paymentMethod: tmpl.paymentMethod || '', totalDebt: String(tmpl.totalDebt || ''),
          startDate: tmpl.startDate || '', endDate: tmpl.endDate || '', notes: tmpl.notes || '',
          ref1: tmpl.ref1 || '', ref2: tmpl.ref2 || '',
          bankName: tmpl.bankName || '', bankAccount: tmpl.bankAccount || '', accountName: tmpl.accountName || '',
          imageUrl: tmpl.imageUrl || '',
          hasWithholdingTax: !!tmpl.hasWithholdingTax,
          whtFormType: tmpl.whtFormType || 'pnd53',
          whtIncomeType: tmpl.whtIncomeType || '',
          whtRate: tmpl.whtRate ? String(tmpl.whtRate) : '',
          supplierId: tmpl.supplierId ? String(tmpl.supplierId) : '',
        });
        setTemplateImagePreview(tmpl.imageUrl ? `/api/${tmpl.imageUrl}` : '');
        setTemplateModalOpen(true);
      }
    }).catch(() => setToast('ไม่สามารถโหลดข้อมูลได้'));
  };

  const handleTemplateImageUpload = async (file: File) => {
    setTemplateImageUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/recurring-expenses/upload-image', {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Upload failed');
      const json = await res.json() as { imageUrl: string };
      setTemplateForm((f) => ({ ...f, imageUrl: json.imageUrl }));
      setTemplateImagePreview(`/api/${json.imageUrl}`);
      setToast('อัปโหลดรูปสำเร็จ');
    } catch {
      setToast('อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setTemplateImageUploading(false);
    }
  };

  const handleTemplateSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const whtIncome = WHT_INCOME_TYPES.find(t => t.code === templateForm.whtIncomeType);
    const body = {
      ...templateForm,
      amount: Number(templateForm.amount),
      dueDay: Number(templateForm.dueDay) || null,
      totalDebt: Number(templateForm.totalDebt) || 0,
      endDate: templateForm.endDate || null,
      imageUrl: templateForm.imageUrl || null,
      hasWithholdingTax: templateForm.hasWithholdingTax ? 1 : 0,
      whtFormType: templateForm.hasWithholdingTax ? templateForm.whtFormType : null,
      whtIncomeType: templateForm.hasWithholdingTax ? templateForm.whtIncomeType : null,
      whtIncomeDescription: templateForm.hasWithholdingTax && whtIncome ? `${whtIncome.label} ${whtIncome.section}` : null,
      whtRate: templateForm.hasWithholdingTax ? Number(templateForm.whtRate) || null : null,
      supplierId: templateForm.supplierId ? Number(templateForm.supplierId) : null,
    };
    try {
      if (editingTemplate) {
        await api.put(`/recurring-expenses/${editingTemplate.id}`, body);
        setToast('แก้ไขรายการสำเร็จ');
      } else {
        await api.post('/recurring-expenses', body);
        setToast('เพิ่มรายการสำเร็จ');
      }
      setTemplateModalOpen(false);
      loadMonthly();
    } catch {
      setToast('บันทึกไม่สำเร็จ');
    }
  };


  const handleSlipUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('slip', file);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/expenses/upload-slip', {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Upload failed');
      const json = await res.json() as { slipImage: string };
      setPayForm((f) => ({ ...f, slipImage: json.slipImage }));
      setSlipPreview(`/api/${json.slipImage}`);
      setToast('อัปโหลดสลิปสำเร็จ');
    } catch {
      setToast('อัปโหลดสลิปไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  const handlePaySubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!payingItem) return;
    try {
      await api.post(`/recurring-expenses/${payingItem.recurringExpenseId}/pay`, {
        month: selectedMonth,
        amount: Number(payForm.amount),
        paidAt: payForm.paidAt,
        paymentMethod: payForm.paymentMethod,
        notes: payForm.notes,
        slipImage: payForm.slipImage,
      });
      setToast('บันทึกการชำระสำเร็จ');
      setPayModalOpen(false);
      loadMonthly();
    } catch {
      setToast('บันทึกการชำระไม่สำเร็จ');
    }
  };

  // Deactivate
  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      await api.patch(`/recurring-expenses/${deactivateTarget.recurringExpenseId}/deactivate`, {});
      setToast('ปิดรายการสำเร็จ');
    } catch {
      setToast('ไม่สามารถปิดรายการได้');
    }
    setDeactivateTarget(null);
    loadMonthly();
  };

  const handleSendAll = async () => {
    if (!confirm(`ส่งทุกรายการของเดือน ${selectedMonth} ไปค่าใช้จ่ายทั้งหมด?`)) return;
    setSendingAll(true);
    try {
      const res = await api.post<{ sent: number; skipped: number }>('/recurring-expenses/payments/send-all', { month: selectedMonth });
      setToast(`ส่งไปค่าใช้จ่ายแล้ว ${res.sent} รายการ (ข้าม ${res.skipped})`);
      loadMonthly();
    } catch {
      setToast('ส่งไม่สำเร็จ');
    } finally {
      setSendingAll(false);
    }
  };

  // ซ่อนรายการที่ส่งไปค่าใช้จ่ายแล้ว (แสดงเฉพาะที่ยังไม่ส่ง หรือ expense ถูกยกเลิก)
  const filteredItems = monthlyItems.filter(item => !item.sentToExpense);

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">ค่าใช้จ่ายประจำเดือน</h1>
        <div className="flex items-center gap-2">
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            {Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - 1 + i).map(y => (
              <option key={y} value={y}>พ.ศ. {y + 543}</option>
            ))}
          </select>
          <select value={filterMonthNum} onChange={(e) => setFilterMonthNum(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            {['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'].map((m, i) => (
              <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">ยอดต้องจ่ายเดือนนี้</p>
          <p className="text-xl font-bold text-gray-800">{summary.totalDue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">จ่ายแล้ว</p>
          <p className="text-xl font-bold text-green-600">{summary.totalPaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">ค้างจ่าย</p>
          <p className="text-xl font-bold text-red-600">{summary.totalPending.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">หนี้คงเหลือรวม</p>
          <p className="text-xl font-bold text-indigo-700">{summary.totalRemainingDebt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Send All Button */}
      {filteredItems.length > 0 && (
        <div className="flex justify-end mb-3">
          <button
            onClick={handleSendAll}
            disabled={sendingAll}
            className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 font-medium"
          >
            {sendingAll ? 'กำลังส่ง...' : `ส่งไปค่าใช้จ่ายทั้งหมด (${filteredItems.length})`}
          </button>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        columns={[
          { key: 'name', label: 'ชื่อรายการ' },
          { key: 'category', label: 'ประเภท' },
          { key: 'payTo', label: 'จ่ายให้', render: (item: MonthlyItem) => item.payTo || '-' },
          { key: 'amount', label: 'ยอด', render: (item: MonthlyItem) => Number(item.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 }) },
          { key: 'dueDay', label: 'กำหนด', render: (item: MonthlyItem) => item.dueDay ? `วันที่ ${item.dueDay}` : '-' },
          { key: 'paymentMethod', label: 'ช่องทาง', render: (item: MonthlyItem) => item.paymentMethod || '-' },
          { key: 'startDate', label: 'วันเริ่ม', render: (item: MonthlyItem) => {
            const tmpl = templates.find(t => t.id === item.recurringExpenseId);
            return tmpl?.startDate ? new Date(tmpl.startDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
          }},
          { key: 'endDate', label: 'วันสิ้นสุด', render: (item: MonthlyItem) => {
            const tmpl = templates.find(t => t.id === item.recurringExpenseId);
            return tmpl?.endDate ? new Date(tmpl.endDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'ไม่มีกำหนด';
          }},
        ]}
        data={filteredItems}
        getId={(item) => item.paymentId ?? item.id}
        searchPlaceholder="ค้นหารายการ..."
        onAdd={openAddTemplate}
        onRowClick={(item: MonthlyItem) => openEditTemplate(item)}
        extraActions={(item: MonthlyItem) => (
          <button onClick={async (ev) => {
            ev.stopPropagation();
            if (!confirm(`ส่ง "${item.name}" ไปหน้าค่าใช้จ่าย?`)) return;
            try {
              await api.post(`/recurring-expenses/payments/${item.paymentId}/send-to-expense`, {});
              setToast(`ส่ง "${item.name}" ไปค่าใช้จ่ายแล้ว`);
              loadMonthly();
            } catch (e: any) {
              setToast(e?.response?.data?.error || 'ส่งไม่สำเร็จ');
            }
          }} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 whitespace-nowrap">
            ส่งไปค่าใช้จ่าย
          </button>
        )}
      />

      {/* Template Modal (Add/Edit) */}
      <Modal open={templateModalOpen} onClose={() => setTemplateModalOpen(false)} title={editingTemplate ? 'แก้ไขรายการประจำ' : 'เพิ่มรายการประจำใหม่'}>
        <form onSubmit={handleTemplateSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อรายการ</label>
            <input required value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              placeholder="เช่น ค่าเช่าออฟฟิศ" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ประเภท</label>
              <select required value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                <option value="">เลือกประเภท...</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ยอดต่อเดือน (บาท)</label>
              <input type="number" step="0.01" required value={templateForm.amount}
                onChange={(e) => setTemplateForm({ ...templateForm, amount: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันครบกำหนด (1-31)</label>
              <input type="number" min="1" max="31" value={templateForm.dueDay}
                onChange={(e) => setTemplateForm({ ...templateForm, dueDay: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">จ่ายให้</label>
              <input list="supplier-list" value={templateForm.payTo} onChange={(e) => setTemplateForm({ ...templateForm, payTo: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                placeholder="เลือกผู้ขายหรือพิมพ์ชื่อใหม่" autoComplete="off" />
              <datalist id="supplier-list">
                {suppliers.map((s) => <option key={s.id} value={s.name} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ช่องทางชำระ</label>
              <select value={templateForm.paymentMethod} onChange={(e) => setTemplateForm({ ...templateForm, paymentMethod: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                <option value="">เลือกช่องทาง...</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ยอดหนี้ทั้งหมด (บาท)</label>
              <input type="number" step="0.01" value={templateForm.totalDebt}
                onChange={(e) => setTemplateForm({ ...templateForm, totalDebt: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                placeholder="0 = ไม่มีกำหนด" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันเริ่ม</label>
              <input type="date" value={templateForm.startDate}
                onChange={(e) => setTemplateForm({ ...templateForm, startDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด</label>
              <input type="date" value={templateForm.endDate}
                onChange={(e) => setTemplateForm({ ...templateForm, endDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ธนาคาร</label>
              <input value={templateForm.bankName} onChange={(e) => setTemplateForm({ ...templateForm, bankName: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                placeholder="เช่น กสิกร, กรุงเทพ" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เลขบัญชี</label>
              <input value={templateForm.bankAccount} onChange={(e) => setTemplateForm({ ...templateForm, bankAccount: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                placeholder="xxx-x-xxxxx-x" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อบัญชี</label>
              <input value={templateForm.accountName} onChange={(e) => setTemplateForm({ ...templateForm, accountName: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                placeholder="ชื่อเจ้าของบัญชี" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">อ้างอิง 1</label>
              <input value={templateForm.ref1} onChange={(e) => setTemplateForm({ ...templateForm, ref1: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                placeholder="เลขสัญญา, เลขอ้างอิง" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">อ้างอิง 2</label>
              <input value={templateForm.ref2} onChange={(e) => setTemplateForm({ ...templateForm, ref2: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                placeholder="เลขอ้างอิงเพิ่มเติม" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
          {/* WHT Section */}
          <div className="border-t pt-3 mt-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <input type="checkbox" checked={templateForm.hasWithholdingTax}
                onChange={(e) => setTemplateForm({ ...templateForm, hasWithholdingTax: e.target.checked })}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              หัก ณ ที่จ่าย
            </label>
            {templateForm.hasWithholdingTax && (
              <div className="grid grid-cols-2 gap-3 ml-6">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">ประเภทแบบ</label>
                  <select value={templateForm.whtFormType} onChange={(e) => setTemplateForm({ ...templateForm, whtFormType: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="pnd3">ภ.ง.ด. 3 (บุคคลธรรมดา)</option>
                    <option value="pnd53">ภ.ง.ด. 53 (นิติบุคคล)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">ประเภทเงินได้</label>
                  <select value={templateForm.whtIncomeType} onChange={(e) => {
                    const sel = WHT_INCOME_TYPES.find(t => t.code === e.target.value);
                    setTemplateForm({ ...templateForm, whtIncomeType: e.target.value, whtRate: sel ? String(sel.rate) : templateForm.whtRate });
                  }} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="">เลือกประเภท...</option>
                    {WHT_INCOME_TYPES.map(t => <option key={t.code} value={t.code}>{t.label} {t.section} ({t.rate}%)</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">อัตรา (%)</label>
                  <input type="number" step="0.01" value={templateForm.whtRate}
                    onChange={(e) => setTemplateForm({ ...templateForm, whtRate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">ภาษีที่หัก/เดือน</label>
                  <div className="px-3 py-2 bg-red-50 rounded-lg text-sm text-red-700 font-bold">
                    ฿{templateForm.amount && templateForm.whtRate ? (Number(templateForm.amount) * Number(templateForm.whtRate) / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '0.00'}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">ผู้ขาย (สำหรับ WHT)</label>
                  <select value={templateForm.supplierId} onChange={(e) => setTemplateForm({ ...templateForm, supplierId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="">ไม่ระบุ</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

            <textarea value={templateForm.notes} onChange={(e) => setTemplateForm({ ...templateForm, notes: e.target.value })}
              rows={2} placeholder="หมายเหตุเพิ่มเติม..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">แนบรูป/เอกสาร</label>
            <div className="flex gap-2 items-start">
              <input ref={templateImageRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTemplateImageUpload(f); }} />
              <button type="button" onClick={() => templateImageRef.current?.click()} disabled={templateImageUploading}
                className="px-3 py-2 text-sm rounded-lg border border-dashed border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50">
                {templateImageUploading ? 'กำลังอัปโหลด...' : (templateForm.imageUrl ? 'เปลี่ยนรูป' : 'แนบรูป')}
              </button>
            </div>
            {templateImagePreview && (
              <div className="mt-2">
                <img src={templateImagePreview} alt="preview" className="max-h-48 rounded-lg border border-gray-200 object-contain" />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setTemplateModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{editingTemplate ? 'บันทึก' : 'เพิ่ม'}</button>
          </div>
        </form>
      </Modal>

      {/* Pay Modal */}
      <Modal open={payModalOpen} onClose={() => setPayModalOpen(false)} title={`ชำระ "${payingItem?.name || ''}"`}>
        <form onSubmit={handlePaySubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">สลิป/ใบเสร็จ</label>
            <div className="flex gap-2 items-start">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleSlipUpload(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-2 text-sm rounded-lg border border-dashed border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
              >
                {uploading ? 'กำลังอัปโหลด...' : (payForm.slipImage ? 'เปลี่ยนสลิป' : 'แนบสลิป')}
              </button>
            </div>
            {slipPreview && (
              <div className="mt-2">
                <img src={slipPreview} alt="slip" className="max-h-48 rounded-lg border border-gray-200 object-contain" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท)</label>
              <input type="number" step="0.01" required value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ชำระ</label>
              <input type="date" required value={payForm.paidAt}
                onChange={(e) => setPayForm({ ...payForm, paidAt: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ช่องทางชำระ</label>
            <select value={payForm.paymentMethod} onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="">เลือกช่องทาง...</option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <textarea value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
              rows={2} placeholder="หมายเหตุเพิ่มเติม..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setPayModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700">ยืนยันชำระ</button>
          </div>
        </form>
      </Modal>

      {/* Deactivate Confirm */}
      <ConfirmDialog
        open={!!deactivateTarget}
        message={`ต้องการปิดรายการ "${deactivateTarget?.name}" ใช่ไหม?`}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />

      {/* Detail Modal */}
      <Modal open={!!detailItem} onClose={() => { setDetailItem(null); setDetailMonthly(null); }} title={`รายละเอียด "${detailItem?.name || ''}"`}>
        {detailItem && (
          <div className="flex flex-col gap-3 text-sm">
            {detailItem.imageUrl && (
              <div className="flex justify-center">
                <img src={`/api/${detailItem.imageUrl}`} alt="รูปแนบ" className="max-h-64 rounded-lg border border-gray-200 object-contain" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-500">ประเภท:</span> {detailItem.category}</div>
              <div><span className="text-gray-500">ยอด/เดือน:</span> {Number(detailItem.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</div>
              <div><span className="text-gray-500">จ่ายให้:</span> {detailItem.payTo || '-'}</div>
              <div><span className="text-gray-500">กำหนด:</span> {detailItem.dueDay ? `วันที่ ${detailItem.dueDay}` : '-'}</div>
              <div><span className="text-gray-500">ช่องทาง:</span> {detailItem.paymentMethod || '-'}</div>
              <div><span className="text-gray-500">หนี้คงเหลือ:</span> {Number(detailItem.remainingDebt).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</div>
              {detailItem.bankName && <div><span className="text-gray-500">ธนาคาร:</span> {detailItem.bankName}</div>}
              {detailItem.bankAccount && <div><span className="text-gray-500">เลขบัญชี:</span> {detailItem.bankAccount}</div>}
              {detailItem.accountName && <div><span className="text-gray-500">ชื่อบัญชี:</span> {detailItem.accountName}</div>}
              {detailItem.ref1 && <div><span className="text-gray-500">อ้างอิง 1:</span> {detailItem.ref1}</div>}
              {detailItem.ref2 && <div><span className="text-gray-500">อ้างอิง 2:</span> {detailItem.ref2}</div>}
            </div>
            {detailItem.notes && <div><span className="text-gray-500">หมายเหตุ:</span> {detailItem.notes}</div>}

            {/* Payment Details for this month */}
            {detailMonthly && (
              <div className="mt-2 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-700">รายละเอียดการชำระ ({selectedMonth})</h4>
                  {!editingMonthly && detailMonthly.status !== 'paid' && (
                    <button onClick={() => { setEditingMonthly(true); setEditMonthlyForm({ amount: String(detailMonthly.amount), paymentMethod: detailMonthly.paymentMethod || '', notes: detailMonthly.notes || '' }); }}
                      className="text-xs text-indigo-600 hover:text-indigo-800">✏️ แก้ไข</button>
                  )}
                </div>
                {editingMonthly ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">ยอดชำระ (บาท)</label>
                        <input type="number" step="0.01" value={editMonthlyForm.amount}
                          onChange={(e) => setEditMonthlyForm({ ...editMonthlyForm, amount: e.target.value })}
                          className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">ช่องทางชำระ</label>
                        <select value={editMonthlyForm.paymentMethod}
                          onChange={(e) => setEditMonthlyForm({ ...editMonthlyForm, paymentMethod: e.target.value })}
                          className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                          <option value="">เลือก...</option>
                          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">หมายเหตุ</label>
                      <textarea value={editMonthlyForm.notes}
                        onChange={(e) => setEditMonthlyForm({ ...editMonthlyForm, notes: e.target.value })}
                        rows={2} className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingMonthly(false)} className="px-3 py-1.5 text-xs rounded-lg border hover:bg-gray-50">ยกเลิก</button>
                      <button onClick={async () => {
                        try {
                          await api.put(`/recurring-expenses/payments/${detailMonthly.paymentId}`, {
                            amount: Number(editMonthlyForm.amount),
                            paymentMethod: editMonthlyForm.paymentMethod,
                            notes: editMonthlyForm.notes,
                          });
                          setToast('บันทึกสำเร็จ');
                          setEditingMonthly(false);
                          setDetailItem(null); setDetailMonthly(null);
                          loadMonthly();
                        } catch { setToast('บันทึกไม่สำเร็จ'); }
                      }} className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">บันทึก</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div><span className="text-gray-500">สถานะ:</span> {detailMonthly.status === 'paid' ? <span className="text-green-600 font-medium">จ่ายแล้ว</span> : <span className="text-red-600 font-medium">ค้างจ่าย</span>}</div>
                      <div><span className="text-gray-500">ยอดชำระ:</span> {Number(detailMonthly.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</div>
                      {detailMonthly.paidAt && <div><span className="text-gray-500">วันที่ชำระ:</span> {new Date(detailMonthly.paidAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}</div>}
                      {detailMonthly.paymentMethod && <div><span className="text-gray-500">ช่องทาง:</span> {detailMonthly.paymentMethod}</div>}
                    </div>
                    {detailMonthly.notes && <div className="mt-1"><span className="text-gray-500">หมายเหตุ:</span> {detailMonthly.notes}</div>}
                    {detailMonthly.slipImage && (
                      <div className="mt-2">
                        <p className="text-gray-500 mb-1">สลิป/ใบเสร็จ:</p>
                        <img src={`/api/${detailMonthly.slipImage}`} alt="สลิป" className="max-h-64 rounded-lg border border-gray-200 object-contain" />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button onClick={() => { setDetailItem(null); setDetailMonthly(null); setEditingMonthly(false); }} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ปิด</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
