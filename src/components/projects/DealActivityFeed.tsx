'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useEntityTimeline } from '@/lib/hooks/use-entity-timeline';
import { relativeTime } from '@/lib/utils/relative-time';
import { timelineDotTone, type TimelineDotTone } from '@/lib/timeline/dot-tone';
import type { TimelineFilterValue } from '@/components/shared/EntityTimeline';
import type { TimelineEvent, TimelineKind, TimelineKindFilter } from '@/types/timeline';

// ═══════════════════════════════════════════════════════
// S-DEAL-ACTIVITY-VIEW-1 (W5): лента СДЕЛКИ по макету — одна строка на событие.
//
// Точка по смыслу (деньги / касание / поля, `lib/timeline/dot-tone.ts`) на
// вертикальной линии, текст в одну строку, мета справа без переноса. Групп
// «Просрочено / Этот месяц / Ранее» и шеврона нет — это вид `<EntityTimeline>`,
// который у лида, компании и контакта остаётся прежним.
//
// Механика запроса — та же, что у `<EntityTimeline>` (S-TL-1…3): выбранный чип
// уходит в RPC `p_kinds`, `all` — `undefined`. Фильтр управляемый: чипы стоят в
// шапке блока (`ProjectDetail`), а не над лентой.
// ═══════════════════════════════════════════════════════

/**
 * Чипы шапки: Все · Звонки · Встречи · Задачи · Заметки · Поля · AI.
 * `activity` разворачивается в «Заметки» + «Поля» внутри `TimelineFilterChips`.
 *
 * ⚠️ Это НАБОР ЧИПОВ, не фильтр данных: `project` («Сделка создана из лида») в
 * ленте «Все» остаётся — чипа под него нет, но сужать данные по набору нельзя
 * (дефект S-TL-2: «Все» показывало бы виды только из загруженных страниц).
 */
export const DEAL_CHIP_KINDS: TimelineKind[] = ['call', 'meeting', 'task', 'activity', 'ai_run'];

/** Подписи чипов сделки: весь `activity_log` без заметок — это правки полей. */
export const DEAL_CHIP_LABELS: Partial<Record<TimelineFilterValue, string>> = { activity: 'Поля' };

const PAGE = 10;

/**
 * Заливка точки по тону — семантика, не `--accent`. Карта живёт в компоненте, а
 * не в `lib/timeline/dot-tone.ts`: `content` Tailwind сканирует только
 * `src/components` и `src/app`, и классы из `src/lib` в сборку не попадают
 * (замер 26.09: `bg-success` из lib рендерился прозрачным).
 */
const DOT_TONE_CLASS: Record<TimelineDotTone, string> = {
  money: 'bg-success',
  touch: 'bg-warning',
  neutral: 'bg-border2',
};

/**
 * Лента сделки под выбранным чипом. Один и тот же вызов у шапки (скрыть чипы у
 * сделки без событий) и у ленты — ключ React Query общий, запрос один. При `all`
 * ключ совпадает ещё и с `DealLastEvent`/`DealNextStep`.
 */
export function useDealActivity(projectId: string, filter: TimelineFilterValue) {
  const requestKinds = useMemo<TimelineKindFilter[] | undefined>(
    () => (filter === 'all' ? undefined : [filter]),
    [filter],
  );
  const timeline = useEntityTimeline('project', projectId, requestKinds);
  /*
    S-HEALTH-V2-1 (F-08): чипы у сущности БЕЗ ленты — управление, которым нечем
    управлять. Прячем только «активности нет вовсе»: фильтр `all` + загрузка
    завершена + ноль событий. При выбранном чипе ветка не срабатывает — иначе
    пустой чип спрятал бы и путь назад к «Все».
  */
  const emptyEntity =
    filter === 'all' && !timeline.isLoading && !timeline.error && timeline.events.length === 0;
  return { ...timeline, emptyEntity };
}

