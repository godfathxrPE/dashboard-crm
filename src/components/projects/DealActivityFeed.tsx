'use client';

import { useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { useEntityTimeline, type TimelineEntityType } from '@/lib/hooks/use-entity-timeline';
import { useRealtimeSync } from '@/lib/hooks/use-realtime';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useAuth } from '@/lib/hooks/use-auth';
import { canWriteFeed } from '@/lib/notes/permissions';
import {
  buildDayRows,
  groupByDay,
  isStageEvent,
  splitPlanned,
  type FeedRow,
} from '@/lib/timeline/feed-model';
import type { TimelineFilterValue } from '@/components/shared/EntityTimeline';
import type { TimelineEvent, TimelineKind, TimelineKindFilter } from '@/types/timeline';
import { DealPinnedZone, ZoneHeader } from './DealPinnedZone';
import {
  AxisItem,
  DayPill,
  FieldsGroupRow,
  NoteCard,
  PlannedRow,
  StageCard,
  SystemRow,
  TouchCard,
  type FeedViewer,
} from './DealFeedParts';

// ═══════════════════════════════════════════════════════
// S-NOTES-2.1: лента СДЕЛКИ (и лида) по макету `_analysis/mockup-S-NOTES-2.html`.
//
// Три зоны сверху вниз: «Закреплено» (суть сделки + до 3 заметок, `DealPinnedZone`) →
// «Запланировано» (открытые задачи и будущие встречи) → история по дням на оси с узлами
// по типу касания (заметка — жёлтый, встреча — фиолетовый, звонок — синий, смена
// стадии — флаг; системные строки — мелкая точка).
//
// Раскладка и склейка — чистые функции `lib/timeline/feed-model.ts`; здесь только
// представление. Вид `<EntityTimeline>` у компании и контакта остаётся прежним.
//
// История WORK-W5 (до этого спринта): одна строка на событие, раскрытие по клику
// (S-DEAL-NOTES-READ-1). Раскрытие ушло: заметка, встреча и звонок теперь карточки с
// телом, свёрнутым до 6 строк.
//
// Механика запроса — та же, что у `<EntityTimeline>` (S-TL-1…3): выбранный чип
// уходит в RPC `p_kinds`, `all` — `undefined`. Фильтр управляемый: чипы стоят в
// шапке блока (`ProjectDetail`), а не над лентой.
// ═══════════════════════════════════════════════════════

/**
 * Чипы шапки: Все · Звонки · Встречи · Задачи · Заметки · Поля · AI.
 * «Заметки» — вид `note` (таблица `notes`, 134), «Поля» — `activity` (журнал без заметок).
 *
 * ⚠️ Это НАБОР ЧИПОВ, не фильтр данных: `project` («Сделка создана из лида») в
 * ленте «Все» остаётся — чипа под него нет, но сужать данные по набору нельзя
 * (дефект S-TL-2: «Все» показывало бы виды только из загруженных страниц).
 */
export const DEAL_CHIP_KINDS: TimelineKind[] = ['call', 'meeting', 'task', 'note', 'activity', 'ai_run'];

/** Подписи чипов сделки: `activity_log` без заметок — это правки полей. */
export const DEAL_CHIP_LABELS: Partial<Record<TimelineFilterValue, string>> = { activity: 'Поля' };

const PAGE = 10;

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

/** Зона «Закреплено» живёт под «Все» и «Заметки»: под остальными чипами она — шум. */
function showsPinnedZone(filter: TimelineFilterValue): boolean {
  return filter === 'all' || filter === 'note';
}

