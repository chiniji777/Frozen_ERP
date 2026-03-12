import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

interface RawMaterial {
  id: number;
  name: string;
  unit: string;
  pricePerUnit: number;
}

interface BomItem {
  rawMaterialId: number;
  quantity: number;
  unit: string;
  materialName?: string;
  pricePerUnit?: number;
}

interface Product {
  id: number;
  name: string;
}

interface Bom {
  id: number;
  name: string;
  description?: string;
  productId: number;
  laborCost?: number;
  overheadCost?: number;
  product?: Product;
  items: BomItem[];
}

function calcItemCost(item: BomItem): number {
  return (item.pricePerUnit || 0) * (item.quantity || 0);
}

function calcTotalCost(items: BomItem[]): number {
  return items.reduce((sum, it) => sum + calcItemCost(it), 0);
}

export default function BomPage() {
  const [data, setData] = useState<Bom[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Bom | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bom | null>(null);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formProductId, setFormProductId] = useState<number | ''>('');
  const [formLaborCost, setFormLaborCost] = useState(0);
  const [formOverheadCost, setFormOverheadCost] = useState(0);
  const [formItems, setFormItems] = useState<BomItem[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [boms, prods, mats] = await Promise.all([
        api.get<Bom[]>('/bom').catch(() => []),
        api.get<Product[]>('/products').catch(() => []),
        api.get<RawMaterial[]>('/raw-materials').catch(() => []),
      ]);
      setData(boms);
      setProducts(prods);
      setMaterials(mats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setFormName('');
    setFormDescription('');
    setFormProductId('');
    setFormLaborCost(0);
    setFormOverheadCost(0);
    setFormItems([{ rawMaterialId: 0, quantity: 1, unit: '' }]);
    setModalOpen(true);
  };

  const openEdit = (b: Bom) => {
    setEditing(b);
    setFormName(b.name);
    setFormDescription(b.description || '');
    setFormProductId(b.productId);
    setFormLaborCost(b.laborCost || 0);
    setFormOverheadCost(b.overheadCost || 0);
    setFormItems(b.items.length > 0 ? b.items.map(it => ({
      rawMaterialId: it.rawMaterialId,
      quantity: it.quantity,
      unit: it.unit,
      materialName: it.materialName,
      pricePerUnit: it.pricePerUnit,
    })) : [{ rawMaterialId: 0, quantity: 1, unit: '' }]);
    setModalOpen(true);
  };

  const addItem = () => setFormItems([...formItems, { rawMaterialId: 0, quantity: 1, unit: '' }]);
  const removeItem = (i: number) => setFormItems(formItems.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, val: unknown) => {
    const next = [...formItems];
    (next[i] as unknown as Record<string, unknown>)[field] = val;
    if (field === 'rawMaterialId') {
      const mat = materials.find((m) => m.id === Number(val));
      if (mat) {
        next[i].unit = mat.unit;
        next[i].pricePerUnit = mat.pricePerUnit;
        next[i].materialName = mat.name;
      }
    }
    setFormItems(next);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name: formName,
      description: formDescription,
      productId: Number(formProductId),
      laborCost: formLaborCost,
      overheadCost: formOverheadCost,
      items: formItems.filter((it) => it.rawMaterialId > 0).map((it) => ({
        rawMaterialId: it.rawMaterialId,
        quantity: Number(it.quantity),
        unit: it.unit,
      })),
    };
    if (editing) {
      await api.put(`/bom/${editing.id}`, body);
    } else {
      await api.post('/bom', body);
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.del(`/bom/${deleteTarget.id}`);
    setDeleteTarget(null);
    load();
  };

  // Calculate live cost from form items (lookup material prices)
  const liveFormItems = formItems.map(it => ({
    ...it,
    pricePerUnit: it.pricePerUnit ?? materials.find(m => m.id === it.rawMaterialId)?.pricePerUnit ?? 0,
  }));
  const liveMaterialCost = calcTotalCost(liveFormItems);
  const liveGrandTotal = liveMaterialCost + formLaborCost + formOverheadCost;

  if (loading) return <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">📋 BOM (Bill of Materials)</h1>

      <DataTable
        columns={[
          { key: 'id', label: 'รหัส' },
          { key: 'name', label: 'ชื่อ BOM' },
          { key: 'productId', label: 'สินค้า', render: (b: Bom) => b.product?.name || products.find((p) => p.id === b.productId)?.name || '-' },
          { key: 'items', label: 'วัตถุดิบ', render: (b: Bom) => `${b.items?.length ?? 0} รายการ` },
          {
            key: 'totalCost', label: 'ต้นทุนรวม',
            render: (b: Bom) => {
              const materialCost = calcTotalCost(b.items || []);
              const total = materialCost + (b.laborCost || 0) + (b.overheadCost || 0);
              return <span className="font-semibold text-emerald-700">฿{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>;
            },
          },
        ]}
        data={data}
        getId={(b) => b.id}
        searchPlaceholder="ค้นหา BOM..."
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(b) => setDeleteTarget(b)}
        onRowClick={openEdit}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'แก้ไข BOM' : 'สร้าง BOM ใหม่'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ BOM</label>
            <input required value={formName} onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">สินค้า</label>
            <select required value={formProductId} onChange={(e) => setFormProductId(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="">-- เลือกสินค้า --</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด</label>
            <textarea rows={2} value={formDescription} onChange={(e) => setFormDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">วัตถุดิบ</label>
              <button type="button" onClick={addItem} className="text-xs text-indigo-600 hover:text-indigo-800">+ เพิ่มรายการ</button>
            </div>

            {/* Header */}
            <div className="grid grid-cols-12 gap-1 text-xs text-gray-500 mb-1 px-1">
              <div className="col-span-4">วัตถุดิบ</div>
              <div className="col-span-2 text-right">จำนวน</div>
              <div className="col-span-1">หน่วย</div>
              <div className="col-span-2 text-right">ราคา/หน่วย</div>
              <div className="col-span-2 text-right">รวม</div>
              <div className="col-span-1"></div>
            </div>

            <div className="flex flex-col gap-1.5">
              {formItems.map((item, i) => {
                const mat = materials.find((m) => m.id === item.rawMaterialId);
                const price = item.pricePerUnit ?? mat?.pricePerUnit ?? 0;
                const cost = price * (item.quantity || 0);
                return (
                  <div key={i} className="grid grid-cols-12 gap-1 items-center">
                    <select value={item.rawMaterialId} onChange={(e) => updateItem(i, 'rawMaterialId', Number(e.target.value))}
                      className="col-span-4 px-2 py-1.5 border rounded text-sm">
                      <option value={0}>-- เลือก --</option>
                      {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                      className="col-span-2 px-2 py-1.5 border rounded text-sm text-right" />
                    <span className="col-span-1 text-xs text-gray-500 truncate">{item.unit || mat?.unit || ''}</span>
                    <span className="col-span-2 text-xs text-gray-500 text-right">฿{price.toLocaleString()}</span>
                    <span className="col-span-2 text-xs font-semibold text-emerald-700 text-right">฿{cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    <div className="col-span-1 text-center">
                      {formItems.length > 1 && (
                        <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Material subtotal */}
            <div className="flex justify-end mt-3 pt-2 border-t">
              <div className="text-sm text-gray-600">
                ต้นทุนวัตถุดิบ: <span className="font-semibold text-emerald-700">฿{liveMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Labor & Overhead Costs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ค่าแรง (Labor Cost)</label>
              <input type="number" min="0" step="0.01" value={formLaborCost} onChange={(e) => setFormLaborCost(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ค่าใช้จ่ายอื่น (Overhead)</label>
              <input type="number" min="0" step="0.01" value={formOverheadCost} onChange={(e) => setFormOverheadCost(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">ต้นทุนวัตถุดิบ</span>
              <span className="font-medium">฿{liveMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            {formLaborCost > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">ค่าแรง</span>
                <span className="font-medium">฿{formLaborCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {formOverheadCost > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">ค่าใช้จ่ายอื่น</span>
                <span className="font-medium">฿{formOverheadCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-300">
              <span className="font-bold text-gray-800">ต้นทุนรวมทั้งหมด</span>
              <span className="font-bold text-emerald-700 text-lg">฿{liveGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{editing ? 'บันทึก' : 'สร้าง'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        message={`ต้องการลบ BOM "${deleteTarget?.name}" ใช่ไหม?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
