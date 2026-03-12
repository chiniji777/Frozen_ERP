import { useState, useEffect, useRef } from 'react';
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<CompanyProfile[]>('/settings/profiles').then(data => {
      setCompanies(data);
      const def = data.find(c => c.isDefault === 1) || data[0];
      if (def) setSelectedCompany(def.id);
    }).catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handlePrint = (opt: PrintOption) => {
    const params = new URLSearchParams();
    if (selectedCompany) params.set('companyId', String(selectedCompany));
    if (opt.params) {
      for (const [k, v] of Object.entries(opt.params)) params.set(k, v);
    }
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

  return (
    <div className={`relative inline-block ${className}`} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center gap-1.5"
      >
        <span>🖨️</span> พิมพ์เอกสาร
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
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
        </div>
      )}
    </div>
  );
}
