import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import ConfirmDialog from '../components/ConfirmDialog';

interface SalesOrder {
  id: number; order_number: string; customer_name?: string; customer_id?: number;
  status: string; total_amount?: number; items?: SOItem[];
}
interface DeliveryNote {
  id: number; dn_number: string; sales_order_id: number; so_order_number?: string;
  customer_name?: string; status: string;
}
interface SOItem {
  product_name?: string; product_id?: number; item_code?: string;
  quantity: number; unit_price: number; uom?: string; weight?: number;
}
interface InvoiceItem {
  product_name?: string; product_id?: number; item_code?: string;
  quantity: number; unit_price: number; uom: string; amount: number;
}
interface Invoice {
  id: number;
  invoice_number: string;
  sales_order_id?: number;
  delivery_note_id?: number;
  so_order_number?: string;
  dn_number?: string;
  customer_name?: string;
  billing_company?: string;
  billing_address?: string;
  billing_tax_id?: string;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  status: string;
  due_date: string;
  notes?: string;
  items: InvoiceItem[];
  created_at?: string;
}

type InvoiceSource = 'so' | 'dn' | 'multi';

const statusCfg: Record<string, { label: string; color: string; next?: string; nextLabel?: string; nextColor?: string }> = {
  draft: { label: 'ร่าง', color: 'bg-gray-100 text-gray-700', next: 'send', nextLabel: '📧 ส่งใบแจ้งหนี้', nextColor: 'bg-blue-600 hover:bg-blue-700' },
  sent: { label: 'ส่งแล้ว', color: 'bg-blue-100 text-blue-700', next: 'pay', nextLabel: '💰 ชำระแล้ว', nextColor: 'bg-green-600 hover:bg-green-700' },
  paid: { label: 'ชำระแล้ว', color: 'bg-green-100 text-green-700' },
  overdue: { label: 'เกินกำหนด', color: 'bg-red-100 text-red-700', next: 'pay', nextLabel: '💰 ชำระแล้ว', nextColor: 'bg-green-600 hover:bg-green-700' },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700' },
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

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start py-1.5">
    <span className="text-xs text-gray-500 w-32 shrink-0">{label}</span>
    <span className="text-sm text-gray-800">{value || '-'}</span>
  </div>
);

