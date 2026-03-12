import { useState } from 'react';

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  onAdd?: () => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  extraActions?: (item: T) => React.ReactNode;
  getId: (item: T) => number | string;
  selectable?: boolean;
  selectedIds?: Set<number | string>;
  onSelectionChange?: (ids: Set<number | string>) => void;
  toolbarExtra?: React.ReactNode;
  onRowClick?: (item: T) => void;
}

const PAGE_SIZES = [10, 25, 50, 100];

export default function DataTable<T>({
  columns,
  data,
  searchPlaceholder = 'ค้นหา...',
  onAdd,
  onEdit,
  onDelete,
  extraActions,
  getId,
  selectable = false,
  selectedIds,
  onSelectionChange,
  toolbarExtra,
  onRowClick,
}: Props<T>) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const filtered = data.filter((item) =>
    columns.some((col) => {
      const val = (item as Record<string, unknown>)[col.key];
      return String(val ?? '').toLowerCase().includes(search.toLowerCase());
    })
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const allPageIds = paged.map((item) => getId(item));
  const allSelected = selectable && allPageIds.length > 0 && allPageIds.every((id) => selectedIds?.has(id));

  const toggleSelectAll = () => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (allSelected) {
      allPageIds.forEach((id) => next.delete(id));
    } else {
      allPageIds.forEach((id) => next.add(id));
    }
    onSelectionChange(next);
  };

  const toggleSelect = (id: number | string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
        />
        {toolbarExtra}
        {onAdd && (
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors whitespace-nowrap"
          >
            + เพิ่มใหม่
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key} className="text-left px-4 py-3 font-semibold text-gray-600">
                  {col.label}
                </th>
              ))}
              {(onEdit || onDelete || extraActions) && (
                <th className="text-right px-4 py-3 font-semibold text-gray-600">จัดการ</th>
              )}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0) + 1} className="text-center py-8 text-gray-400">
                  ไม่พบข้อมูล
                </td>
              </tr>
            ) : (
              paged.map((item) => {
                const itemId = getId(item);
                return (
                <tr key={itemId} className={`border-b border-gray-50 hover:bg-gray-50 ${selectable && selectedIds?.has(itemId) ? 'bg-indigo-50' : ''} ${onRowClick ? 'cursor-pointer' : ''}`} onClick={onRowClick ? () => onRowClick(item) : undefined}>
                  {selectable && (
                    <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds?.has(itemId) ?? false} onChange={() => toggleSelect(itemId)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-gray-700">
                      {col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? '-')}
                    </td>
                  ))}
                  {(onEdit || onDelete || extraActions) && (
                    <td className="px-4 py-3 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                      {extraActions && extraActions(item)}
                      {onEdit && (
                        <button
                          onClick={() => onEdit(item)}
                          className="text-indigo-600 hover:text-indigo-800 text-sm"
                        >
                          แก้ไข
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(item)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          ลบ
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>แสดง</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span>รายการ / หน้า</span>
          {selectable && selectedIds && selectedIds.size > 0 && (
            <span className="ml-2 text-indigo-600 font-medium">เลือก {selectedIds.size} รายการ</span>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded border text-sm disabled:opacity-30"
            >
              ก่อนหน้า
            </button>
            <span className="px-3 py-1 text-sm text-gray-600">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded border text-sm disabled:opacity-30"
            >
              ถัดไป
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
