import { useState, useEffect, useRef, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';

interface Invoice { id: number; invoice_number: string; customer_name?: string; total_amount: number; status: string; }
interface Payment {
  id: number;
  invoice_id: number;
  invoice_number?: string;
  customer_name?: string;
  amount: number;
  method: string;
  reference: string;
  slip_url?: string;
  invoice_status?: string;
  created_at?: string;
}

interface OcrResult {
  amount?: number;
  date?: string;
  sender?: string;
  receiver?: string;
  raw?: string;
}

interface MatchedInvoice {
  invoice: Invoice;
  matchType: 'exact' | 'close' | 'none';
}

const methodLabels: Record<string, string> = { cash: 'เงินสด', transfer: 'โอน', cheque: 'เช็ค' };

export default function PaymentPage() {
  const [data, setData] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState('');

  // Manual form
  const [formInvId, setFormInvId] = useState<number | ''>('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState('transfer');
  const [formRef, setFormRef] = useState('');

  // Slip/Amount matching modal
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchTab, setMatchTab] = useState<'slip' | 'amount'>('slip');
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [matchedInvoices, setMatchedInvoices] = useState<MatchedInvoice[]>([]);
  const [selectedMatchIds, setSelectedMatchIds] = useState<number[]>([]);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual amount matching
  const [manualAmount, setManualAmount] = useState('');
  const [manualCustomer, setManualCustomer] = useState('');
  const [combos, setCombos] = useState<Invoice[][]>([]);
  const [selectedComboIdx, setSelectedComboIdx] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [pays, ivs] = await Promise.all([
        api.get<Payment[]>('/payments').catch(() => []),
        api.get<Invoice[]>('/invoices').catch(() => []),
      ]);
      setData(pays); setInvoices(ivs.filter((iv) => iv.status === 'sent' || iv.status === 'draft'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const selectedInv = invoices.find((iv) => iv.id === Number(formInvId));

  const openAdd = () => {
    setFormInvId(''); setFormAmount(''); setFormMethod('transfer'); setFormRef('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await api.post('/payments', {
      invoice_id: Number(formInvId),
      amount: Number(formAmount),
      method: formMethod,
      reference: formRef,
    });
    setModalOpen(false); load();
  };

  // --- Open matching modal ---
  const openMatchModal = (tab: 'slip' | 'amount' = 'slip') => {
    setSlipFile(null); setSlipPreview(''); setOcrResult(null);
    setMatchedInvoices([]); setSelectedMatchIds([]);
    setManualAmount(''); setManualCustomer(''); setCombos([]); setSelectedComboIdx(null);
    setMatchTab(tab);
    setMatchModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSlipFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setSlipPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setOcrResult(null); setMatchedInvoices([]); setSelectedMatchIds([]);
  };

  // --- Match invoices from OCR result ---
  const matchInvoices = (ocrAmount?: number): MatchedInvoice[] => {
    if (!ocrAmount || invoices.length === 0) return [];
    const tolerance = 0.05; // 5% tolerance for close match
    return invoices.map((iv) => {
      const diff = Math.abs(iv.total_amount - ocrAmount);
      const pct = iv.total_amount > 0 ? diff / iv.total_amount : 1;
      let matchType: 'exact' | 'close' | 'none' = 'none';
      if (diff < 1) matchType = 'exact'; // within 1 baht = exact
      else if (pct <= tolerance) matchType = 'close';
      return { invoice: iv, matchType };
    }).filter((m) => m.matchType !== 'none')
      .sort((a, b) => (a.matchType === 'exact' ? 0 : 1) - (b.matchType === 'exact' ? 0 : 1));
  };

  // --- OCR Scan ---
  const handleOcrScan = async () => {
    if (!slipFile) return;
    setOcrLoading(true);
    try {
      const formData = new FormData();
      formData.append('slip', slipFile);
      const result = await api.postForm<OcrResult>('/payments/ocr-slip', formData);
      setOcrResult(result);
      const matches = matchInvoices(result.amount);
      setMatchedInvoices(matches);
      if (matches.length === 1) setSelectedMatchIds([matches[0].invoice.id]);
    } catch {
      // Mock OCR for frontend development
      const mockResult: OcrResult = {
        amount: 15750,
        date: new Date().toISOString().split('T')[0],
        sender: 'นาย ทดสอบ ระบบ',
        receiver: 'บจก. อาหารแช่แข็ง พลัส',
      };
      setOcrResult(mockResult);
      const matches = matchInvoices(mockResult.amount);
      setMatchedInvoices(matches);
      if (matches.length === 1) setSelectedMatchIds([matches[0].invoice.id]);
      setToast('ใช้ข้อมูล mock (API ยังไม่พร้อม)');
    } finally {
      setOcrLoading(false);
    }
  };

  // --- Find combination of invoices that sum to target amount ---
  const findCombinations = (targetAmount: number, pool: Invoice[], maxResults = 5): Invoice[][] => {
    const results: Invoice[][] = [];
    const sorted = [...pool].sort((a, b) => b.total_amount - a.total_amount);
    const search = (remaining: number, start: number, current: Invoice[]) => {
      if (results.length >= maxResults) return;
      if (Math.abs(remaining) < 1) { results.push([...current]); return; }
      if (remaining < 0) return;
      for (let i = start; i < sorted.length; i++) {
        if (sorted[i].total_amount > remaining + 1) continue;
        current.push(sorted[i]);
        search(remaining - sorted[i].total_amount, i + 1, current);
        current.pop();
      }
    };
    search(targetAmount, 0, []);
    return results;
  };

  // --- Manual amount search ---
  const handleManualSearch = () => {
    const amt = Number(manualAmount);
    if (!amt || amt <= 0) return;
    // Step 1: direct match
    const direct = matchInvoices(amt);
    setMatchedInvoices(direct);
    if (direct.length > 0) {
      if (direct.length === 1) setSelectedMatchIds([direct[0].invoice.id]);
      setCombos([]);
      return;
    }
    // Step 2: filter by customer if selected, then find combos
    const pool = manualCustomer
      ? invoices.filter((iv) => iv.customer_name === manualCustomer)
      : invoices;
    const found = findCombinations(amt, pool);
    setCombos(found);
    setSelectedComboIdx(found.length === 1 ? 0 : null);
    setSelectedMatchIds([]);
  };

  // --- Confirm payment (shared by both tabs) ---
  const getConfirmInvoiceIds = (): number[] => {
    if (matchTab === 'amount' && selectedComboIdx !== null && combos[selectedComboIdx]) {
      return combos[selectedComboIdx].map((iv) => iv.id);
    }
    return selectedMatchIds;
  };

  const getConfirmAmount = (): number => {
    if (matchTab === 'slip') return ocrResult?.amount || 0;
    return Number(manualAmount) || 0;
  };

  const handleConfirmPayment = async () => {
    const ids = getConfirmInvoiceIds();
    const amount = getConfirmAmount();
    if (ids.length === 0 || !amount) return;
    setConfirmLoading(true);
    try {
      for (const invId of ids) {
        const iv = invoices.find((x) => x.id === invId);
        const payAmount = ids.length === 1 ? amount : (iv?.total_amount || amount);
        if (matchTab === 'slip' && slipFile) {
          const fd = new FormData();
          fd.append('slip', slipFile);
          fd.append('invoice_id', String(invId));
          fd.append('amount', String(payAmount));
          fd.append('method', 'transfer');
          fd.append('reference', `OCR: ${ocrResult?.sender || ''} ${ocrResult?.date || ''}`);
          try { await api.postForm('/payments/from-slip', fd); continue; } catch { /* fallback below */ }
        }
        await api.post('/payments', {
          invoice_id: invId,
          amount: payAmount,
          method: 'transfer',
          reference: matchTab === 'slip'
            ? `สลิป: ${ocrResult?.sender || ''} ${ocrResult?.date || ''}`
            : `ใส่ยอด: ฿${amount.toLocaleString()}`,
        });
      }
      setMatchModalOpen(false);
      setToast(`บันทึกรับชำระ ${ids.length} รายการสำเร็จ`);
      load();
    } catch {
      setToast('ไม่สามารถบันทึกได้');
    } finally {
      setConfirmLoading(false);
    }
  };

  // --- View detail for row click ---
  const [viewPayment, setViewPayment] = useState<Payment | null>(null);

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">💰 รับชำระเงิน</h1>

      {/* Toolbar buttons */}
      <div className="flex gap-2 mb-4">
        <button onClick={openAdd}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors">
          + บันทึกรับชำระ
        </button>
        <button onClick={() => openMatchModal('slip')}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition-colors">
          📷 Upload สลิป
        </button>
        <button onClick={() => openMatchModal('amount')}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium transition-colors">
          🔢 ใส่ยอดจับคู่
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'id', label: 'รหัส' },
          { key: 'invoice_number', label: 'ใบแจ้งหนี้' },
          { key: 'customer_name', label: 'ลูกค้า' },
          { key: 'amount', label: 'จำนวนเงิน', render: (p) => `฿${(Number(p.amount) || 0).toLocaleString()}` },
          { key: 'method', label: 'วิธีชำระ', render: (p) => methodLabels[p.method] ?? p.method },
          { key: 'reference', label: 'อ้างอิง' },
          { key: 'invoice_status', label: 'สถานะ IV', render: (p) => (
            <span className={`px-2 py-0.5 rounded-full text-xs ${p.invoice_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {p.invoice_status === 'paid' ? 'ชำระครบ' : 'ยังไม่ครบ'}
            </span>
          )},
        ]}
        data={data}
        getId={(p) => p.id}
        searchPlaceholder="ค้นหาการชำระเงิน..."
        onRowClick={(p) => setViewPayment(p)}
      />

      {/* View Payment Detail Modal */}
      <Modal open={!!viewPayment} onClose={() => setViewPayment(null)} title={`รายละเอียดการชำระ #${viewPayment?.id || ''}`}>
        {viewPayment && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-500">ใบแจ้งหนี้:</span> {viewPayment.invoice_number || '-'}</div>
              <div><span className="text-gray-500">ลูกค้า:</span> {viewPayment.customer_name || '-'}</div>
              <div><span className="text-gray-500">จำนวนเงิน:</span> ฿{(Number(viewPayment.amount) || 0).toLocaleString()}</div>
              <div><span className="text-gray-500">วิธีชำระ:</span> {methodLabels[viewPayment.method] ?? viewPayment.method}</div>
              <div><span className="text-gray-500">อ้างอิง:</span> {viewPayment.reference || '-'}</div>
              <div><span className="text-gray-500">วันที่:</span> {viewPayment.created_at?.slice(0, 10) || '-'}</div>
            </div>
            {viewPayment.slip_url && (
              <div>
                <span className="text-gray-500 text-xs">สลิป:</span>
                <img src={viewPayment.slip_url} alt="slip" className="mt-1 max-w-xs rounded-lg border" />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Manual Add Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="บันทึกรับชำระเงิน">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลือกใบแจ้งหนี้</label>
            <select required value={formInvId} onChange={(e) => { setFormInvId(Number(e.target.value)); const iv = invoices.find((x) => x.id === Number(e.target.value)); if (iv) setFormAmount(String(iv.total_amount)); }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="">-- เลือก Invoice --</option>
              {invoices.map((iv) => <option key={iv.id} value={iv.id}>{iv.invoice_number} — {iv.customer_name} (฿{Number(iv.total_amount).toLocaleString()})</option>)}
            </select>
            {selectedInv && <p className="text-xs text-gray-400 mt-1">ยอด: ฿{Number(selectedInv.total_amount).toLocaleString()}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท)</label>
            <input type="number" step="0.01" required value={formAmount} onChange={(e) => setFormAmount(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">วิธีชำระ</label>
            <select value={formMethod} onChange={(e) => setFormMethod(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="cash">เงินสด</option>
              <option value="transfer">โอน</option>
              <option value="cheque">เช็ค</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
            <input value={formRef} onChange={(e) => setFormRef(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="เลขอ้างอิง / หมายเลขเช็ค" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">บันทึก</button>
          </div>
        </form>
      </Modal>

      {/* Matching Modal (Slip OCR / Manual Amount) */}
      <Modal open={matchModalOpen} onClose={() => setMatchModalOpen(false)} title="จับคู่รับชำระเงิน">
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button onClick={() => setMatchTab('slip')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${matchTab === 'slip' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              📷 Upload สลิป
            </button>
            <button onClick={() => setMatchTab('amount')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${matchTab === 'amount' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              🔢 ใส่ยอดเอง
            </button>
          </div>

          {/* Tab: Slip Upload */}
          {matchTab === 'slip' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">1. เลือกรูปสลิป</label>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm hover:bg-gray-200 transition-colors">
                    📁 เลือกไฟล์
                  </button>
                  <button type="button" onClick={() => { if (fileInputRef.current) { fileInputRef.current.capture = 'environment'; fileInputRef.current.click(); } }}
                    className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm hover:bg-gray-200 transition-colors">
                    📷 ถ่ายรูป
                  </button>
                </div>
                {slipFile && <p className="text-xs text-gray-500 mt-1">{slipFile.name} ({(slipFile.size / 1024).toFixed(0)} KB)</p>}
              </div>
              {slipPreview && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Preview</label>
                  <img src={slipPreview} alt="slip preview" className="max-w-full max-h-48 rounded-lg border border-gray-200 object-contain" />
                </div>
              )}
              {slipFile && !ocrResult && (
                <button type="button" onClick={handleOcrScan} disabled={ocrLoading}
                  className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {ocrLoading ? (
                    <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> กำลังอ่านสลิป...</>
                  ) : '2. Scan สลิป (OCR)'}
                </button>
              )}
              {ocrResult && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">ผล OCR</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">จำนวนเงิน:</span> <span className="font-semibold text-indigo-700">฿{(ocrResult.amount || 0).toLocaleString()}</span></div>
                    <div><span className="text-gray-500">วันที่:</span> {ocrResult.date || '-'}</div>
                    <div><span className="text-gray-500">ผู้โอน:</span> {ocrResult.sender || '-'}</div>
                    <div><span className="text-gray-500">ผู้รับ:</span> {ocrResult.receiver || '-'}</div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Tab: Manual Amount */}
          {matchTab === 'amount' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">1. พิมพ์ยอดเงินที่ได้รับ</label>
                <input type="number" step="0.01" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="เช่น 15750"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">2. เลือกลูกค้า (ถ้ายอดไม่ตรงบิลเดียว)</label>
                <select value={manualCustomer} onChange={(e) => setManualCustomer(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                  <option value="">-- ทุกลูกค้า --</option>
                  {[...new Set(invoices.map((iv) => iv.customer_name).filter(Boolean))].map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={handleManualSearch} disabled={!manualAmount || Number(manualAmount) <= 0}
                className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors disabled:opacity-50">
                🔍 ค้นหาบิลที่ตรงกัน
              </button>
            </>
          )}

          {/* Shared: Invoice Matching Results */}
          {((matchTab === 'slip' && ocrResult) || (matchTab === 'amount' && (matchedInvoices.length > 0 || combos.length > 0))) && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">จับคู่ใบแจ้งหนี้</h4>

              {/* Single invoice matches */}
              {matchedInvoices.length > 0 && (
                <div className="space-y-2 mb-3">
                  {matchedInvoices.map(({ invoice: iv, matchType }) => (
                    <label key={iv.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                        selectedMatchIds.includes(iv.id)
                          ? 'border-indigo-500 bg-indigo-50'
                          : matchType === 'exact'
                            ? 'border-green-300 bg-green-50 hover:border-green-400'
                            : 'border-yellow-300 bg-yellow-50 hover:border-yellow-400'
                      }`}>
                      <input type="radio" name="matchInvoice" value={iv.id}
                        checked={selectedMatchIds.includes(iv.id)}
                        onChange={() => { setSelectedMatchIds([iv.id]); setSelectedComboIdx(null); }}
                        className="text-indigo-600 focus:ring-indigo-500" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{iv.invoice_number}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            matchType === 'exact' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'
                          }`}>
                            {matchType === 'exact' ? 'ตรงเป๊ะ' : 'ใกล้เคียง'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{iv.customer_name} · ฿{Number(iv.total_amount).toLocaleString()}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Combination matches */}
              {combos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">พบชุดบิลที่รวมยอดตรง ฿{Number(manualAmount).toLocaleString()}:</p>
                  {combos.map((combo, idx) => (
                    <label key={idx}
                      className={`block p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                        selectedComboIdx === idx ? 'border-indigo-500 bg-indigo-50' : 'border-green-300 bg-green-50 hover:border-green-400'
                      }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <input type="radio" name="comboMatch" checked={selectedComboIdx === idx}
                          onChange={() => { setSelectedComboIdx(idx); setSelectedMatchIds([]); }}
                          className="text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm font-medium">ชุดที่ {idx + 1}</span>
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-200 text-green-800">รวมตรง</span>
                      </div>
                      <div className="ml-6 space-y-0.5">
                        {combo.map((iv) => (
                          <div key={iv.id} className="text-xs text-gray-600">
                            {iv.invoice_number} — {iv.customer_name} · ฿{Number(iv.total_amount).toLocaleString()}
                          </div>
                        ))}
                        <div className="text-xs font-semibold text-indigo-700 pt-1 border-t border-green-200">
                          รวม: ฿{combo.reduce((s, iv) => s + iv.total_amount, 0).toLocaleString()}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* No matches at all */}
              {matchedInvoices.length === 0 && combos.length === 0 && (
                <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                  ไม่พบบิลที่ยอดตรง/รวมกันได้
                  <div className="mt-2">
                    <label className="block text-xs text-gray-500 mb-1">เลือกใบแจ้งหนี้เอง:</label>
                    <select value={selectedMatchIds[0] || ''} onChange={(e) => setSelectedMatchIds([Number(e.target.value)])}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="">-- เลือก --</option>
                      {invoices.map((iv) => (
                        <option key={iv.id} value={iv.id}>{iv.invoice_number} — {iv.customer_name} (฿{Number(iv.total_amount).toLocaleString()})</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Confirm button */}
          {(selectedMatchIds.length > 0 || selectedComboIdx !== null) && (
            <button type="button" onClick={handleConfirmPayment} disabled={confirmLoading}
              className="w-full px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {confirmLoading ? (
                <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> กำลังบันทึก...</>
              ) : `✅ ยืนยันรับชำระ${getConfirmInvoiceIds().length > 1 ? ` (${getConfirmInvoiceIds().length} บิล)` : ''}`}
            </button>
          )}
        </div>
      </Modal>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
