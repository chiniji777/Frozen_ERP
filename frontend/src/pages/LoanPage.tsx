import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface LoanRepayment {
  id: number;
  loanId: number;
  amount: number;
  date: string;
  notes?: string;
  slipImage?: string;
  createdAt?: string;
}

interface Loan {
  id: number;
  borrowerName: string;
  amount: number;
  remainingBalance: number;
  date: string;
  dueDate?: string;
  notes?: string;
  status: 'active' | 'paid' | 'overdue' | 'cancelled';
  repayments?: LoanRepayment[];
  createdAt?: string;
}

type LoanStatus = Loan['status'];

const statusConfig: Record<LoanStatus, { label: string; bg: string; text: string }> = {
  active: { label: 'กำลังยืม', bg: 'bg-blue-100', text: 'text-blue-700' },
  paid: { label: 'คืนครบ', bg: 'bg-green-100', text: 'text-green-700' },
  overdue: { label: 'เกินกำหนด', bg: 'bg-red-100', text: 'text-red-700' },
  cancelled: { label: 'ยกเลิก', bg: 'bg-gray-100', text: 'text-gray-500' },
};

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-50">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 text-right">{value || '-'}</span>
    </div>
  );
}

const emptyForm = { borrowerName: '', amount: '', date: '', dueDate: '', notes: '' };
const emptyRepayForm = { amount: '', date: '', notes: '' };