function rowText(e: TimelineEvent): string {
  return e.detail ? `${e.title} — ${e.detail}` : e.title;
}

export function DealActivityFeed({
  projectId,
  filter,
  expanded,
  onOpenEvent,
}: {
  projectId: string;
  filter: TimelineFilterValue;
  /** «Вся лента» в шапке: лимит снят, видно всё загруженное. */
  expanded: boolean;
  onOpenEvent?: (event: TimelineEvent) => void;
}) {
  const { events, isLoading, error, hasMore, loadMore, isLoadingMore } = useDealActivity(
    projectId,
    filter,
  );

  // Лимит сбрасывается сменой чипа: состояние привязано к фильтру, и новый фильтр
  // начинает с 10 без эффекта-синхронизатора.
  const [limitState, setLimitState] = useState<{ filter: TimelineFilterValue; limit: number }>({
    filter,
    limit: PAGE,
  });
  const limit = limitState.filter === filter ? limitState.limit : PAGE;

  const visible = expanded ? events : events.slice(0, limit);
  const hiddenLoaded = expanded ? 0 : Math.max(0, events.length - limit);

  function showMore() {
    const next = limit + PAGE;
    setLimitState({ filter, limit: next });
    // Загруженные кончились, а у ленты есть дно ниже — догружаем страницу.
    if (next > events.length && hasMore) void loadMore();
  }

  // Ветки загрузки / сбоя / пусто — дословно из `<EntityTimeline>`: это купленные
  // дефекты S-TL-1 (сбой неотличим от пустоты) и S-TL-3 (честный пустой чип).
  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-accent" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="py-6 text-center text-xs text-danger">
        Не удалось загрузить активность. Обновите страницу.
      </p>
    );
  }
  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-xs italic text-text-mute">
        {filter === 'all' ? 'Пока нет активности' : 'Нет событий этого типа'}
      </p>
    );
  }

  const now = Date.now();
  const canShowMore = !expanded && (hiddenLoaded > 0 || hasMore);
  const canLoadEarlier = expanded && hasMore;

  return (
    <div>
      <ul className="max-w-[72ch]">
        {visible.map((event, i) => {
          const last = i === visible.length - 1;
          const overdue = event.status === 'overdue';
          const text = rowText(event);
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onOpenEvent?.(event)}
                title={text}
                className="relative grid w-full grid-cols-[auto_1fr_auto] items-baseline gap-3 rounded-lg
                           px-1 py-1.5 text-left transition-colors hover:bg-surface2"
              >
                {/* Линия идёт от центра этой точки ровно на высоту строки — до центра
                    следующей, у последней строки её нет. */}
                {!last && (
                  <span
                    aria-hidden
                    className="absolute left-[calc(0.5rem-0.5px)] top-1/2 h-full border-l border-border"
                  />
                )}
                <span
                  aria-hidden
                  className={cn(
                    'relative size-2 self-center rounded-full',
                    DOT_TONE_CLASS[timelineDotTone(event)],
                  )}
                />
                <span className="min-w-0 truncate text-body text-text-main">{text}</span>
                <span className="whitespace-nowrap text-meta tabular-nums text-text-mute">
                  {/* Просроченная задача: статус несёт метка, а не цвет точки —
                      цвет точки занят смыслом события. */}
                  {overdue && <span className="font-semibold text-danger-text">просрочено · </span>}
                  {relativeTime(event.date, now)}
                  {event.actorName && ` · ${event.actorName}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {(canShowMore || canLoadEarlier) && (
        <button
          type="button"
          onClick={canShowMore ? showMore : () => void loadMore()}
          disabled={isLoadingMore}
          className="mt-2 rounded-lg px-2 py-1 text-xs font-semibold text-text-dim transition-colors
                     hover:bg-surface2 hover:text-text-main disabled:opacity-50"
        >
          {isLoadingMore ? 'Загружаем…' : canShowMore ? 'Показать ещё' : 'Показать раньше'}
        </button>
      )}
    </div>
  );
}
