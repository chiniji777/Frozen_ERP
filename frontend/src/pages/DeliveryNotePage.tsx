import { useState, useEffect, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import ConfirmDialog from '../components/ConfirmDialog';
import PrintMenu from '../components/PrintMenu';

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
interface DeliveryPhoto {
  id: number; photoUrl: string; latitude?: number; longitude?: number;
  takenAt?: string; notes?: string;
}
interface DeliveryConfirmation {
  id: number; signatureUrl?: string; latitude?: number; longitude?: number;
  confirmedAt?: string;
}
interface DeliveryNote {
  id: number; dn_number: string; sales_order_id: number; sales_order_ids?: string;
  so_order_number?: string; customer_name?: string; status: string;
  delivery_date?: string; driver_name?: string; driver_phone?: string;
  vehicle_no?: string; pickup_point?: string; notes?: string;
  items: DNItem[]; created_at?: string;
  delivery_photos?: DeliveryPhoto[];
  delivery_confirmations?: DeliveryConfirmation[];
}

const statusCfg: Record<string, { label: string; color: string; next?: string; nextLabel?: string; nextColor?: string }> = {
  draft: { label: 'ร่าง', color: 'bg-gray-100 text-gray-700', next: 'ship', nextLabel: '📦 จัดส่ง', nextColor: 'bg-yellow-600 hover:bg-yellow-700' },
  shipped: { label: 'จัดส่งแล้ว', color: 'bg-yellow-100 text-yellow-700', next: 'deliver', nextLabel: '✅ ส่งถึงแล้ว', nextColor: 'bg-green-600 hover:bg-green-700' },
  delivered: { label: 'ส่งถึงแล้ว', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700' },
};


const InputField = ({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string;
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
    <h3 className="text-sm font-semibold text-gray-700 mb-4 border-b pb-2">{title}</h3>
    {children}
  </div>
);

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start py-1.5">
    <span className="text-xs text-gray-500 w-32 shrink-0">{label}</span>
    <span className="text-sm text-gray-800">{value || '-'}</span>
  </div>
);

export default function DeliveryNotePage() {
  const [data, setData] = useState<DeliveryNote[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [detailDN, setDetailDN] = useState<DeliveryNote | null>(null);
  const [actionTarget, setActionTarget] = useState<{ dn: DeliveryNote; action: string } | null>(null);
  const [toast, setToast] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  // Reset to list view when sidebar re-navigates to this page
  useEffect(() => {
    setDetailDN(null);
    setFormOpen(false);
  }, [location.key]);

  const [formSOIds, setFormSOIds] = useState<number[]>([]);
  const [formDeliveryDate, setFormDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDriverName, setFormDriverName] = useState('');
  const [formDriverPhone, setFormDriverPhone] = useState('');
  const [formVehicleNo, setFormVehicleNo] = useState('');
  const [formPickupPoint, setFormPickupPoint] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<DNItem[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [dns, sos] = await Promise.all([
        api.get<DeliveryNote[]>('/delivery-notes').catch(() => []),
        api.get<SalesOrder[]>('/sales-orders').catch(() => []),
      ]);
      setData(dns);
      setOrders(sos.filter((o) => o.status === 'confirmed'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  // Handle ?openId= param: auto-open detail view for a specific DN
  const [openIdHandled, setOpenIdHandled] = useState(false);
  useEffect(() => {
    if (loading || openIdHandled) return;
    const params = new URLSearchParams(location.search);
    const openId = params.get('openId');
    if (!openId) return;
    setOpenIdHandled(true);
    (async () => {
      try {
        const dn = await api.get<DeliveryNote>(`/delivery-notes/${Number(openId)}`);
        setDetailDN(dn);
        setFormOpen(false);
      } catch { /* ignore */ }
      navigate('/delivery-notes', { replace: true });
    })();
  }, [loading, openIdHandled, location.search]);

  const toggleSO = async (soId: number) => {
    const newIds = formSOIds.includes(soId) ? formSOIds.filter((id) => id !== soId) : [...formSOIds, soId];
    setFormSOIds(newIds);
    const allItems: DNItem[] = [];
    for (const id of newIds) {
      try {
        const detail = await api.get<SalesOrder>(`/sales-orders/${id}`);
        if (detail.items) {
          allItems.push(...detail.items.map((it) => ({
            product_name: it.product_name || '', product_id: it.product_id,
            item_code: it.item_code, quantity: it.quantity,
            uom: it.uom || 'Pcs.', weight: it.weight || 0,
          })));
        }
      } catch { /* skip */ }
    }
    setFormItems(allItems);
  };

  const updateItem = (i: number, field: keyof DNItem, val: string | number) => {
    const next = [...formItems];
    (next[i] as unknown as Record<string, unknown>)[field] = val;
    setFormItems(next);
  };

  const openAdd = () => {
    setFormSOIds([]); setFormDeliveryDate(new Date().toISOString().split('T')[0]);
    setFormDriverName(''); setFormDriverPhone(''); setFormVehicleNo('');
    setFormPickupPoint(''); setFormNotes(''); setFormItems([]);
    setDetailDN(null); setFormOpen(true);
  };

  const handleDuplicate = async (dn: DeliveryNote) => {
    const full = await api.get<DeliveryNote>(`/delivery-notes/${dn.id}`).catch(() => dn);
    setFormSOIds(full.sales_order_ids ? (typeof full.sales_order_ids === 'string' ? JSON.parse(full.sales_order_ids) : full.sales_order_ids) : [full.sales_order_id].filter(Boolean));
    setFormDeliveryDate(new Date().toISOString().split('T')[0]);
    setFormDriverName((full as any).driverName || '');
    setFormDriverPhone((full as any).driverPhone || '');
    setFormVehicleNo((full as any).vehicleNo || '');
    setFormPickupPoint((full as any).pickupPoint || '');
    setFormNotes((full as any).notes || '');
    setFormItems(full.items?.map(i => ({ ...i, id: undefined })) || []);
    setDetailDN(null); setFormOpen(true);
  };

  const openDetail = async (dn: DeliveryNote) => {
    try { const d = await api.get<DeliveryNote>(`/delivery-notes/${dn.id}`); setDetailDN(d); } catch { setDetailDN(dn); }
    setFormOpen(false);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (formSOIds.length === 0) return;
    await api.post('/delivery-notes', {
      salesOrderIds: formSOIds, delivery_date: formDeliveryDate || null,
      driver_name: formDriverName || null, driverPhone: formDriverPhone || null,
      vehicle_no: formVehicleNo || null, pickupPoint: formPickupPoint || null, notes: formNotes || null,
      items: formItems.map((it) => ({ product_id: it.product_id, item_code: it.item_code, quantity: Number(it.quantity), uom: it.uom, weight: Number(it.weight) })),
    });
    setFormOpen(false); load();
  };

  const handleAction = async () => {
    if (!actionTarget) return;
    const { dn, action } = actionTarget;
    await api.post(`/delivery-notes/${dn.id}/${action}`, {});
    setActionTarget(null);
    setToast(action === 'ship' ? 'จัดส่งแล้ว' : action === 'deliver' ? 'ส่งถึงแล้ว' : 'ยกเลิกแล้ว');
    if (detailDN?.id === dn.id) { try { setDetailDN(await api.get<DeliveryNote>(`/delivery-notes/${dn.id}`)); } catch { /* */ } }
    load();
  };

  const getPrintOptions = (id: number) => [
    { label: 'ใบส่งของ (DN)', icon: '🚚', path: `/delivery-notes/${id}/print` },
  ];
  const tw = (items: DNItem[]) => items.reduce((s, it) => s + (it.weight || 0), 0);
  const tq = (items: DNItem[]) => items.reduce((s, it) => s + it.quantity, 0);

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  // ========== DETAIL VIEW ==========
  if (detailDN && !formOpen) {
    const dn = detailDN;
    const cfg = statusCfg[dn.status] ?? statusCfg.draft;
    const items = dn.items || [];
    return (
      <div className="max-w-4xl mx-auto min-h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetailDN(null)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-800">{dn.dn_number}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
          </div>
          <div className="flex gap-2">
            {cfg.next && (
              <button onClick={() => setActionTarget({ dn, action: cfg.next! })}
                className={`px-4 py-2 text-sm text-white rounded-lg ${cfg.nextColor}`}>{cfg.nextLabel}</button>
            )}
            {dn.status === 'draft' && (
              <button onClick={() => setActionTarget({ dn, action: 'cancel' })}
                className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">✕ ยกเลิก</button>
            )}
            {dn.status === 'delivered' && (
              <button onClick={() => navigate(`/invoices?fromDN=${dn.id}`)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">📄 สร้างใบแจ้งหนี้</button>
            )}
            <PrintMenu options={getPrintOptions(dn.id)} />
          </div>
        </div>

        {/* Status Flow — parallel confirmations after shipped */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
          <div className="flex items-center justify-center gap-2 text-sm">
            {/* Step 1: ร่าง */}
            <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${dn.status === 'draft' ? 'bg-gray-100 text-gray-700 ring-2 ring-offset-1 ring-indigo-300' : 'bg-green-100 text-green-700'}`}>
              {dn.status !== 'draft' ? '✓ ' : ''}ร่าง
            </div>
            <div className={`w-8 h-0.5 ${dn.status !== 'draft' ? 'bg-green-400' : 'bg-gray-200'}`} />
            {/* Step 2: จัดส่งแล้ว */}
            <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${dn.status === 'shipped' ? 'bg-yellow-100 text-yellow-700 ring-2 ring-offset-1 ring-indigo-300' : dn.status === 'delivered' || dn.status === 'cancelled' ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
              {['delivered'].includes(dn.status) ? '✓ ' : ''}จัดส่งแล้ว
            </div>
            <div className={`w-8 h-0.5 ${dn.status === 'delivered' ? 'bg-green-400' : 'bg-gray-200'}`} />
            {/* Step 3: Two parallel confirmations */}
            <div className="flex flex-col gap-1">
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${dn.status === 'delivered' ? 'bg-green-100 text-green-700 ring-2 ring-offset-1 ring-green-300' : 'bg-gray-50 text-gray-400'}`}>
                {dn.status === 'delivered' ? '✓ ' : ''}📦 ส่งถึงแล้ว
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${(dn.delivery_confirmations?.length ?? 0) > 0 ? 'bg-emerald-100 text-emerald-700 ring-2 ring-offset-1 ring-emerald-300' : 'bg-gray-50 text-gray-400'}`}>
                {(dn.delivery_confirmations?.length ?? 0) > 0 ? '✓ ' : ''}✍️ เซ็นต์รับแล้ว
              </div>
            </div>
          </div>
          {/* Success indicator */}
          {(dn.status === 'delivered' || dn.status === 'shipped' || (dn.delivery_confirmations?.length ?? 0) > 0) && dn.status !== 'draft' && dn.status !== 'cancelled' && (
            <div className="text-center mt-3 text-xs text-green-600 font-medium">
              {dn.status === 'delivered' || (dn.delivery_confirmations?.length ?? 0) > 0
                ? '✅ จัดส่งสำเร็จ'
                : '📦 อยู่ระหว่างจัดส่ง'}
            </div>
          )}
        </div>

        <Section title="ข้อมูลทั่วไป">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="อ้างอิง SO" value={dn.sales_order_id ? (
              <button onClick={() => navigate(`/sales-orders?openId=${dn.sales_order_id}`)} className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium">
                {dn.so_order_number || `SO #${dn.sales_order_id}`}
              </button>
            ) : dn.so_order_number} />
            <InfoRow label="ลูกค้า" value={<strong>{dn.customer_name}</strong>} />
            <InfoRow label="วันจัดส่ง" value={dn.delivery_date?.slice(0, 10)} />
            <InfoRow label="วันที่สร้าง" value={dn.created_at?.slice(0, 10)} />
          </div>
        </Section>

        <Section title="ข้อมูลจัดส่ง">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="ชื่อคนขับ" value={dn.driver_name} />
            <InfoRow label="เบอร์โทร" value={dn.driver_phone} />
            <InfoRow label="ทะเบียนรถ" value={dn.vehicle_no} />
            <InfoRow label="จุดรับสินค้า" value={dn.pickup_point} />
          </div>
        </Section>

        <Section title={`รายการสินค้า (${items.length})`}>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2 pr-2 w-8">#</th><th className="pb-2 pr-2">สินค้า</th>
              <th className="pb-2 pr-2 text-right">จำนวน</th><th className="pb-2 pr-2">หน่วย</th><th className="pb-2 text-right">น้ำหนัก</th>
            </tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-2.5 pr-2 text-gray-400">{i + 1}</td>
                  <td className="py-2.5 pr-2 font-medium">{it.product_name || '-'}</td>
                  <td className="py-2.5 pr-2 text-right">{it.quantity.toLocaleString()}</td>
                  <td className="py-2.5 pr-2">{it.uom}</td>
                  <td className="py-2.5 text-right">{it.weight} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 bg-gray-50 rounded-lg p-3 flex gap-6 text-sm">
            <div><span className="text-gray-500">รวม:</span> <strong>{tq(items).toLocaleString()}</strong></div>
            <div><span className="text-gray-500">น้ำหนัก:</span> <strong>{tw(items).toLocaleString()} kg</strong></div>
          </div>
        </Section>

        {dn.notes && <Section title="หมายเหตุ"><p className="text-sm text-gray-700 whitespace-pre-wrap">{dn.notes}</p></Section>}

        {/* Delivery Photos */}
        {(dn.delivery_photos?.length ?? 0) > 0 && (
          <Section title={`📸 รูปถ่ายส่งสินค้า (${dn.delivery_photos!.length})`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {dn.delivery_photos!.map((photo) => (
                <div key={photo.id} className="border border-gray-100 rounded-lg overflow-hidden">
                  <img src={photo.photoUrl} alt="delivery" className="w-full h-48 object-cover cursor-pointer hover:opacity-90"
                    onClick={() => window.open(photo.photoUrl, '_blank')} />
                  <div className="p-3 text-xs text-gray-500 space-y-1">
                    {photo.takenAt && <div>📅 {photo.takenAt.slice(0, 16).replace('T', ' ')}</div>}
                    {photo.latitude && photo.longitude && (
                      <div>📍 <a href={`https://www.google.com/maps?q=${photo.latitude},${photo.longitude}`}
                        target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                        {photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}
                      </a></div>
                    )}
                    {photo.notes && <div className="text-gray-600">💬 {photo.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Customer Confirmations / Signatures */}
        {(dn.delivery_confirmations?.length ?? 0) > 0 && (
          <Section title="✍️ ลายเซ็นต์ลูกค้า / ยืนยันรับสินค้า">
            <div className="space-y-4">
              {dn.delivery_confirmations!.map((conf) => (
                <div key={conf.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {conf.signatureUrl && (
                      <div className="flex-shrink-0">
                        <p className="text-xs text-gray-500 mb-2">ลายเซ็นต์:</p>
                        <img src={conf.signatureUrl} alt="customer signature"
                          className="border rounded-lg bg-white p-2 h-24 cursor-pointer hover:opacity-90"
                          onClick={() => window.open(conf.signatureUrl!, '_blank')} />
                      </div>
                    )}
                    <div className="text-xs text-gray-500 space-y-1.5 flex-grow">
                      {conf.confirmedAt && <div className="flex items-center gap-1">📅 ยืนยันเมื่อ: <span className="text-gray-700 font-medium">{conf.confirmedAt.slice(0, 16).replace('T', ' ')}</span></div>}
                      {conf.latitude && conf.longitude && (
                        <div className="flex items-center gap-1">📍 ตำแหน่ง: <a href={`https://www.google.com/maps?q=${conf.latitude},${conf.longitude}`}
                          target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                          {conf.latitude.toFixed(4)}, {conf.longitude.toFixed(4)}
                        </a></div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <ConfirmDialog open={!!actionTarget}
          message={actionTarget?.action === 'ship' ? `ยืนยันจัดส่ง "${actionTarget?.dn.dn_number}"?` : actionTarget?.action === 'cancel' ? `ยกเลิก "${actionTarget?.dn.dn_number}"?` : `ยืนยัน "${actionTarget?.dn.dn_number}" ส่งถึงแล้ว?`}
          onConfirm={handleAction} onCancel={() => setActionTarget(null)} />
        {toast && <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg">{toast}</div>}
      </div>
    );
  }

  // ========== CREATE FORM ==========
  if (formOpen) {
    return (
      <div className="max-w-4xl mx-auto min-h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">สร้างใบส่งของ</h1>
          <button onClick={() => setFormOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">← กลับรายการ</button>
        </div>
        <form onSubmit={handleCreate}>
          <Section title="เลือกใบสั่งขาย">
            <div className="max-h-[60vh] overflow-y-auto border rounded-lg p-2">
              {orders.length === 0 ? <p className="text-sm text-gray-400 py-2 text-center">ไม่มี SO ที่ confirmed</p> :
                orders.map((o) => (
                  <label key={o.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 ${formSOIds.includes(o.id) ? 'bg-indigo-50' : ''}`}>
                    <input type="checkbox" checked={formSOIds.includes(o.id)} onChange={() => toggleSO(o.id)} className="rounded" />
                    <span className="text-sm">{o.order_number} — {o.customer_name}</span>
                  </label>
                ))}
            </div>
          </Section>
          <Section title="ข้อมูลจัดส่ง">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField label="วันที่จัดส่ง" value={formDeliveryDate} onChange={setFormDeliveryDate} type="date" />
              <InputField label="ชื่อคนขับ" value={formDriverName} onChange={setFormDriverName} />
              <InputField label="เบอร์โทรคนขับ" value={formDriverPhone} onChange={setFormDriverPhone} />
              <InputField label="ทะเบียนรถ" value={formVehicleNo} onChange={setFormVehicleNo} />
              <InputField label="จุดรับสินค้า" value={formPickupPoint} onChange={setFormPickupPoint} />
            </div>
          </Section>
          {formItems.length > 0 && (
            <Section title="รายการสินค้า">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pr-2">#</th><th className="pb-2 pr-2">สินค้า</th>
                  <th className="pb-2 pr-2 text-right">จำนวน</th><th className="pb-2 pr-2">หน่วย</th><th className="pb-2 text-right">น้ำหนัก</th>
                </tr></thead>
                <tbody>
                  {formItems.map((item, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 pr-2">{item.product_name || '-'}</td>
                      <td className="py-2 pr-2"><input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))} className="w-20 px-2 py-1 border rounded text-sm text-right" /></td>
                      <td className="py-2 pr-2"><input value={item.uom} onChange={(e) => updateItem(i, 'uom', e.target.value)} className="w-16 px-2 py-1 border rounded text-sm" /></td>
                      <td className="py-2"><input type="number" step="0.01" value={item.weight} onChange={(e) => updateItem(i, 'weight', Number(e.target.value))} className="w-20 px-2 py-1 border rounded text-sm text-right" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
          <Section title="หมายเหตุ">
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </Section>
          <div className="flex justify-end gap-3 mb-8">
            <button type="button" onClick={() => setFormOpen(false)} className="px-6 py-2.5 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" disabled={formSOIds.length === 0} className="px-6 py-2.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">สร้างใบส่งของ</button>
          </div>
        </form>
      </div>
    );
  }

  // ========== LIST VIEW ==========
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">📦 ใบส่งของ (Delivery Note)</h1>
      <DataTable
        columns={[
          { key: 'dn_number', label: 'เลขที่', filterable: true },
          { key: 'so_order_number', label: 'อ้างอิง SO', filterable: true },
          { key: 'customer_name', label: 'ลูกค้า', filterable: true },
          { key: 'delivery_date', label: 'วันจัดส่ง', render: (d) => d.delivery_date?.slice(0, 10) || '-' },
          { key: 'items', label: 'รายการ', render: (d) => `${d.items?.length ?? 0} รายการ` },
          { key: 'status', label: 'สถานะ', filterable: true, render: (d) => {
            const c = statusCfg[d.status] ?? statusCfg.draft;
            return <span className={`px-2 py-0.5 rounded-full text-xs ${c.color}`}>{c.label}</span>;
          }},
        ]}
        data={data} getId={(d) => d.id} searchPlaceholder="ค้นหาใบส่งของ..."
        onAdd={openAdd} onRowClick={(d) => openDetail(d)}
        extraActions={(d) => (
          <div className="flex gap-1">
            <button onClick={(e) => { e.stopPropagation(); handleDuplicate(d); }} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">สำเนา</button>
            <PrintMenu options={getPrintOptions(d.id)} className="text-xs" />
          </div>
        )}
      />
      {toast && <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg">{toast}</div>}
    </div>
  );
}