export default function InvoicePage() {
  const [data, setData] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [dns, setDns] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [detailInv, setDetailInv] = useState<Invoice | null>(null);
  const [actionTarget, setActionTarget] = useState<{ inv: Invoice; action: string } | null>(null);
  const [toast, setToast] = useState('');

  const [formSource, setFormSource] = useState<InvoiceSource>('so');
  const [formSOId, setFormSOId] = useState<number | ''>('');
  const [formDNId, setFormDNId] = useState<number | ''>('');
  const [formMultiSOIds, setFormMultiSOIds] = useState<number[]>([]);
  const [formDueDate, setFormDueDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<InvoiceItem[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [ivs, sos, dnList] = await Promise.all([
        api.get<Invoice[]>('/invoices').catch(() => []),
        api.get<SalesOrder[]>('/sales-orders').catch(() => []),
        api.get<DeliveryNote[]>('/delivery-notes').catch(() => []),
      ]);
      setData(ivs);
      setOrders(sos.filter((o) => o.status === 'confirmed' || o.status === 'delivered'));
      setDns(dnList.filter((d) => d.status === 'delivered'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  const isOverdue = (iv: Invoice) => iv.status !== 'paid' && iv.status !== 'cancelled' && iv.due_date && new Date(iv.due_date) < new Date();
  const effectiveStatus = (iv: Invoice) => isOverdue(iv) ? 'overdue' : iv.status;

  const loadSOItems = async (soId: number): Promise<InvoiceItem[]> => {
    try {
      const detail = await api.get<SalesOrder>(`/sales-orders/${soId}`);
      if (detail.items) {
        return detail.items.map((it) => ({
          product_name: it.product_name || '', product_id: it.product_id,
          item_code: it.item_code, quantity: it.quantity,
          unit_price: it.unit_price, uom: it.uom || 'Pcs.',
          amount: it.quantity * it.unit_price,
        }));
      }
    } catch { /* fallback */ }
    return [];
  };

  const onSOChange = async (soId: number) => {
    setFormSOId(soId);
    if (soId) {
      const items = await loadSOItems(soId);
      setFormItems(items);
    }
  };

  const onDNChange = (dnId: number) => {
    setFormDNId(dnId);
    setFormItems([]);
  };

  const toggleMultiSO = async (soId: number) => {
    const next = formMultiSOIds.includes(soId)
      ? formMultiSOIds.filter((id) => id !== soId)
      : [...formMultiSOIds, soId];
    setFormMultiSOIds(next);
    const allItems: InvoiceItem[] = [];
    for (const id of next) {
      const items = await loadSOItems(id);
      allItems.push(...items);
    }
    setFormItems(allItems);
  };

  const subtotal = formItems.reduce((s, it) => s + it.amount, 0);
  const vatAmount = Math.round(subtotal * 7) / 100;
  const grandTotal = subtotal + vatAmount;

  const openAdd = () => {
    setFormSource('so'); setFormSOId(''); setFormDNId('');
    setFormMultiSOIds([]); setFormDueDate(''); setFormNotes('');
    setFormItems([]);
    setDetailInv(null); setFormOpen(true);
  };

  const openDetail = async (iv: Invoice) => {
    try { const d = await api.get<Invoice>(`/invoices/${iv.id}`); setDetailInv(d); } catch { setDetailInv(iv); }
    setFormOpen(false);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      due_date: formDueDate || null,
      notes: formNotes || null,
      items: formItems.map((it) => ({
        product_id: it.product_id, item_code: it.item_code,
        quantity: Number(it.quantity), unit_price: Number(it.unit_price),
        uom: it.uom, amount: Number(it.amount),
      })),
    };
    if (formSource === 'so' && formSOId) payload.salesOrderId = Number(formSOId);
    if (formSource === 'dn' && formDNId) payload.deliveryNoteId = Number(formDNId);
    if (formSource === 'multi' && formMultiSOIds.length) payload.salesOrderIds = formMultiSOIds;
    await api.post('/invoices', payload);
    setFormOpen(false); load();
  };

  const handleAction = async () => {
    if (!actionTarget) return;
    const { inv, action } = actionTarget;
    await api.post(`/invoices/${inv.id}/${action}`, {});
    setActionTarget(null);
    setToast(action === 'send' ? 'ส่งใบแจ้งหนี้แล้ว' : action === 'pay' ? 'บันทึกชำระเงินแล้ว' : 'ยกเลิกแล้ว');
    if (detailInv?.id === inv.id) { try { setDetailInv(await api.get<Invoice>(`/invoices/${inv.id}`)); } catch { /* */ } }
    load();
  };

  const handlePrint = (id: number) => { window.open(`/api/invoices/${id}/print`, '_blank'); };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  // ========== DETAIL VIEW ==========
  if (detailInv && !formOpen) {
    const iv = detailInv;
    const status = effectiveStatus(iv);
    const cfg = statusCfg[status] ?? statusCfg.draft;
    const items = iv.items || [];

    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetailInv(null)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-800">{iv.invoice_number}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
          </div>
          <div className="flex gap-2">
            {cfg.next && (
              <button onClick={() => setActionTarget({ inv: iv, action: cfg.next! })}
                className={`px-4 py-2 text-sm text-white rounded-lg ${cfg.nextColor}`}>{cfg.nextLabel}</button>
            )}
            {(iv.status === 'draft') && (
              <button onClick={() => setActionTarget({ inv: iv, action: 'cancel' })}
                className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">✕ ยกเลิก</button>
            )}
            <button onClick={() => handlePrint(iv.id)} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">🖨️ พิมพ์</button>
          </div>
        </div>

        {/* Status Flow */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
          <div className="flex items-center justify-center gap-2 text-sm">
            {['draft', 'sent', 'paid'].map((s, i) => {
              const sc = statusCfg[s]!;
              const statusOrder = ['draft', 'sent', 'paid'];
              const currentIdx = statusOrder.indexOf(iv.status === 'overdue' ? 'sent' : iv.status);
              const isActive = s === (iv.status === 'overdue' ? 'sent' : iv.status);
              const isPast = currentIdx > i;
              return (
                <div key={s} className="flex items-center gap-2">
                  {i > 0 && <div className={`w-8 h-0.5 ${isPast ? 'bg-green-400' : 'bg-gray-200'}`} />}
                  <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${isActive ? (status === 'overdue' && s === 'sent' ? 'bg-red-100 text-red-700 ring-2 ring-offset-1 ring-red-300' : sc.color + ' ring-2 ring-offset-1 ring-indigo-300') : isPast ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                    {isPast && !isActive ? '✓ ' : ''}{s === 'sent' && status === 'overdue' ? 'เกินกำหนด' : sc.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Section title="ข้อมูลทั่วไป">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="ลูกค้า" value={<strong>{iv.customer_name}</strong>} />
            <InfoRow label="อ้างอิง SO" value={iv.so_order_number} />
            {iv.dn_number && <InfoRow label="อ้างอิง DN" value={iv.dn_number} />}
            <InfoRow label="วันที่สร้าง" value={iv.created_at?.slice(0, 10)} />
          </div>
        </Section>

        <Section title="ข้อมูลเรียกเก็บ">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="บริษัท" value={iv.billing_company} />
            <InfoRow label="เลขประจำตัวผู้เสียภาษี" value={iv.billing_tax_id} />
            <InfoRow label="ที่อยู่" value={iv.billing_address} />
            <InfoRow label="ครบกำหนดชำระ" value={
              <span className={isOverdue(iv) ? 'text-red-600 font-semibold' : ''}>{iv.due_date?.slice(0, 10) || '-'}</span>
            } />
          </div>
        </Section>

        <Section title={`รายการสินค้า (${items.length})`}>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2 pr-2 w-8">#</th>
              <th className="pb-2 pr-2">สินค้า</th>
              <th className="pb-2 pr-2 text-right">จำนวน</th>
              <th className="pb-2 pr-2">หน่วย</th>
              <th className="pb-2 pr-2 text-right">ราคา/หน่วย</th>
              <th className="pb-2 text-right">จำนวนเงิน</th>
            </tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-2.5 pr-2 text-gray-400">{i + 1}</td>
                  <td className="py-2.5 pr-2 font-medium">{it.product_name || it.item_code || '-'}</td>
                  <td className="py-2.5 pr-2 text-right">{it.quantity.toLocaleString()}</td>
                  <td className="py-2.5 pr-2">{it.uom}</td>
                  <td className="py-2.5 pr-2 text-right">฿{Number(it.unit_price).toLocaleString()}</td>
                  <td className="py-2.5 text-right">฿{Number(it.amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>฿{Number(iv.subtotal).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">VAT {iv.vat_rate}%</span><span>฿{Number(iv.vat_amount).toLocaleString()}</span></div>
            <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
              <span>Grand Total</span><span>฿{Number(iv.total_amount).toLocaleString()}</span>
            </div>
          </div>
        </Section>

        {iv.notes && <Section title="หมายเหตุ"><p className="text-sm text-gray-700 whitespace-pre-wrap">{iv.notes}</p></Section>}

        <ConfirmDialog open={!!actionTarget}
          message={actionTarget?.action === 'send' ? `ส่งใบแจ้งหนี้ "${actionTarget?.inv.invoice_number}" ให้ลูกค้า?` : actionTarget?.action === 'cancel' ? `ยกเลิก "${actionTarget?.inv.invoice_number}"?` : `ยืนยันว่า "${actionTarget?.inv.invoice_number}" ชำระเงินแล้ว?`}
          onConfirm={handleAction} onCancel={() => setActionTarget(null)} />
        {toast && <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg">{toast}</div>}
      </div>
    );
  }

  // ========== CREATE FORM ==========
  if (formOpen) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">สร้างใบแจ้งหนี้</h1>
          <button onClick={() => setFormOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">← กลับรายการ</button>
        </div>
        <form onSubmit={handleCreate}>
          <Section title="แหล่งที่มา">
            <div className="flex gap-3 mb-4">
              {(['so', 'dn', 'multi'] as InvoiceSource[]).map((src) => (
                <button key={src} type="button" onClick={() => { setFormSource(src); setFormItems([]); }}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${formSource === src ? 'bg-indigo-600 text-white border-indigo-600' : 'hover:bg-gray-50'}`}>
                  {src === 'so' ? 'จาก SO' : src === 'dn' ? 'จาก DN' : 'รวมหลาย SO'}
                </button>
              ))}
            </div>

            {formSource === 'so' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">เลือกใบสั่งขาย</label>
                <select required value={formSOId} onChange={(e) => onSOChange(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">-- เลือก SO --</option>
                  {orders.map((o) => <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name}</option>)}
                </select>
              </div>
            )}

            {formSource === 'dn' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">เลือกใบส่งของ</label>
                <select required value={formDNId} onChange={(e) => onDNChange(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">-- เลือก DN --</option>
                  {dns.map((d) => <option key={d.id} value={d.id}>{d.dn_number} — {d.customer_name}</option>)}
                </select>
              </div>
            )}

            {formSource === 'multi' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">เลือก SO หลายใบ</label>
                <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {orders.map((o) => (
                    <label key={o.id} className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm ${formMultiSOIds.includes(o.id) ? 'bg-indigo-50' : ''}`}>
                      <input type="checkbox" checked={formMultiSOIds.includes(o.id)}
                        onChange={() => toggleMultiSO(o.id)} className="rounded" />
                      {o.order_number} — {o.customer_name}
                    </label>
                  ))}
                  {orders.length === 0 && <p className="text-sm text-gray-400 p-2">ไม่มี SO ที่ใช้ได้</p>}
                </div>
                {formMultiSOIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">เลือก {formMultiSOIds.length} ใบ</p>
                )}
              </div>
            )}
          </Section>

          <Section title="กำหนดชำระ">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField label="วันครบกำหนด" value={formDueDate} onChange={setFormDueDate} type="date" />
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
                      <th className="pb-2 pr-2 text-right">ราคา/หน่วย</th>
                      <th className="pb-2 pr-2 text-right">จำนวนเงิน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formItems.map((it, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                        <td className="py-2 pr-2">{it.product_name || it.item_code || '-'}</td>
                        <td className="py-2 pr-2 text-right">{it.quantity}</td>
                        <td className="py-2 pr-2">{it.uom}</td>
                        <td className="py-2 pr-2 text-right">{Number(it.unit_price).toLocaleString()}</td>
                        <td className="py-2 pr-2 text-right">{Number(it.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>฿{subtotal.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">VAT 7%</span><span>฿{vatAmount.toLocaleString()}</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                  <span>Grand Total</span><span>฿{grandTotal.toLocaleString()}</span>
                </div>
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
            <button type="submit"
              className="px-6 py-2.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium disabled:opacity-50">
              สร้างใบแจ้งหนี้
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ========== LIST VIEW ==========
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">ใบแจ้งหนี้ (Invoice)</h1>
      <DataTable
        columns={[
          { key: 'invoice_number', label: 'เลขที่' },
          { key: 'customer_name', label: 'ลูกค้า', render: (iv) => iv.customer_name || '-' },
          { key: 'so_order_number', label: 'อ้างอิง', render: (iv) => iv.so_order_number || iv.dn_number || '-' },
          { key: 'total_amount', label: 'ยอดรวม', render: (iv) => `฿${Number(iv.total_amount).toLocaleString()}` },
          { key: 'due_date', label: 'ครบกำหนด', render: (iv) => (
            <span className={isOverdue(iv) ? 'text-red-600 font-semibold' : ''}>{iv.due_date?.slice(0, 10) || '-'}</span>
          )},
          { key: 'status', label: 'สถานะ', render: (iv) => {
            const s = effectiveStatus(iv);
            const cfg2 = statusCfg[s] ?? statusCfg.draft;
            return <span className={`px-2 py-0.5 rounded-full text-xs ${cfg2.color}`}>{cfg2.label}</span>;
          }},
        ]}
        data={data}
        getId={(iv) => iv.id}
        searchPlaceholder="ค้นหาใบแจ้งหนี้..."
        onAdd={openAdd}
        onRowClick={openDetail}
      />
      {toast && <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg">{toast}</div>}
    </div>
  );
}
