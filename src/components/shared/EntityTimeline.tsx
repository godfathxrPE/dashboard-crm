'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Phone, Calendar, CheckSquare, FolderKanban, Activity, Sparkles,
  ChevronRight, Loader2, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { isNoteEvent } from '@/lib/utils/activity-events';
import { useEntityTimeline, type TimelineEntityType } from '@/lib/hooks/use-entity-timeline';
import type { TimelineEvent, TimelineKind } from '@/types/timeline';

// ═══════════════════════════════════════════════════════
// <EntityTimeline> — переиспользуемая лента активности сущности.
// Данные — useEntityTimeline (серверная сборка + keyset-пагинация).
// Компонент тонкий: группировка (Просрочено → Этот месяц → Ранее),
// клиентский фильтр по kind, кнопка «Показать раньше», клик по
// событию → onOpenEvent (родитель решает, что открыть).
//
// ⚠️ S-TL-2, ДОЛГ: клиентский фильтр по `kind` фильтрует ЗАГРУЖЕННЫЕ страницы,
// а не ленту. Выбрав «Звонки», человек видит звонки только из уже загруженных
// событий. Так было и до пагинации, но с кнопкой «Показать раньше» это стало
// заметно. Лечится только серверным фильтром — параметром RPC `p_kinds text[]`
// (S-TL-3). Полумеру в виде подписи-подсказки сознательно не добавляем.
// ═══════════════════════════════════════════════════════

/**
 * `all` + kinds + производный `note`.
 *
 * S-UI-CLARITY-1: `note` — не kind, а срез внутри `activity`: события
 * `kind='activity'` с человеческим `eventType` (см. `isNoteEvent`). Отдельным
 * kind его сделать нельзя — источник один (`activity_log`), и `kindFilter`
 * родителей пришлось бы учить второму имени того же источника.
 */
export type TimelineFilterValue = 'all' | TimelineKind | 'note';

interface EntityTimelineProps {
  entityType: TimelineEntityType;
  entityId: string;
  onOpenEvent?: (event: TimelineEvent) => void;
  /** Опциональное действие в строке (напр. AI-кнопка для звонков) — держит компонент generic */
  renderAction?: (event: TimelineEvent) => ReactNode;
  className?: string;

  // ═══ S-R2-CO360-1: опциональные расширения. Все три по умолчанию выключены —
  // контакт, сделка и прочие страницы получают ровно прежний рендер. ═══

  /**
   * Какие kinds вообще предлагать чипами и показывать. Фильтр применяется к УЖЕ
   * ЗАГРУЖЕННЫМ страницам — запрос не меняется (серверный фильтр по видам —
   * `p_kinds` в RPC, S-TL-3). Не задан → дефолтный набор.
   */
  kindFilter?: TimelineKind[];
  /**
   * Будущие события — отдельной первой группой «Предстоящее», остальные — «Ранее».
   * Заменяет трёхчастную группировку (Просрочено/Этот месяц/Ранее), а не дополняет:
   * две оси группировки в одном списке нечитаемы.
   */
  splitUpcoming?: boolean;
  /**
   * Управляемый фильтр. Передан вместе с `onFilterChange` → выбор живёт у
   * родителя (карточка компании держит его в ui-store, чтобы он пережил уход со
   * страницы). Не передан → компонент помнит выбор сам, как и раньше.
   */
  filter?: TimelineFilterValue;
  onFilterChange?: (value: TimelineFilterValue) => void;
  /** Скрыть встроенный ряд чипов — родитель рисует свой в другом месте макета. */
  showFilters?: boolean;
}

const KIND_META: Record<TimelineKind, { icon: LucideIcon; dot: string; fg: string }> = {
  call:     { icon: Phone,        dot: 'bg-blue-l',   fg: 'text-blue' },
  meeting:  { icon: Calendar,     dot: 'bg-green-l',  fg: 'text-green' },
  task:     { icon: CheckSquare,  dot: 'bg-yellow-l', fg: 'text-yellow' },
  project:  { icon: FolderKanban, dot: 'bg-accent-l', fg: 'text-accent' },
  activity: { icon: Activity,     dot: 'bg-surface2', fg: 'text-text-mute' },
  ai_run:   { icon: Sparkles,     dot: 'bg-accent-l', fg: 'text-accent' },
};

