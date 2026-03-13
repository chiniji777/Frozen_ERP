import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface Bom {
  id: number;
  name: string;
  product_id: number;
  product_name?: string;
  total_cost?: number;
}

interface ProductionOrder {
  id: number;
  bom_id: number;
  bom_name?: string;
  product_name?: string;
  quantity: number;
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled';
  material_cost: number;
  labor_cost: number;
  overhead_cost: number;
  total_cost: number;
  cost_per_unit: number;
  created_at?: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: 'ร่าง', color: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'กำลังผลิต', color: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'เสร็จสิ้น', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700' },
};

export default function ProductionPage() {
  const [data, setData] = useState<ProductionOrder[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<ProductionOrder | null>(null);

  const [formBomId, setFormBomId] = useState<number | ''>('');
  const [formQty, setFormQty] = useState('1');
  const [formLabor, setFormLabor] = useState('0');
  const [formOverhead, setFormOverhead] = useState('0');

  const load = async () => {
    setLoading(true);
    try {
      const [orders, bomList] = await Promise.all([
        api.get<ProductionOrder[]>('/production').catch(() => []),
        api.get<Bom[]>('/bom').catch(() => []),
      ]);
      setData(orders);
      setBoms(bomList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const selectedBom = boms.find((b) => b.id === Number(formBomId));
  const materialCost = (selectedBom?.total_cost ?? 0) * Number(formQty || 0);
  const laborCost = Number(formLabor || 0);
  const overheadCost = Number(formOverhead || 0);
  const totalCost = materialCost + laborCost + overheadCost;
  const costPerUnit = Number(formQty) > 0 ? totalCost / Number(formQty) : 0;

  const openAdd = () => {
    setFormBomId('');
    setFormQty('1');
    setFormLabor('0');
    setFormOverhead('0');
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await api.post('/production', {
      bom_id: Number(formBomId),
      quantity: Number(formQty),
      labor_cost: laborCost,
      overhead_cost: overheadCost,
    });
    setModalOpen(false);
    load();
  };

  const handleComplete = async () => {
    if (!completeTarget) return;
    await api.put(`/production/${completeTarget.id}/complete`, {});
    setCompleteTarget(null);
    load();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">🏭 สั่งผลิต</h1>

      <DataTable
        columns={[
          { key: 'id', label: 'รหัส' },
          { key: 'product_name', label: 'สินค้า', render: (o) => o.product_name || o.bom_name || '-' },
          { key: 'quantity', label: 'จำนวน' },
          { key: 'status', label: 'สถานะ', filterable: true, render: (o) => {
            const cfg = statusConfig[o.status] ?? statusConfig.draft;
            return <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.color}`}>{cfg.label}</span>;
          }},
          { key: 'material_cost', label: 'วัตถุดิบ', render: (o) => `฿${Number(o.material_cost).toLocaleString()}` },
          { key: 'labor_cost', label: 'ค่าแรง', render: (o) => `฿${Number(o.labor_cost).toLocaleString()}` },
          { key: 'total_cost', label: 'ต้นทุนรวม', render: (o) => `฿${Number(o.total_cost).toLocaleString()}` },
          { key: 'cost_per_unit', label: 'ต้นทุน/ชิ้น', render: (o) => `฿${Number(o.cost_per_unit).toLocaleString()}` },
        ]}
        data={data}
        getId={(o) => o.id}
        searchPlaceholder="ค้นหารายการผลิต..."
        onAdd={openAdd}
        onEdit={(o) => {
          if (o.status === 'draft' || o.status === 'in_progress') setCompleteTarget(o);
        }}
        onRowClick={(o) => {
          if (o.status === 'draft' || o.status === 'in_progress') setCompleteTarget(o);
        }}
      />

      {/* ปุ่มเสร็จผลิตแสดงในตาราง — ใช้ onEdit เป็น trigger */}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="สร้างรายการผลิตใหม่">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลือก BOM</label>
            <select required value={formBomId} onChange={(e) => setFormBomId(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="">-- เลือก BOM --</option>
              {boms.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.product_name || 'สินค้า #' + b.product_id})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนผลิต</label>
            <input type="number" min="1" required value={formQty} onChange={(e) => setFormQty(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ค่าแรง (บาท)</label>
              <input type="number" step="0.01" value={formLabor} onChange={(e) => setFormLabor(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Overhead (บาท)</label>
              <input type="number" step="0.01" value={formOverhead} onChange={(e) => setFormOverhead(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-sm">
            <h3 className="font-semibold text-gray-700 mb-2">Cost Breakdown</h3>
            <div className="flex justify-between"><span className="text-gray-500">วัตถุดิบ</span><span>฿{materialCost.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">ค่าแรง</span><span>฿{laborCost.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Overhead</span><span>฿{overheadCost.toLocaleString()}</span></div>
            <div className="flex justify-between font-bold border-t mt-2 pt-2"><span>รวมทั้งหมด</span><span>฿{totalCost.toLocaleString()}</span></div>
            <div className="flex justify-between text-indigo-600"><span>ต้นทุน/ชิ้น</span><span>฿{costPerUnit.toLocaleString()}</span></div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">สร้างรายการ</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!completeTarget}
        message={`ยืนยันเสร็จผลิต "${completeTarget?.product_name || 'รายการ #' + completeTarget?.id}"? จะหัก stock วัตถุดิบและเพิ่ม stock สินค้า`}
        onConfirm={handleComplete}
        onCancel={() => setCompleteTarget(null)}
      />
    </div>
  );
}
