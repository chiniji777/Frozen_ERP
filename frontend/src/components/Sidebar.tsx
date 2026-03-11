import { NavLink } from 'react-router-dom';

const menu = [
  { to: '/', label: 'แดชบอร์ด', icon: '📊' },
  { to: '/customers', label: 'ลูกค้า', icon: '👥' },
  { to: '/products', label: 'สินค้า', icon: '📦' },
  { to: '/raw-materials', label: 'วัตถุดิบ', icon: '🧱' },
  { to: '/bom', label: 'BOM', icon: '📋' },
  { to: '/production', label: 'สั่งผลิต', icon: '🏭' },
  { to: '/costs', label: 'ต้นทุน', icon: '💹' },
  { to: '/sales-orders', label: 'ใบสั่งขาย', icon: '📝' },
  { to: '/delivery-notes', label: 'ใบส่งของ', icon: '🚚' },
  { to: '/invoices', label: 'ใบแจ้งหนี้', icon: '📄' },
  { to: '/payments', label: 'จ่ายเงิน', icon: '💰' },
  { to: '/receipts', label: 'ใบเสร็จ', icon: '🧾' },
  { to: '/expenses', label: 'ค่าใช้จ่าย', icon: '💸' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed top-0 left-0 z-30 h-full w-64 bg-indigo-900 text-white transform transition-transform lg:translate-x-0 lg:static lg:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 text-xl font-bold border-b border-indigo-700">
          🏢 Nut Office ERP
        </div>
        <nav className="mt-2 flex flex-col gap-0.5 px-2">
          {menu.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-700 text-white font-semibold'
                    : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                }`
              }
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
