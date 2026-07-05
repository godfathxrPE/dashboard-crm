'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, ArrowUpRight } from 'lucide-react';

interface PeekPanelProps {
  title: string;
  /** Переход на полную страницу сущности */
  href: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Peek-панель (Sprint W2d): предпросмотр записи без ухода со списка.
 * Не модалка — без оверлея; z-40 (между drawer 30 и dropdown 50).
 * Закрытие: Escape, крестик, клик вне панели. Клик по строке таблицы
 * НЕ закрывает — это смена содержимого peek (обрабатывает DataTable).
 */
export function PeekPanel({ title, href, onClose, children }: PeekPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('tbody tr')) return;
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

  if (typeof document === 'undefined') return null;

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
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1
                     text-xs text-text-dim transition-colors hover:border-accent hover:text-accent"
        >
          Открыть полностью
          <ArrowUpRight size={12} />
        </Link>
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
