import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';

interface CompanyProfile {
  id: number;
  companyName: string;
  companyNameEn: string;
  isDefault: number;
}

interface PrintOption {
  label: string;
  icon: string;
  path: string; // e.g. "/sales-orders/5/print"
  /** extra query params beyond companyId */
  params?: Record<string, string>;
}

interface Props {
  options: PrintOption[];
  className?: string;
}

export default function PrintMenu({ options, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<number | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean }>({ top: 0, left: 0, flipUp: false });

  useEffect(() => {
    api.get<CompanyProfile[]>('/settings/profiles').then(data => {
      setCompanies(data);
      const def = data.find(c => c.isDefault === 1) || data[0];
      if (def) setSelectedCompany(def.id);
    }).catch(() => {});
  }, []);

  const calcPosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropH = 300; // estimated max dropdown height
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < dropH && rect.top > dropH;
    setPos({
      top: flipUp ? rect.top : rect.bottom + 4,
      left: Math.max(8, rect.right - 288), // 288 = w-72 (18rem)
      flipUp,
    });
  }, []);

  // Recalc on open
  useEffect(() => {
    if (open) calcPosition();
  }, [open, calcPosition]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (dropRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on scroll/resize
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const handlePrint = (opt: PrintOption) => {
    const params = new URLSearchParams();
    if (selectedCompany) params.set('companyId', String(selectedCompany));
    if (opt.params) {
      for (const [k, v] of Object.entries(opt.params)) params.set(k, v);
    }
    const token = localStorage.getItem('token');
    if (token) params.set('token', token);
    const qs = params.toString();
    window.open(`/api${opt.path}${qs ? '?' + qs : ''}`, '_blank');
    setOpen(false);
  };

  if (options.length === 0) return null;

  // Single option — no dropdown needed, just a button
  if (options.length === 1 && companies.length <= 1) {
    return (
      <button
        onClick={() => handlePrint(options[0])}
        className={`px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center gap-1.5 ${className}`}
      >
        <span>🖨️</span> {options[0].label}
      </button>
    );
  }

  const dropdown = open
    ? createPortal(
        <div
          ref={dropRef}
          className="fixed w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] overflow-hidden"
          style={{
            top: pos.flipUp ? undefined : pos.top,
            bottom: pos.flipUp ? window.innerHeight - pos.top + 4 : undefined,
            left: pos.left,
          }}
        >
          {/* Company selector */}
          {companies.length > 1 && (
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">หัวบิล / Company</label>
              <select
                value={selectedCompany ?? ''}
                onChange={(e) => setSelectedCompany(Number(e.target.value))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              >
                {companies.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.companyName || c.companyNameEn}
                    {c.isDefault ? ' ⭐' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Print options */}
          <div className="py-1">
            {options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handlePrint(opt)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 flex items-center gap-2.5 transition-colors"
              >
                <span className="text-base">{opt.icon}</span>
                <span className="font-medium text-gray-700">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center gap-1.5"
      >
        <span>🖨️</span> พิมพ์เอกสาร
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}
