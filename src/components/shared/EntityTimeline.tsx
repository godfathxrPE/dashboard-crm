'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
// S-TL-4: иконка и цвет вида — из общего модуля. Вторая такая карта жила на
// дашборде (по `event_type`) и после переезда виджета на org-ленту стала копией.
import { KIND_META } from '@/lib/timeline/kind-meta';
import { useEntityTimeline, type TimelineEntityType } from '@/lib/hooks/use-entity-timeline';
import type { TimelineEvent, TimelineKind, TimelineKindFilter } from '@/types/timeline';

// ═══════════════════════════════════════════════════════
// <EntityTimeline> — переиспользуемая лента активности сущности.
// Данные — useEntityTimeline (серверная сборка + keyset-пагинация + фильтр по видам).
// Компонент тонкий: группировка (Просрочено → Этот месяц → Ранее),
// чипы фильтра, кнопка «Показать раньше», клик по событию → onOpenEvent
// (родитель решает, что открыть).
//
// S-TL-3: фильтр по видам БОЛЬШЕ НЕ КЛИЕНТСКИЙ. Выбранный чип уходит в RPC
// параметром `p_kinds`, и «Звонки» означают звонки со всей ленты, а не из уже
// загруженных страниц. Пустой результат при выбранном чипе теперь честен:
// событий этого вида нет вовсе, а не «нет среди загруженных».
// ═══════════════════════════════════════════════════════

/**
 * `all` + виды серверного фильтра (шесть kind + производный `note`).
 *
 * S-UI-CLARITY-1: `note` — не kind, а срез внутри `activity`: события
 * `kind='activity'` с человеческим `event_type`. Отдельным kind его сделать
 * нельзя — источник один (`activity_log`), и `kindFilter` родителей пришлось бы
 * учить второму имени того же источника. С S-TL-3 срез считает SQL
 * (`p_kinds = ['note']`), а не клиент.
 */
// ⚠️ УЖЕ, чем `TimelineKindFilter`: чипы карточки предлагают шесть видов и `note`,
// но не `stage`/`deleted` — эти два завёл дашборд (S-TL-4), и на карточке сущности
// им места нет. Значение отсюда всегда валидный `TimelineKindFilter`, обратное неверно.
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
   * Какие kinds вообще предлагать чипами и показывать. Это КОНФИГУРАЦИЯ КАРТОЧКИ,
   * а не фильтр данных: набор чипов у компании шире дефолтного. Не задан →
   * дефолтный набор.
   *
   * ⚠️ Срез по этому набору остался клиентским (в отличие от выбранного чипа,
   * который с S-TL-3 уходит в `p_kinds`). Сегодня это безобидно: единственный
   * родитель, который его задаёт, перечисляет ВСЕ шесть видов, и срез — no-op.
   * Карточка, которая объявит набор УЖЕ полного, вернёт себе дефект S-TL-2:
   * «Все» будет показывать объявленные виды только из загруженных страниц.
   * Лечится передачей набора в `kinds` хука — не сделано за отсутствием такого
   * родителя.
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
  const [localFilter, setLocalFilter] = useState<TimelineFilterValue>('all');

  // Управляемый режим — только когда переданы ОБА props: одиночный `filter` без
  // колбэка дал бы залипший чип, который невозможно переключить.
  const controlled = filterProp !== undefined && onFilterChange !== undefined;
  const filter = controlled ? filterProp : localFilter;
  const setFilter = controlled ? onFilterChange! : setLocalFilter;

  const kinds = useMemo(() => kindFilter ?? DEFAULT_KINDS, [kindFilter]);

  // S-TL-3: выбранный чип — это ЗАПРОС. `all` уходит как `undefined` (⇒ `p_kinds`
  // null), любой другой — массивом из одного вида. Смена чипа меняет queryKey хука,
  // и лента приходит с первой страницы: курсор от прежнего набора видов к новому
  // отношения не имеет.
  const requestKinds = useMemo<TimelineKindFilter[] | undefined>(
    () => (filter === 'all' ? undefined : [filter]),
    [filter],
  );

  const {
    events: allEvents, isLoading, error, hasMore, loadMore, isLoadingMore,
  } = useEntityTimeline(entityType, entityId, requestKinds);

  // `kindFilter` режет ленту до объявленного набора: иначе «Все» показывало бы
  // события тех видов, которых в чипах нет. Сегодня no-op (см. props), поэтому
  // серверным его не делаем — лишний `p_kinds` из шести значений эквивалентен null.
  const events = useMemo(
    () => (kindFilter ? allEvents.filter((e) => kinds.includes(e.kind)) : allEvents),
    [allEvents, kindFilter, kinds],
  );

  const groups = useMemo(() => {
    const now = new Date();
    if (splitUpcoming) {
      const nowMs = now.getTime();
      const upcoming: TimelineEvent[] = [];
      const past: TimelineEvent[] = [];
      for (const e of events) {
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
    for (const e of events) {
      if (e.status === 'overdue') overdue.push(e);
      else if (sameMonth(e.date, now)) thisMonth.push(e);
      else earlier.push(e);
    }
    return [
      { key: 'overdue', label: 'Просрочено', items: overdue },
      { key: 'month', label: 'Этот месяц', items: thisMonth },
      { key: 'earlier', label: 'Ранее', items: earlier },
    ].filter((g) => g.items.length > 0);
  }, [events, splitUpcoming]);

  return (
    <div className={className}>
      {/*
        Чипы стоят ВЫШЕ ветвления загрузки намеренно. С S-TL-3 смена чипа — новый
        запрос, и ранний `return` со спиннером убирал бы с экрана сам переключатель
        на время загрузки: чипы мигали бы при каждом клике, а промахнуться по
        исчезающей кнопке легко.
      */}
      {showFilters && (
        <TimelineFilterChips className="mb-3" kinds={kinds} value={filter} onChange={setFilter} />
      )}

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 size={20} className="animate-spin text-accent" />
        </div>
      ) : /*
          Сбой загрузки обязан отличаться от «событий нет»: без этой ветки любой
          бросок внутри queryFn выглядит как пустая лента — React Query такой бросок
          ловит молча, и в консоли с логами БД не остаётся ничего (дефект S-TL-1).
        */
      error ? (
        <p className="py-6 text-center text-xs text-danger">
          Не удалось загрузить активность. Обновите страницу.
        </p>
      ) : events.length === 0 ? (
        /*
          Два разных пустых состояния. С S-TL-3 второе стало честным: сервер вернул
          ноль событий ВЫБРАННОГО вида по всей ленте, а не «ноль среди загруженных».
        */
        <p className="py-6 text-center text-xs text-text-mute italic">
          {filter === 'all' ? 'Пока нет активности' : 'Нет событий этого типа'}
        </p>
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
                        <span className="mt-1 shrink-0 rounded-full bg-danger-l px-1.5 py-0.5 text-xs font-medium text-danger">
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
        ленту. С S-TL-3 «Показать раньше» догружает страницу ВЫБРАННОГО вида —
        `hasMore` считается по той же отфильтрованной ленте, что и показана.
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
