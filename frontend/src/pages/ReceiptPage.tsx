import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';

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
  const [printTarget, setPrintTarget] = useState<Receipt | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [companyName, setCompanyName] = useState('Nut Office ERP');

  const load = async () => {
    setLoading(true);
    try {
      const [recs, pays, settings] = await Promise.all([
        api.get<Receipt[]>('/receipts').catch(() => []),
        api.get<Payment[]>('/payments').catch(() => []),
        api.get<{ companyName?: string }>('/settings').catch(() => ({})),
      ]);
      setData(recs); setPayments(pays);
      if (settings.companyName) setCompanyName(settings.companyName);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!formPayId) return;
    await api.post('/receipts', { payment_id: Number(formPayId) });
    setModalOpen(false); load();
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>ใบเสร็จ</title><style>body{font-family:sans-serif;padding:40px;max-width:600px;margin:auto}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}.header{text-align:center;margin-bottom:20px}.total{font-size:1.2em;font-weight:bold}@media print{button{display:none}}</style></head><body>`);
    w.document.write(printRef.current.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.print();
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
            <button onClick={() => setPrintTarget(r)} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">พิมพ์</button>
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

      <Modal open={!!printTarget} onClose={() => setPrintTarget(null)} title="ใบเสร็จรับเงิน">
        <div ref={printRef}>
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold">🏢 {companyName}</h2>
            <p className="text-gray-500 text-sm">ใบเสร็จรับเงิน</p>
          </div>
          <table className="w-full text-sm mb-4">
            <tbody>
              <tr><td className="text-gray-500 py-1">เลขที่</td><td className="font-medium">{printTarget?.receipt_number}</td></tr>
              <tr><td className="text-gray-500 py-1">ลูกค้า</td><td>{printTarget?.customer_name || '-'}</td></tr>
              <tr><td className="text-gray-500 py-1">วันที่</td><td>{printTarget?.created_at?.slice(0, 10) || '-'}</td></tr>
              <tr><td className="text-gray-500 py-1">วิธีชำระ</td><td>{printTarget?.method || '-'}</td></tr>
            </tbody>
          </table>
          <div className="border-t pt-3 text-right">
            <span className="text-lg font-bold">฿{Number(printTarget?.amount ?? 0).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={handlePrint} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">พิมพ์ / Export</button>
        </div>
      </Modal>
    </div>
  );
}
