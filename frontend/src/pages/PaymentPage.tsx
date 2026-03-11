import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';

interface Invoice { id: number; invoice_number: string; customer_name?: string; total_amount: number; status: string; }
interface Payment {
  id: number;
  invoice_id: number;
  invoice_number?: string;
  customer_name?: string;
  amount: number;
  method: string;
  reference: string;
  invoice_status?: string;
  created_at?: string;
}

const methodLabels: Record<string, string> = { cash: 'เงินสด', transfer: 'โอน', cheque: 'เช็ค' };

export default function PaymentPage() {
  const [data, setData] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [formInvId, setFormInvId] = useState<number | ''>('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState('transfer');
  const [formRef, setFormRef] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [pays, ivs] = await Promise.all([
        api.get<Payment[]>('/payments').catch(() => []),
        api.get<Invoice[]>('/invoices').catch(() => []),
      ]);
      setData(pays); setInvoices(ivs.filter((iv) => iv.status === 'sent' || iv.status === 'draft'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const selectedInv = invoices.find((iv) => iv.id === Number(formInvId));

  const openAdd = () => {
    setFormInvId(''); setFormAmount(''); setFormMethod('transfer'); setFormRef('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await api.post('/payments', {
      invoice_id: Number(formInvId),
      amount: Number(formAmount),
      method: formMethod,
      reference: formRef,
    });
    setModalOpen(false); load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">💰 รับชำระเงิน</h1>
      <DataTable
        columns={[
          { key: 'id', label: 'รหัส' },
          { key: 'invoice_number', label: 'ใบแจ้งหนี้' },
          { key: 'customer_name', label: 'ลูกค้า' },
          { key: 'amount', label: 'จำนวนเงิน', render: (p) => `฿${Number(p.amount).toLocaleString()}` },
          { key: 'method', label: 'วิธีชำระ', render: (p) => methodLabels[p.method] ?? p.method },
          { key: 'reference', label: 'อ้างอิง' },
          { key: 'invoice_status', label: 'สถานะ IV', render: (p) => (
            <span className={`px-2 py-0.5 rounded-full text-xs ${p.invoice_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {p.invoice_status === 'paid' ? 'ชำระครบ' : 'ยังไม่ครบ'}
            </span>
          )},
        ]}
        data={data}
        getId={(p) => p.id}
        searchPlaceholder="ค้นหาการชำระเงิน..."
        onAdd={openAdd}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="บันทึกรับชำระเงิน">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลือกใบแจ้งหนี้</label>
            <select required value={formInvId} onChange={(e) => { setFormInvId(Number(e.target.value)); const iv = invoices.find((x) => x.id === Number(e.target.value)); if (iv) setFormAmount(String(iv.total_amount)); }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="">-- เลือก Invoice --</option>
              {invoices.map((iv) => <option key={iv.id} value={iv.id}>{iv.invoice_number} — {iv.customer_name} (฿{Number(iv.total_amount).toLocaleString()})</option>)}
            </select>
            {selectedInv && <p className="text-xs text-gray-400 mt-1">ยอด: ฿{Number(selectedInv.total_amount).toLocaleString()}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท)</label>
            <input type="number" step="0.01" required value={formAmount} onChange={(e) => setFormAmount(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">วิธีชำระ</label>
            <select value={formMethod} onChange={(e) => setFormMethod(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="cash">เงินสด</option>
              <option value="transfer">โอน</option>
              <option value="cheque">เช็ค</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
            <input value={formRef} onChange={(e) => setFormRef(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="เลขอ้างอิง / หมายเลขเช็ค" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">บันทึก</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
