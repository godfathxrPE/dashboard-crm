'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useStagger } from '@/lib/hooks/use-stagger';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render: (item: T) => React.ReactNode;
  searchValue?: (item: T) => string;
}

export interface BulkAction {
  label: string;
  icon?: React.ReactNode;
  onClick: (selectedIds: string[]) => void;
  variant?: 'default' | 'danger';
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  onRowClick?: (item: T) => void;
  pageSize?: number;
  searchPlaceholder?: string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  selectable?: boolean;
  bulkActions?: BulkAction[];
}

type SortDir = 'asc' | 'desc';

export function DataTable<T>({
  data,
  columns,
  keyField,
  onRowClick,
  pageSize = 20,
  searchPlaceholder = 'Поиск...',
  emptyMessage = 'Нет данных',
  emptyIcon,
  selectable,
  bulkActions,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIdx = useRef<number | null>(null);
  const tbodyRef = useStagger<HTMLTableSectionElement>(30);

  // ─── Search ───
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((item) =>
      columns.some((col) => {
        const val = col.searchValue
          ? col.searchValue(item)
          : String((item as Record<string, unknown>)[col.key] ?? '');
        return val.toLowerCase().includes(q);
      }),
    );
  }, [data, search, columns]);

  // ─── Sort ───
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aStr = String((a as Record<string, unknown>)[sortKey] ?? '');
      const bStr = String((b as Record<string, unknown>)[sortKey] ?? '');
      const cmp = aStr.localeCompare(bStr, 'ru');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // ─── Paginate ───
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function handleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function handleSearch(val: string) {
    setSearch(val);
    setPage(0);
  }

  // ─── Selection ───
  const getId = useCallback((item: T) => String(item[keyField]), [keyField]);

  const toggleOne = useCallback(
    (id: string, index: number, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastClickedIdx.current !== null) {
          const start = Math.min(lastClickedIdx.current, index);
          const end = Math.max(lastClickedIdx.current, index);
          for (let i = start; i <= end; i++) {
            next.add(getId(paged[i]));
          }
        } else {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        lastClickedIdx.current = index;
        return next;
      });
    },
    [paged, getId],
  );

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = paged.length > 0 && paged.every((item) => prev.has(getId(item)));
      if (allSelected) return new Set();
      return new Set(paged.map((item) => getId(item)));
    });
  }, [paged, getId]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const allChecked = paged.length > 0 && paged.every((item) => selectedIds.has(getId(item)));
  const someChecked = paged.some((item) => selectedIds.has(getId(item)));
  const colSpan = columns.length + (selectable ? 1 : 0);

  return (
    <div>
      {/* Search bar */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-3
                       text-sm text-text-main placeholder:text-text-mute
                       focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <span className="text-xs text-text-mute">
          {filtered.length} из {data.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {selectable && (
                <th className="w-10 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      className="flex items-center gap-1 transition-colors hover:text-accent"
                    >
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      ) : null}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-12 text-center">
                  {emptyIcon && <div className="mb-2 flex justify-center">{emptyIcon}</div>}
                  <p className="text-xs text-text-mute">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              paged.map((item, idx) => {
                const id = getId(item);
                const isSelected = selectedIds.has(id);
                return (
                  <tr
                    key={id}
                    onClick={() => onRowClick?.(item)}
                    className={cn(
                      'border-b border-border/50 transition-colors duration-150',
                      onRowClick && 'cursor-pointer',
                      isSelected ? 'bg-accent-l' : onRowClick ? 'hover:bg-accent-l' : '',
                    )}
                  >
                    {selectable && (
                      <td className="w-10 px-2 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const shiftKey = (e.nativeEvent as MouseEvent).shiftKey ?? false;
                            toggleOne(id, idx, shiftKey);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-2.5">
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-text-mute">
            Стр. {page + 1} из {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded p-1 text-text-mute transition-colors hover:bg-surface-hover disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded p-1 text-text-mute transition-colors hover:bg-surface-hover disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectable && bulkActions && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3
                        rounded-xl border border-border bg-surface px-4 py-2.5
                        shadow-lg bulk-bar-enter">
          <span className="text-sm font-medium text-text-main tabular-nums">
            {selectedIds.size} выбрано
          </span>
          <div className="h-4 w-px bg-border" />
          {bulkActions.map((action, i) => (
            <button
              key={i}
              onClick={() => { action.onClick(Array.from(selectedIds)); clearSelection(); }}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                action.variant === 'danger'
                  ? 'text-red hover:bg-red-l'
                  : 'text-text-dim hover:bg-accent-l hover:text-accent',
              )}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
          <button
            onClick={clearSelection}
            className="ml-1 rounded p-1 text-text-mute hover:text-text-main transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
