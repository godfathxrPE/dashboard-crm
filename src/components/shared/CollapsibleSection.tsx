'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { readSectionExpanded, writeSectionExpanded } from '@/lib/utils/section-state';

// ═══════════════════════════════════════════════════════
// S-DEAL-LAYOUT-1 (задача 1): общий примитив сворачивания для зоны «Работа» —
// доска задач и орг. блок делят один механизм, а не два разных.
//
// Состояние — per-виджет per-сделка в localStorage (`deal-section:<projectId>:
// <sectionId>`), сама персистентность и её отказоустойчивость живут в
// `lib/utils/section-state.ts` (тестируемое — в `lib/`, не в компоненте).
//
// Содержимое монтируется ЛЕНИВО: пока секцию не раскрыли ни разу, `children`
// в DOM нет вовсе — иначе доска задач грузилась бы при каждом открытии карточки,
// даже свёрнутой (её обёртка зовёт хуки ради сводки, и сама доска монтировалась
// бы следом). После первого раскрытия `hasBeenExpanded` больше не сбрасывается,
// и сворачивание прячет содержимое `hidden`, а не размонтированием: иначе доска
// заново запрашивала бы данные на каждый разворот.
//
// `alwaysVisible` (S-DEAL-DEADLINES-1, задача 0) — слот ПОД шапкой, живущий вне
// обоих механизмов выше: он не под `hasBeenExpanded`-гейтом и не под `hidden`.
// Нужен таймлайну дедлайнов, который обязан отвечать «что горит» ДО того, как
// доску раскрыли. В `children` он жить не может (не смонтирован до первого
// раскрытия), в `summary` — тоже: `summary` рендерится ВНУТРИ кнопки-шапки, а
// метки таймлайна сами `<button>`, и кнопка в кнопке — невалидный HTML с
// реальной поломкой клавиатурной навигации, а не придирка линтера.
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
  /**
   * Содержимое под шапкой, видимое в ЛЮБОМ состоянии секции: монтируется сразу
   * и не прячется при сворачивании. В отличие от `summary` лежит вне кнопки —
   * поэтому может содержать собственные интерактивные элементы.
   */
  alwaysVisible?: ReactNode;
  defaultExpanded?: boolean;
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
  alwaysVisible,
  defaultExpanded = false,
  forceExpanded = false,
  id,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(
    () => forceExpanded || readSectionExpanded(projectId, sectionId, defaultExpanded),
  );
  // Секция, открытая сразу (деплинк или сохранённое «развёрнуто»), считается
  // уже раскрытой — содержимое ей нужно с первого рендера.
  const [hasBeenExpanded, setHasBeenExpanded] = useState(expanded);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next) setHasBeenExpanded(true);
    writeSectionExpanded(projectId, sectionId, next);
  }

  return (
    <div id={id} className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer flex-wrap items-center gap-2 px-4 py-2.5 text-left"
      >
        <span className="text-xs font-bold text-text-main">{title}</span>
        {badge}
        {summary && (
          <span className="min-w-0 flex-1 truncate text-meta text-text-mute">{summary}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-meta text-accent">
          {expanded ? 'Свернуть' : 'Развернуть'}
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>
      {alwaysVisible && (
        <div className="border-t border-border px-4 py-3">{alwaysVisible}</div>
      )}
      {hasBeenExpanded && (
        <div hidden={!expanded} className="border-t border-border p-4">
          {children}
        </div>
      )}
    </div>
  );
}
