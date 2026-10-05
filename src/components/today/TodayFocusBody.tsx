'use client';

import { useState, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import { Dot, Flag, ListChecks, Phone, StickyNote, Users, type LucideIcon } from 'lucide-react';
import { ContactCallChip } from '@/components/shared/ContactCallChip';
import { PulseDayStrip } from '@/components/shared/PulseDayStrip';
import { cn } from '@/lib/utils/cn';
import { buildPulseDays } from '@/lib/domain/deal-pulse';
import { countBuckets, feedBucket, filterFeed, type FeedBucket, type FeedFilter } from '@/lib/domain/focus-feed';
import { TIMELINE_PAGE_SIZE } from '@/lib/timeline/cursor';
import { dealHeaderAmount } from '@/lib/domain/deal-amount';
import { pickActiveQuote } from '@/lib/domain/quote-version';
import { useEntityTimeline } from '@/lib/hooks/use-entity-timeline';
import { useStageTimeGauge } from '@/lib/hooks/use-stage-gauge';
import { useContactBrief } from '@/lib/hooks/use-contact-brief';
import { useUpdateTask } from '@/lib/hooks/use-tasks';
import { useUpdateCall } from '@/lib/hooks/use-calls';
import { formatContactName } from '@/lib/utils/contact-name';
import { projectHref } from '@/lib/utils/project-href';
import { pluralRu } from '@/lib/utils/plural';
import { localDateKey, mskTime } from '@/lib/utils/date-helpers';
import { dayText, deadlineText, plannedText, quoteLineText } from '@/lib/utils/today-text';
import type { Project } from '@/lib/hooks/use-projects';
import type { PipelineStage } from '@/types/database';
import type { Quote } from '@/types/entities';
import type { DealTouch } from '@/lib/domain/deal-touch';
import type { PlannedEvent } from '@/lib/domain/today-deals';
import type { TodayDealCall, TodayDealTask } from '@/lib/domain/today-model';
import type { TimelineEvent } from '@/types/timeline';
import { TodayFocusNote } from './TodayFocusNote';

interface TodayFocusBodyProps {
  project: Project;
  stage: PipelineStage | null;
  /** Касания сделки по возрастанию времени — полоса «Было». */
  touches: readonly DealTouch[];
  tasks: readonly TodayDealTask[];
  calls: readonly TodayDealCall[];
  planned: PlannedEvent | null;
  quotes: readonly Quote[];
  now: Date;
  /** Поле заметки — туда ставит курсор клавиша N экрана. */
  noteRef: RefObject<HTMLInputElement | null>;
}

/** Событий в секции «Лента» без выбранного дня. */
const FOCUS_FEED_EVENTS = 8;
/** Новая заметка — `kind='note'` не раньше момента отправки минус столько. */
const FRESH_NOTE_SLACK_MS = 60_000;

const ALL_FILTER: FeedFilter = { bucket: 'all', day: null };

const BUCKET_CHIPS: { bucket: FeedBucket | 'all'; label: string }[] = [
  { bucket: 'all', label: 'Все' },
  { bucket: 'note', label: 'Заметки' },
  { bucket: 'call', label: 'Звонки' },
  { bucket: 'stage', label: 'Стадии' },
];

/**
 * Иконка события (F-08: один цвет — один смысл). Цвет только у смены стадии — тот же
 * `--info`, что у капсулы стадии в пульсе; остальное нейтрально.
 */
function eventIcon(e: TimelineEvent): { Icon: LucideIcon; tone: string } {
  switch (feedBucket(e)) {
    case 'stage': return { Icon: Flag, tone: 'text-info' };
    case 'note': return { Icon: StickyNote, tone: 'text-text-dim' };
    case 'call': return { Icon: Phone, tone: 'text-text-dim' };
    default:
      if (e.kind === 'meeting') return { Icon: Users, tone: 'text-text-dim' };
      // `task_created`/`task_completed` журнала ссылаются на задачу (`refType`).
      if (e.kind === 'task' || e.refType === 'task') return { Icon: ListChecks, tone: 'text-text-dim' };
      return { Icon: Dot, tone: 'text-text-dim' };
  }
}

function FeedChip({
  label, count, active, onClick,
}: { label: string; count?: number; active: boolean; onClick: () => void }) {
  const empty = count === 0;
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={empty}
      onClick={onClick}
      className={cn(
        'inline-flex h-[1.375rem] items-center gap-1 whitespace-nowrap rounded-full border px-2 text-meta transition-colors',
        active
          ? 'border-border2 bg-surface2 font-medium text-text-main'
          : empty
            ? 'cursor-default border-dashed border-border text-text-mute'
            : 'border-border text-text-dim hover:text-text-main',
      )}
    >
      {label}
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

const ROW_BUTTON =
  'inline-flex min-h-7 shrink-0 items-center rounded border border-border px-2 text-xs text-text-dim transition-colors hover:text-text-main';

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-3 first:border-t-0">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-meta font-semibold uppercase tracking-wider text-text-mute">{title}</h3>
        <span className="flex-1" />
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Тело фокуса (спека, §4): «Было» → «Лента» → «Задачи и звонки» → «КП» → «Сделка».
 * Содержимое — из раскрытой панели V3 (удалена этим спринтом), без новой логики.
 *
 * ⚠️ Пропсы простые — проект, касания, задачи, КП, — а не `TodayDealView`: это тело
 * потом заменит `ProjectPeekContent` в «Сделках» (спека, §4), и вида экрана
 * «Сегодня» там не будет. Четвёртого детального вида сделки не заводить.
 */
export function TodayFocusBody({
  project, stage, touches, tasks, calls, planned, quotes, now, noteRef,
}: TodayFocusBodyProps) {
  // Страница — как у ленты карточки сделки: фильтру нужен материал, а ключ кеша общий,
  // и переход в карточку открывает её из кеша. Сброс фильтра и выделения при смене
  // сделки — `key={project.id}` у родителя.
  const { events, isLoading: feedLoading, error: feedError, refetch: refetchFeed, dataUpdatedAt } =
    useEntityTimeline('project', project.id, undefined, TIMELINE_PAGE_SIZE);
  const [filter, setFilter] = useState<FeedFilter>(ALL_FILTER);
  /** Момент отправки последней заметки из фокуса — по нему выделяется новое событие. */
  const [noteSentAt, setNoteSentAt] = useState<number | null>(null);
  const gauge = useStageTimeGauge(project.stage_entered_at, stage ? { id: stage.id, phase_group: stage.phase_group } : null);
  const { data: contact } = useContactBrief(project.contact_id);
  const updateTask = useUpdateTask();
  const updateCall = useUpdateCall();

  const pulseDays = buildPulseDays(touches, project.next_action_date, now);
  const anyTouch = pulseDays.some((d) => d.count > 0);
  const dueInWindow = pulseDays.some((d) => d.isDue);
  // ⚠️ `now` экрана застывает на весь день (`useTodayNow`), и отсечка по нему спрятала
  // бы всё, что случилось после открытия экрана, — в том числе заметку из фокуса.
  // Будущее отсекается по моменту загрузки страницы: что позже — ещё не было.
  const feedNow = new Date(Math.max(now.getTime(), dataUpdatedAt));
  const counts = countBuckets(events, feedNow);
  const filtered = filterFeed(events, filter, feedNow);
  const shown = filter.day ? filtered : filtered.slice(0, FOCUS_FEED_EVENTS);
  const isFresh = (e: TimelineEvent) =>
    noteSentAt !== null && e.kind === 'note' && new Date(e.date).getTime() >= noteSentAt - FRESH_NOTE_SLACK_MS;
  const selectDay = (day: string) =>
    setFilter((f) => (f.day === day ? ALL_FILTER : { bucket: 'all', day }));
  const href = projectHref(project);

  const quoteLine = quoteLineText(pickActiveQuote(quotes), dealHeaderAmount(quotes, project.budget).source, now);
  // `?tab=quotes` карточка сделки принимает: ведёт на развёрнутый орг. блок с КП
  // (`ProjectDetail`, S-DEAL-LAYOUT-1).
  const quotesHref = `${href}?tab=quotes`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Section
        title="Было · 30 дней"
        aside={<span className="text-meta text-text-mute">день — события, клик — лента за день</span>}
      >
        <PulseDayStrip
          days={pulseDays}
          dueLabel={dueInWindow && project.next_action_date ? dayText(project.next_action_date) : undefined}
          selectedDay={filter.day}
          onSelectDay={selectDay}
        />
        {!anyTouch && (
          <p className="mt-2 text-xs text-text-dim">За 30 дней по сделке не было ни одного касания</p>
        )}
      </Section>

      <section className="border-t border-border px-4 py-3">
        <TodayFocusNote projectId={project.id} inputRef={noteRef} onCreated={setNoteSentAt} />
      </section>

      <Section
        title="Лента"
        aside={
          !feedLoading && !feedError ? (
            <div className="flex flex-wrap justify-end gap-1">
              {filter.day ? (
                <>
                  <FeedChip label={`${dayText(filter.day)} ✕`} active onClick={() => setFilter(ALL_FILTER)} />
                  <FeedChip label="Все" count={counts.all} active={false} onClick={() => setFilter(ALL_FILTER)} />
                </>
              ) : (
                BUCKET_CHIPS.map((c) => (
                  <FeedChip
                    key={c.bucket}
                    label={c.label}
                    count={counts[c.bucket]}
                    active={filter.bucket === c.bucket}
                    onClick={() => setFilter({ bucket: c.bucket, day: null })}
                  />
                ))
              )}
            </div>
          ) : undefined
        }
      >
        {feedLoading ? (
          <div className="space-y-2" aria-hidden="true">
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface2" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface2" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface2" />
          </div>
        ) : feedError ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
            <span>Ленту не загрузили</span>
            <button type="button" onClick={() => void refetchFeed()} className={ROW_BUTTON}>
              Повторить
            </button>
          </div>
        ) : shown.length === 0 ? (
          <p className="text-xs text-text-dim">
            {counts.all === 0
              ? 'Событий пока нет'
              : filter.day
                ? `${dayText(filter.day)}: событий нет`
                : 'Нет событий этого вида'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {shown.map((e) => {
              const { Icon, tone } = eventIcon(e);
              const fresh = isFresh(e);
              return (
                <li key={e.id} className="grid grid-cols-[3.25rem_1rem_minmax(0,1fr)] gap-1.5 text-xs leading-[1.4]">
                  <span className={fresh ? 'font-semibold tabular-nums text-text-main' : 'tabular-nums text-text-mute'}>
                    {dayText(e.date)}
                  </span>
                  <Icon aria-hidden="true" className={cn('mt-px h-3.5 w-3.5', tone)} />
                  <span className="line-clamp-2 text-text-main" title={e.body ?? e.title}>{e.title}</span>
                </li>
              );
            })}
          </ul>
        )}
        <Link href={href} className="mt-2 inline-block text-xs text-text-dim underline-offset-2 hover:underline">
          Вся лента сделки
        </Link>
      </Section>

      {(tasks.length > 0 || calls.length > 0) && (
        <Section title="Задачи и звонки">
          <ul className="space-y-1.5">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-xs">
                <span className="min-w-0 flex-1 text-text-main">
                  Задача «{t.text}»
                  {t.deadline && (
                    <span className={t.overdue ? 'text-warning-text' : 'text-text-dim'}>
                      {' '}· {t.overdue ? 'срок был' : 'срок'} {dayText(t.deadline)}
                    </span>
                  )}
                </span>
                <button type="button" onClick={() => updateTask.mutate({ id: t.id, lane: 'done' })} className={ROW_BUTTON}>
                  Готово
                </button>
              </li>
            ))}
            {calls.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-xs">
                <span className={cn('min-w-0 flex-1', c.overdue ? 'text-warning-text' : 'text-text-main')}>
                  Звонок {dayText(c.date)}, {mskTime(c.date)}
                </span>
                <button type="button" onClick={() => updateCall.mutate({ id: c.id, status: 'done' })} className={ROW_BUTTON}>
                  Выполнен
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="КП"
        aside={
          <Link href={quotesHref} className="text-xs font-medium text-text-main underline-offset-2 hover:underline">
            {quoteLine.action === 'create' ? 'Создать КП' : 'Открыть КП'}
          </Link>
        }
      >
        <p className={cn('text-xs', quoteLine.warn ? 'text-warning-text' : 'text-text-main')}>{quoteLine.text}</p>
      </Section>

      <Section title="Сделка">
        <div className="space-y-1 text-xs text-text-main">
          {gauge && gauge.days !== null && stage && (
            <p>
              Стадия «{stage.name}»: {gauge.days} {pluralRu(gauge.days, 'день', 'дня', 'дней')}
              {gauge.norm !== null && ` при норме ${gauge.norm}`}
            </p>
          )}
          {project.deadline && <p>{deadlineText(project.deadline, localDateKey(now))}</p>}
          {planned && <p className="first-letter:uppercase">{plannedText(planned)}</p>}
        </div>
        {contact ? (
          <div className="mt-2.5">
            <ContactCallChip
              name={formatContactName(contact.first_name, contact.last_name)}
              position={contact.position}
              initialsFrom={contact.first_name}
              phone={contact.phone}
              email={contact.email}
            />
          </div>
        ) : !project.contact_id ? (
          <p className="mt-2 text-xs text-text-dim">Контакт не указан</p>
        ) : null}
      </Section>
    </div>
  );
}
