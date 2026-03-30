'use client';

import { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

// ═══════════════════════════════════════════════════════
// Generic DataTable — паттерн из Salesforce List Views
// Переиспользуемая таблица с поиском, сортировкой, пагинацией
// ═══════════════════════════════════════════════════════

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render: (item: T) => React.ReactNode;
  searchValue?: (item: T) => string;
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
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);

  // ─── Search filter ───
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((item) =>
      columns.some((col) => {
        const val = col.searchValue
          ? col.searchValue(item)
          : String((item as Record<string, unknown>)[col.key] ?? '');
        return val.toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  // ─── Sort ───
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');
      const cmp = aStr.localeCompare(bStr, 'ru');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // ─── Paginate ───
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // Reset page on search
  function handleSearch(val: string) {
    setSearch(val);
    setPage(0);
  }

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
                        sortDir === 'asc' ? (
                          <ChevronUp size={12} />
                        ) : (
                          <ChevronDown size={12} />
                        )
                      ) : null}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-12 text-center">
                  {emptyIcon && <div className="mb-2 flex justify-center">{emptyIcon}</div>}
                  <p className="text-xs text-text-mute">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              paged.map((item) => (
                <tr
                  key={String(item[keyField])}
                  onClick={() => onRowClick?.(item)}
                  className={`
                    border-b border-border/50 transition-colors
                    ${onRowClick ? 'cursor-pointer hover:bg-surface-hover' : ''}
                  `}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2.5">
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))
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
              className="rounded p-1 text-text-mute transition-colors
                         hover:bg-surface-hover disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded p-1 text-text-mute transition-colors
                         hover:bg-surface-hover disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
