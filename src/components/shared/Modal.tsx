'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════
// AUDIT A1.2 — единый Modal primitive.
// Закрывает класс «тихая потеря ввода»:
//  • viewport-fit: flex-col + max-h — шапка и футер всегда видны, тело
//    скроллится (баг 1П-4: длинная модалка уезжала за экран на 1366×768);
//  • isDirty-guard: клик по фону / Esc / крестик при несохранённых
//    изменениях — inline-подтверждение ВНУТРИ модалки (не window.confirm);
//  • data-modal / data-modal-overlay — тема-хуки (непрозрачный фон тёмных
//    тем, z-index 999/1000 из globals.css) остаются рабочими.
//
// Форма живёт в children как <form id="…">, кнопки — в footer с
// type="submit" form="…" (submit срабатывает из футера вне <form>).
// Кнопка «Отмена» в footer — осознанный отказ, зовёт onClose напрямую;
// guard ловит только СЛУЧАЙНОЕ закрытие (фон/Esc/крестик).
// ═══════════════════════════════════════════════════════

interface ModalProps {
  title: ReactNode;
  /** Подзаголовок под title (напр. динамическая подсказка LeadConversion). */
  description?: ReactNode;
  onClose: () => void;
  /** Есть несохранённые изменения — закрытие через inline-подтверждение. */
  isDirty?: boolean;
  /** Строка действий (кнопки). Липкий футер; submit через form="…". */
  footer?: ReactNode;
  children: ReactNode;
  /** Tailwind max-w-* класс ширины. По умолчанию max-w-lg. */
  maxWidth?: string;
}

export function Modal({
  title,
  description,
  onClose,
  isDirty = false,
  footer,
  children,
  maxWidth = 'max-w-lg',
}: ModalProps) {
  const [confirming, setConfirming] = useState(false);

  const requestClose = () => {
    if (isDirty) setConfirming(true);
    else onClose();
  };

  // Esc — тот же путь, что клик по фону (учитывает isDirty). Слушаем на bubble:
  // открытый комбобокс гасит свой Esc сам (stopPropagation) — сначала закроется
  // он, вторым Esc — модалка. Нужный каскад.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // requestClose замыкает актуальный isDirty
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  // Блокируем прокрутку фона под модалкой.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      data-modal-overlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div
        data-modal
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex max-h-[calc(100dvh-3rem)] w-full flex-col overflow-hidden rounded-xl border border-border bg-surface elevation-3 ring-1 ring-border',
          maxWidth,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — flex-none */}
        <div className="flex flex-none items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text-main">{title}</h2>
            {description && (
              <div className="mt-0.5 text-xs text-text-mute">{description}</div>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Закрыть"
            className="-mr-1 shrink-0 rounded-lg p-1 text-text-mute transition-colors hover:bg-surface-hover"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — единственная скролл-зона */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          {children}
        </div>

        {/* Footer — flex-none, липкий */}
        {footer && (
          <div className="flex flex-none items-center justify-end gap-2 border-t border-border/60 px-6 py-4">
            {footer}
          </div>
        )}

        {/* isDirty-guard: inline-подтверждение поверх модалки */}
        {confirming && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/30 p-6"
            data-modal-confirm
          >
            <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 elevation-3 text-center">
              <p className="text-sm font-medium text-text-main">
                Есть несохранённые изменения
              </p>
              <p className="mt-1 text-xs text-text-dim">
                Закрыть без сохранения? Введённые данные не сохранятся.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  autoFocus
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Продолжить редактирование
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-red transition-colors hover:bg-surface-hover"
                >
                  Закрыть без сохранения
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