// Подписи чипов по kind. S-UI-CLARITY-1: `activity` больше не «Заметки» — это
// activity_log целиком (смены стадий, аудит полей, автоматизации), и честное имя
// ему «Система». Заметки выделены отдельным производным чипом ниже.
const KIND_LABEL: Record<TimelineKind, string> = {
  call: 'Звонки',
  meeting: 'Встречи',
  task: 'Задачи',
  project: 'Сделки',
  activity: 'Система',
  ai_run: 'AI',
};

/** Подпись производного чипа — рядом с «Системой», из того же источника. */
const NOTE_LABEL = 'Заметки';

// Дефолтный набор чипов — прямые источники Sprint A (поведение до S-R2-CO360-1).
const DEFAULT_KINDS: TimelineKind[] = ['call', 'meeting', 'task', 'project'];

/**
 * Ряд чипов фильтра. Экспортируется, чтобы карточка компании могла поставить его
 * НАД композером (порядок мокапа), а не под ним, — с тем же видом и поведением.
 * Второго определения стиля чипа при этом не появляется.
 */
export function TimelineFilterChips({
  kinds, value, onChange, className,
}: {
  kinds: TimelineKind[];
  value: TimelineFilterValue;
  onChange: (v: TimelineFilterValue) => void;
  className?: string;
}) {
  // `activity` разворачивается в ДВА чипа на своём месте в порядке: «Заметки»
  // (производный срез) и «Система» (весь activity_log). Родителям для этого
  // ничего передавать не нужно — набор kinds у них прежний.
  const items: { key: TimelineFilterValue; label: string }[] = [
    { key: 'all', label: 'Все' },
    ...kinds.flatMap((k) =>
      k === 'activity'
        ? [
            { key: 'note' as TimelineFilterValue, label: NOTE_LABEL },
            { key: k as TimelineFilterValue, label: KIND_LABEL[k] },
          ]
        : [{ key: k as TimelineFilterValue, label: KIND_LABEL[k] }],
    ),
  ];
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {items.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
            value === f.key
              ? 'bg-accent-l text-accent'
              : 'text-text-mute hover:bg-surface2 hover:text-text-main',
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  const suffix = diff >= 0 ? 'назад' : 'вперёд';
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins}м ${suffix}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}ч ${suffix}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}д ${suffix}`;
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function sameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

export function EntityTimeline({
  entityType, entityId, onOpenEvent, renderAction, className,
  kindFilter, splitUpcoming = false, filter: filterProp, onFilterChange, showFilters = true,
}: EntityTimelineProps) {
  const {
    events: allEvents, isLoading, error, hasMore, loadMore, isLoadingMore,
  } = useEntityTimeline(entityType, entityId);
  const [localFilter, setLocalFilter] = useState<TimelineFilterValue>('all');

  // Управляемый режим — только когда переданы ОБА props: одиночный `filter` без
  // колбэка дал бы залипший чип, который невозможно переключить.
  const controlled = filterProp !== undefined && onFilterChange !== undefined;
  const filter = controlled ? filterProp : localFilter;
  const setFilter = controlled ? onFilterChange! : setLocalFilter;

  const kinds = useMemo(() => kindFilter ?? DEFAULT_KINDS, [kindFilter]);

  // `kindFilter` режет ленту до объявленного набора ДО чипов: иначе «Все»
  // показывало бы события тех типов, которых в чипах нет.
  const events = useMemo(
    () => (kindFilter ? allEvents.filter((e) => kinds.includes(e.kind)) : allEvents),
    [allEvents, kindFilter, kinds],
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    // Производный срез: заметки живут внутри kind='activity', отличаются eventType.
    if (filter === 'note') return events.filter((e) => e.kind === 'activity' && isNoteEvent(e.eventType));
    return events.filter((e) => e.kind === filter);
  }, [events, filter]);

  const groups = useMemo(() => {
    const now = new Date();
    if (splitUpcoming) {
      const nowMs = now.getTime();
      const upcoming: TimelineEvent[] = [];
      const past: TimelineEvent[] = [];
      for (const e of filtered) {
        if (new Date(e.date).getTime() > nowMs) upcoming.push(e);
        else past.push(e);
      }
      // Внутри «Предстоящего» порядок обратный общему: ближайшее сверху.
      // Хук сортирует всю ленту по убыванию даты — для будущего это «самое
      // далёкое сверху», что для плана бессмысленно.
      upcoming.reverse();
      return [
        { key: 'upcoming', label: 'Предстоящее', items: upcoming },
        { key: 'earlier', label: 'Ранее', items: past },
      ].filter((g) => g.items.length > 0);
    }

    const overdue: TimelineEvent[] = [];
    const thisMonth: TimelineEvent[] = [];
    const earlier: TimelineEvent[] = [];
    for (const e of filtered) {
      if (e.status === 'overdue') overdue.push(e);
      else if (sameMonth(e.date, now)) thisMonth.push(e);
      else earlier.push(e);
    }
    return [
      { key: 'overdue', label: 'Просрочено', items: overdue },
      { key: 'month', label: 'Этот месяц', items: thisMonth },
      { key: 'earlier', label: 'Ранее', items: earlier },
    ].filter((g) => g.items.length > 0);
  }, [filtered, splitUpcoming]);

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-accent" />
      </div>
    );
  }

  // Сбой загрузки обязан отличаться от «событий нет»: без этой ветки любой бросок
  // внутри queryFn выглядит как пустая лента — React Query такой бросок ловит
  // молча, и в консоли с логами БД не остаётся ничего (дефект S-TL-1).
  if (error) {
    return (
      <p className={cn('py-6 text-center text-xs text-red', className)}>
        Не удалось загрузить активность. Обновите страницу.
      </p>
    );
  }

  return (
    <div className={className}>
      {/* Фильтр-табы (клиентский фильтр по kind — без повторных запросов) */}
      {showFilters && (
        <TimelineFilterChips className="mb-3" kinds={kinds} value={filter} onChange={setFilter} />
      )}

      {events.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-mute italic">Пока нет активности</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-mute italic">Нет событий этого типа</p>
      ) : (
        <div className="max-h-[560px] space-y-4 overflow-y-auto pr-1">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="mb-1.5 text-meta font-medium uppercase tracking-wide text-text-mute">
                {group.label}
              </div>
              <div className="relative ml-[7px] border-l border-border pl-5">
                {group.items.map((event) => {
                  const meta = KIND_META[event.kind];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={event.id}
                      className="group/row relative -ml-1 flex items-start gap-3 rounded-lg py-2 pl-1 pr-2 transition-colors hover:bg-surface-hover"
                    >
                      <div className={cn('absolute -left-[23px] top-[10px] flex h-[14px] w-[14px] items-center justify-center rounded-full', meta.dot)}>
                        <Icon size={8} className={meta.fg} />
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenEvent?.(event)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-sm text-text-main">
                          {event.title}
                          {event.detail && <span className="ml-1 text-text-dim">— {event.detail}</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-text-mute">
                          {relativeTime(event.date)}
                          {event.actorName && <span className="ml-1">• {event.actorName}</span>}
                        </p>
                      </button>
                      {event.status === 'overdue' && (
                        <span className="mt-1 shrink-0 rounded-full bg-red-l px-1.5 py-0.5 text-xs font-medium text-red">
                          Просрочено
                        </span>
                      )}
                      {renderAction?.(event)}
                      <ChevronRight size={14} className="mt-0.5 shrink-0 text-text-mute" />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/*
        Кнопка, а не бесконечная прокрутка: лента живёт в блоке с `max-h` и своим
        скроллом, а страница под ней скроллится сама — scroll-триггер во вложенном
        скроллере ведёт себя непредсказуемо. Прокрутку можно надстроить позже поверх
        той же механики.

        Кнопка стоит ВНЕ скроллера намеренно: иначе до неё пришлось бы долистывать
        ленту, а при активном фильтре («Нет событий этого типа») она бы вовсе исчезла
        — то есть единственный способ догрузить события выбранного вида пропадал бы
        ровно тогда, когда он нужен.
      */}
      {hasMore && (
        <button
          type="button"
          onClick={() => loadMore()}
          disabled={isLoadingMore}
          className="mt-3 w-full rounded-lg border border-border py-2 text-xs text-text-dim
                     transition-colors hover:bg-surface-hover hover:text-text-main disabled:opacity-50"
        >
          {isLoadingMore ? 'Загружаем…' : 'Показать раньше'}
        </button>
      )}
    </div>
  );
}
