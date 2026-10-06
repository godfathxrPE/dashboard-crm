'use client';

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import { ArrowUpRight, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useFieldMoves } from '@/lib/hooks/use-stage-story';
import { pickActiveQuote } from '@/lib/domain/quote-version';
import { projectHref } from '@/lib/utils/project-href';
import { pluralRu } from '@/lib/utils/plural';
import { formatBudget } from '@/lib/validators/project';
import { localDateKey } from '@/lib/utils/date-helpers';
import { amountSourceText, focusKicker, stepPlateLabel } from '@/lib/utils/today-text';
import type { Project } from '@/lib/hooks/use-projects';
import type { PipelineStage } from '@/types/database';
import type { Quote } from '@/types/entities';
import type { TodayDealView } from '@/lib/domain/today-model';
import { TodayFocusBody } from './TodayFocusBody';

interface TodayFocusPaneProps {
  view: TodayDealView;
  project: Project;
  stage: PipelineStage | null;
  quotes: readonly Quote[];
  now: Date;
  /** Номер хода и их число; `null` — сделка из списка групп. */
  move: { n: number; of: number } | null;
  /** Ряд действий хода (`TodayStepActions`) или итог записи (`TodayStepDone`). */
  actions: ReactNode;
  /** Открыта форма хода: после её закрытия DOM-фокус возвращается в шапку. */
  composerOpen: boolean;
  /** Сам `<aside>`: `contains` работает и для портала. */
  paneRef: RefObject<HTMLElement | null>;
  /** Шапка: в её первую кнопку уходит DOM-фокус по Enter. */
  headRef: RefObject<HTMLDivElement | null>;
  /** Поле заметки в теле — туда ставит курсор клавиша N. */
  noteRef: RefObject<HTMLInputElement | null>;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  /** Узкий режим: панель поверх списка, порталом в `body`. */
  overlay?: boolean;
  onClose?: () => void;
}

/** Первая кнопка или ссылка шапки — туда уходит DOM-фокус. */
export function focusHeadEntry(head: HTMLElement | null) {
  head?.querySelector<HTMLElement>('button, a')?.focus();
}

/**
 * Фокус экрана «Сегодня» (спека `today-focus-spec.md`, §4; макет, кадры 1–3): один
 * детальный вид сделки справа от списка. Шапка — на стекле и не прокручивается;
 * тело — на `--surface`, прокручивается внутри.
 *
 * Имя `TodayFocus` не занимать: так назывался удалённый в V3 «Фокус дня».
 *
 * ⚠️ Смысловой текст (`--red-text`, `--danger-text`, `--green-text`, `--success-text`)
 * стекло перекрашивает само — fix-S-GLASS-THEME-1. `--danger` и `--success` (заливки)
 * не перекрашены: цвет смысла в шапке — текстовые утилиты, не заливки.
 * `data-card` на шапке нет: `.t-aura [data-card]` перебил бы стекло.
 */
export function TodayFocusPane({
  view, project, stage, quotes, now, move, actions, composerOpen, paneRef, headRef, noteRef, onKeyDown, overlay, onClose,
}: TodayFocusPaneProps) {
  const { source } = view;
  const { data: moves } = useFieldMoves(source.id);
  const stepMoves = moves?.step.count ?? 0;
  const kicker = focusKicker(view, move);
  const activeQuote = pickActiveQuote(quotes);
  const amount = view.amount.amount;
  const step = source.next_step?.trim();
  const href = projectHref(project);

  // Форма хода закрылась (Esc, «Отмена», запись) — её поле размонтировано, и DOM-фокус
  // упал на `body`. Возвращаем его в шапку: второй Esc тогда уводит фокус на строку.
  const wasComposing = useRef(composerOpen);
  useEffect(() => {
    if (wasComposing.current && !composerOpen) {
      const active = document.activeElement;
      if (!active || active === document.body) focusHeadEntry(headRef.current);
    }
    wasComposing.current = composerOpen;
  }, [composerOpen, headRef]);

  // Название сделки — заголовок шапки, здесь только то, что под ним.
  const context = [
    source.companyName,
    source.stage?.name ?? null,
    stepMoves >= 2 ? `перенесён ${stepMoves} ${pluralRu(stepMoves, 'раз', 'раза', 'раз')}` : null,
  ].filter((s): s is string => !!s);

  return (
    <aside
      ref={paneRef}
      aria-label={`Фокус: ${source.name}`}
      onKeyDown={onKeyDown}
      className={cn('today-focus', overlay && 'today-focus-overlay peek-panel')}
    >
      <div ref={headRef} className={cn('glass-sheet relative shrink-0 px-4 pb-3.5 pt-4', overlay && 'pr-11')}>
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 pt-0.5 text-meta font-semibold uppercase tracking-wider text-text-dim">
            {kicker.risk ? (
              <>
                {move && `${kicker.lead} · `}
                {/* Причин риска здесь нет: они секцией «Риски» в теле, каждая с действием. */}
                <span className="inline-flex items-center gap-1 align-top text-warning-text">
                  <TriangleAlert aria-hidden="true" className="h-3 w-3 shrink-0" />
                  Под риском
                </span>
              </>
            ) : (
              kicker.lead
            )}
            {kicker.days && (
              <>
                {' · '}
                <span className={kicker.hot ? 'text-red' : 'text-text-dim'}>{kicker.days}</span>
              </>
            )}
          </p>
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold leading-tight tabular-nums text-text-main">
              {amount !== null ? formatBudget(amount) : '—'}
            </p>
            <p className="text-meta text-text-dim">{amountSourceText(view.amount.source, activeQuote?.status ?? null)}</p>
          </div>
        </div>

        <Link
          href={href}
          title="Открыть карточку сделки · O"
          className="mt-1.5 flex items-start gap-1 text-base font-semibold leading-snug text-text-main underline-offset-2 hover:underline"
        >
          <span className="line-clamp-2 min-w-0">{source.name}</span>
          <ArrowUpRight aria-hidden="true" className="mt-[0.3125rem] h-3 w-3 shrink-0" />
        </Link>

        {context.length > 0 && <p className="mt-0.5 text-xs text-text-dim">{context.join(' · ')}</p>}

        {/* Подложка — та же, что у «Следующего шага» карточки сделки (`DealNextStep`). */}
        <div className="glass-plate mt-3 px-3.5 pb-3 pt-2.5">
          <p className="text-meta font-semibold uppercase tracking-wider text-text-dim">
            {stepPlateLabel(view, localDateKey(now))}
          </p>
          <p className={cn('mt-1 line-clamp-3 text-sm font-medium leading-[1.42]', step ? 'text-text-main' : 'text-text-dim')}>
            {step || 'Шаг не задан'}
          </p>
        </div>

        <div className="mt-3">{actions}</div>

        {overlay && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть фокус"
            title="Закрыть фокус · Esc"
            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded text-text-dim transition-colors hover:bg-surface2 hover:text-text-main"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* `key`: смена сделки сбрасывает фильтр ленты, выделение новой заметки и
          недописанный текст — они про прежнюю сделку. */}
      <TodayFocusBody
        key={project.id}
        project={project}
        stage={stage}
        touches={view.touches}
        tasks={view.tasks}
        calls={view.calls}
        planned={view.planned}
        quotes={quotes}
        now={now}
        noteRef={noteRef}
      />
    </aside>
  );
}
