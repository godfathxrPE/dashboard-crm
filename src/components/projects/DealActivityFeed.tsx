'use client';

import { useId, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useEntityTimeline, type TimelineEntityType } from '@/lib/hooks/use-entity-timeline';
import { relativeTime } from '@/lib/utils/relative-time';
import { timelineDotTone, type TimelineDotTone } from '@/lib/timeline/dot-tone';
import { noteToPlainLine, splitNoteHead } from '@/lib/text/note-blocks';
import { NoteBody } from '@/components/shared/NoteBody';
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
// S-DEAL-NOTES-READ-1: строка с текстом (заметка, встреча/звонок с notes/agreements)
// раскрывается НА МЕСТЕ — превью в две строки, по клику полный текст. Модалка
// остаётся для правки («Изменить»). Нативный тултип с полным текстом убран: на
// заметке в 2000 символов он был единственным способом прочитать её.
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
 *
 * S-LEAD-V2-WORK-1: `entityType` — аддитивно, дефолт `'project'`. Лента лида —
 * тот же вид W5, а не третья вариация; ключ у сделки прежний
 * (`['timeline','project',id,…]`).
 */
export function useDealActivity(
  entityId: string,
  filter: TimelineFilterValue,
  entityType: TimelineEntityType = 'project',
) {
  const requestKinds = useMemo<TimelineKindFilter[] | undefined>(
    () => (filter === 'all' ? undefined : [filter]),
    [filter],
  );
  const timeline = useEntityTimeline(entityType, entityId, requestKinds);
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

/**
 * Строка с текстом → заголовок строки и остаток для превью/раскрытия; `null` — текста
 * нет, строка ведёт себя как раньше. У заметки заголовок — первая строка самого текста
 * (`title` у неё и есть весь текст одним абзацем), у встречи/звонка — собственный
 * `title`, а текст — `body`.
 */
function rowParts(e: TimelineEvent): { head: string; rest: string } | null {
  if (!e.body) return null;
  if (e.kind === 'activity') {
    const { head, rest } = splitNoteHead(e.body);
    return head ? { head, rest } : null;
  }
  return { head: e.title, rest: e.body };
}

export function DealActivityFeed({
  entityId,
  entityType = 'project',
  filter,
  expanded,
  onOpenEvent,
}: {
  entityId: string;
  entityType?: TimelineEntityType;
  filter: TimelineFilterValue;
  /** «Вся лента» в шапке: лимит снят, видно всё загруженное. */
  expanded: boolean;
  onOpenEvent?: (event: TimelineEvent) => void;
}) {
  const { events, isLoading, error, hasMore, loadMore, isLoadingMore } = useDealActivity(
    entityId,
    filter,
    entityType,
  );

  // Лимит сбрасывается сменой чипа: состояние привязано к фильтру, и новый фильтр
  // начинает с 10 без эффекта-синхронизатора.
  const [limitState, setLimitState] = useState<{ filter: TimelineFilterValue; limit: number }>({
    filter,
    limit: PAGE,
  });
  const limit = limitState.filter === filter ? limitState.limit : PAGE;

  // Раскрытые строки — по `event.id`, он стабилен при смене чипа и подгрузке страниц,
  // поэтому сброс не нужен. Несколько раскрытых одновременно — можно.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const uid = useId();
  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

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
          const parts = rowParts(event);
          const open = parts !== null && openIds.has(event.id);
          const panelId = `${uid}-${event.id}`;
          const preview = parts ? noteToPlainLine(parts.rest) : '';
          const editable = event.kind === 'call' || event.kind === 'meeting';
          return (
            <li key={event.id} className="relative">
              {/* Рельса таймлайна рисуется на `li`, а не на кнопке: раскрытая строка выше
                  соседей, и линия «на высоту кнопки» рвалась бы. Точка стоит на центре
                  ПЕРВОЙ строки (py-1.5 + пол-строки), линия идёт от неё до такого же
                  центра следующей `li` — высота строки между ними значения не имеет.
                  `text-body` на рельсе — чтобы `lh` считался от кегля текста строки. */}
              {!last && (
                <span
                  aria-hidden
                  className="absolute left-[calc(0.5rem-0.5px)] top-[calc(0.375rem+0.5lh)]
                             -bottom-[calc(0.375rem+0.5lh)] border-l border-border text-body"
                />
              )}
              <span
                aria-hidden
                className={cn(
                  'absolute left-1 top-[calc(0.375rem+0.5lh-0.25rem)] size-2 rounded-full text-body',
                  DOT_TONE_CLASS[timelineDotTone(event)],
                )}
              />
              <button
                type="button"
                onClick={() => (parts ? toggleOpen(event.id) : onOpenEvent?.(event))}
                aria-expanded={parts ? open : undefined}
                aria-controls={parts && open ? panelId : undefined}
                className="grid w-full grid-cols-[1fr_auto] items-baseline gap-3 rounded-lg
                           py-1.5 pl-6 pr-1 text-left transition-colors hover:bg-surface2"
              >
                <span className="min-w-0">
                  {/* Раскрытая строка без остатка (заметка в одну строку) разворачивает
                      САМ заголовок: тела под ним нет, а в `truncate` текст не прочесть. */}
                  <span
                    className={cn(
                      'block text-body text-text-main',
                      open ? 'whitespace-normal break-words' : 'truncate',
                    )}
                  >
                    {parts ? parts.head : rowText(event)}
                  </span>
                  {!open && preview && (
                    <span className="mt-0.5 line-clamp-2 text-meta text-text-dim">
                      {preview}
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap text-meta tabular-nums text-text-mute">
                  {/* Просроченная задача: статус несёт метка, а не цвет точки —
                      цвет точки занят смыслом события. */}
                  {overdue && <span className="font-semibold text-danger-text">просрочено · </span>}
                  {relativeTime(event.date, now)}
                  {event.actorName && ` · ${event.actorName}`}
                </span>
              </button>

              {open && parts && (
                <div id={panelId} className="pb-2 pl-6 pr-1">
                  {parts.rest && <NoteBody text={parts.rest} collapsedLines={0} />}
                  {event.nextStep && (
                    <p className="mt-2 text-meta font-semibold text-text-main">
                      → Следующий шаг: {event.nextStep}
                    </p>
                  )}
                  {/* Правки заметок в продукте нет — кнопки у неё нет (кнопка без
                      действия, как в `DealLastEvent`). */}
                  {editable && onOpenEvent && (
                    <button
                      type="button"
                      onClick={() => onOpenEvent(event)}
                      className="mt-2 h-[1.875rem] rounded-[0.625rem] border border-border px-3 text-xs
                                 font-semibold text-text-main transition-colors hover:bg-surface2"
                    >
                      Изменить
                    </button>
                  )}
                </div>
              )}
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
