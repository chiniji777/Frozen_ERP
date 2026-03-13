import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

type ExpenseStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

interface Supplier {
  id: number;
  name: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  promptPayId: string | null;
  taxId?: string | null;
  address?: string | null;
  supplierType?: string | null;
}

const WHT_INCOME_TYPES = [
  { code: 'rent_property', label: 'ค่าเช่าอสังหาริมทรัพย์', section: '40(5)(ก)', rate: 5 },
  { code: 'service', label: 'ค่าบริการ / จ้างทำของ', section: '40(8)', rate: 3 },
  { code: 'transport', label: 'ค่าขนส่ง', section: '40(8)', rate: 1 },
  { code: 'advertising', label: 'ค่าโฆษณา', section: '40(8)', rate: 2 },
  { code: 'contractor', label: 'ค่ารับเหมา', section: '40(7)(8)', rate: 3 },
  { code: 'professional', label: 'ค่าวิชาชีพอิสระ', section: '40(6)', rate: 3 },
  { code: 'prize', label: 'รางวัล/ส่วนลด', section: '40(8)', rate: 5 },
] as const;

interface Expense {
  id: number;
  category: string;
  description: string;
  amount: number;
  date: string;
  slipImage: string | null;
  notes: string;
  status?: ExpenseStatus;
  dueDate?: string;
  paidAt?: string;
  paymentMethod?: string;
  recurringExpenseId?: number;
  supplierId?: number | null;
  supplier?: Supplier | null;
  hasWithholdingTax?: number;
  whtFormType?: string | null;
  whtIncomeType?: string | null;
  whtIncomeDescription?: string | null;
  whtRate?: number | null;
  whtAmount?: number | null;
  whtNetAmount?: number | null;
  whtDocNumber?: string | null;
  expenseNumber?: string | null;
  recurringInfo?: {
    imageUrl?: string | null;
    bankName?: string | null;
    bankAccount?: string | null;
    accountName?: string | null;
    payTo?: string | null;
  } | null;
}

interface PrintLog {
  id: number;
  docType: string;
  refId: number;
  refNumber: string | null;
  description: string | null;
  printedBy: string | null;
  printedAt: string;
}

interface ExpenseForm {
  category: string;
  description: string;
  amount: string;
  date: string;
  notes: string;
  slipImage: string;
  dueDate: string;
  paymentMethod: string;
  supplierId: string;
  hasWithholdingTax: boolean;
  whtFormType: string;
  whtIncomeType: string;
  whtRate: string;
}

interface RecurringMonthlyItem {
  id: number;
  paymentId: number;
  recurringExpenseId: number;
  month: string;
  amount: number;
  paidAt: string | null;
  status: 'pending' | 'paid';
  name: string;
  category: string;
  dueDay: number;
  payTo: string;
  paymentMethod: string;
}

const emptyForm: ExpenseForm = { category: '', description: '', amount: '', date: '', notes: '', slipImage: '', dueDate: '', paymentMethod: '', supplierId: '', hasWithholdingTax: false, whtFormType: 'pnd3', whtIncomeType: '', whtRate: '' };

const statusConfig: Record<ExpenseStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'รอจ่าย', bg: 'bg-amber-100', text: 'text-amber-700' },
  paid: { label: 'จ่ายแล้ว', bg: 'bg-green-100', text: 'text-green-700' },
  overdue: { label: 'เกินกำหนด', bg: 'bg-red-100', text: 'text-red-700' },
  cancelled: { label: 'ยกเลิก', bg: 'bg-gray-100', text: 'text-gray-500' },
};

const paymentMethodLabel: Record<string, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  credit: 'บัตรเครดิต',
  cheque: 'เช็ค',
};

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-50">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 text-right">{value || '-'}</span>
    </div>
  );
}

