import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface MenuItem {
  to: string;
  labelTh: string;
  labelEn: string;
}

interface MenuSection {
  titleTh: string;
  titleEn: string;
  items: MenuItem[];
}

const SECTIONS: MenuSection[] = [
  {
    titleTh: 'หลัก',
    titleEn: 'Main',
    items: [
      { to: '/', labelTh: 'แดชบอร์ด', labelEn: 'Dashboard' },
    ],
  },
  {
    titleTh: 'ข้อมูลหลัก',
    titleEn: 'Master Data',
    items: [
      { to: '/customers', labelTh: 'ลูกค้า', labelEn: 'Customers' },
      { to: '/suppliers', labelTh: 'ผู้ขาย', labelEn: 'Suppliers' },
      { to: '/products', labelTh: 'สินค้า', labelEn: 'Products' },
      { to: '/raw-materials', labelTh: 'วัตถุดิบ', labelEn: 'Raw Materials' },
    ],
  },
  {
    titleTh: 'การผลิต',
    titleEn: 'Production',
    items: [
      { to: '/bom', labelTh: 'BOM', labelEn: 'Bill of Materials' },
      { to: '/production', labelTh: 'สั่งผลิต', labelEn: 'Production' },
      { to: '/stock', labelTh: 'สต็อครวม', labelEn: 'Stock' },
    ],
  },
  {
    titleTh: 'ขาย & ส่งของ',
    titleEn: 'Sales',
    items: [
      { to: '/sales-orders', labelTh: 'ใบสั่งขาย', labelEn: 'Sales Orders' },
      { to: '/delivery-notes', labelTh: 'ใบส่งของ', labelEn: 'Delivery Notes' },
      { to: '/invoices', labelTh: 'ใบแจ้งหนี้', labelEn: 'Invoices' },
    ],
  },
  {
    titleTh: 'การเงิน',
    titleEn: 'Finance',
    items: [
      { to: '/payments', labelTh: 'จ่ายเงิน', labelEn: 'Payments' },
      { to: '/expenses', labelTh: 'ค่าใช้จ่าย', labelEn: 'Expenses' },
      { to: '/recurring-expenses', labelTh: 'ค่าใช้จ่ายประจำ', labelEn: 'Recurring Expenses' },
      { to: '/expenses?category=ซื้อวัตถุดิบ', labelTh: 'ซื้อวัตถุดิบ', labelEn: 'Purchase Materials' },
      { to: '/loans', labelTh: 'ยืมเงิน', labelEn: 'Loans' },
    ],
  },
  {
    titleTh: 'ระบบ',
    titleEn: 'System',
    items: [
      { to: '/settings', labelTh: 'ตั้งค่า', labelEn: 'Settings' },
    ],
  },
];

const STORAGE_KEY = 'erp-sidebar-order';
const LONG_PRESS_MS = 300;

function getAllItems(isAdmin: boolean): MenuItem[] {
  const items: MenuItem[] = [];
  for (const s of SECTIONS) {
    items.push(...s.items);
  }
  if (isAdmin) {
    items.push({ to: '/users', labelTh: 'จัดการผู้ใช้', labelEn: 'User Management' });
  }
  return items;
}

function getSectionsWithAdmin(isAdmin: boolean): MenuSection[] {
  if (!isAdmin) return SECTIONS;
  return SECTIONS.map((s) =>
    s.titleEn === 'System'
      ? { ...s, items: [...s.items, { to: '/users', labelTh: 'จัดการผู้ใช้', labelEn: 'User Management' }] }
      : s,
  );
}

function loadOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function saveOrder(items: MenuItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map((i) => i.to)));
}

function applyOrder(sections: MenuSection[], order: string[] | null): MenuItem[] {
  const all: MenuItem[] = [];
  for (const s of sections) all.push(...s.items);
  if (!order) return all;
  const byTo = new Map(all.map((i) => [i.to, i]));
  const ordered: MenuItem[] = [];
  for (const to of order) {
    const item = byTo.get(to);
    if (item) {
      ordered.push(item);
      byTo.delete(to);
    }
  }
  for (const item of byTo.values()) ordered.push(item);
  return ordered;
}

function getSectionForItem(to: string, sections: MenuSection[]): MenuSection | undefined {
  return sections.find((s) => s.items.some((i) => i.to === to));
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';

  const sections = getSectionsWithAdmin(isAdmin);
  const [orderedItems, setOrderedItems] = useState<MenuItem[]>(() =>
    applyOrder(sections, loadOrder()),
  );

  // Sync when admin status changes
  useEffect(() => {
    setOrderedItems(applyOrder(sections, loadOrder()));
  }, [isAdmin]);

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draggable, setDraggable] = useState(false);

  const currentUrl = location.pathname + location.search;

  const isMenuActive = (to: string) => {
    if (to.includes('?')) return currentUrl === to;
    return location.pathname === to && !location.search;
  };

  const handleClick = (e: React.MouseEvent, to: string) => {
    if (currentUrl === to) {
      e.preventDefault();
      navigate(to, { replace: true, state: { reset: Date.now() } });
    }
    onClose();
  };

  // Long press to enable drag
  const handlePointerDown = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      setDraggable(true);
    }, LONG_PRESS_MS);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setOverIdx(idx);
  }, []);

  const handleDrop = useCallback(
    (idx: number) => {
      if (dragIdx === null || dragIdx === idx) {
        setDragIdx(null);
        setOverIdx(null);
        setDraggable(false);
        return;
      }
      const newItems = [...orderedItems];
      const [moved] = newItems.splice(dragIdx, 1);
      newItems.splice(idx, 0, moved);
      setOrderedItems(newItems);
      saveOrder(newItems);
      setDragIdx(null);
      setOverIdx(null);
      setDraggable(false);
    },
    [dragIdx, orderedItems],
  );

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setOverIdx(null);
    setDraggable(false);
  }, []);

  // Build section headers map for display
  let lastSection = '';

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
          Nut Office ERP
        </div>
        <nav
          className="mt-3 flex flex-col gap-0.5 px-3 overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 80px)' }}
        >
          {orderedItems.map((m, idx) => {
            const section = getSectionForItem(m.to, sections);
            const sectionKey = section ? section.titleEn : '';
            let showHeader = false;
            if (sectionKey && sectionKey !== lastSection) {
              showHeader = true;
              lastSection = sectionKey;
            }

            return (
              <div key={m.to}>
                {showHeader && section && (
                  <div className={`px-2 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-indigo-400 ${idx === 0 ? 'pt-1' : ''}`}>
                    {section.titleTh} / {section.titleEn}
                  </div>
                )}
                <NavLink
                  to={m.to}
                  end={m.to === '/'}
                  draggable={draggable}
                  onPointerDown={handlePointerDown}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => handleClick(e, m.to)}
                  className={() => {
                    const active = isMenuActive(m.to);
                    const isDragging = dragIdx === idx;
                    const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
                    return `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      draggable ? 'cursor-grab' : ''
                    } ${isDragging ? 'opacity-40 cursor-grabbing' : ''} ${
                      isOver ? 'ring-2 ring-indigo-300 bg-white/10' : ''
                    } ${
                      active
                        ? 'bg-white/15 text-white shadow-lg shadow-indigo-900/50 ring-1 ring-white/10'
                        : 'text-indigo-200 hover:bg-white/10 hover:text-white hover:shadow-md'
                    }`;
                  }}
                >
                  <span className="text-sm">{m.labelTh}</span>
                  <span className="text-xs text-indigo-300">/ {m.labelEn}</span>
                </NavLink>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
