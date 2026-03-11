import { useState, useEffect } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface SalesOrder { id: number; order_number: string; customer_name?: string; status: string; }
interface DeliveryNote {
  id: number;
  dn_number: string;
  sales_order_id: number;
  so_order_number?: string;
  customer_name?: string;
  status: string;
  items: { product_name?: string; quantity: number }[];
}

const statusCfg: Record<string, { label: string; color: string }> = {
  draft: { label: 'ร่าง', color: 'bg-gray-100 text-gray-700' },
  shipped: { label: 'จัดส่งแล้ว', color: 'bg-yellow-100 text-yellow-700' },
  delivered: { label: 'ส่งถึงแล้ว', color: 'bg-green-100 text-green-700' },
};

export default function DeliveryNotePage() {
  const [data, setData] = useState<DeliveryNote[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formSOId, setFormSOId] = useState<number | ''>('');
  const [actionTarget, setActionTarget] = useState<{ dn: DeliveryNote; action: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [dns, sos] = await Promise.all([
        api.get<DeliveryNote[]>('/delivery-notes').catch(() => []),
        api.get<SalesOrder[]>('/sales-orders').catch(() => []),
      ]);
      setData(dns); setOrders(sos.filter((o) => o.status === 'confirmed'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!formSOId) return;
    await api.post('/delivery-notes', { sales_order_id: Number(formSOId) });
    setModalOpen(false); load();
  };

  const handleAction = async () => {
    if (!actionTarget) return;
    const { dn, action } = actionTarget;
    await api.put(`/delivery-notes/${dn.id}/${action}`, {});
    setActionTarget(null); load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">🚚 ใบส่งของ (Delivery Note)</h1>
      <DataTable
        columns={[
          { key: 'dn_number', label: 'เลขที่' },
          { key: 'so_order_number', label: 'อ้างอิง SO' },
          { key: 'customer_name', label: 'ลูกค้า' },
          { key: 'items', label: 'รายการ', render: (d) => `${d.items?.length ?? 0} รายการ` },
          { key: 'status', label: 'สถานะ', render: (d) => {
            const cfg = statusCfg[d.status] ?? statusCfg.draft;
            return <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.color}`}>{cfg.label}</span>;
          }},
          { key: 'actions', label: '', render: (d) => (
            <div className="flex gap-1">
              {d.status === 'draft' && (
                <button onClick={() => setActionTarget({ dn: d, action: 'ship' })}
                  className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100">จัดส่ง</button>
              )}
              {d.status === 'shipped' && (
                <button onClick={() => setActionTarget({ dn: d, action: 'deliver' })}
                  className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">ส่งถึงแล้ว</button>
              )}
            </div>
          )},
        ]}
        data={data}
        getId={(d) => d.id}
        searchPlaceholder="ค้นหาใบส่งของ..."
        onAdd={() => setModalOpen(true)}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="สร้างใบส่งของจาก SO">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลือกใบสั่งขาย</label>
            <select value={formSOId} onChange={(e) => setFormSOId(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="">-- เลือก SO --</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button onClick={handleCreate} disabled={!formSOId} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">สร้าง</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!actionTarget}
        message={actionTarget?.action === 'ship' ? `ยืนยันจัดส่ง "${actionTarget?.dn.dn_number}"?` : `ยืนยันว่า "${actionTarget?.dn.dn_number}" ส่งถึงแล้ว?`}
        onConfirm={handleAction} onCancel={() => setActionTarget(null)} />
    </div>
  );
}
