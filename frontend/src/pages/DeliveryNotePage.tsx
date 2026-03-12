import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import ConfirmDialog from '../components/ConfirmDialog';

interface SalesOrder {
  id: number; order_number: string; customer_name?: string; customer_id?: number;
  status: string; items?: SOItem[];
}
interface SOItem {
  product_name?: string; product_id?: number; item_code?: string;
  quantity: number; unit_price?: number; uom?: string; weight?: number;
}
interface DNItem {
  product_name?: string; product_id?: number; item_code?: string;
  quantity: number; uom: string; weight: number;
}
interface DeliveryNote {
  id: number;
  dn_number: string;
  sales_order_id: number;
  so_order_number?: string;
  customer_name?: string;
  status: string;
  delivery_date?: string;
  driver_name?: string;
  vehicle_no?: string;
  notes?: string;
  items: DNItem[];
  created_at?: string;
}

const statusCfg: Record<string, { label: string; color: string }> = {
  draft: { label: 'ร่าง', color: 'bg-gray-100 text-gray-700' },
  shipped: { label: 'จัดส่งแล้ว', color: 'bg-yellow-100 text-yellow-700' },
  delivered: { label: 'ส่งถึงแล้ว', color: 'bg-green-100 text-green-700' },
};

const InputField = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '' }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; disabled?: boolean; placeholder?: string;
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50" />
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
    <h3 className="text-sm font-semibold text-gray-700 mb-4 border-b pb-2">{title}</h3>
    {children}
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = statusCfg[status] ?? statusCfg.draft;
  return <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.color}`}>{cfg.label}</span>;
};

const MOCK_DNS: DeliveryNote[] = [
  { id: 1, dn_number: 'DN-2026-0001', sales_order_id: 1, so_order_number: 'SO-2026-0010', customer_name: 'บริษัท ทดสอบ จำกัด', status: 'draft', delivery_date: '2026-03-15', items: [{ product_name: 'สินค้า A', quantity: 10, uom: 'Pcs.', weight: 5 }] },
  { id: 2, dn_number: 'DN-2026-0002', sales_order_id: 2, so_order_number: 'SO-2026-0011', customer_name: 'ร้านค้าตัวอย่าง', status: 'shipped', delivery_date: '2026-03-12', driver_name: 'สมชาย', vehicle_no: 'กท-1234', items: [{ product_name: 'สินค้า B', quantity: 5, uom: 'Kg', weight: 5 }] },
];

export default function DeliveryNotePage() {
  const [data, setData] = useState<DeliveryNote[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [viewDN, setViewDN] = useState<DeliveryNote | null>(null);
  const [actionTarget, setActionTarget] = useState<{ dn: DeliveryNote; action: string } | null>(null);

  const [formSOId, setFormSOId] = useState<number | ''>('');
  const [formDeliveryDate, setFormDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDriverName, setFormDriverName] = useState('');
  const [formVehicleNo, setFormVehicleNo] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<DNItem[]>([]);
  const [selectedSOLabel, setSelectedSOLabel] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [dns, sos] = await Promise.all([
        api.get<DeliveryNote[]>('/delivery-notes').catch(() => MOCK_DNS),
        api.get<SalesOrder[]>('/sales-orders').catch(() => []),
      ]);
      setData(dns);
      setOrders(sos.filter((o) => o.status === 'confirmed'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onSOChange = async (soId: number) => {
    setFormSOId(soId);
    const so = orders.find((o) => o.id === soId);
    if (!so) { setFormItems([]); setSelectedSOLabel(''); return; }
    setSelectedSOLabel(`${so.order_number} — ${so.customer_name || ''}`);
    try {
      const detail = await api.get<SalesOrder>(`/sales-orders/${soId}`);
      if (detail.items) {
        setFormItems(detail.items.map((it) => ({
          product_name: it.product_name || '', product_id: it.product_id,
          item_code: it.item_code, quantity: it.quantity,
          uom: it.uom || 'Pcs.', weight: it.weight || 0,
        })));
      }
    } catch {
      setFormItems([{ product_name: 'สินค้า', quantity: 1, uom: 'Pcs.', weight: 0 }]);
    }
  };

  const updateItem = (i: number, field: keyof DNItem, val: string | number) => {
    const next = [...formItems];
    (next[i] as unknown as Record<string, unknown>)[field] = val;
    setFormItems(next);
  };

  const openAdd = () => {
    setFormSOId(''); setFormDeliveryDate(new Date().toISOString().split('T')[0]);
    setFormDriverName(''); setFormVehicleNo(''); setFormNotes('');
    setFormItems([]); setSelectedSOLabel('');
    setFormOpen(true);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!formSOId) return;
    await api.post('/delivery-notes', {
      sales_order_id: Number(formSOId),
      delivery_date: formDeliveryDate || null,
      driver_name: formDriverName || null,
      vehicle_no: formVehicleNo || null,
      notes: formNotes || null,
      items: formItems.map((it) => ({
        product_id: it.product_id, item_code: it.item_code,
        quantity: Number(it.quantity), uom: it.uom, weight: Number(it.weight),
      })),
    });
    setFormOpen(false); load();
  };

  const handleAction = async () => {
    if (!actionTarget) return;
    const { dn, action } = actionTarget;
    await api.put(`/delivery-notes/${dn.id}/${action}`, {});
    setActionTarget(null); load();
  };

  const handlePrint = (dnId: number) => {
    window.open(`/api/delivery-notes/${dnId}/print`, '_blank');
  };

  const totalWeight = (items: DNItem[]) => items.reduce((s, it) => s + (it.weight || 0), 0);
  const totalQty = (items: DNItem[]) => items.reduce((s, it) => s + it.quantity, 0);

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  if (formOpen) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">สร้างใบส่งของ</h1>
          <button onClick={() => setFormOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">กลับรายการ</button>
        </div>
        <form onSubmit={handleCreate}>
          <Section title="เลือกใบสั่งขาย">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">ใบสั่งขาย (SO)</label>
                <select required value={formSOId} onChange={(e) => onSOChange(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">-- เลือก SO --</option>
                  {orders.map((o) => <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name}</option>)}
                </select>
              </div>
              {selectedSOLabel && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-500">อ้างอิง: <strong className="text-gray-700">{selectedSOLabel}</strong></span>
                </div>
              )}
            </div>
          </Section>

          <Section title="ข้อมูลจัดส่ง">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField label="วันที่จัดส่ง" value={formDeliveryDate} onChange={setFormDeliveryDate} type="date" />
              <InputField label="ชื่อคนขับ" value={formDriverName} onChange={setFormDriverName} placeholder="ชื่อคนขับรถ" />
              <InputField label="ทะเบียนรถ" value={formVehicleNo} onChange={setFormVehicleNo} placeholder="เช่น กท-1234" />
            </div>
          </Section>

          {formItems.length > 0 && (
            <Section title="รายการสินค้า">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="pb-2 pr-2">#</th>
                      <th className="pb-2 pr-2">สินค้า</th>
                      <th className="pb-2 pr-2 text-right">จำนวน</th>
                      <th className="pb-2 pr-2">หน่วย</th>
                      <th className="pb-2 pr-2 text-right">น้ำหนัก (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formItems.map((item, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                        <td className="py-2 pr-2 text-gray-700">{item.product_name || item.item_code || '-'}</td>
                        <td className="py-2 pr-2">
                          <input type="number" min="0" step="0.01" value={item.quantity}
                            onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                            className="w-20 px-2 py-1 border rounded text-sm text-right" />
                        </td>
                        <td className="py-2 pr-2">
                          <input value={item.uom} onChange={(e) => updateItem(i, 'uom', e.target.value)}
                            className="w-16 px-2 py-1 border rounded text-sm" />
                        </td>
                        <td className="py-2 pr-2">
                          <input type="number" step="0.01" value={item.weight}
                            onChange={(e) => updateItem(i, 'weight', Number(e.target.value))}
                            className="w-20 px-2 py-1 border rounded text-sm text-right" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 bg-gray-50 rounded-lg p-3 flex gap-6 text-sm">
                <div><span className="text-gray-500">รวมจำนวน:</span> <strong>{totalQty(formItems).toLocaleString()}</strong></div>
                <div><span className="text-gray-500">รวมน้ำหนัก:</span> <strong>{totalWeight(formItems).toLocaleString()} kg</strong></div>
              </div>
            </Section>
          )}

          <Section title="หมายเหตุ">
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="หมายเหตุเพิ่มเติม..." />
          </Section>

          <div className="flex justify-end gap-3 mb-8">
            <button type="button" onClick={() => setFormOpen(false)}
              className="px-6 py-2.5 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" disabled={!formSOId}
              className="px-6 py-2.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium disabled:opacity-50">
              สร้างใบส่งของ
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">ใบส่งของ (Delivery Note)</h1>
      <DataTable
        columns={[
          { key: 'dn_number', label: 'เลขที่' },
          { key: 'so_order_number', label: 'อ้างอิง SO' },
          { key: 'customer_name', label: 'ลูกค้า' },
          { key: 'delivery_date', label: 'วันจัดส่ง', render: (d) => d.delivery_date?.slice(0, 10) || '-' },
          { key: 'items', label: 'รายการ', render: (d) => `${d.items?.length ?? 0} รายการ` },
          { key: 'status', label: 'สถานะ', render: (d) => <StatusBadge status={d.status} /> },
        ]}
        data={data}
        getId={(d) => d.id}
        searchPlaceholder="ค้นหาใบส่งของ..."
        onAdd={openAdd}
        onRowClick={(d) => setViewDN(d)}
        extraActions={(d) => (
          <div className="flex gap-1">
            <button onClick={() => setViewDN(d)}
              className="px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">ดูเพิ่ม</button>
            <button onClick={() => handlePrint(d.id)}
              className="px-2 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100">พิมพ์</button>
            {d.status === 'draft' && (
              <button onClick={() => setActionTarget({ dn: d, action: 'ship' })}
                className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100">จัดส่ง</button>
            )}
            {d.status === 'shipped' && (
              <button onClick={() => setActionTarget({ dn: d, action: 'deliver' })}
                className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">ส่งถึงแล้ว</button>
            )}
          </div>
        )}
      />

      {viewDN && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setViewDN(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold">{viewDN.dn_number}</h2>
                <StatusBadge status={viewDN.status} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => handlePrint(viewDN.id)} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">พิมพ์</button>
                <button onClick={() => setViewDN(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-500 mb-2">ข้อมูลทั่วไป</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">อ้างอิง SO:</span> {viewDN.so_order_number || '-'}</div>
                  <div><span className="text-gray-500">ลูกค้า:</span> {viewDN.customer_name || '-'}</div>
                  <div><span className="text-gray-500">วันจัดส่ง:</span> {viewDN.delivery_date?.slice(0, 10) || '-'}</div>
                  <div><span className="text-gray-500">สถานะ:</span> {statusCfg[viewDN.status]?.label || viewDN.status}</div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-500 mb-2">ข้อมูลจัดส่ง</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">คนขับ:</span> {viewDN.driver_name || '-'}</div>
                  <div><span className="text-gray-500">ทะเบียนรถ:</span> {viewDN.vehicle_no || '-'}</div>
                  {viewDN.notes && <div className="col-span-2"><span className="text-gray-500">หมายเหตุ:</span> {viewDN.notes}</div>}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-500 mb-2">รายการสินค้า</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="pb-2 pr-2">#</th>
                      <th className="pb-2 pr-2">สินค้า</th>
                      <th className="pb-2 pr-2 text-right">จำนวน</th>
                      <th className="pb-2 pr-2">หน่วย</th>
                      <th className="pb-2 pr-2 text-right">น้ำหนัก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewDN.items?.map((it, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2 text-gray-400">{i + 1}</td>
                        <td className="py-1.5 pr-2">{it.product_name || '-'}</td>
                        <td className="py-1.5 pr-2 text-right">{it.quantity}</td>
                        <td className="py-1.5 pr-2">{it.uom}</td>
                        <td className="py-1.5 pr-2 text-right">{it.weight} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 text-sm text-gray-500">
                  รวม: {totalQty(viewDN.items || [])} ชิ้น / {totalWeight(viewDN.items || [])} kg
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!actionTarget}
        message={actionTarget?.action === 'ship' ? `ยืนยันจัดส่ง "${actionTarget?.dn.dn_number}"?` : `ยืนยันว่า "${actionTarget?.dn.dn_number}" ส่งถึงแล้ว?`}
        onConfirm={handleAction} onCancel={() => setActionTarget(null)} />
    </div>
  );
}
