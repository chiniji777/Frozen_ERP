import { useState, useRef, useEffect } from 'react';

export interface SearchableOption {
  value: number | string;
  label: string;
  searchText?: string; // extra text to match against (e.g. code, sku)
}

interface Props {
  options: SearchableOption[];
  value: number | string;
  onChange: (value: number | string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export default function SearchableSelect({ options, value, onChange, placeholder = 'Search...', className = '', required }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const filtered = query.trim()
    ? options.filter((o) => {
        const q = query.toLowerCase();
        return o.label.toLowerCase().includes(q) || (o.searchText?.toLowerCase().includes(q) ?? false);
      })
    : options;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!value) setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [value]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIdx] as HTMLElement;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  const handleSelect = (opt: SearchableOption) => {
    onChange(opt.value);
    setQuery(opt.label);
    setOpen(false);
  };

  const handleFocus = () => {
    setOpen(true);
    setHighlightIdx(0);
    // Select all text on focus for easy re-search
    inputRef.current?.select();
  };

  const handleInputChange = (text: string) => {
    setQuery(text);
    setOpen(true);
    setHighlightIdx(0);
    // Clear selection when user types
    if (value && text !== selectedOption?.label) {
      onChange(0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx((prev) => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx]);
        break;
      case 'Escape':
        setOpen(false);
        if (selectedOption) setQuery(selectedOption.label);
        break;
    }
  };

  // Sync display text with selected value
  useEffect(() => {
    if (selectedOption && !open) {
      setQuery(selectedOption.label);
    } else if (!value && !open) {
      setQuery('');
    }
  }, [value, selectedOption, open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required && !value}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none pr-8"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">▼</span>

      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">ไม่พบรายการ</li>
          ) : (
            filtered.map((opt, i) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  i === highlightIdx ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50'
                } ${opt.value === value ? 'font-medium' : ''}`}
                onMouseEnter={() => setHighlightIdx(i)}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
              >
                {opt.label}
                {opt.searchText && (
                  <span className="ml-2 text-xs text-gray-400">{opt.searchText}</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
