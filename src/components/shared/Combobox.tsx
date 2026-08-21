'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { useAnchoredRect } from '@/lib/hooks/use-anchored-rect';

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
  /**
   * FIX S-CHAT-TASK-1-BIND: строка поиска наружу — для списков, которые ищет СЕРВЕР
   * (`useEntitySearch`), а не клиентский фильтр по уже загруженным опциям.
   * Не задан — прежнее поведение один в один.
   */
  onSearchChange?: (search: string) => void;
  /**
   * С чего начинать поиск при открытии. Нужен там, где запрос уже известен из контекста
   * (имя, вытащенное из текста сообщения): открыть пустым значило бы заставить человека
   * набрать то, что система уже прочитала.
   */
  initialSearch?: string;
  /** Ответ сервера ещё в пути — «Ничего не найдено» тут соврало бы. */
  loading?: boolean;
  /**
   * Доступное имя поля — S-CONTACT-COMPANY.
   *
   * Без него имя триггера берётся из содержимого: пока ничего не выбрано, это
   * placeholder, а после выбора — название записи, то есть скрин-ридер перестаёт
   * называть САМО ПОЛЕ. Там, где рядом нет `<label>` (карточка контакта, где
   * подпись — заголовок блока), это единственный источник имени.
   */
  ariaLabel?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Выбрать...',
  disabled,
  onSearchChange,
  initialSearch = '',
  loading = false,
  ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(initialSearch);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Попап рендерится в портал (position: fixed) поверх overflow-скролла модалки.
  // 192 = бывший класс `max-h-48`: теперь это ЖЕЛАЕМАЯ высота, фактическую (с
  // учётом места до края окна) возвращает хук в `maxHeight`.
  const anchor = useAnchoredRect(containerRef, open, 4, 192);

  const selected = options.find((o) => o.value === value);

  // Серверный поиск (`onSearchChange`) фильтрует сам — второй фильтр поверх него не
  // «уточнял» бы, а расходился: пока летит дебаунс, клиентский фильтр уже применил
  // новую строку к старым опциям и прячет валидные результаты.
  const serverSearch = !!onSearchChange;
  const filtered =
    search && !serverSearch
      ? options.filter((o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.sub?.toLowerCase().includes(search.toLowerCase()),
        )
      : options;

  const setSearchValue = useCallback(
    (next: string) => {
      setSearch(next);
      onSearchChange?.(next);
    },
    [onSearchChange],
  );

  // Reset highlight when filtered list changes
  useEffect(() => { setHighlightIdx(0); }, [filtered.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  // Close on outside click. Попап в портале живёт вне containerRef — учитываем и listRef.
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setSearchValue(initialSearch);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled, initialSearch, setSearchValue]);

  const select = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(false);
      setSearchValue('');
    },
    [onChange, setSearchValue],
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
          aria-label={ariaLabel}
          title={selected?.label}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-input
                     bg-surface px-3 py-2 text-sm text-left
                     focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent
                     disabled:opacity-50"
        >
          <span className={`min-w-0 truncate ${selected ? 'text-text-main' : 'text-text-mute'}`}>
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
          onChange={(e) => setSearchValue(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabel}
          placeholder="Поиск..."
          className="w-full rounded-lg border border-accent bg-surface px-3 py-2
                     text-sm text-text-main placeholder:text-text-mute
                     outline-none ring-1 ring-accent"
        />
      )}

      {/* Dropdown — портал поверх overflow-скролла модалки */}
      {open && anchor && createPortal(
        <ul
          ref={listRef}
          style={{
            position: 'fixed',
            // При флипе якорь — НИЖНИЙ край. Здесь это критично: список фильтруется
            // по мере ввода, и при якоре по `top` он отрывался бы от поля тем
            // сильнее, чем меньше совпадений осталось.
            ...(anchor.bottom != null ? { bottom: anchor.bottom } : { top: anchor.top }),
            // maxHeight инлайном, а не классом: класс `max-h-48` перебил бы расчёт
            // хука и вернул бы обрезание нижним краем окна.
            left: anchor.left, width: anchor.width, maxHeight: anchor.maxHeight, zIndex: 1100,
          }}
          className="overflow-auto rounded-lg border border-border bg-popover py-1 elevation-3"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-text-mute">
              {loading ? 'Поиск…' : 'Ничего не найдено'}
            </li>
          )}
          {filtered.map((opt, idx) => (
            <li
              key={opt.value}
              onMouseDown={() => select(opt.value)}
              onMouseEnter={() => setHighlightIdx(idx)}
              // Длинное название режем, полное — в title: перенос строки в списке
              // ломает высоту строк и попадание мышью.
              title={opt.sub ? `${opt.label} · ${opt.sub}` : opt.label}
              className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm ${
                idx === highlightIdx ? 'bg-accent/10 text-accent' : 'text-text-main'
              } ${opt.value === value ? 'font-medium' : ''}`}
            >
              <span className="min-w-0 flex-1 truncate">{opt.label}</span>
              {opt.sub && (
                <span className="shrink-0 truncate text-xs text-text-mute">{opt.sub}</span>
              )}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
