'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, ArrowUpRight } from 'lucide-react';

interface PeekPanelProps {
  title: string;
  /**
   * Переход на полную страницу сущности. Необязателен: у peek дня месяца
   * (S-CAL-MONTH-1) полной страницы нет — день не сущность, и ссылка
   * «Открыть полностью» вела бы в никуда.
   */
  href?: string;
  /**
   * Селектор источников, клик по которым МЕНЯЕТ содержимое peek, а не закрывает
   * его. Строка таблицы (`tbody tr`) зашита всегда — это исходный контракт с
   * DataTable; ячейка дня месяца приходит сюда как `[data-cal-day]`.
   */
  keepOpenSelector?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Peek-панель (Sprint W2d): предпросмотр записи без ухода со списка.
 * Не модалка — без оверлея; z-40 (между drawer 30 и dropdown 50).
 * Закрытие: Escape, крестик, клик вне панели. Клик по строке таблицы
 * НЕ закрывает — это смена содержимого peek (обрабатывает DataTable).
 */
export function PeekPanel({ title, href, keepOpenSelector, onClose, children }: PeekPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const keepOpenRef = useRef(keepOpenSelector);
  keepOpenRef.current = keepOpenSelector;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // A11y: фокус возвращается туда, откуда peek открыли. Без этого после Escape
  // фокус остаётся на <body>, и Tab начинает обход страницы с начала — из сетки
  // месяца, где день открывают с клавиатуры, выйти было бы некуда.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (!opener || !opener.isConnected) return;
      // Панель к этому моменту уже снята, поэтому её собственный фокус (крестик,
      // ссылка) успел схлопнуться на <body> — это и есть «уходить некуда».
      // А вот если фокус на живом элементе страницы, пользователь уже кликнул
      // мимо и работает дальше: отбирать фокус у него нельзя.
      const active = document.activeElement;
      if (active && active !== document.body) return;
      opener.focus();
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('tbody tr')) return;
      if (keepOpenRef.current && target.closest(keepOpenRef.current)) return;
      onCloseRef.current();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const el = document.activeElement;
      const tag = el?.tagName.toLowerCase();
      // Escape внутри инпута — отмена редактирования (InlineEdit), не закрытие панели
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement)?.isContentEditable) return;
      onCloseRef.current();
    }

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // ⚠️ Портал появляется ТОЛЬКО после монтирования, а не по ветке
  // `typeof document === 'undefined'`. Ветка давала разный markup на сервере и
  // на клиенте, и React ронял гидрацию всей страницы («server rendered HTML
  // didn't match»). Пока peek открывался лишь кликом по строке таблицы, в SSR
  // он не попадал и дефект спал; peek дня (S-CAL-MONTH-1) открыт уже в первом
  // рендере, если в адресе есть `?date=` — и разбудил его.
  if (!mounted) return null;

  return createPortal(
    <aside
      ref={panelRef}
      data-peek-panel
      role="complementary"
      aria-label={title}
      className="peek-panel fixed right-0 top-0 z-40 flex h-screen w-[440px] max-w-[90vw] flex-col bg-surface"
      style={{
        borderLeft: '0.5px solid var(--border)',
        boxShadow: 'var(--elevation-3)',
      }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-main">{title}</h2>
        {href && (
          <Link
            href={href}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1
                       text-xs text-text-dim transition-colors hover:border-accent hover:text-accent"
          >
            Открыть полностью
            <ArrowUpRight size={12} />
          </Link>
        )}
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="rounded p-1 text-text-mute transition-colors hover:text-text-main"
        >
          <X size={14} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </aside>,
    document.body,
  );
}
