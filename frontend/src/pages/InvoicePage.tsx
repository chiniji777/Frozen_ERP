import { useState, useEffect } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface SalesOrder { id: number; order_number: string; customer_name?: string; status: string; }
interface Invoice {
  id: number;
  invoice_number: string;
  sales_order_id: number;
  so_order_number?: string;
  customer_name?: string;
  total_amount: number;
  status: string;
  due_date: string;
}

const statusCfg: Record<string, { label: string; color: string }> = {
  draft: { label: 'ร่าง', color: 'bg-gray-100 text-gray-700' },
  sent: { label: 'ส่งแล้ว', color: 'bg-blue-100 text-blue-700' },
  paid: { label: 'ชำระแล้ว', color: 'bg-green-100 text-green-700' },
  overdue: { label: 'เกินกำหนด', color: 'bg-red-100 text-red-700' },
};

export default function InvoicePage() {
  const [data, setData] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formSOId, setFormSOId] = useState<number | ''>('');
  const [formDueDate, setFormDueDate] = useState('');
  const [sendTarget, setSendTarget] = useState<Invoice | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [ivs, sos] = await Promise.all([
        api.get<Invoice[]>('/invoices').catch(() => []),
        api.get<SalesOrder[]>('/sales-orders').catch(() => []),
      ]);
      setData(ivs); setOrders(sos.filter((o) => o.status === 'confirmed' || o.status === 'delivered'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const isOverdue = (iv: Invoice) => iv.status !== 'paid' && new Date(iv.due_date) < new Date();

  const handleCreate = async () => {
    if (!formSOId) return;
    await api.post('/invoices', { sales_order_id: Number(formSOId), due_date: formDueDate || undefined });
    setModalOpen(false); load();
  };

  const handleSend = async () => {
    if (!sendTarget) return;
    await api.put(`/invoices/${sendTarget.id}/send`, {});
    setSendTarget(null); load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">📄 ใบแจ้งหนี้ (Invoice)</h1>
      <DataTable
        columns={[
          { key: 'invoice_number', label: 'เลขที่' },
          { key: 'customer_name', label: 'ลูกค้า' },
          { key: 'total_amount', label: 'ยอด', render: (iv) => `฿${Number(iv.total_amount).toLocaleString()}` },
          { key: 'due_date', label: 'ครบกำหนด', render: (iv) => (
            <span className={isOverdue(iv) ? 'text-red-600 font-semibold' : ''}>{iv.due_date?.slice(0, 10) || '-'}</span>
          )},
          { key: 'status', label: 'สถานะ', render: (iv) => {
            const s = isOverdue(iv) ? 'overdue' : iv.status;
            const cfg = statusCfg[s] ?? statusCfg.draft;
            return <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.color}`}>{cfg.label}</span>;
          }},
          { key: 'actions', label: '', render: (iv) => iv.status === 'draft' ? (
            <button onClick={() => setSendTarget(iv)} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">ส่งใบแจ้งหนี้</button>
          ) : null },
        ]}
        data={data}
        getId={(iv) => iv.id}
        searchPlaceholder="ค้นหาใบแจ้งหนี้..."
        onAdd={() => { setFormSOId(''); setFormDueDate(''); setModalOpen(true); }}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="สร้างใบแจ้งหนี้จาก SO">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลือกใบสั่งขาย</label>
            <select value={formSOId} onChange={(e) => setFormSOId(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="">-- เลือก SO --</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">วันครบกำหนดชำระ</label>
            <input type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button onClick={handleCreate} disabled={!formSOId} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">สร้าง</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!sendTarget} message={`ส่งใบแจ้งหนี้ "${sendTarget?.invoice_number}" ให้ลูกค้า?`}
        onConfirm={handleSend} onCancel={() => setSendTarget(null)} />
    </div>
  );
}
