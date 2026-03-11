import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface Customer { id: number; name: string; }
interface Product { id: number; name: string; price: number; }
interface SOItem { product_id: number; quantity: number; unit_price: number; product_name?: string; }
interface SalesOrder {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name?: string;
  status: string;
  subtotal: number;
  vat: number;
  total_amount: number;
  items: SOItem[];
  created_at?: string;
}

const statusCfg: Record<string, { label: string; color: string }> = {
  draft: { label: 'ร่าง', color: 'bg-gray-100 text-gray-700' },
  confirmed: { label: 'ยืนยัน', color: 'bg-blue-100 text-blue-700' },
  shipped: { label: 'จัดส่งแล้ว', color: 'bg-yellow-100 text-yellow-700' },
  delivered: { label: 'ส่งถึงแล้ว', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700' },
};

export default function SalesOrderPage() {
  const [data, setData] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<SalesOrder | null>(null);

  const [formCustId, setFormCustId] = useState<number | ''>('');
  const [formItems, setFormItems] = useState<SOItem[]>([{ product_id: 0, quantity: 1, unit_price: 0 }]);

  const load = async () => {
    setLoading(true);
    try {
      const [orders, custs, prods] = await Promise.all([
        api.get<SalesOrder[]>('/sales-orders').catch(() => []),
        api.get<Customer[]>('/customers').catch(() => []),
        api.get<Product[]>('/products').catch(() => []),
      ]);
      setData(orders); setCustomers(custs); setProducts(prods);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const subtotal = formItems.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const vat = subtotal * 0.07;
  const totalAmount = subtotal + vat;

  const addItem = () => setFormItems([...formItems, { product_id: 0, quantity: 1, unit_price: 0 }]);
  const removeItem = (i: number) => setFormItems(formItems.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, val: unknown) => {
    const next = [...formItems];
    (next[i] as unknown as Record<string, unknown>)[field] = val;
    if (field === 'product_id') {
      const prod = products.find((p) => p.id === Number(val));
      if (prod) next[i].unit_price = prod.price;
    }
    setFormItems(next);
  };

  const openAdd = () => {
    setFormCustId('');
    setFormItems([{ product_id: 0, quantity: 1, unit_price: 0 }]);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await api.post('/sales-orders', {
      customer_id: Number(formCustId),
      items: formItems.filter((it) => it.product_id > 0).map((it) => ({
        product_id: it.product_id, quantity: Number(it.quantity), unit_price: Number(it.unit_price),
      })),
    });
    setModalOpen(false); load();
  };

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    await api.put(`/sales-orders/${confirmTarget.id}/confirm`, {});
    setConfirmTarget(null); load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">📝 ใบสั่งขาย (Sales Order)</h1>
      <DataTable
        columns={[
          { key: 'order_number', label: 'เลขที่' },
          { key: 'customer_name', label: 'ลูกค้า' },
          { key: 'total_amount', label: 'ยอดรวม', render: (o) => `฿${Number(o.total_amount).toLocaleString()}` },
          { key: 'status', label: 'สถานะ', render: (o) => {
            const cfg = statusCfg[o.status] ?? statusCfg.draft;
            return <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.color}`}>{cfg.label}</span>;
          }},
        ]}
        data={data}
        getId={(o) => o.id}
        searchPlaceholder="ค้นหาใบสั่งขาย..."
        onAdd={openAdd}
        onEdit={(o) => { if (o.status === 'draft') setConfirmTarget(o); }}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="สร้างใบสั่งขายใหม่">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ลูกค้า</label>
            <select required value={formCustId} onChange={(e) => setFormCustId(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="">-- เลือกลูกค้า --</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">สินค้า</label>
              <button type="button" onClick={addItem} className="text-xs text-indigo-600 hover:text-indigo-800">+ เพิ่มรายการ</button>
            </div>
            <div className="flex flex-col gap-2">
              {formItems.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select value={item.product_id} onChange={(e) => updateItem(i, 'product_id', Number(e.target.value))}
                    className="flex-1 px-2 py-1.5 border rounded-lg text-sm">
                    <option value={0}>-- เลือกสินค้า --</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                    className="w-16 px-2 py-1.5 border rounded-lg text-sm text-right" placeholder="จำนวน" />
                  <input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(i, 'unit_price', Number(e.target.value))}
                    className="w-24 px-2 py-1.5 border rounded-lg text-sm text-right" placeholder="ราคา" />
                  <span className="text-xs text-gray-400 w-20 text-right">฿{(item.quantity * item.unit_price).toLocaleString()}</span>
                  {formItems.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 bg-gray-50 rounded-lg p-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>฿{subtotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">VAT 7%</span><span>฿{vat.toLocaleString()}</span></div>
              <div className="flex justify-between font-bold border-t mt-1 pt-1"><span>รวมทั้งหมด</span><span>฿{totalAmount.toLocaleString()}</span></div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">สร้าง</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!confirmTarget} message={`ยืนยันใบสั่งขาย "${confirmTarget?.order_number}"?`}
        onConfirm={handleConfirm} onCancel={() => setConfirmTarget(null)} />
    </div>
  );
}
