import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';
import PrintMenu from '../components/PrintMenu';

interface Customer {
  id: number; name: string; fullName?: string; nickName?: string;
  address?: string; phone?: string; email?: string; taxId?: string;
  creditLimit?: number; paymentTerms?: string; salesPartner?: string;
  commissionRate?: number;
}
interface Product { id: number; name: string; sku?: string; price: number; salePrice?: number; unit?: string; hasVat?: number; }
interface UserInfo { id: number; username: string; displayName: string; role: string; }
interface SOItem {
  productId: number; itemCode?: string; quantity: number; unitPrice: number;
  rate?: number; uom: string; productName?: string;
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

const emptyItem = (): SOItem => ({ productId: 0, itemCode: '', quantity: 1, unitPrice: 0, rate: 0, uom: 'Pcs.' });
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

const Section = ({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
    <div className="flex items-center justify-between mb-4 border-b pb-2">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      {actions}
    </div>
    {children}
  </div>
);

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start py-1.5">
    <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
    <span className="text-sm text-gray-800">{value || '-'}</span>
  </div>
);

export default function SalesOrderPage() {
  const [data, setData] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [teamUsers, setTeamUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SalesOrder | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<SalesOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<SalesOrder | null>(null);
  const [attachments, setAttachments] = useState<SOAttachment[]>([]);
  const [, setCompanyName] = useState('Frozen Food Plus Co., Ltd.');
  const [creatingDn, setCreatingDn] = useState(false);
  const [creatingInv, setCreatingInv] = useState(false);
  const [toast, setToast] = useState('');
  const location = useLocation();

  // Reset to list view when sidebar re-navigates to this page
  useEffect(() => {
    setDetailOrder(null);
    setFormOpen(false);
  }, [location.key]);

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
  const [noAddressWarning, setNoAddressWarning] = useState(false);
  const [formNickName, setFormNickName] = useState('');
  const [formEmail, setFormEmail] = useState('');

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

  const customerOptions = useMemo(() =>
    customers.map((c) => ({ value: c.id, label: c.name, searchText: c.nickName || '' })),
    [customers]
  );
  const productOptions = useMemo(() =>
    products.map((p) => ({ value: p.id, label: p.name, searchText: p.sku || '' })),
    [products]
  );

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

  // Calculations — VAT only for products with hasVat
  const subtotal = formItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const vatableSubtotal = formItems.reduce((s, it) => {
    const prod = products.find((p) => p.id === it.productId);
    if (prod && prod.hasVat !== 0) return s + it.quantity * it.unitPrice;
    return s;
  }, 0);
  const totalQty = formItems.reduce((s, it) => s + it.quantity, 0);
  const vat = Math.round(vatableSubtotal * 7) / 100;
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

  // Open detail view (full page)
  const openDetail = async (order: SalesOrder) => {
    const detail = await api.get<SalesOrder>(`/sales-orders/${order.id}`);
    setDetailOrder(detail);
    setAttachments(detail.attachments || []);
    setFormOpen(false);
  };

  // Open edit form (pre-fill from SO)
  const openEdit = (so: SalesOrder) => {
    setEditing(so);
    setFormCustId(so.customerId);
    setFormDate(so.date || new Date().toISOString().split('T')[0]);
    setFormDeliveryStart(so.deliveryStartDate || '');
    setFormDeliveryEnd(so.deliveryEndDate || '');
    setFormCustAddress(so.customerAddress || '');
    setFormShipName(so.shippingAddressName || '');
    setFormShipAddress(so.shippingAddress || '');
    setFormContactPerson(so.contactPerson || '');
    setFormContact(so.contact || '');
    setFormMobileNo(so.mobileNo || '');
    setFormPaymentTemplate(so.paymentTermsTemplate || '');
    setFormSalesPartner(so.salesPartner || '');
    setFormCommRate(so.commissionRate || 0);
    setFormNotes(so.notes || '');
    setFormPoNumber(so.poNumber || '');
    setFormPoDate(so.poDate || '');
    setFormPoNotes(so.poNotes || '');
    setFormItems(so.items && so.items.length > 0 ? so.items.map(it => ({
      productId: it.productId, itemCode: it.itemCode || '', quantity: it.quantity,
      unitPrice: it.unitPrice, rate: it.rate || 0, uom: it.uom,
      productName: it.productName,
    })) : [emptyItem()]);
    setFormPaymentTerms(so.paymentTerms || []);
    const c = customers.find(x => x.id === so.customerId);
    setFormNickName(c?.nickName || so.customer?.nickName || '');
    setFormEmail(c?.email || so.customer?.email || '');
    setFormCreditLimit(c?.creditLimit || so.customer?.creditLimit || 0);
    setFormTaxId(c?.taxId || so.customer?.taxId || '');
    setNoAddressWarning(false);
    setAttachments(so.attachments || []);
    setDetailOrder(null);
    setFormOpen(true);
  };

  const handleUpload = async (soId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    await fetch(`/api/sales-orders/${soId}/attachments`, {
      method: 'POST', body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const updated = await api.get<SOAttachment[]>(`/sales-orders/${soId}/attachments`);
    setAttachments(updated);
    e.target.value = '';
  };

  const handleDeleteAttachment = async (soId: number, attId: number) => {
    await api.del(`/sales-orders/${soId}/attachments/${attId}`);
    setAttachments(prev => prev.filter(a => a.id !== attId));
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const getPrintOptions = (orderId: number) => [
    { label: 'ใบสั่งขาย (SO)', icon: '📋', path: `/sales-orders/${orderId}/print` },
    { label: 'COA', icon: '🔬', path: `/sales-orders/${orderId}/coa` },
    { label: 'สติ๊กเกอร์', icon: '🏷️', path: `/sales-orders/${orderId}/sticker` },
  ];

  const handleCreateDn = async (soId: number) => {
    setCreatingDn(true);
    try {
      await api.post('/delivery-notes', { salesOrderId: soId });
      setToast('สร้างใบส่งของ (DN) สำเร็จ');
      const updated = await api.get<SalesOrder>(`/sales-orders/${soId}`);
      setDetailOrder(updated);
      setAttachments(updated.attachments || []);
      load();
    } catch {
      setToast('ไม่สามารถสร้าง DN ได้');
    } finally { setCreatingDn(false); }
  };

  const handleCreateInvoice = async (soId: number) => {
    setCreatingInv(true);
    try {
      await api.post('/invoices', { salesOrderId: soId });
      setToast('สร้างใบแจ้งหนี้ (Invoice) สำเร็จ');
      const updated = await api.get<SalesOrder>(`/sales-orders/${soId}`);
      setDetailOrder(updated);
      setAttachments(updated.attachments || []);
      load();
    } catch {
      setToast('ไม่สามารถสร้าง Invoice ได้');
    } finally { setCreatingInv(false); }
  };

  const openAdd = () => {
    const today = new Date().toISOString().split('T')[0];
    setEditing(null);
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
    setAttachments([]);
    setFormOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
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
        uom: it.uom,
      })),
      paymentTerms: formPaymentTerms.length ? formPaymentTerms : undefined,
    };
    if (editing) {
      await api.put(`/sales-orders/${editing.id}`, body);
      setToast('บันทึกการแก้ไขสำเร็จ');
      // Go back to detail view after edit
      const updated = await api.get<SalesOrder>(`/sales-orders/${editing.id}`);
      setFormOpen(false);
      setDetailOrder(updated);
      setAttachments(updated.attachments || []);
    } else {
      await api.post('/sales-orders', body);
      setFormOpen(false);
    }
    load();
  };

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    await api.post(`/sales-orders/${confirmTarget.id}/confirm`, {});
    setConfirmTarget(null);
    // Refresh detail if open
    if (detailOrder && detailOrder.id === confirmTarget.id) {
      const updated = await api.get<SalesOrder>(`/sales-orders/${confirmTarget.id}`);
      setDetailOrder(updated);
    }
    load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">Loading...</div>;

  // ========================================
  // === DETAIL VIEW (Full Page) ===
  // ========================================
  if (detailOrder && !formOpen) {
    const so = detailOrder;
    const cfg = statusCfg[so.status] ?? statusCfg.draft;
    const soItems = so.items || [];
    const soSubtotal = soItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);

    return (
      <div className="max-w-5xl mx-auto min-h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetailOrder(null)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-800">{so.orderNumber}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
          </div>
          <div className="flex gap-2">
            {so.status === 'draft' && (
              <>
                <button onClick={() => openEdit(so)}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  ✏️ แก้ไข
                </button>
                <button onClick={() => setConfirmTarget(so)}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  ✓ Confirm
                </button>
              </>
            )}
            {so.status === 'confirmed' && (
              <>
                <button onClick={() => handleCreateDn(so.id)} disabled={creatingDn}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {creatingDn ? 'กำลังสร้าง...' : '📦 สร้าง DN'}
                </button>
                <button onClick={() => handleCreateInvoice(so.id)} disabled={creatingInv}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                  {creatingInv ? 'กำลังสร้าง...' : '📄 สร้าง Invoice'}
                </button>
              </>
            )}
            {so.status === 'delivered' && (
              <button onClick={() => handleCreateInvoice(so.id)} disabled={creatingInv}
                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                {creatingInv ? 'กำลังสร้าง...' : '📄 สร้าง Invoice'}
              </button>
            )}
            <PrintMenu options={getPrintOptions(so.id)} />
          </div>
        </div>

        {/* Dashboard */}
        <Section title="ข้อมูลทั่วไป">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="ลูกค้า" value={<span className="font-medium">{so.customer?.name || '-'}</span>} />
            <InfoRow label="วันที่" value={so.date} />
            <InfoRow label="Tax ID" value={so.customer?.taxId} />
            <InfoRow label="Credit Limit" value={so.customer?.creditLimit?.toLocaleString()} />
            <InfoRow label="ส่งของ" value={`${so.deliveryStartDate || '-'} ถึง ${so.deliveryEndDate || '-'}`} />
            <InfoRow label="Email" value={so.customer?.email} />
          </div>
        </Section>

        {/* Address & Contact */}
        <Section title="ที่อยู่ & ผู้ติดต่อ">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="ที่อยู่ลูกค้า" value={so.customerAddress} />
            <InfoRow label="ที่อยู่จัดส่ง" value={so.shippingAddress} />
            <InfoRow label="ชื่อจัดส่ง" value={so.shippingAddressName} />
            <InfoRow label="ผู้ติดต่อ" value={so.contactPerson} />
            <InfoRow label="เบอร์ติดต่อ" value={so.contact} />
            <InfoRow label="มือถือ" value={so.mobileNo} />
          </div>
        </Section>

        {/* Items */}
        <Section title={`รายการสินค้า (${soItems.length} รายการ)`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pr-2 w-8">#</th>
                  <th className="pb-2 pr-2">สินค้า</th>
                  <th className="pb-2 pr-2 text-right">จำนวน</th>
                  <th className="pb-2 pr-2">หน่วย</th>
                  <th className="pb-2 pr-2 text-right">ราคา/หน่วย</th>
                  <th className="pb-2 text-right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {soItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2.5 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2.5 pr-2 font-medium">{item.productName || `Product #${item.productId}`}</td>
                    <td className="py-2.5 pr-2 text-right">{item.quantity.toLocaleString()}</td>
                    <td className="py-2.5 pr-2">{item.uom}</td>
                    <td className="py-2.5 pr-2 text-right">{Number(item.unitPrice).toLocaleString()}</td>
                    <td className="py-2.5 text-right font-medium">{(item.quantity * item.unitPrice).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 bg-gray-50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">จำนวนรวม</span><div className="font-semibold">{Number(so.totalQuantity || soItems.reduce((s, it) => s + it.quantity, 0)).toLocaleString()}</div></div>
            <div><span className="text-gray-500">ยอดก่อน VAT</span><div className="font-semibold">฿{soSubtotal.toLocaleString()}</div></div>
            <div><span className="text-gray-500">VAT 7%</span><div className="font-semibold">฿{Number(so.vatAmount).toLocaleString()}</div></div>
            <div><span className="text-gray-500">ยอดรวมทั้งสิ้น</span><div className="font-bold text-lg text-indigo-700">฿{Number(so.totalAmount).toLocaleString()}</div></div>
          </div>
        </Section>

        {/* PO Info */}
        {(so.poNumber || so.poDate || so.poNotes) && (
          <Section title="PO ลูกค้า">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <InfoRow label="PO Number" value={so.poNumber} />
              <InfoRow label="PO Date" value={so.poDate} />
            </div>
            {so.poNotes && <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">{so.poNotes}</div>}
          </Section>
        )}

        {/* Payment & Commission */}
        <Section title="เงื่อนไขการชำระ & Commission">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="เงื่อนไข" value={so.paymentTermsTemplate} />
            <InfoRow label="Sales Partner" value={so.salesPartner} />
            <InfoRow label="Commission Rate" value={so.commissionRate ? `${so.commissionRate}%` : '-'} />
            <InfoRow label="Total Commission" value={so.totalCommission ? `฿${Number(so.totalCommission).toLocaleString()}` : '-'} />
          </div>
          {so.paymentTerms && so.paymentTerms.length > 0 && (
            <div className="mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="pb-2 pr-2">งวด</th>
                    <th className="pb-2 pr-2">คำอธิบาย</th>
                    <th className="pb-2 pr-2">กำหนด</th>
                    <th className="pb-2 pr-2 text-right">สัดส่วน %</th>
                    <th className="pb-2 text-right">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  {so.paymentTerms.map((pt, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 pr-2">{pt.paymentTerm}</td>
                      <td className="py-2 pr-2">{pt.description}</td>
                      <td className="py-2 pr-2">{pt.dueDate}</td>
                      <td className="py-2 pr-2 text-right">{pt.invoicePortion}%</td>
                      <td className="py-2 text-right">{Number(pt.paymentAmount).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Notes */}
        {so.notes && (
          <Section title="หมายเหตุ">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{so.notes}</p>
          </Section>
        )}

        {/* ===== ATTACHMENTS ===== */}
        <Section title={`เอกสารแนบ (${attachments.length})`}
          actions={
            <label className="inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs cursor-pointer hover:bg-indigo-100 font-medium">
              <span>+ แนบไฟล์</span>
              <input type="file" className="hidden" onChange={(e) => handleUpload(so.id, e)} />
            </label>
          }
        >
          {attachments.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">📎</div>
              <p className="text-sm">ยังไม่มีเอกสารแนบ</p>
              <p className="text-xs mt-1">กดปุ่ม "+ แนบไฟล์" ด้านบนเพื่อเพิ่ม</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📄</span>
                    <div>
                      <a href={`/api/attachments/${att.filename}`} target="_blank" rel="noreferrer"
                        className="text-sm text-indigo-600 hover:underline font-medium">{att.originalName}</a>
                      <div className="text-xs text-gray-400">
                        {att.size ? `${(att.size / 1024).toFixed(1)} KB` : ''}
                        {att.createdAt ? ` • ${new Date(att.createdAt).toLocaleDateString('th-TH')}` : ''}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteAttachment(so.id, att.id)}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1">ลบ</button>
                </div>
              ))}
            </div>
          )}
        </Section>

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

  // ========================================
  // === LIST VIEW ===
  // ========================================
  if (!formOpen) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Sales Order</h1>
        <DataTable
          columns={[
            { key: 'orderNumber', label: 'SO#' },
            { key: 'customer', label: 'Customer', render: (o) => (o as SalesOrder).customer?.name || '-' },
            { key: 'date', label: 'Date', render: (o) => (o as SalesOrder).date || '-' },
            { key: 'totalAmount', label: 'Grand Total', render: (o) => `฿${Number((o as SalesOrder).totalAmount).toLocaleString()}` },
            { key: 'status', label: 'Status', render: (o) => {
              const cfg2 = statusCfg[(o as SalesOrder).status] ?? statusCfg.draft;
              return <span className={`px-2 py-0.5 rounded-full text-xs ${cfg2.color}`}>{cfg2.label}</span>;
            }},
          ]}
          data={data}
          getId={(o) => o.id}
          searchPlaceholder="ค้นหา Sales Order..."
          onAdd={openAdd}
          onRowClick={(o) => openDetail(o)}
          extraActions={(o) => (
            <div className="flex gap-1">
              <button onClick={(e) => { e.stopPropagation(); openDetail(o); }} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">Detail</button>
              <PrintMenu options={getPrintOptions(o.id)} className="text-xs" />
            </div>
          )}
        />
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg">
            {toast}
          </div>
        )}
      </div>
    );
  }

  // ========================================
  // === FORM VIEW (Create / Edit) ===
  // ========================================
  return (
    <div className="max-w-5xl mx-auto min-h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">
          {editing ? `แก้ไข ${editing.orderNumber}` : 'สร้าง Sales Order ใหม่'}
        </h1>
        <button onClick={() => {
          setFormOpen(false);
          if (editing) {
            // Go back to detail view
            openDetail(editing);
          }
        }} className="text-gray-400 hover:text-gray-600 text-sm">
          {editing ? '← กลับหน้ารายละเอียด' : '← กลับรายการ'}
        </button>
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
                  <th className="pb-2 pr-2 w-8">#</th>
                  <th className="pb-2 pr-2">สินค้า</th>
                  <th className="pb-2 pr-2 text-right w-20">จำนวน</th>
                  <th className="pb-2 pr-2 w-16">หน่วย</th>
                  <th className="pb-2 pr-2 text-right w-24">ราคา/หน่วย</th>
                  <th className="pb-2 pr-2 text-right w-24">รวม</th>
                  <th className="pb-2 pr-2 text-center w-10">VAT</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {formItems.map((item, i) => {
                  const prod = products.find((p) => p.id === item.productId);
                  const hasVat = prod ? prod.hasVat !== 0 : true;
                  return (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
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
                        <input value={item.uom} onChange={(e) => updateItem(i, 'uom', e.target.value)}
                          className="w-16 px-2 py-1 border rounded text-sm" />
                      </td>
                      <td className="py-2 pr-2">
                        <input type="number" step="0.01" value={item.unitPrice}
                          onChange={(e) => updateItem(i, 'unitPrice', Number(e.target.value))}
                          className="w-24 px-2 py-1 border rounded text-sm text-right" />
                      </td>
                      <td className="py-2 pr-2 text-right font-medium">{(item.quantity * item.unitPrice).toLocaleString()}</td>
                      <td className="py-2 pr-2 text-center">
                        {hasVat ? <span className="text-xs text-green-600">✓</span> : <span className="text-xs text-gray-400">-</span>}
                      </td>
                      <td className="py-2">
                        {formItems.length > 1 && (
                          <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">x</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addItem} className="mt-2 text-xs text-indigo-600 hover:text-indigo-800">+ Add Row</button>
          <div className="mt-4 bg-gray-50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">จำนวนรวม</span><div className="font-semibold">{totalQty.toLocaleString()}</div></div>
            <div><span className="text-gray-500">ยอดก่อน VAT</span><div className="font-semibold">{subtotal.toLocaleString()}</div></div>
            <div><span className="text-gray-500">VAT 7% <span className="text-xs">(เฉพาะสินค้ามี VAT)</span></span><div className="font-semibold">{vat.toLocaleString()}</div></div>
            <div><span className="text-gray-500">ยอดรวมทั้งสิ้น</span><div className="font-bold text-lg text-indigo-700">{totalAmount.toLocaleString()}</div></div>
          </div>
        </Section>

        {/* Section: Payment Terms */}
        <Section title="Payment Terms">
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">เงื่อนไขการชำระ</label>
            <select value={formPaymentTemplate} onChange={(e) => setFormPaymentTemplate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">-- เลือกเงื่อนไข --</option>
              <option value="COD">COD (เงินสด)</option>
              <option value="Net 7">Net 7 วัน</option>
              <option value="Net 15">Net 15 วัน</option>
              <option value="Net 30">Net 30 วัน</option>
              <option value="Net 45">Net 45 วัน</option>
              <option value="Net 60">Net 60 วัน</option>
              <option value="Net 90">Net 90 วัน</option>
              <option value="50/50">มัดจำ 50% / ส่งมอบ 50%</option>
              <option value="Custom">กำหนดเอง</option>
            </select>
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

        {/* Section: Commission */}
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

        {/* Section: PO */}
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

        {/* ===== ATTACHMENTS (in edit mode) ===== */}
        {editing && (
          <Section title={`เอกสารแนบ (${attachments.length})`}
            actions={
              <label className="inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs cursor-pointer hover:bg-indigo-100 font-medium">
                <span>+ แนบไฟล์</span>
                <input type="file" className="hidden" onChange={(e) => handleUpload(editing.id, e)} />
              </label>
            }
          >
            {attachments.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <div className="text-2xl mb-1">📎</div>
                <p className="text-sm">ยังไม่มีเอกสารแนบ</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📄</span>
                      <div>
                        <a href={`/api/attachments/${att.filename}`} target="_blank" rel="noreferrer"
                          className="text-sm text-indigo-600 hover:underline font-medium">{att.originalName}</a>
                        <div className="text-xs text-gray-400">
                          {att.size ? `${(att.size / 1024).toFixed(1)} KB` : ''}
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => handleDeleteAttachment(editing.id, att.id)}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1">ลบ</button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 mb-8">
          <button type="button" onClick={() => {
            setFormOpen(false);
            if (editing) openDetail(editing);
          }}
            className="px-6 py-2.5 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
          <button type="submit"
            className="px-6 py-2.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium">
            {editing ? '💾 บันทึกการแก้ไข' : '💾 Save Sales Order'}
          </button>
        </div>
      </form>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