export default function ExpensePage() {
  const [searchParams] = useSearchParams();
  const urlCategory = searchParams.get('category') || '';
  const [data, setData] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [cancelTarget, setCancelTarget] = useState<Expense | null>(null);
  const [detailExp, setDetailExp] = useState<Expense | null>(null);
  const [imageZoom, setImageZoom] = useState(false);
  const [filterCat, setFilterCat] = useState(urlCategory);
  const [filterStatus, setFilterStatus] = useState<ExpenseStatus | ''>('');
  const [filterMonth, setFilterMonth] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [uploading, setUploading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [slipPreview, setSlipPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [recurringItems, setRecurringItems] = useState<RecurringMonthlyItem[]>([]);
  const [supplierList, setSupplierList] = useState<Supplier[]>([]);
  const [printLogs, setPrintLogs] = useState<PrintLog[]>([]);

  const loadSuppliers = () => {
    api.get<Supplier[]>('/suppliers').then(setSupplierList).catch(() => setSupplierList([]));
  };

  const load = () => {
    setLoading(true);
    api.get<Expense[]>('/expenses')
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  const loadCategories = () => {
    api.get<string[]>('/expenses/categories')
      .then(setCategories)
      .catch(() => setCategories(['ค่าขนส่ง', 'ค่าน้ำมัน', 'ค่าวัตถุดิบ', 'ค่าบรรจุภัณฑ์', 'ค่าสาธารณูปโภค', 'ค่าแรงงาน', 'อื่นๆ']));
  };

  const loadRecurring = () => {
    api.get<RecurringMonthlyItem[]>(`/recurring-expenses/monthly?month=${filterMonth}`)
      .then(setRecurringItems)
      .catch(() => setRecurringItems([]));
  };

  const handleMarkRecurringPaid = async (item: RecurringMonthlyItem) => {
    try {
      await api.post(`/recurring-expenses/${item.recurringExpenseId}/pay`, {
        month: filterMonth,
        amount: item.amount,
        paidAt: new Date().toISOString().slice(0, 10),
        paymentMethod: item.paymentMethod || '',
        notes: '',
        slipImage: '',
      });
      setToast(`ชำระ "${item.name}" สำเร็จ`);
      loadRecurring();
      load();
    } catch {
      setToast('ชำระไม่สำเร็จ');
    }
  };

  const handleMarkExpensePaid = async (expense: Expense) => {
    try {
      await api.patch(`/expenses/${expense.id}/pay`, {
        paidAt: new Date().toISOString().slice(0, 10),
      });
      setToast(`ชำระ "${expense.description}" สำเร็จ`);
      load();
      if (detailExp?.id === expense.id) {
        setDetailExp({ ...expense, status: 'paid', paidAt: new Date().toISOString().slice(0, 10) });
      }
    } catch {
      setToast('ชำระไม่สำเร็จ');
    }
  };

  const handleMarkExpenseUnpaid = async (expense: Expense) => {
    try {
      await api.patch(`/expenses/${expense.id}/unpay`, {});
      setToast(`เปลี่ยน "${expense.description}" เป็นรอจ่าย`);
      load();
    } catch {
      setToast('เปลี่ยนสถานะไม่สำเร็จ');
    }
  };

  const handleToggleStatus = (expense: Expense) => {
    const st = expense.status || 'pending';
    if (st === 'paid') {
      if (expense.recurringExpenseId) return;
      handleMarkExpenseUnpaid(expense);
    } else if (st === 'pending' || st === 'overdue') {
      if (expense.recurringExpenseId) {
        const ri = recurringItems.find((r) => r.recurringExpenseId === expense.recurringExpenseId && r.status === 'pending');
        if (ri) handleMarkRecurringPaid(ri);
      } else {
        handleMarkExpensePaid(expense);
      }
    }
  };

  useEffect(() => { load(); loadCategories(); loadRecurring(); loadSuppliers(); }, [filterMonth]);
  useEffect(() => { setFilterCat(urlCategory); }, [urlCategory]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const allCategories = [...new Set([...categories, ...data.map((e) => e.category).filter(Boolean)])];

  // Merge recurring items into main table
  const recurringAsExpenses: Expense[] = recurringItems.map((r) => ({
    id: r.paymentId ?? -(r.id),
    category: r.category,
    description: r.name,
    amount: Number(r.amount),
    date: `${filterMonth}-${String(r.dueDay).padStart(2, '0')}`,
    slipImage: null,
    notes: r.payTo ? `จ่ายให้: ${r.payTo}` : '',
    status: (r.status === 'paid' ? 'paid' : 'pending') as ExpenseStatus,
    dueDate: `${filterMonth}-${String(r.dueDay).padStart(2, '0')}`,
    paidAt: r.paidAt || undefined,
    paymentMethod: r.paymentMethod || undefined,
    recurringExpenseId: r.recurringExpenseId,
  }));

  const allExpenses = [...data, ...recurringAsExpenses];

  const filtered = allExpenses.filter((e) => {
    if (filterCat && e.category !== filterCat) return false;
    if (filterStatus && (e.status || 'pending') !== filterStatus) return false;
    if (filterMonth && e.date) {
      const expMonth = e.date.slice(0, 7);
      if (expMonth !== filterMonth) return false;
    }
    return true;
  });

  const monthlyTotal = filtered.reduce((sum, e) => sum + Number(e.amount), 0);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
    setSlipPreview('');
    setModalOpen(true);
  };

  const openDetail = (e: Expense) => {
    setDetailExp(e);
    setImageZoom(false);
    setPrintLogs([]);
    api.get<Expense>(`/expenses/${e.id}`).then((full) => setDetailExp(full)).catch(() => {});
    api.get<PrintLog[]>(`/expenses/${e.id}/print-logs`).then(setPrintLogs).catch(() => setPrintLogs([]));
  };

  const openEditFromDetail = () => {
    if (!detailExp || detailExp.recurringExpenseId) return;
    openEdit(detailExp);
  };

  const openEdit = (e: Expense) => {
    setDetailExp(null);
    if (e.recurringExpenseId) return;
    setEditing(e);
    setForm({
      category: e.category, description: e.description, amount: String(e.amount),
      date: e.date?.slice(0, 10) || '', notes: e.notes || '', slipImage: e.slipImage || '',
      dueDate: e.dueDate?.slice(0, 10) || '', paymentMethod: e.paymentMethod || '',
      supplierId: e.supplierId ? String(e.supplierId) : '',
      hasWithholdingTax: !!e.hasWithholdingTax,
      whtFormType: e.whtFormType || 'pnd3',
      whtIncomeType: e.whtIncomeType || '',
      whtRate: e.whtRate ? String(e.whtRate) : '',
    });
    setSlipPreview(e.slipImage ? `/api/${e.slipImage}` : '');
    setModalOpen(true);
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
      setForm((f) => ({ ...f, slipImage: json.slipImage }));
      setSlipPreview(`/api/${json.slipImage}`);
      setToast('อัปโหลดสลิปสำเร็จ');
      return json.slipImage;
    } catch {
      setToast('อัปโหลดสลิปไม่สำเร็จ');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleOcr = async () => {
    if (!form.slipImage) {
      setToast('กรุณาอัปโหลดสลิปก่อน');
      return;
    }
    setOcrLoading(true);
    try {
      const fd = new FormData();
      const imgRes = await fetch(`/api/${form.slipImage}`);
      const blob = await imgRes.blob();
      fd.append('slip', blob, 'slip.jpg');
      const token = localStorage.getItem('token');
      const res = await fetch('/api/ocr-slip/ocr', {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('OCR failed');
      const json = await res.json() as { parsed?: { amount?: number; date?: string; payer?: string } };
      if (json.parsed) {
        setForm((f) => ({
          ...f,
          amount: json.parsed?.amount ? String(json.parsed.amount) : f.amount,
          date: json.parsed?.date ? normalizeDate(json.parsed.date) : f.date,
          description: json.parsed?.payer ? json.parsed.payer : f.description,
        }));
        setToast('OCR สำเร็จ — กรอกข้อมูลอัตโนมัติ');
      } else {
        setToast('OCR ไม่สามารถอ่านข้อมูลได้');
      }
    } catch {
      setToast('OCR ไม่สำเร็จ');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const amt = Number(form.amount);
    const whtRate = form.hasWithholdingTax && form.whtRate ? Number(form.whtRate) : null;
    const whtAmount = form.hasWithholdingTax && whtRate ? Math.round(amt * whtRate / 100 * 100) / 100 : null;
    const whtNetAmount = whtAmount != null ? Math.round((amt - whtAmount) * 100) / 100 : null;
    const whtIncome = WHT_INCOME_TYPES.find(t => t.code === form.whtIncomeType);
    const body = {
      ...form,
      amount: amt,
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      hasWithholdingTax: form.hasWithholdingTax,
      whtFormType: form.hasWithholdingTax ? form.whtFormType : null,
      whtIncomeType: form.hasWithholdingTax ? form.whtIncomeType : null,
      whtIncomeDescription: form.hasWithholdingTax && whtIncome ? `${whtIncome.label} ${whtIncome.section}` : null,
      whtRate,
      whtAmount,
      whtNetAmount,
    };
    if (editing) {
      await api.put(`/expenses/${editing.id}`, body);
    } else {
      await api.post('/expenses', body);
    }
    setModalOpen(false);
    load();
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await api.patch(`/expenses/${cancelTarget.id}/cancel`, {});
      setToast(`ยกเลิกค่าใช้จ่าย "${cancelTarget.description}" สำเร็จ`);
    } catch {
      setToast('ไม่สามารถยกเลิกได้');
    }
    setCancelTarget(null);
    load();
  };

  const renderStatusBadge = (e: Expense) => {
    const st = (e.status || 'pending') as ExpenseStatus;
    const cfg = statusConfig[st] || statusConfig.pending;
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.bg} ${cfg.text}`}>
        {cfg.label}
      </span>
    );
  };


  // === Detail View ===
  if (detailExp && !modalOpen) {
    const exp = detailExp;
    const st = (exp.status || 'pending') as ExpenseStatus;
    const cfg = statusConfig[st] || statusConfig.pending;

    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetailExp(null)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-800">ค่าใช้จ่าย #{exp.id}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
            {exp.recurringExpenseId && <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-600 font-medium">ประจำ</span>}
          </div>
          <div className="flex gap-2">
            {!exp.recurringExpenseId && st !== 'cancelled' && (
              <button onClick={openEditFromDetail} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">✏️ แก้ไข</button>
            )}
            {(st === 'pending' || st === 'overdue') && (
              <button onClick={() => handleToggleStatus(exp)} className="px-4 py-2 text-sm text-white rounded-lg bg-green-600 hover:bg-green-700">💰 จ่ายแล้ว</button>
            )}
            {st === 'paid' && !exp.recurringExpenseId && (
              <button onClick={() => handleToggleStatus(exp)} className="px-4 py-2 text-sm border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-50">↩ เปลี่ยนเป็นรอจ่าย</button>
            )}
            {st === 'pending' && !exp.recurringExpenseId && (
              <button onClick={() => setCancelTarget(exp)} className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">✕ ยกเลิก</button>
            )}
            {!!exp.hasWithholdingTax && (
              <button onClick={() => { const t = localStorage.getItem('token'); window.open(`/api/expenses/${exp.id}/print-wht${t ? '?token=' + t : ''}`, '_blank'); setTimeout(() => api.get<PrintLog[]>(`/expenses/${exp.id}/print-logs`).then(setPrintLogs).catch(() => {}), 1000); }} className="px-4 py-2 text-sm border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-50">🖨️ ใบหัก ณ ที่จ่าย</button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">ข้อมูลทั่วไป</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="รายละเอียด" value={<strong>{exp.description}</strong>} />
            <InfoRow label="หมวดหมู่" value={exp.category} />
            <InfoRow label="จำนวนเงิน" value={<span className="text-lg font-bold text-indigo-700">฿{Number(exp.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>} />
            <InfoRow label="วันที่" value={exp.date?.slice(0, 10)} />
            <InfoRow label="วันครบกำหนด" value={exp.dueDate?.slice(0, 10)} />
            {exp.notes && <InfoRow label="หมายเหตุ" value={exp.notes} />}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">การชำระเงิน</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="สถานะ" value={renderStatusBadge(exp)} />
            <InfoRow label="วิธีชำระ" value={exp.paymentMethod ? (paymentMethodLabel[exp.paymentMethod] || exp.paymentMethod) : undefined} />
            <InfoRow label="วันที่ชำระ" value={exp.paidAt?.slice(0, 10)} />
          </div>
          {exp.supplier && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 mb-2">ข้อมูลชำระเงิน Supplier: {exp.supplier.name}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                <InfoRow label="ธนาคาร" value={exp.supplier.bankName} />
                <InfoRow label="เลขบัญชี" value={exp.supplier.bankAccountNumber} />
                <InfoRow label="ชื่อบัญชี" value={exp.supplier.bankAccountName} />
                <InfoRow label="PromptPay" value={exp.supplier.promptPayId} />
              </div>
              {exp.supplier.promptPayId && (
                <div className="mt-3 flex justify-center">
                  <img
                    src={`https://promptpay.io/${exp.supplier.promptPayId}/${exp.amount}.png`}
                    alt="PromptPay QR"
                    className="w-48 h-48 border rounded-lg"
                  />
                </div>
              )}
            </div>
          )}
          {exp.recurringInfo && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 mb-2">ข้อมูลจากรายการประจำ{exp.recurringInfo.payTo ? `: ${exp.recurringInfo.payTo}` : ''}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                {exp.recurringInfo.bankName && <InfoRow label="ธนาคาร" value={exp.recurringInfo.bankName} />}
                {exp.recurringInfo.bankAccount && <InfoRow label="เลขบัญชี" value={exp.recurringInfo.bankAccount} />}
                {exp.recurringInfo.accountName && <InfoRow label="ชื่อบัญชี" value={exp.recurringInfo.accountName} />}
              </div>
              {exp.recurringInfo.imageUrl && (
                <div className="mt-3 flex justify-center">
                  <img src={`/api/${exp.recurringInfo.imageUrl}`} alt="QR/เอกสาร" className="max-h-64 rounded-lg border border-gray-200 object-contain" />
                </div>
              )}
            </div>
          )}
        </div>

        {!!exp.hasWithholdingTax && (
          <div className="bg-white rounded-xl shadow-sm border p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-600 mb-3">หัก ณ ที่จ่าย</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <InfoRow label="แบบฟอร์ม" value={exp.whtFormType === 'pnd3' ? 'ภ.ง.ด. 3 (บุคคลธรรมดา)' : exp.whtFormType === 'pnd53' ? 'ภ.ง.ด. 53 (นิติบุคคล)' : exp.whtFormType} />
              <InfoRow label="ประเภทเงินได้" value={exp.whtIncomeDescription || exp.whtIncomeType} />
              <InfoRow label="อัตราภาษี" value={exp.whtRate ? `${exp.whtRate}%` : undefined} />
              <InfoRow label="ยอดก่อนหัก" value={<span className="font-medium">฿{Number(exp.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>} />
              <InfoRow label="ภาษีที่หัก" value={exp.whtAmount ? <span className="text-red-600 font-bold">฿{Number(exp.whtAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span> : undefined} />
              <InfoRow label="ยอดจ่ายจริง" value={exp.whtNetAmount ? <span className="text-green-700 font-bold text-lg">฿{Number(exp.whtNetAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span> : undefined} />
              {exp.whtDocNumber && <InfoRow label="เลขที่เอกสาร" value={exp.whtDocNumber} />}
            </div>
          </div>
        )}

        {exp.slipImage && (
          <div className="bg-white rounded-xl shadow-sm border p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-600 mb-3">สลิป/ใบเสร็จ</h2>
            <div className="flex justify-center">
              <img src={`/api/${exp.slipImage}`} alt="slip"
                className={`rounded-lg border border-gray-200 object-contain cursor-pointer transition-all ${imageZoom ? 'max-h-[80vh] max-w-full' : 'max-h-64'}`}
                onClick={() => setImageZoom(!imageZoom)} />
            </div>
            {!imageZoom && <p className="text-xs text-gray-400 text-center mt-2">คลิกเพื่อขยาย</p>}
          </div>
        )}

        {printLogs.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-600 mb-3">ประวัติการปริ้นเอกสาร</h2>
            <div className="divide-y divide-gray-100">
              {printLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm text-gray-800">{log.description || log.docType}</span>
                    {log.refNumber && <span className="ml-2 text-xs text-gray-400">({log.refNumber})</span>}
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(log.printedAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <ConfirmDialog open={!!cancelTarget} message={`ต้องการยกเลิกค่าใช้จ่าย "${cancelTarget?.description}" ใช่ไหม?`}
          onConfirm={handleCancel} onCancel={() => setCancelTarget(null)} />
        {toast && (<div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in">{toast}</div>)}
      </div>
    );
  }

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">{urlCategory ? `🐟 ${urlCategory}` : 'ค่าใช้จ่าย'}</h1>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">เดือน</label>
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="">ทั้งหมด</option>
            {(() => {
              const months: string[] = [];
              const now = new Date();
              for (let i = 11; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
              }
              return months.reverse().map((m) => (
                <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })}</option>
              ));
            })()}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">หมวด</label>
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm">
            <option value="">ทั้งหมด</option>
            {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">สถานะ</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as ExpenseStatus | '')}
            className="px-3 py-1.5 border rounded-lg text-sm">
            <option value="">ทั้งหมด</option>
            <option value="pending">รอจ่าย</option>
            <option value="paid">จ่ายแล้ว</option>
            <option value="overdue">เกินกำหนด</option>
            <option value="cancelled">ยกเลิก</option>
          </select>
        </div>
        <div className="ml-auto bg-indigo-50 rounded-lg px-4 py-2">
          <span className="text-sm text-gray-500">ยอดรวม: </span>
          <span className="text-lg font-bold text-indigo-700">{monthlyTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'id', label: 'รหัส' },
          { key: 'date', label: 'วันที่', render: (e: Expense) => e.date?.slice(0, 10) || '-' },
          { key: 'category', label: 'หมวด', filterable: true, render: (e: Expense) => (
            <span className="flex items-center gap-1.5">
              {e.category}
              {e.recurringExpenseId && <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-600 font-medium">ประจำ</span>}
            </span>
          )},
          { key: 'description', label: 'รายละเอียด', filterable: true },
          { key: 'amount', label: 'จำนวนเงิน', render: (e: Expense) => `${Number(e.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}` },
          { key: 'slipImage', label: 'สลิป', render: (e: Expense) => e.slipImage ? <span className="text-green-600 text-xs">มีสลิป</span> : <span className="text-gray-400 text-xs">-</span> },
          { key: 'status', label: 'สถานะ', filterable: true, render: (e: Expense) => {
            const st = (e.status || 'pending') as ExpenseStatus;
            const cfg = statusConfig[st] || statusConfig.pending;
            return (
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
                {(st === 'pending' || st === 'overdue') && (
                  <button onClick={(ev) => { ev.stopPropagation(); handleToggleStatus(e); }}
                    className="px-2.5 py-1 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 whitespace-nowrap">
                    จ่ายแล้ว
                  </button>
                )}
                {st === 'paid' && !e.recurringExpenseId && (
                  <button onClick={(ev) => { ev.stopPropagation(); handleToggleStatus(e); }}
                    className="px-2.5 py-1 text-xs rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 whitespace-nowrap">
                    รอจ่าย
                  </button>
                )}
              </div>
            );
          }},
        ]}
        data={filtered}
        getId={(e) => e.id}
        searchPlaceholder="ค้นหาค่าใช้จ่าย..."
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(e) => e.recurringExpenseId ? undefined : setCancelTarget(e)}
        onRowClick={openDetail}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่ายใหม่'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Slip upload + OCR */}
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
                {uploading ? 'กำลังอัปโหลด...' : (form.slipImage ? 'เปลี่ยนสลิป' : 'แนบสลิป')}
              </button>
              {form.slipImage && (
                <button
                  type="button"
                  onClick={handleOcr}
                  disabled={ocrLoading}
                  className="px-3 py-2 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
                >
                  {ocrLoading ? 'กำลังอ่าน...' : 'OCR อ่านสลิป'}
                </button>
              )}
            </div>
            {slipPreview && (
              <div className="mt-2">
                <img src={slipPreview} alt="slip" className="max-h-48 rounded-lg border border-gray-200 object-contain" />
              </div>
            )}
          </div>

          {/* Category dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมวด</label>
            <select
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            >
              <option value="">เลือกหมวด...</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Supplier dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier (ผู้ขาย)</label>
            <select
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            >
              <option value="">ไม่ระบุ</option>
              {supplierList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {(() => {
              const sel = supplierList.find(s => String(s.id) === form.supplierId);
              if (!sel) return null;
              const hasPayInfo = sel.bankName || sel.bankAccountNumber || sel.promptPayId;
              if (!hasPayInfo) return null;
              return (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm">
                  <p className="text-xs font-semibold text-blue-600 mb-1">ข้อมูลชำระเงิน</p>
                  {sel.bankName && <p className="text-gray-700">ธนาคาร: {sel.bankName}</p>}
                  {sel.bankAccountNumber && <p className="text-gray-700">เลขบัญชี: {sel.bankAccountNumber}</p>}
                  {sel.bankAccountName && <p className="text-gray-700">ชื่อบัญชี: {sel.bankAccountName}</p>}
                  {sel.promptPayId && <p className="text-gray-700">PromptPay: {sel.promptPayId}</p>}
                </div>
              );
            })()}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              placeholder="รายละเอียดค่าใช้จ่าย..." />
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท)</label>
              <input type="number" step="0.01" required value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
              <input type="date" required value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>

          {/* Due Date + Payment Method */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันครบกำหนด</label>
              <input type="date" value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ช่องทางชำระ</label>
              <select value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                <option value="">เลือก...</option>
                <option value="cash">เงินสด</option>
                <option value="transfer">โอนเงิน</option>
                <option value="credit">บัตรเครดิต</option>
                <option value="cheque">เช็ค</option>
              </select>
            </div>
          </div>

          {/* Withholding Tax */}
          <div className="border border-gray-200 rounded-lg p-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.hasWithholdingTax}
                onChange={(e) => setForm({ ...form, hasWithholdingTax: e.target.checked })}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              <span className="text-sm font-medium text-gray-700">หัก ณ ที่จ่าย</span>
            </label>
            {form.hasWithholdingTax && (
              <div className="mt-3 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">แบบฟอร์ม</label>
                    <select value={form.whtFormType} onChange={(e) => setForm({ ...form, whtFormType: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="pnd3">ภ.ง.ด. 3 (บุคคลธรรมดา)</option>
                      <option value="pnd53">ภ.ง.ด. 53 (นิติบุคคล)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">ประเภทเงินได้</label>
                    <select value={form.whtIncomeType}
                      onChange={(e) => {
                        const sel = WHT_INCOME_TYPES.find(t => t.code === e.target.value);
                        setForm({ ...form, whtIncomeType: e.target.value, whtRate: sel ? String(sel.rate) : form.whtRate });
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="">เลือกประเภท...</option>
                      {WHT_INCOME_TYPES.map(t => <option key={t.code} value={t.code}>{t.label} {t.section} ({t.rate}%)</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">อัตรา (%)</label>
                    <input type="number" step="0.01" value={form.whtRate}
                      onChange={(e) => setForm({ ...form, whtRate: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">ภาษีที่หัก</label>
                    <div className="px-3 py-2 bg-red-50 rounded-lg text-sm text-red-700 font-bold">
                      ฿{form.amount && form.whtRate ? (Number(form.amount) * Number(form.whtRate) / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '0.00'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">ยอดจ่ายจริง</label>
                    <div className="px-3 py-2 bg-green-50 rounded-lg text-sm text-green-700 font-bold">
                      ฿{form.amount && form.whtRate ? (Number(form.amount) - Number(form.amount) * Number(form.whtRate) / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : (Number(form.amount) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2} placeholder="หมายเหตุเพิ่มเติม..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{editing ? 'บันทึก' : 'เพิ่ม'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!cancelTarget} message={`ต้องการยกเลิกค่าใช้จ่าย "${cancelTarget?.description}" ใช่ไหม?`}
        onConfirm={handleCancel} onCancel={() => setCancelTarget(null)} />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

function normalizeDate(raw: string): string {
  // Try DD/MM/YYYY → YYYY-MM-DD
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let year = parseInt(dmy[3]);
    if (year > 2500) year -= 543; // Thai year
    if (year < 100) year += 2000;
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  // Try YYYY-MM-DD
  const ymd = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  return raw;
}
