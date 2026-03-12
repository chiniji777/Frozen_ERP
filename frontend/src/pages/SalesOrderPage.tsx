import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';

interface Customer {
  id: number; name: string; fullName?: string; nickName?: string;
  address?: string; phone?: string; email?: string; taxId?: string;
  creditLimit?: number; paymentTerms?: string; salesPartner?: string;
  commissionRate?: number;
}
interface Product { id: number; name: string; sku?: string; price: number; salePrice?: number; unit?: string; }
interface UserInfo { id: number; username: string; displayName: string; role: string; }
interface SOItem {
  productId: number; itemCode?: string; quantity: number; unitPrice: number;
  rate?: number; uom: string; weight: number; productName?: string;
}
interface PaymentTermRow {
  paymentTerm: string; description: string; dueDate: string;
  invoicePortion: number; paymentAmount: number;
}
interface SOAttachment {
  id: number; salesOrderId: number; filename: string; originalName: string;
  mimeType?: string; size?: number; createdAt?: string;
}
interface SalesOrder {
  id: number; orderNumber: string; customerId: number; status: string;
  date?: string; deliveryStartDate?: string; deliveryEndDate?: string;
  customerAddress?: string; shippingAddressName?: string; shippingAddress?: string;
  contactPerson?: string; contact?: string; mobileNo?: string;
  warehouse?: string; subtotal: number; vatRate: number; vatAmount: number;
  totalAmount: number; totalQuantity?: number; totalNetWeight?: number;
  paymentTermsTemplate?: string; salesPartner?: string; commissionRate?: number;
  totalCommission?: number; poNumber?: string; poDate?: string; poNotes?: string;
  notes?: string;
  customer?: Customer; items?: SOItem[]; paymentTerms?: PaymentTermRow[];
  attachments?: SOAttachment[];
  createdAt?: string;
}

const statusCfg: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700' },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700' },
  invoiced: { label: 'Invoiced', color: 'bg-purple-100 text-purple-700' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
};

const emptyItem = (): SOItem => ({ productId: 0, itemCode: '', quantity: 1, unitPrice: 0, rate: 0, uom: 'Pcs.', weight: 0 });
const emptyPT = (): PaymentTermRow => ({ paymentTerm: '', description: '', dueDate: '', invoicePortion: 0, paymentAmount: 0 });

const InputField = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '' }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; disabled?: boolean; placeholder?: string;
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50" />
  </div>
);

