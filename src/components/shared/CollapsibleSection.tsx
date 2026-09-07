'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { readSectionExpanded, writeSectionExpanded } from '@/lib/utils/section-state';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════
// S-DEAL-LAYOUT-1 (задача 1): общий примитив сворачивания для зоны «Работа» —
// доска задач и орг. блок делят один механизм, а не два разных.
//
// Состояние — per-виджет per-сделка в localStorage (`deal-section:<projectId>:
// <sectionId>`), сама персистентность и её отказоустойчивость живут в
// `lib/utils/section-state.ts` (тестируемое — в `lib/`, не в компоненте).
//
// Содержимое скрывается `hidden`, а не размонтированием: доска задач внутри
// заново запрашивала бы данные на каждый разворот, если бы её убирали из DOM.
//
// `forceExpanded` — синхронный деплинк (S-DEAL-LAYOUT-1, задача 4): читается
// на первом рендере, ДО того как `useState`-инициализатор дойдёт до
// localStorage, поэтому гонки с обычным чтением состояния нет. Значение НЕ
// пишется в хранилище — это одноразовый нудж по мёртвой ссылке, а не смена
// пользовательской настройки.
// ═══════════════════════════════════════════════════════

export interface CollapsibleSectionProps {
  /** Ключ строки состояния — id сделки/проекта. */
  projectId: string;
  /** Второй ключ строки состояния — id виджета внутри сделки. */
  sectionId: string;
  title: string;
  /** Пилюля рядом с заголовком (например, общий счётчик). */
  badge?: ReactNode;
  /** Сводка мелким текстом — видна и в свёрнутом, и в развёрнутом виде. */
  summary?: ReactNode;
  defaultExpanded?: boolean;
  /** Секция всегда развёрнута и не даёт свернуть себя (S-IA-DELIVERY-1: «План» внедрения). */
  locked?: boolean;
  /** Деплинк на эту секцию (`?tab=quotes` → орг. блок) — открыть при монтировании. */
  forceExpanded?: boolean;
  /** Якорь для scrollIntoView по деплинку. */
  id?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  projectId,
  sectionId,
  title,
  badge,
  summary,
  defaultExpanded = false,
  locked = false,
  forceExpanded = false,
  id,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(
    () => locked || forceExpanded || readSectionExpanded(projectId, sectionId, defaultExpanded),
  );

  function toggle() {
    if (locked) return;
    setExpanded((prev) => {
      const next = !prev;
      writeSectionExpanded(projectId, sectionId, next);
      return next;
    });
  }

  return (
    <div id={id} className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={toggle}
        disabled={locked}
        aria-expanded={expanded}
        className={cn(
          'flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left',
          !locked && 'cursor-pointer',
        )}
      >
        <span className="text-xs font-bold text-text-main">{title}</span>
        {badge}
        {summary && (
          <span className="min-w-0 flex-1 truncate text-meta text-text-mute">{summary}</span>
        )}
        {!locked && (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-meta text-accent">
            {expanded ? 'Свернуть' : 'Развернуть'}
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        )}
      </button>
      <div hidden={!expanded} className="border-t border-border p-4">
        {children}
      </div>
    </div>
  );
}
