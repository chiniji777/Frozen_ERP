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

const statusCfg: Record<string, { label: string; color: string }> = {
  draft: { label: 'ร่าง', color: 'bg-gray-100 text-gray-700' },
  sent: { label: 'ส่งแล้ว', color: 'bg-blue-100 text-blue-700' },
  paid: { label: 'ชำระแล้ว', color: 'bg-green-100 text-green-700' },
  overdue: { label: 'เกินกำหนด', color: 'bg-red-100 text-red-700' },
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

const MOCK_INVOICES: Invoice[] = [
  { id: 1, invoice_number: 'INV-2026-0001', sales_order_id: 1, so_order_number: 'SO-2026-0010', customer_name: 'บริษัท ทดสอบ จำกัด', billing_company: 'บริษัท ทดสอบ จำกัด', billing_address: '123 ถ.สุขุมวิท', billing_tax_id: '0105500000001', subtotal: 10000, vat_rate: 7, vat_amount: 700, total_amount: 10700, status: 'draft', due_date: '2026-04-15', items: [{ product_name: 'สินค้า A', quantity: 10, unit_price: 1000, uom: 'Pcs.', amount: 10000 }] },
  { id: 2, invoice_number: 'INV-2026-0002', sales_order_id: 2, so_order_number: 'SO-2026-0011', customer_name: 'ร้านค้าตัวอย่าง', billing_company: 'ร้านค้าตัวอย่าง', subtotal: 5000, vat_rate: 7, vat_amount: 350, total_amount: 5350, status: 'sent', due_date: '2026-03-20', items: [{ product_name: 'สินค้า B', quantity: 5, unit_price: 1000, uom: 'Kg', amount: 5000 }] },
];

export default function InvoicePage() {
  const [data, setData] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [dns, setDns] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [viewInv, setViewInv] = useState<Invoice | null>(null);
  const [sendTarget, setSendTarget] = useState<Invoice | null>(null);
  const [paidTarget, setPaidTarget] = useState<Invoice | null>(null);

  const [formSource, setFormSource] = useState<InvoiceSource>('so');
  const [formSOId, setFormSOId] = useState<number | ''>('');
  const [formDNId, setFormDNId] = useState<number | ''>('');
  const [formMultiSOIds, setFormMultiSOIds] = useState<number[]>([]);
  const [formDueDate, setFormDueDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<InvoiceItem[]>([]);
  const [formBillingCompany, setFormBillingCompany] = useState('');
  const [formBillingAddress, setFormBillingAddress] = useState('');
  const [formBillingTaxId, setFormBillingTaxId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [ivs, sos, dnList] = await Promise.all([
        api.get<Invoice[]>('/invoices').catch(() => MOCK_INVOICES),
        api.get<SalesOrder[]>('/sales-orders').catch(() => []),
        api.get<DeliveryNote[]>('/delivery-notes').catch(() => []),
      ]);
      setData(ivs);
      setOrders(sos.filter((o) => o.status === 'confirmed' || o.status === 'delivered'));
      setDns(dnList.filter((d) => d.status === 'delivered'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const isOverdue = (iv: Invoice) => iv.status !== 'paid' && new Date(iv.due_date) < new Date();

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
    const so = orders.find((o) => o.id === soId);
    if (so) {
      setFormBillingCompany(so.customer_name || '');
      const items = await loadSOItems(soId);
      setFormItems(items);
    }
  };

  const onDNChange = (dnId: number) => {
    setFormDNId(dnId);
    const dn = dns.find((d) => d.id === dnId);
    if (dn) {
      setFormBillingCompany(dn.customer_name || '');
      setFormItems([]);
    }
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
    if (next.length > 0) {
      const first = orders.find((o) => o.id === next[0]);
      if (first) setFormBillingCompany(first.customer_name || '');
    }
  };

  const subtotal = formItems.reduce((s, it) => s + it.amount, 0);
  const vatAmount = Math.round(subtotal * 7) / 100;
  const grandTotal = subtotal + vatAmount;

  const openAdd = () => {
    setFormSource('so'); setFormSOId(''); setFormDNId('');
    setFormMultiSOIds([]); setFormDueDate(''); setFormNotes('');
    setFormItems([]); setFormBillingCompany(''); setFormBillingAddress('');
    setFormBillingTaxId('');
    setFormOpen(true);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      due_date: formDueDate || null,
      notes: formNotes || null,
      billing_company: formBillingCompany || null,
      billing_address: formBillingAddress || null,
      billing_tax_id: formBillingTaxId || null,
      items: formItems.map((it) => ({
        product_id: it.product_id, item_code: it.item_code,
        quantity: Number(it.quantity), unit_price: Number(it.unit_price),
        uom: it.uom, amount: Number(it.amount),
      })),
    };
    if (formSource === 'so' && formSOId) payload.sales_order_id = Number(formSOId);
    if (formSource === 'dn' && formDNId) payload.delivery_note_id = Number(formDNId);
    if (formSource === 'multi' && formMultiSOIds.length) payload.sales_order_ids = formMultiSOIds;
    await api.post('/invoices', payload);
    setFormOpen(false); load();
  };

  const handleSend = async () => {
    if (!sendTarget) return;
    await api.put(`/invoices/${sendTarget.id}/send`, {});
    setSendTarget(null); load();
  };

  const handlePaid = async () => {
    if (!paidTarget) return;
    await api.put(`/invoices/${paidTarget.id}/pay`, {});
    setPaidTarget(null); load();
  };

  const handlePrint = (invId: number) => {
    window.open(`/api/invoices/${invId}/print`, '_blank');
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  if (formOpen) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">สร้างใบแจ้งหนี้</h1>
          <button onClick={() => setFormOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">กลับรายการ</button>
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
                    <label key={o.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm">
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

          <Section title="ข้อมูลหัวบิล (แก้ไขได้)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField label="ชื่อบริษัท / ชื่อผู้ซื้อ" value={formBillingCompany} onChange={setFormBillingCompany} placeholder="ชื่อบนหัวบิล" />
              <InputField label="เลขประจำตัวผู้เสียภาษี" value={formBillingTaxId} onChange={setFormBillingTaxId} placeholder="13 หลัก" />
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">ที่อยู่สำหรับออกบิล</label>
                <textarea value={formBillingAddress} onChange={(e) => setFormBillingAddress(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="ที่อยู่ในใบแจ้งหนี้..." />
              </div>
            </div>
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
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{subtotal.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">VAT 7%</span><span>{vatAmount.toLocaleString()}</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                  <span>Grand Total</span><span>{grandTotal.toLocaleString()}</span>
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">ใบแจ้งหนี้ (Invoice)</h1>
      <DataTable
        columns={[
          { key: 'invoice_number', label: 'เลขที่' },
          { key: 'customer_name', label: 'ลูกค้า', render: (iv) => iv.billing_company || iv.customer_name || '-' },
          { key: 'so_order_number', label: 'อ้างอิง', render: (iv) => iv.so_order_number || iv.dn_number || '-' },
          { key: 'total_amount', label: 'ยอดรวม', render: (iv) => `฿${Number(iv.total_amount).toLocaleString()}` },
          { key: 'due_date', label: 'ครบกำหนด', render: (iv) => (
            <span className={isOverdue(iv) ? 'text-red-600 font-semibold' : ''}>{iv.due_date?.slice(0, 10) || '-'}</span>
          )},
          { key: 'status', label: 'สถานะ', render: (iv) => {
            const s = isOverdue(iv) ? 'overdue' : iv.status;
            return <StatusBadge status={s} />;
          }},
        ]}
        data={data}
        getId={(iv) => iv.id}
        searchPlaceholder="ค้นหาใบแจ้งหนี้..."
        onAdd={openAdd}
        extraActions={(iv) => (
          <div className="flex gap-1">
            <button onClick={() => setViewInv(iv)}
              className="px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">ดูเพิ่ม</button>
            <button onClick={() => handlePrint(iv.id)}
              className="px-2 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100">พิมพ์</button>
            {iv.status === 'draft' && (
              <button onClick={() => setSendTarget(iv)}
                className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">ส่ง</button>
            )}
            {iv.status === 'sent' && (
              <button onClick={() => setPaidTarget(iv)}
                className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">ชำระแล้ว</button>
            )}
          </div>
        )}
      />

      {viewInv && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setViewInv(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold">{viewInv.invoice_number}</h2>
                <StatusBadge status={isOverdue(viewInv) ? 'overdue' : viewInv.status} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => handlePrint(viewInv.id)} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">พิมพ์</button>
                <button onClick={() => setViewInv(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-blue-700 mb-2">ข้อมูลหัวบิล</h4>
                <div className="text-sm space-y-1">
                  <div><span className="text-gray-500">บริษัท:</span> {viewInv.billing_company || viewInv.customer_name || '-'}</div>
                  {viewInv.billing_address && <div><span className="text-gray-500">ที่อยู่:</span> {viewInv.billing_address}</div>}
                  {viewInv.billing_tax_id && <div><span className="text-gray-500">Tax ID:</span> {viewInv.billing_tax_id}</div>}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-500 mb-2">ข้อมูลทั่วไป</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">อ้างอิง SO:</span> {viewInv.so_order_number || '-'}</div>
                  {viewInv.dn_number && <div><span className="text-gray-500">อ้างอิง DN:</span> {viewInv.dn_number}</div>}
                  <div><span className="text-gray-500">ครบกำหนด:</span> <span className={isOverdue(viewInv) ? 'text-red-600 font-semibold' : ''}>{viewInv.due_date?.slice(0, 10) || '-'}</span></div>
                  <div><span className="text-gray-500">สถานะ:</span> {statusCfg[isOverdue(viewInv) ? 'overdue' : viewInv.status]?.label}</div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-500 mb-2">รายการ</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="pb-2 pr-2">#</th>
                      <th className="pb-2 pr-2">สินค้า</th>
                      <th className="pb-2 pr-2 text-right">จำนวน</th>
                      <th className="pb-2 pr-2 text-right">ราคา</th>
                      <th className="pb-2 pr-2 text-right">จำนวนเงิน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewInv.items?.map((it, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2 text-gray-400">{i + 1}</td>
                        <td className="py-1.5 pr-2">{it.product_name || '-'}</td>
                        <td className="py-1.5 pr-2 text-right">{it.quantity}</td>
                        <td className="py-1.5 pr-2 text-right">{Number(it.unit_price).toLocaleString()}</td>
                        <td className="py-1.5 pr-2 text-right">{Number(it.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>฿{Number(viewInv.subtotal).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">VAT {viewInv.vat_rate}%</span><span>฿{Number(viewInv.vat_amount).toLocaleString()}</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                  <span>Grand Total</span><span>฿{Number(viewInv.total_amount).toLocaleString()}</span>
                </div>
              </div>
              {viewInv.notes && (
                <div className="text-sm"><span className="text-gray-500">หมายเหตุ:</span> {viewInv.notes}</div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!sendTarget} message={`ส่งใบแจ้งหนี้ "${sendTarget?.invoice_number}" ให้ลูกค้า?`}
        onConfirm={handleSend} onCancel={() => setSendTarget(null)} />
      <ConfirmDialog open={!!paidTarget} message={`ยืนยันว่า "${paidTarget?.invoice_number}" ชำระเงินแล้ว?`}
        onConfirm={handlePaid} onCancel={() => setPaidTarget(null)} />
    </div>
  );
}
