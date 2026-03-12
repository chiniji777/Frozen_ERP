import { useState, useEffect } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import PrintMenu from '../components/PrintMenu';

interface Payment { id: number; invoice_number?: string; customer_name?: string; amount: number; method: string; }
interface Receipt {
  id: number;
  receipt_number: string;
  payment_id: number;
  customer_name?: string;
  amount: number;
  method?: string;
  created_at?: string;
}

export default function ReceiptPage() {
  const [data, setData] = useState<Receipt[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formPayId, setFormPayId] = useState<number | ''>('');

  const load = async () => {
    setLoading(true);
    try {
      const [recs, pays] = await Promise.all([
        api.get<Receipt[]>('/receipts').catch(() => []),
        api.get<Payment[]>('/payments').catch(() => []),
      ]);
      setData(recs); setPayments(pays);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!formPayId) return;
    await api.post('/receipts', { payment_id: Number(formPayId) });
    setModalOpen(false); load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">🧾 ใบเสร็จรับเงิน</h1>
      <DataTable
        columns={[
          { key: 'receipt_number', label: 'เลขที่' },
          { key: 'customer_name', label: 'ลูกค้า' },
          { key: 'amount', label: 'จำนวนเงิน', render: (r) => `฿${Number(r.amount).toLocaleString()}` },
          { key: 'created_at', label: 'วันที่', render: (r) => r.created_at?.slice(0, 10) || '-' },
          { key: 'actions', label: '', render: (r) => (
            <PrintMenu options={[{ label: 'ใบเสร็จรับเงิน', icon: '🧾', path: `/receipts/${r.id}/print` }]} />
          )},
        ]}
        data={data}
        getId={(r) => r.id}
        searchPlaceholder="ค้นหาใบเสร็จ..."
        onAdd={() => { setFormPayId(''); setModalOpen(true); }}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="สร้างใบเสร็จจาก Payment">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลือก Payment</label>
            <select value={formPayId} onChange={(e) => setFormPayId(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="">-- เลือก Payment --</option>
              {payments.map((p) => <option key={p.id} value={p.id}>#{p.id} — {p.invoice_number} — ฿{Number(p.amount).toLocaleString()}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button onClick={handleCreate} disabled={!formPayId} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">สร้าง</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