export default function SalesOrderPage() {
  const [data, setData] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [teamUsers, setTeamUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<SalesOrder | null>(null);

  // Form state
  const [formCustId, setFormCustId] = useState<number | ''>('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDeliveryStart, setFormDeliveryStart] = useState('');
  const [formDeliveryEnd, setFormDeliveryEnd] = useState('');
  const [formCustAddress, setFormCustAddress] = useState('');
  const [formShipName, setFormShipName] = useState('');
  const [formShipAddress, setFormShipAddress] = useState('');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formMobileNo, setFormMobileNo] = useState('');
  const [formItems, setFormItems] = useState<SOItem[]>([emptyItem()]);
  const [formPaymentTemplate, setFormPaymentTemplate] = useState('');
  const [formPaymentTerms, setFormPaymentTerms] = useState<PaymentTermRow[]>([]);
  const [formSalesPartner, setFormSalesPartner] = useState('');
  const [formCommRate, setFormCommRate] = useState(0);
  const [formNotes, setFormNotes] = useState('');
  const [formCreditLimit, setFormCreditLimit] = useState(0);
  const [formTaxId, setFormTaxId] = useState('');
  const [formPoNumber, setFormPoNumber] = useState('');
  const [formPoDate, setFormPoDate] = useState('');
  const [formPoNotes, setFormPoNotes] = useState('');
  const [detailOrder, setDetailOrder] = useState<SalesOrder | null>(null);
  const [attachments, setAttachments] = useState<SOAttachment[]>([]);
  const [companyName, setCompanyName] = useState('Frozen Food Plus Co., Ltd.');
  const [creatingDn, setCreatingDn] = useState(false);
  const [creatingInv, setCreatingInv] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [orders, custs, prods, settings, usrs] = await Promise.all([
        api.get<SalesOrder[]>('/sales-orders').catch(() => []),
        api.get<Customer[]>('/customers').catch(() => []),
        api.get<Product[]>('/products').catch(() => []),
        api.get<{ companyNameEn?: string }>('/settings').catch(() => ({} as { companyNameEn?: string })),
        api.get<UserInfo[]>('/auth/users').catch(() => []),
      ]);
      setData(orders); setCustomers(custs); setProducts(prods); setTeamUsers(usrs);
      if (settings.companyNameEn) setCompanyName(settings.companyNameEn);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Searchable select options
  const customerOptions = useMemo(() =>
    customers.map((c) => ({ value: c.id, label: c.name, searchText: c.nickName || '' })),
    [customers]
  );
  const productOptions = useMemo(() =>
    products.map((p) => ({ value: p.id, label: p.name, searchText: p.sku || '' })),
    [products]
  );

  // Auto-fill when customer changes
  const [noAddressWarning, setNoAddressWarning] = useState(false);
  const [formNickName, setFormNickName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const onCustomerChange = (custId: number) => {
    setFormCustId(custId);
    const c = customers.find((x) => x.id === custId);
    if (c) {
      setFormNickName(c.nickName || '');
      setFormEmail(c.email || '');
      setFormCustAddress(c.address || '');
      setFormShipName(c.fullName || c.name || '');
      setFormShipAddress(c.address || '');
      setFormContactPerson(c.nickName || c.name || '');
      setFormContact(c.phone || '');
      setFormMobileNo(c.phone || '');
      setFormSalesPartner(c.salesPartner || '');
      setFormCommRate(c.commissionRate || 0);
      setFormCreditLimit(c.creditLimit || 0);
      setFormTaxId(c.taxId || '');
      setFormPaymentTemplate(c.paymentTerms || '');
      setNoAddressWarning(!c.address);
    }
  };

  // Calculations
  const subtotal = formItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const totalQty = formItems.reduce((s, it) => s + it.quantity, 0);
  const totalWeight = formItems.reduce((s, it) => s + (it.weight || 0), 0);
  const vat = Math.round(subtotal * 7) / 100;
  const totalAmount = subtotal + vat;
  const totalCommission = Math.round(subtotal * formCommRate) / 100;

  const addItem = () => setFormItems([...formItems, emptyItem()]);
  const removeItem = (i: number) => setFormItems(formItems.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, val: unknown) => {
    const next = [...formItems];
    (next[i] as unknown as Record<string, unknown>)[field] = val;
    if (field === 'productId') {
      const prod = products.find((p) => p.id === Number(val));
      if (prod) {
        next[i].unitPrice = prod.salePrice ?? prod.price;
        next[i].itemCode = prod.sku || '';
        next[i].productName = prod.name;
        if (prod.unit) next[i].uom = prod.unit;
      }
    }
    setFormItems(next);
  };

  const addPT = () => setFormPaymentTerms([...formPaymentTerms, emptyPT()]);
  const removePT = (i: number) => setFormPaymentTerms(formPaymentTerms.filter((_, idx) => idx !== i));
  const updatePT = (i: number, field: string, val: unknown) => {
    const next = [...formPaymentTerms];
    (next[i] as unknown as Record<string, unknown>)[field] = val;
    setFormPaymentTerms(next);
  };

  const openDetail = async (order: SalesOrder) => {
    const detail = await api.get<SalesOrder>(`/sales-orders/${order.id}`);
    setDetailOrder(detail);
    setAttachments(detail.attachments || []);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!detailOrder || !e.target.files?.length) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    await fetch(`/api/sales-orders/${detailOrder.id}/attachments`, {
      method: 'POST', body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const updated = await api.get<SOAttachment[]>(`/sales-orders/${detailOrder.id}/attachments`);
    setAttachments(updated);
    e.target.value = '';
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handlePrint = (orderId: number) => {
    window.open(`/api/sales-orders/${orderId}/print`, '_blank');
  };

  const handleCreateDn = async () => {
    if (!detailOrder) return;
    setCreatingDn(true);
    try {
      await api.post('/delivery-notes', { sales_order_id: detailOrder.id });
      setToast('สร้างใบส่งของ (DN) สำเร็จ');
      const updated = await api.get<SalesOrder>(`/sales-orders/${detailOrder.id}`);
      setDetailOrder(updated);
      load();
    } catch {
      setToast('ไม่สามารถสร้าง DN ได้');
    } finally {
      setCreatingDn(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!detailOrder) return;
    setCreatingInv(true);
    try {
      await api.post('/invoices', { sales_order_id: detailOrder.id });
      setToast('สร้างใบแจ้งหนี้ (Invoice) สำเร็จ');
      const updated = await api.get<SalesOrder>(`/sales-orders/${detailOrder.id}`);
      setDetailOrder(updated);
      load();
    } catch {
      setToast('ไม่สามารถสร้าง Invoice ได้');
    } finally {
      setCreatingInv(false);
    }
  };

  const openAdd = () => {
    const today = new Date().toISOString().split('T')[0];
    setFormCustId(''); setFormDate(today);
    setFormDeliveryStart(today); setFormDeliveryEnd(today);
    setFormCustAddress(''); setFormShipName(''); setFormShipAddress('');
    setFormContactPerson(''); setFormContact(''); setFormMobileNo('');
    setFormItems([emptyItem()]); setFormPaymentTemplate('');
    setFormPaymentTerms([]); setFormSalesPartner(''); setFormCommRate(0);
    setFormNotes(''); setFormCreditLimit(0); setFormTaxId('');
    setFormPoNumber(''); setFormPoDate(''); setFormPoNotes('');
    setFormNickName(''); setFormEmail(''); setNoAddressWarning(false);
    setDetailOrder(null);
    setFormOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await api.post('/sales-orders', {
      customerId: Number(formCustId),
      date: formDate,
      deliveryStartDate: formDeliveryStart || null,
      deliveryEndDate: formDeliveryEnd || null,
      customerAddress: formCustAddress || null,
      shippingAddressName: formShipName || null,
      shippingAddress: formShipAddress || null,
      contactPerson: formContactPerson || null,
      contact: formContact || null,
      mobileNo: formMobileNo || null,
      paymentTermsTemplate: formPaymentTemplate || null,
      salesPartner: formSalesPartner || null,
      commissionRate: formCommRate,
      poNumber: formPoNumber || null,
      poDate: formPoDate || null,
      poNotes: formPoNotes || null,
      notes: formNotes || null,
      items: formItems.filter((it) => it.productId > 0).map((it) => ({
        productId: it.productId, itemCode: it.itemCode, quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice), rate: Number(it.rate) || null,
        uom: it.uom, weight: Number(it.weight),
      })),
      paymentTerms: formPaymentTerms.length ? formPaymentTerms : undefined,
    });
    setFormOpen(false); load();
  };

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    await api.put(`/sales-orders/${confirmTarget.id}/confirm`, {});
    setConfirmTarget(null); load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">Loading...</div>;

  // === LIST VIEW ===
  if (!formOpen) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Sales Order</h1>
        <DataTable
          columns={[
            { key: 'orderNumber', label: 'SO#' },
            { key: 'customer', label: 'Customer', render: (o) => (o as SalesOrder).customer?.name || '-' },
            { key: 'date', label: 'Date', render: (o) => (o as SalesOrder).date || '-' },
            { key: 'totalAmount', label: 'Grand Total', render: (o) => `${Number((o as SalesOrder).totalAmount).toLocaleString()}` },
            { key: 'status', label: 'Status', render: (o) => {
              const cfg = statusCfg[(o as SalesOrder).status] ?? statusCfg.draft;
              return <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.color}`}>{cfg.label}</span>;
            }},
          ]}
          data={data}
          getId={(o) => o.id}
          searchPlaceholder="Search Sales Orders..."
          onAdd={openAdd}
          onEdit={(o) => { if (o.status === 'draft') setConfirmTarget(o); }}
          extraActions={(o) => (
            <div className="flex gap-1">
              <button onClick={() => openDetail(o)} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">Detail</button>
              <button onClick={() => handlePrint(o.id)} className="px-2 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100">Print</button>
            </div>
          )}
        />
        {/* Detail Modal */}
        {detailOrder && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDetailOrder(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">{detailOrder.orderNumber}</h2>
                <div className="flex gap-2">
                  {detailOrder.status === 'confirmed' && (
                    <button onClick={handleCreateDn} disabled={creatingDn}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {creatingDn ? 'กำลังสร้าง...' : 'สร้าง DN'}
                    </button>
                  )}
                  {detailOrder.status === 'delivered' && (
                    <button onClick={handleCreateInvoice} disabled={creatingInv}
                      className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                      {creatingInv ? 'กำลังสร้าง...' : 'สร้าง Invoice'}
                    </button>
                  )}
                  <button onClick={() => handlePrint(detailOrder.id)} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Print</button>
                  <button onClick={() => setDetailOrder(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
              </div>
              {/* PO Info */}
              {(detailOrder.poNumber || detailOrder.poDate) && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <h4 className="text-xs font-semibold text-blue-700 mb-1">PO ลูกค้า</h4>
                  <p className="text-sm">PO#: {detailOrder.poNumber || '-'} | Date: {detailOrder.poDate || '-'}</p>
                  {detailOrder.poNotes && <p className="text-sm text-gray-600 mt-1">{detailOrder.poNotes}</p>}
                </div>
              )}
              {/* Customer */}
              <div className="mb-4">
                <p className="text-sm"><strong>ลูกค้า:</strong> {detailOrder.customer?.name || '-'}</p>
                <p className="text-sm"><strong>Grand Total:</strong> {Number(detailOrder.totalAmount).toLocaleString()}</p>
              </div>
              {/* Attachments */}
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-2">เอกสารแนบ / Attachments</h4>
                <div className="mb-3">
                  <label className="inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-sm cursor-pointer hover:bg-indigo-100">
                    <span>+ Attach File</span>
                    <input type="file" className="hidden" onChange={handleUpload} />
                  </label>
                </div>
                {attachments.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีเอกสารแนบ</p>}
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between py-1.5 border-b border-gray-100">
                    <a href={`/api/attachments/${att.filename}`} target="_blank" rel="noreferrer"
                      className="text-sm text-indigo-600 hover:underline">{att.originalName}</a>
                    <span className="text-xs text-gray-400">{att.size ? `${(att.size / 1024).toFixed(1)} KB` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <ConfirmDialog open={!!confirmTarget} message={`Confirm Sales Order "${confirmTarget?.orderNumber}"?`}
          onConfirm={handleConfirm} onCancel={() => setConfirmTarget(null)} />
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg">
            {toast}
          </div>
        )}
      </div>
    );
  }

  // === FORM VIEW (ERPNext style sections) ===
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 border-b pb-2">{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">New Sales Order</h1>
        <button onClick={() => setFormOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">Back to List</button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Section 1: Dashboard */}
        <Section title="Dashboard">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Customer</label>
              <SearchableSelect
                options={customerOptions}
                value={formCustId}
                onChange={(v) => onCustomerChange(Number(v))}
                placeholder="พิมพ์ชื่อ/รหัสลูกค้า..."
                required
              />
            </div>
            <InputField label="Nickname" value={formNickName} onChange={setFormNickName} disabled />
            <InputField label="Date" value={formDate} onChange={setFormDate} type="date" />
            <InputField label="Credit Limit" value={formCreditLimit} onChange={(v) => setFormCreditLimit(Number(v))} type="number" disabled />
            <InputField label="Delivery Start Date" value={formDeliveryStart} onChange={setFormDeliveryStart} type="date" />
            <InputField label="Delivery End Date" value={formDeliveryEnd} onChange={setFormDeliveryEnd} type="date" />
            <InputField label="Tax ID" value={formTaxId} onChange={setFormTaxId} disabled />
            <InputField label="Email" value={formEmail} onChange={setFormEmail} disabled />
          </div>
          {noAddressWarning && (
            <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              ลูกค้ายังไม่มีที่อยู่ในระบบ กรุณาไปเพิ่มที่อยู่ในหน้า Customer ก่อน
            </div>
          )}
        </Section>

        {/* Section 2: Address & Contact */}
        <Section title="Address & Contact">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Customer Address" value={formCustAddress} onChange={setFormCustAddress} />
            <InputField label="Shipping Address Name" value={formShipName} onChange={setFormShipName} />
            <InputField label="Shipping Address" value={formShipAddress} onChange={setFormShipAddress} />
            <InputField label="Contact Person" value={formContactPerson} onChange={setFormContactPerson} />
            <InputField label="Contact" value={formContact} onChange={setFormContact} />
            <InputField label="Mobile No" value={formMobileNo} onChange={setFormMobileNo} />
          </div>
        </Section>

        {/* Section 3: Items */}
        <Section title="Items">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-2">Item Code</th>
                  <th className="pb-2 pr-2">Item Name</th>
                  <th className="pb-2 pr-2 text-right">Qty</th>
                  <th className="pb-2 pr-2 text-right">Rate</th>
                  <th className="pb-2 pr-2">UOM</th>
                  <th className="pb-2 pr-2 text-right">Weight (kg)</th>
                  <th className="pb-2 pr-2 text-right">Amount</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {formItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <input value={item.itemCode || ''} onChange={(e) => updateItem(i, 'itemCode', e.target.value)}
                        className="w-24 px-2 py-1 border rounded text-sm" placeholder="Code" />
                    </td>
                    <td className="py-2 pr-2">
                      <SearchableSelect
                        options={productOptions}
                        value={item.productId}
                        onChange={(v) => updateItem(i, 'productId', Number(v))}
                        placeholder="ค้นสินค้า..."
                        className="w-48"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" min="0" step="0.01" value={item.quantity}
                        onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                        className="w-20 px-2 py-1 border rounded text-sm text-right" />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" step="0.01" value={item.unitPrice}
                        onChange={(e) => updateItem(i, 'unitPrice', Number(e.target.value))}
                        className="w-24 px-2 py-1 border rounded text-sm text-right" />
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
                    <td className="py-2 pr-2 text-right text-gray-600">{(item.quantity * item.unitPrice).toLocaleString()}</td>
                    <td className="py-2">
                      {formItems.length > 1 && (
                        <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">x</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addItem} className="mt-2 text-xs text-indigo-600 hover:text-indigo-800">+ Add Row</button>
          <div className="mt-4 bg-gray-50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">Total Qty</span><div className="font-semibold">{totalQty.toLocaleString()}</div></div>
            <div><span className="text-gray-500">Total Net Weight</span><div className="font-semibold">{totalWeight.toLocaleString()} kg</div></div>
            <div><span className="text-gray-500">Subtotal</span><div className="font-semibold">{subtotal.toLocaleString()}</div></div>
            <div><span className="text-gray-500">Grand Total</span><div className="font-bold text-lg">{totalAmount.toLocaleString()}</div></div>
          </div>
        </Section>

        {/* Section 5: Payment Terms */}
        <Section title="Payment Terms">
          <div className="mb-3">
            <InputField label="Payment Terms Template" value={formPaymentTemplate} onChange={setFormPaymentTemplate} placeholder="e.g. Net 30" />
          </div>
          {formPaymentTerms.length > 0 && (
            <table className="w-full text-sm mb-2">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pr-2">Payment Term</th>
                  <th className="pb-2 pr-2">Description</th>
                  <th className="pb-2 pr-2">Due Date</th>
                  <th className="pb-2 pr-2 text-right">Portion %</th>
                  <th className="pb-2 pr-2 text-right">Amount</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {formPaymentTerms.map((pt, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 pr-2">
                      <input value={pt.paymentTerm} onChange={(e) => updatePT(i, 'paymentTerm', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm" />
                    </td>
                    <td className="py-2 pr-2">
                      <input value={pt.description} onChange={(e) => updatePT(i, 'description', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm" />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="date" value={pt.dueDate} onChange={(e) => updatePT(i, 'dueDate', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm" />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" step="0.01" value={pt.invoicePortion}
                        onChange={(e) => updatePT(i, 'invoicePortion', Number(e.target.value))}
                        className="w-20 px-2 py-1 border rounded text-sm text-right" />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" step="0.01" value={pt.paymentAmount}
                        onChange={(e) => updatePT(i, 'paymentAmount', Number(e.target.value))}
                        className="w-24 px-2 py-1 border rounded text-sm text-right" />
                    </td>
                    <td className="py-2">
                      <button type="button" onClick={() => removePT(i)} className="text-red-400 hover:text-red-600">x</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="button" onClick={addPT} className="text-xs text-indigo-600 hover:text-indigo-800">+ Add Payment Term</button>
        </Section>

        {/* Section 6: Commission */}
        <Section title="Sales Team / Commission">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sales Partner</label>
              <select value={formSalesPartner} onChange={(e) => setFormSalesPartner(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">-- เลือกพนักงานขาย --</option>
                {teamUsers.map((u) => <option key={u.id} value={u.displayName}>{u.displayName}</option>)}
              </select>
            </div>
            <InputField label="Commission Rate (%)" value={formCommRate} onChange={(v) => setFormCommRate(Number(v))} type="number" />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Total Commission</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold">
                {totalCommission.toLocaleString()}
              </div>
            </div>
          </div>
        </Section>

        {/* Section: PO ลูกค้า */}
        <Section title="PO ลูกค้า / Customer Purchase Order">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InputField label="PO Number" value={formPoNumber} onChange={setFormPoNumber} placeholder="เลขที่ PO ลูกค้า" />
            <InputField label="PO Date" value={formPoDate} onChange={setFormPoDate} type="date" />
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">PO Notes</label>
              <textarea value={formPoNotes} onChange={(e) => setFormPoNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="หมายเหตุจาก PO ลูกค้า..." />
            </div>
          </div>
        </Section>

        {/* Notes */}
        <Section title="Notes">
          <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="Additional notes..." />
        </Section>

        {/* Actions */}
        <div className="flex justify-end gap-3 mb-8">
          <button type="button" onClick={() => setFormOpen(false)}
            className="px-6 py-2.5 text-sm rounded-lg border hover:bg-gray-50">Cancel</button>
          <button type="submit"
            className="px-6 py-2.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium">
            Save Sales Order
          </button>
        </div>
      </form>
    </div>
  );
}
