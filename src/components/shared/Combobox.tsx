'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, X } from 'lucide-react';

export interface ComboboxOption {
  value: string;
  label: string;
  sub?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Выбрать...',
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = search
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.sub?.toLowerCase().includes(search.toLowerCase()),
      )
    : options;

  // Reset highlight when filtered list changes
  useEffect(() => { setHighlightIdx(0); }, [filtered.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled]);

  const select = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(false);
      setSearch('');
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIdx]) select(filtered[highlightIdx].value);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      {!open ? (
        <button
          type="button"
          onClick={openDropdown}
          disabled={disabled}
          className="flex w-full items-center justify-between rounded-lg border border-border
                     bg-surface px-3 py-2 text-sm text-left
                     focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent
                     disabled:opacity-50"
        >
          <span className={selected ? 'text-text-main' : 'text-text-mute'}>
            {selected ? selected.label : placeholder}
          </span>
          <span className="flex items-center gap-1">
            {value && !disabled && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onChange(null); }}
                className="rounded p-0.5 hover:bg-surface-hover"
              >
                <X size={14} className="text-text-mute" />
              </span>
            )}
            <ChevronDown size={14} className="text-text-mute" />
          </span>
        </button>
      ) : (
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Поиск..."
          className="w-full rounded-lg border border-accent bg-surface px-3 py-2
                     text-sm text-text-main placeholder:text-text-mute
                     outline-none ring-1 ring-accent"
        />
      )}

      {/* Dropdown */}
      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg
                     border border-border bg-surface py-1 shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-text-mute">Ничего не найдено</li>
          )}
          {filtered.map((opt, idx) => (
            <li
              key={opt.value}
              onMouseDown={() => select(opt.value)}
              onMouseEnter={() => setHighlightIdx(idx)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${
                idx === highlightIdx ? 'bg-accent/10 text-accent' : 'text-text-main'
              } ${opt.value === value ? 'font-medium' : ''}`}
            >
              {opt.label}
              {opt.sub && (
                <span className="ml-2 text-xs text-text-mute">{opt.sub}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