function Skeleton() {
  return (
    <div aria-hidden className="mt-5 grid max-w-[72ch] gap-2">
      {[
        ['w-[38%]', 'w-[92%]', 'w-[76%]'],
        ['w-[30%]', 'w-[84%]'],
      ].map((lines, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-border bg-surface px-[0.95rem] py-3">
          {lines.map((w) => (
            <span key={w} className={`block h-2.5 animate-pulse rounded-full bg-surface2 ${w}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function HistoryRow({
  row,
  last,
  now,
  viewer,
  onOpenEvent,
}: {
  row: FeedRow;
  last: boolean;
  now: number;
  viewer: FeedViewer;
  onOpenEvent?: (event: TimelineEvent) => void;
}) {
  if (row.type === 'fields') {
    return (
      <AxisItem variant="sys" last={last}>
        <FieldsGroupRow group={row} />
      </AxisItem>
    );
  }
  const e = row.event;
  const canEditEvents = canWriteFeed(viewer.role);

  if (e.kind === 'note') {
    return (
      <AxisItem variant="note" last={last}>
        <NoteCard event={e} viewer={viewer} now={now} />
      </AxisItem>
    );
  }
  if (e.kind === 'meeting' || e.kind === 'call') {
    return (
      <AxisItem variant={e.kind} last={last}>
        <TouchCard event={e} now={now} canEdit={canEditEvents} onOpenEvent={onOpenEvent} />
      </AxisItem>
    );
  }
  if (isStageEvent(e)) {
    return (
      <AxisItem variant="stage" last={last}>
        <StageCard event={e} comment={row.stageComment} />
      </AxisItem>
    );
  }
  return (
    <AxisItem variant="sys" last={last}>
      <SystemRow event={e} onOpenEvent={onOpenEvent} />
    </AxisItem>
  );
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
  const { events, isLoading, error, hasMore, loadMore, isLoadingMore, refetch } = useDealActivity(
    entityId,
    filter,
    entityType,
  );

  // Заметка, написанная в соседней вкладке или с телефона, приезжает без перезагрузки.
  // Префикс ключа — без вида и размера страницы: накрывает все срезы ленты сущности.
  useRealtimeSync('notes', ['timeline', entityType, entityId]);

  const { data: role } = useOrgRole();
  const { user } = useAuth();
  const viewer: FeedViewer = { role, userId: user?.id };

  // Лимит сбрасывается сменой чипа: состояние привязано к фильтру, и новый фильтр
  // начинает с 10 без эффекта-синхронизатора.
  const [limitState, setLimitState] = useState<{ filter: TimelineFilterValue; limit: number }>({
    filter,
    limit: PAGE,
  });
  const limit = limitState.filter === filter ? limitState.limit : PAGE;

  const now = Date.now();
  const pinnedZone = showsPinnedZone(filter) && (entityType === 'project' || entityType === 'lead');

  const { planned, history } = useMemo(() => {
    const split = splitPlanned(events, now);
    // Заметка с `pinnedAt` живёт в зоне «Закреплено» — в истории её второй раз не рисуем.
    // Признак — `pinnedAt` самого события, а не отдельный запрос: он совпадает с тем,
    // что зона получила бы, и не мигает дублем, пока закреплённые грузятся.
    return {
      planned: split.planned,
      history: pinnedZone
        ? split.history.filter((e) => !(e.kind === 'note' && e.pinnedAt))
        : split.history,
    };
    // `now` меняется каждый рендер; пересчёт нужен только при смене событий и зоны.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, pinnedZone]);

  const visibleHistory = expanded ? history : history.slice(0, limit);
  const hiddenLoaded = expanded ? 0 : Math.max(0, history.length - limit);
  const groups = groupByDay(visibleHistory, now);

  function showMore() {
    const next = limit + PAGE;
    setLimitState({ filter, limit: next });
    // Загруженные кончились, а у ленты есть дно ниже — догружаем страницу.
    if (next > history.length && hasMore) void loadMore();
  }

  const canShowMore = !expanded && (hiddenLoaded > 0 || hasMore);
  const canLoadEarlier = expanded && hasMore;

  return (
    <div>
      {pinnedZone && (
        <DealPinnedZone
          entityType={entityType === 'lead' ? 'lead' : 'project'}
          entityId={entityId}
          viewer={viewer}
          now={now}
        />
      )}

      {/* Ветки загрузки / сбоя / пусто — те же причины, что у `<EntityTimeline>`: это
          купленные дефекты S-TL-1 (сбой неотличим от пустоты) и S-TL-3 (честный пустой чип). */}
      {isLoading ? (
        <Skeleton />
      ) : error ? (
        <div className="mt-5 max-w-[72ch] rounded-lg border border-dashed border-border2 p-4 text-body text-text-dim">
          Ленту не удалось загрузить.{' '}
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-xs font-semibold text-text-main underline underline-offset-2"
          >
            Повторить
          </button>
        </div>
      ) : events.length === 0 ? (
        <p className="mt-5 max-w-[72ch] rounded-lg border border-dashed border-border2 p-4 text-body text-text-dim">
          {filter === 'all'
            ? `Здесь появятся заметки, звонки и встречи по ${entityType === 'lead' ? 'лиду' : 'сделке'}. Начните с заметки по первому разговору.`
            : 'Нет событий этого типа'}
        </p>
      ) : (
        <>
          {planned.length > 0 && (
            <section aria-label="Запланировано" className="mt-5">
              <ZoneHeader count={planned.length}>
                <Clock size={13} aria-hidden /> Запланировано
              </ZoneHeader>
              <ul className="grid max-w-[72ch] gap-1">
                {planned.map((e) => (
                  <PlannedRow key={e.id} event={e} now={now} onOpenEvent={onOpenEvent} />
                ))}
              </ul>
            </section>
          )}

          {groups.length > 0 && (
            <div className="mt-5 max-w-[calc(72ch+2.6rem)]">
              {groups.map((g) => {
                const rows = buildDayRows(g.items);
                return (
                  <section key={g.key} aria-label={g.label}>
                    <DayPill>{g.label}</DayPill>
                    <ol>
                      {rows.map((row, i) => (
                        <HistoryRow
                          key={row.type === 'event' ? row.event.id : `fields:${row.items[0].id}`}
                          row={row}
                          last={i === rows.length - 1}
                          now={now}
                          viewer={viewer}
                          onOpenEvent={onOpenEvent}
                        />
                      ))}
                    </ol>
                  </section>
                );
              })}
            </div>
          )}

          {(canShowMore || canLoadEarlier) && (
            <button
              type="button"
              onClick={canShowMore ? showMore : () => void loadMore()}
              disabled={isLoadingMore}
              className="mt-2 rounded-lg border border-border px-3 py-1.5 text-body font-semibold text-text-main
                         transition-colors hover:bg-surface2 disabled:opacity-50"
            >
              {isLoadingMore ? 'Загружаем…' : canShowMore ? 'Показать ещё' : 'Показать раньше'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
