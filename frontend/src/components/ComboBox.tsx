import { useState, useRef, useEffect } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export default function ComboBox({ value, onChange, options, placeholder = '', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = value.trim()
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIdx] as HTMLElement;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  const handleSelect = (opt: string) => {
    onChange(opt);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown') { setOpen(true); e.preventDefault(); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setHighlightIdx((p) => Math.min(p + 1, filtered.length - 1)); break;
      case 'ArrowUp': e.preventDefault(); setHighlightIdx((p) => Math.max(p - 1, 0)); break;
      case 'Enter': e.preventDefault(); if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx]); break;
      case 'Escape': setOpen(false); break;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlightIdx(0); }}
        onFocus={() => { setOpen(true); setHighlightIdx(0); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none pr-8"
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
      />
      <span
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer text-xs"
        onMouseDown={(e) => { e.preventDefault(); setOpen(!open); inputRef.current?.focus(); }}
      >▼</span>

      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
          role="listbox"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={opt === value}
              className={`px-3 py-2 text-sm cursor-pointer ${
                i === highlightIdx ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50'
              } ${opt === value ? 'font-medium' : ''}`}
              onMouseEnter={() => setHighlightIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
