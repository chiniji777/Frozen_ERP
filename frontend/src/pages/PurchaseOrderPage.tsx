import { useState, useEffect, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import ConfirmDialog from '../components/ConfirmDialog';

interface Supplier { id: number; code?: string; name: string; }
interface RawMaterial { id: number; name: string; unit: string; stock: number; pricePerUnit: number; }
interface POItem {
  id?: number; rawMaterialId: number; quantity: number;
  unit: string; unitPrice: number; amount: number;
  materialName?: string;
}
interface PurchaseOrder {
  id: number; poNumber: string; productionOrderId?: number;
  status: string; supplier?: string; totalAmount: number;
  notes?: string; createdAt?: string; updatedAt?: string;
  items?: POItem[];
}

const statusCfg: Record<string, { label: string; color: string }> = {
  draft: { label: 'ร่าง', color: 'bg-gray-100 text-gray-700' },
  confirmed: { label: 'ยืนยันแล้ว', color: 'bg-blue-100 text-blue-700' },
  received: { label: 'รับของแล้ว', color: 'bg-emerald-100 text-emerald-700' },
  paid: { label: 'จ่ายแล้ว', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700' },
};

const STATUS_FLOW = ['draft', 'confirmed', 'received', 'paid'];

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

export default function PurchaseOrderPage() {
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null);
  const [actionTarget, setActionTarget] = useState<{ po: PurchaseOrder; action: string } | null>(null);
  const [toast, setToast] = useState('');
  const location = useLocation();

  // Reset to list view on sidebar re-nav
  useEffect(() => {
    setDetailPO(null);
    setFormOpen(false);
  }, [location.key]);

  // Form state
  const [formSupplierId, setFormSupplierId] = useState<number | ''>('');
  const [formExpectedDate, setFormExpectedDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<POItem[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [pos, supps, mats] = await Promise.all([
        api.get<PurchaseOrder[]>('/purchase-orders').catch(() => []),
        api.get<Supplier[]>('/suppliers').catch(() => []),
        api.get<RawMaterial[]>('/raw-materials').catch(() => []),
      ]);
      setData(pos);
      setSuppliers(supps);
      setMaterials(mats);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  const selectedSupplier = suppliers.find((s) => s.id === Number(formSupplierId));

  const openAdd = () => {
    setFormSupplierId('');
    setFormExpectedDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setFormItems([]);
    setDetailPO(null);
    setFormOpen(true);
  };

  const openDetail = async (po: PurchaseOrder) => {
    try { const d = await api.get<PurchaseOrder>(`/purchase-orders/${po.id}`); setDetailPO(d); } catch { setDetailPO(po); }
    setFormOpen(false);
  };

  const addItem = () => {
    setFormItems([...formItems, { rawMaterialId: 0, quantity: 1, unit: 'กก.', unitPrice: 0, amount: 0 }]);
  };

  const updateItem = (i: number, field: keyof POItem, val: string | number) => {
    const next = [...formItems];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (next[i] as any)[field] = val;
    // Auto-calc amount
    if (field === 'quantity' || field === 'unitPrice') {
      next[i].amount = Number(next[i].quantity) * Number(next[i].unitPrice);
    }
    // Auto-fill unit & price from material
    if (field === 'rawMaterialId') {
      const mat = materials.find((m) => m.id === Number(val));
      if (mat) {
        next[i].unit = mat.unit;
        next[i].unitPrice = mat.pricePerUnit;
        next[i].amount = Number(next[i].quantity) * mat.pricePerUnit;
      }
    }
    setFormItems(next);
  };

  const removeItem = (i: number) => {
    setFormItems(formItems.filter((_, idx) => idx !== i));
  };

  const formTotal = formItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!formSupplierId || formItems.length === 0) return;
    try {
      await api.post('/purchase-orders', {
        supplierId: Number(formSupplierId),
        supplier: selectedSupplier?.name || '',
        expectedDate: formExpectedDate || null,
        notes: formNotes || null,
        items: formItems.map((it) => ({
          rawMaterialId: Number(it.rawMaterialId),
          quantity: Number(it.quantity),
          unit: it.unit,
          unitPrice: Number(it.unitPrice),
          amount: Number(it.amount),
        })),
      });
      setFormOpen(false);
      setToast('สร้าง PO สำเร็จ');
      load();
    } catch {
      setToast('ไม่สามารถสร้าง PO ได้ — กรุณาลองใหม่');
    }
  };

  const handleAction = async () => {
    if (!actionTarget) return;
    const { po, action } = actionTarget;
    try {
      if (action === 'confirm') {
        await api.post(`/purchase-orders/${po.id}/confirm`, {});
        setToast('ยืนยัน PO สำเร็จ');
      } else if (action === 'receive') {
        await api.post(`/purchase-orders/${po.id}/receive`, {});
        setToast('รับของสำเร็จ — stock วัตถุดิบอัปเดตแล้ว');
      } else if (action === 'pay') {
        await api.post(`/purchase-orders/${po.id}/pay`, { paidAt: new Date().toISOString().slice(0, 10) });
        setToast('บันทึกจ่ายเงินสำเร็จ');
      } else if (action === 'delete') {
        await api.del(`/purchase-orders/${po.id}`);
        setToast('ลบ PO สำเร็จ');
        setDetailPO(null);
        setActionTarget(null);
        load();
        return;
      } else if (action === 'cancel') {
        await api.patch(`/purchase-orders/${po.id}/cancel`, {});
        setToast('ยกเลิก PO แล้ว');
      }
      // Refresh detail if open
      if (detailPO?.id === po.id) {
        try { setDetailPO(await api.get<PurchaseOrder>(`/purchase-orders/${po.id}`)); } catch { /* */ }
      }
      load();
    } catch {
      setToast('ไม่สามารถดำเนินการได้');
    }
    setActionTarget(null);
  };

  const getConfirmMessage = () => {
    if (!actionTarget) return '';
    const pn = actionTarget.po.poNumber;
    switch (actionTarget.action) {
      case 'confirm': return `ยืนยัน PO "${pn}"?`;
      case 'receive': return `ยืนยันรับของ "${pn}"? (stock วัตถุดิบจะเพิ่มอัตโนมัติ)`;
      case 'pay': return `ยืนยันจ่ายเงิน "${pn}"?`;
      case 'delete': return `ลบ PO "${pn}"? (ลบถาวร)`;
      default: return `ยกเลิก "${pn}"?`;
    }
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
  const fmtMoney = (n: number) => `฿${Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  // ========== DETAIL VIEW ==========
  if (detailPO && !formOpen) {
    const po = detailPO;
    const cfg = statusCfg[po.status] ?? statusCfg.draft;
    const items = po.items || [];
    const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

    return (
      <div className="max-w-4xl mx-auto min-h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetailPO(null)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-800">{po.poNumber}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
          </div>
          <div className="flex gap-2">
            {po.status === 'draft' && (
              <button onClick={() => setActionTarget({ po, action: 'confirm' })}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                ✓ ยืนยัน
              </button>
            )}
            {po.status === 'confirmed' && (
              <button onClick={() => setActionTarget({ po, action: 'receive' })}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                📦 รับของ
              </button>
            )}
            {po.status === 'received' && (
              <button onClick={() => setActionTarget({ po, action: 'pay' })}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                💰 จ่ายเงิน
              </button>
            )}
            {po.status === 'draft' && (
              <button onClick={() => setActionTarget({ po, action: 'delete' })}
                className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                🗑 ลบ
              </button>
            )}
            {po.status !== 'received' && po.status !== 'paid' && po.status !== 'cancelled' && (
              <button onClick={() => setActionTarget({ po, action: 'cancel' })}
                className="px-4 py-2 text-sm border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50">
                ✕ ยกเลิก
              </button>
            )}
          </div>
        </div>

        {/* Status Flow */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
          <div className="flex items-center justify-center gap-2 text-sm">
            {STATUS_FLOW.map((s, i) => {
              const sc = statusCfg[s]!;
              const isActive = s === po.status;
              const isPast = STATUS_FLOW.indexOf(po.status) > i;
              return (
                <div key={s} className="flex items-center gap-2">
                  {i > 0 && <div className={`w-8 h-0.5 ${isPast ? 'bg-green-400' : 'bg-gray-200'}`} />}
                  <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${isActive ? sc.color + ' ring-2 ring-offset-1 ring-indigo-300' : isPast ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                    {isPast && !isActive ? '✓ ' : ''}{sc.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Section title="ข้อมูลทั่วไป">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="เลขที่ PO" value={po.poNumber} />
            <InfoRow label="ผู้ขาย" value={<strong>{po.supplier || '-'}</strong>} />
            <InfoRow label="ยอดรวม" value={<strong className="text-indigo-600">{fmtMoney(po.totalAmount || total)}</strong>} />
            <InfoRow label="วันที่สร้าง" value={fmtDate(po.createdAt)} />
          </div>
        </Section>

        <Section title={`รายการวัตถุดิบ (${items.length})`}>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2 pr-2 w-8">#</th><th className="pb-2 pr-2">วัตถุดิบ</th>
              <th className="pb-2 pr-2 text-right">จำนวน</th><th className="pb-2 pr-2">หน่วย</th>
              <th className="pb-2 pr-2 text-right">ราคา/หน่วย</th><th className="pb-2 text-right">รวม</th>
            </tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-2.5 pr-2 text-gray-400">{i + 1}</td>
                  <td className="py-2.5 pr-2 font-medium">{it.materialName || '-'}</td>
                  <td className="py-2.5 pr-2 text-right">{Number(it.quantity).toLocaleString()}</td>
                  <td className="py-2.5 pr-2">{it.unit}</td>
                  <td className="py-2.5 pr-2 text-right">{fmtMoney(it.unitPrice)}</td>
                  <td className="py-2.5 text-right font-medium">{fmtMoney(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 bg-gray-50 rounded-lg p-3 flex justify-between text-sm">
            <span className="text-gray-500">รวมทั้งสิ้น</span>
            <strong className="text-indigo-600">{fmtMoney(total)}</strong>
          </div>
        </Section>

        {po.notes && <Section title="หมายเหตุ"><p className="text-sm text-gray-700 whitespace-pre-wrap">{po.notes}</p></Section>}

        <ConfirmDialog open={!!actionTarget} message={getConfirmMessage()}
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
          <h1 className="text-2xl font-bold text-gray-800">สร้างใบสั่งซื้อ (PO)</h1>
          <button onClick={() => setFormOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">← กลับรายการ</button>
        </div>
        <form onSubmit={handleCreate}>
          <Section title="ข้อมูลทั่วไป">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">ผู้ขาย *</label>
                <select value={formSupplierId} onChange={(e) => setFormSupplierId(Number(e.target.value) || '')}
                  required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">-- เลือกผู้ขาย --</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code ? `${s.code} — ` : ''}{s.name}</option>)}
                </select>
              </div>
              <InputField label="วันที่คาดว่าจะรับ" value={formExpectedDate} onChange={setFormExpectedDate} type="date" />
            </div>
          </Section>

          <Section title="รายการวัตถุดิบ">
            {formItems.length > 0 && (
              <table className="w-full text-sm mb-3">
                <thead><tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pr-2 w-8">#</th><th className="pb-2 pr-2">วัตถุดิบ</th>
                  <th className="pb-2 pr-2 w-24 text-right">จำนวน</th><th className="pb-2 pr-2 w-20">หน่วย</th>
                  <th className="pb-2 pr-2 w-28 text-right">ราคา/หน่วย</th><th className="pb-2 pr-2 w-28 text-right">รวม</th>
                  <th className="pb-2 w-8"></th>
                </tr></thead>
                <tbody>
                  {formItems.map((item, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <select value={item.rawMaterialId} onChange={(e) => updateItem(i, 'rawMaterialId', Number(e.target.value))}
                          className="w-full px-2 py-1 border rounded text-sm">
                          <option value={0}>-- เลือก --</option>
                          {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <input type="number" min="0" step="0.01" value={item.quantity}
                          onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                          className="w-full px-2 py-1 border rounded text-sm text-right" />
                      </td>
                      <td className="py-2 pr-2">
                        <input value={item.unit} onChange={(e) => updateItem(i, 'unit', e.target.value)}
                          className="w-full px-2 py-1 border rounded text-sm" />
                      </td>
                      <td className="py-2 pr-2">
                        <input type="number" min="0" step="0.01" value={item.unitPrice}
                          onChange={(e) => updateItem(i, 'unitPrice', Number(e.target.value))}
                          className="w-full px-2 py-1 border rounded text-sm text-right" />
                      </td>
                      <td className="py-2 pr-2 text-right font-medium text-sm">{fmtMoney(item.amount)}</td>
                      <td className="py-2">
                        <button type="button" onClick={() => removeItem(i)}
                          className="text-red-400 hover:text-red-600 p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex items-center justify-between">
              <button type="button" onClick={addItem}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                + เพิ่มรายการ
              </button>
              {formItems.length > 0 && (
                <div className="text-sm">รวม: <strong className="text-indigo-600">{fmtMoney(formTotal)}</strong></div>
              )}
            </div>
          </Section>

          <Section title="หมายเหตุ">
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </Section>

          <div className="flex justify-end gap-3 mb-8">
            <button type="button" onClick={() => setFormOpen(false)} className="px-6 py-2.5 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" disabled={!formSupplierId || formItems.length === 0}
              className="px-6 py-2.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              สร้างใบสั่งซื้อ
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ========== LIST VIEW ==========
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">🛒 ใบสั่งซื้อ (Purchase Order)</h1>
      <DataTable
        columns={[
          { key: 'poNumber', label: 'เลขที่ PO', filterable: true },
          { key: 'supplier', label: 'ผู้ขาย', filterable: true, render: (po) => po.supplier || '-' },
          { key: 'totalAmount', label: 'ยอดรวม', render: (po) => fmtMoney(po.totalAmount) },
          { key: 'createdAt', label: 'วันที่', render: (po) => po.createdAt?.slice(0, 10) || '-' },
          { key: 'status', label: 'สถานะ', filterable: true, render: (po) => {
            const c = statusCfg[po.status] ?? statusCfg.draft;
            return <span className={`px-2 py-0.5 rounded-full text-xs ${c.color}`}>{c.label}</span>;
          }},
        ]}
        data={data}
        getId={(po) => po.id}
        searchPlaceholder="ค้นหาใบสั่งซื้อ..."
        onAdd={openAdd}
        onRowClick={(po) => openDetail(po)}
        extraActions={(po) => (
          <div className="flex gap-1">
            {po.status === 'draft' && (
              <button onClick={(e) => { e.stopPropagation(); setActionTarget({ po, action: 'confirm' }); }}
                className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
                ยืนยัน
              </button>
            )}
            {po.status === 'confirmed' && (
              <button onClick={(e) => { e.stopPropagation(); setActionTarget({ po, action: 'receive' }); }}
                className="px-2 py-1 text-xs bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100">
                รับของ
              </button>
            )}
            {po.status === 'received' && (
              <button onClick={(e) => { e.stopPropagation(); setActionTarget({ po, action: 'pay' }); }}
                className="px-2 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100">
                จ่ายเงิน
              </button>
            )}
            {po.status === 'draft' && (
              <button onClick={(e) => { e.stopPropagation(); setActionTarget({ po, action: 'delete' }); }}
                className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">
                ลบ
              </button>
            )}
            {(po.status === 'draft' || po.status === 'confirmed') && (
              <button onClick={(e) => { e.stopPropagation(); setActionTarget({ po, action: 'cancel' }); }}
                className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">
                ยกเลิก
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); openDetail(po); }}
              className="px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">
              Detail
            </button>
          </div>
        )}
      />
      <ConfirmDialog open={!!actionTarget} message={getConfirmMessage()}
        onConfirm={handleAction} onCancel={() => setActionTarget(null)} />
      {toast && <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg">{toast}</div>}
    </div>
  );
}
