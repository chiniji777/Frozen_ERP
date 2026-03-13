import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const menu = [
  { to: '/', label: 'แดชบอร์ด', icon: '📊' },
  { to: '/customers', label: 'ลูกค้า', icon: '👥' },
  { to: '/products', label: 'สินค้า', icon: '📦' },
  { to: '/raw-materials', label: 'วัตถุดิบ', icon: '🧱' },
  { to: '/bom', label: 'BOM', icon: '📋' },
  { to: '/production', label: 'สั่งผลิต', icon: '🏭' },
  { to: '/sales-orders', label: 'ใบสั่งขาย', icon: '📝' },
  { to: '/delivery-notes', label: 'ใบส่งของ', icon: '🚚' },
  { to: '/invoices', label: 'ใบแจ้งหนี้', icon: '📄' },
  { to: '/payments', label: 'จ่ายเงิน', icon: '💰' },
  { to: '/expenses', label: 'ค่าใช้จ่าย', icon: '💸' },
  { to: '/recurring-expenses', label: 'ค่าใช้จ่ายประจำ', icon: '📅' },
  { to: '/suppliers', label: 'ผู้ขาย', icon: '🏪' },
  { to: '/purchase-orders', label: 'จัดซื้อ', icon: '🛒' },
  { to: '/stock', label: 'สต็อครวม', icon: '📊' },
  { to: '/loans', label: 'ยืมเงิน', icon: '💵' },
  { to: '/settings', label: 'ตั้งค่า', icon: '⚙️' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';

  const allMenu = isAdmin
    ? [...menu, { to: '/users', label: 'จัดการผู้ใช้', icon: '👤' }]
    : menu;

  const handleClick = (e: React.MouseEvent, to: string) => {
    if (location.pathname === to) {
      e.preventDefault();
      navigate(to, { replace: true, state: { reset: Date.now() } });
    }
    onClose();
  };

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
        <div className="p-5 text-xl font-bold border-b border-indigo-700">
          🏢 Nut Office ERP
        </div>
        <nav className="mt-3 flex flex-col gap-1.5 px-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
          {allMenu.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              onClick={(e) => handleClick(e, m.to)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all ${
                  isActive
                    ? 'bg-white/15 text-white shadow-lg shadow-indigo-900/50 ring-1 ring-white/10'
                    : 'text-indigo-200 hover:bg-white/10 hover:text-white hover:shadow-md'
                }`
              }
            >
              <span className="text-lg">{m.icon}</span>
              <span>{m.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