export default function LoanPage() {
  const [data, setData] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [detailLoan, setDetailLoan] = useState<Loan | null>(null);
  const [repayOpen, setRepayOpen] = useState(false);
  const [repayForm, setRepayForm] = useState(emptyRepayForm);
  const [cancelTarget, setCancelTarget] = useState<Loan | null>(null);
  const [toast, setToast] = useState('');
  const [imageZoom, setImageZoom] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.get<Loan[]>('/loans')
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

  const loadDetail = async (id: number) => {
    try {
      const loan = await api.get<Loan>(`/loans/${id}`);
      setDetailLoan(loan);
    } catch {
      setToast('ไม่สามารถโหลดข้อมูลได้');
    }
  };

  const openAdd = () => {
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
  };

  const openDetail = (loan: Loan) => {
    setDetailLoan(loan);
    loadDetail(loan.id);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/loans', { ...form, amount: Number(form.amount) });
      setModalOpen(false);
      setToast('สร้างรายการยืมสำเร็จ');
      load();
    } catch {
      setToast('ไม่สามารถสร้างรายการได้');
    }
  };

  const handleRepay = async (e: FormEvent) => {
    e.preventDefault();
    if (!detailLoan) return;
    try {
      await api.post(`/loans/${detailLoan.id}/repay`, {
        ...repayForm,
        amount: Number(repayForm.amount),
      });
      setRepayOpen(false);
      setRepayForm(emptyRepayForm);
      setToast('บันทึกการคืนเงินสำเร็จ');
      load();
      loadDetail(detailLoan.id);
    } catch {
      setToast('ไม่สามารถบันทึกได้');
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await api.patch(`/loans/${cancelTarget.id}/cancel`, {});
      setToast(`ยกเลิกรายการยืม "${cancelTarget.borrowerName}" สำเร็จ`);
      if (detailLoan?.id === cancelTarget.id) setDetailLoan(null);
    } catch {
      setToast('ไม่สามารถยกเลิกได้');
    }
    setCancelTarget(null);
    load();
  };

  const renderStatusBadge = (loan: Loan) => {
    const cfg = statusConfig[loan.status] || statusConfig.active;
    return <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>;
  };

  const totalLent = data.filter((l) => l.status === 'active' || l.status === 'overdue').reduce((s, l) => s + Number(l.amount), 0);
  const totalRemaining = data.filter((l) => l.status === 'active' || l.status === 'overdue').reduce((s, l) => s + Number(l.remainingBalance), 0);

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  // === Detail View ===
  if (detailLoan) {
    const loan = detailLoan;
    const cfg = statusConfig[loan.status] || statusConfig.active;
    const repayments = loan.repayments || [];
    const totalRepaid = repayments.reduce((s, r) => s + Number(r.amount), 0);

    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetailLoan(null)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-800">ยืมเงิน #{loan.id}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
          </div>
          <div className="flex gap-2">
            {(loan.status === 'active' || loan.status === 'overdue') && (
              <button onClick={() => { setRepayForm({ ...emptyRepayForm, date: new Date().toISOString().slice(0, 10) }); setRepayOpen(true); }}
                className="px-4 py-2 text-sm text-white rounded-lg bg-green-600 hover:bg-green-700">💰 คืนเงิน</button>
            )}
            {loan.status === 'active' && (
              <button onClick={() => setCancelTarget(loan)}
                className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">✕ ยกเลิก</button>
            )}
          </div>
        </div>

        {/* Loan Info */}
        <div className="bg-white rounded-xl shadow-sm border p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">ข้อมูลการยืม</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="ผู้ยืม" value={<strong>{loan.borrowerName}</strong>} />
            <InfoRow label="ยอดยืม" value={<span className="text-lg font-bold text-indigo-700">฿{Number(loan.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>} />
            <InfoRow label="วันที่ยืม" value={loan.date?.slice(0, 10)} />
            <InfoRow label="กำหนดคืน" value={loan.dueDate?.slice(0, 10)} />
            {loan.notes && <InfoRow label="หมายเหตุ" value={loan.notes} />}
          </div>
        </div>

        {/* Balance */}
        <div className="bg-white rounded-xl shadow-sm border p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">ยอดคงค้าง</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-500">ยอดยืม</div>
              <div className="text-lg font-bold text-gray-800">฿{Number(loan.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">คืนแล้ว</div>
              <div className="text-lg font-bold text-green-600">฿{totalRepaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">คงเหลือ</div>
              <div className={`text-lg font-bold ${Number(loan.remainingBalance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                ฿{Number(loan.remainingBalance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
          {Number(loan.amount) > 0 && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (totalRepaid / Number(loan.amount)) * 100)}%` }} />
              </div>
              <div className="text-xs text-gray-400 text-right mt-1">{Math.round((totalRepaid / Number(loan.amount)) * 100)}%</div>
            </div>
          )}
        </div>

        {/* Repayment History */}
        <div className="bg-white rounded-xl shadow-sm border p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">ประวัติการคืนเงิน ({repayments.length})</h2>
          {repayments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีการคืนเงิน</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2 pr-2 w-8">#</th>
                <th className="pb-2 pr-2">วันที่</th>
                <th className="pb-2 pr-2 text-right">จำนวน</th>
                <th className="pb-2 pr-2">หมายเหตุ</th>
                <th className="pb-2">สลิป</th>
              </tr></thead>
              <tbody>
                {repayments.map((r, i) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-2.5 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2.5 pr-2">{r.date?.slice(0, 10)}</td>
                    <td className="py-2.5 pr-2 text-right font-medium text-green-600">฿{Number(r.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 pr-2 text-gray-500">{r.notes || '-'}</td>
                    <td className="py-2.5">
                      {r.slipImage ? (
                        <button onClick={() => setImageZoom(r.slipImage!)} className="text-indigo-600 text-xs hover:underline">ดูสลิป</button>
                      ) : <span className="text-gray-400 text-xs">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Image Zoom Modal */}
        {imageZoom && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setImageZoom(null)}>
            <img src={`/api/data/${imageZoom}`} alt="slip" className="max-h-[85vh] max-w-full rounded-lg shadow-xl" />
          </div>
        )}

        {/* Repay Modal */}
        <Modal open={repayOpen} onClose={() => setRepayOpen(false)} title="คืนเงิน">
          <form onSubmit={handleRepay} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงินที่คืน (บาท)</label>
              <input type="number" step="0.01" required value={repayForm.amount}
                onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value })}
                max={Number(loan.remainingBalance)}
                placeholder={`คงเหลือ ฿${Number(loan.remainingBalance).toLocaleString()}`}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่คืน</label>
              <input type="date" required value={repayForm.date}
                onChange={(e) => setRepayForm({ ...repayForm, date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
              <input value={repayForm.notes} onChange={(e) => setRepayForm({ ...repayForm, notes: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                placeholder="หมายเหตุ (ถ้ามี)" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setRepayOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700">บันทึกการคืนเงิน</button>
            </div>
          </form>
        </Modal>

        <ConfirmDialog open={!!cancelTarget} message={`ต้องการยกเลิกรายการยืม "${cancelTarget?.borrowerName}" ใช่ไหม?`}
          onConfirm={handleCancel} onCancel={() => setCancelTarget(null)} />
        {toast && (<div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in">{toast}</div>)}
      </div>
    );
  }

  // === List View ===
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">💵 ยืมเงินระยะสั้น</h1>

      <div className="flex flex-wrap gap-4 mb-4">
        <div className="bg-indigo-50 rounded-lg px-4 py-2">
          <span className="text-sm text-gray-500">ยอดยืมรวม: </span>
          <span className="text-lg font-bold text-indigo-700">฿{totalLent.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="bg-red-50 rounded-lg px-4 py-2">
          <span className="text-sm text-gray-500">คงค้างรวม: </span>
          <span className="text-lg font-bold text-red-600">฿{totalRemaining.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'id', label: 'รหัส' },
          { key: 'borrowerName', label: 'ผู้ยืม', render: (l: Loan) => <strong>{l.borrowerName}</strong> },
          { key: 'date', label: 'วันที่ยืม', render: (l: Loan) => l.date?.slice(0, 10) || '-' },
          { key: 'amount', label: 'ยอดยืม', render: (l: Loan) => `฿${Number(l.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}` },
          { key: 'remainingBalance', label: 'คงค้าง', render: (l: Loan) => (
            <span className={Number(l.remainingBalance) > 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
              ฿{Number(l.remainingBalance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </span>
          )},
          { key: 'dueDate', label: 'กำหนดคืน', render: (l: Loan) => l.dueDate?.slice(0, 10) || '-' },
          { key: 'status', label: 'สถานะ', render: renderStatusBadge },
        ]}
        data={data}
        getId={(l) => l.id}
        searchPlaceholder="ค้นหาผู้ยืม..."
        onAdd={openAdd}
        onDelete={(l) => l.status === 'active' ? setCancelTarget(l) : undefined}
        onRowClick={openDetail}
      />

      {/* Create Loan Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="สร้างรายการยืมใหม่">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ยืม</label>
            <input required value={form.borrowerName} onChange={(e) => setForm({ ...form, borrowerName: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              placeholder="ชื่อผู้ยืมเงิน" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท)</label>
              <input type="number" step="0.01" required value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ยืม</label>
              <input type="date" required value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">กำหนดคืน</label>
            <input type="date" value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"
              placeholder="หมายเหตุเพิ่มเติม..." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">สร้างรายการยืม</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!cancelTarget} message={`ต้องการยกเลิกรายการยืม "${cancelTarget?.borrowerName}" ใช่ไหม?`}
        onConfirm={handleCancel} onCancel={() => setCancelTarget(null)} />
      {toast && (<div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in">{toast}</div>)}
    </div>
  );
}
