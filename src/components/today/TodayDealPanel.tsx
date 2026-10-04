'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { ContactCallChip } from '@/components/shared/ContactCallChip';
import { PulseDayStrip } from '@/components/shared/PulseDayStrip';
import { cn } from '@/lib/utils/cn';
import { buildPulseDays } from '@/lib/domain/deal-pulse';
import { useEntityTimeline } from '@/lib/hooks/use-entity-timeline';
import { useFieldMoves } from '@/lib/hooks/use-stage-story';
import { useStageTimeGauge } from '@/lib/hooks/use-stage-gauge';
import { useContactBrief } from '@/lib/hooks/use-contact-brief';
import { useUpdateTask } from '@/lib/hooks/use-tasks';
import { useUpdateCall } from '@/lib/hooks/use-calls';
import { formatContactName } from '@/lib/utils/contact-name';
import { projectHref } from '@/lib/utils/project-href';
import { pluralRu } from '@/lib/utils/plural';
import { mskTime } from '@/lib/utils/date-helpers';
import { formatBudget } from '@/lib/validators/project';
import { dayText, dayWeekdayText, plannedText } from '@/lib/utils/today-text';
import type { Project } from '@/lib/hooks/use-projects';
import type { PipelineStage } from '@/types/database';
import type { TodayDealView } from '@/lib/domain/today-model';

interface TodayDealPanelProps {
  view: TodayDealView;
  project: Project;
  stage: PipelineStage | null;
  now: Date;
  onPlan: () => void;
  onSnooze: () => void;
  /** Панель под рядом карточек — отдельный лист; под строкой — часть листа списка. */
  standalone?: boolean;
}

/** Событий ленты в блоке «Было». */
const FEED_EVENTS = 3;
/** Страница ленты с запасом: будущие события (встреча через неделю) отсекаются. */
const FEED_PAGE = 10;

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-meta font-semibold uppercase tracking-wider text-text-mute">{title}</h4>
      {children}
    </div>
  );
}

/**
 * Раскрытая сделка «Было · Сейчас · Впереди» (макет, кадры 2–3). Компонент один —
 * и под рядом ходов, и под строкой группы.
 *
 * Задачи и звонки сделки живут здесь, в «Сейчас», с прежними действиями «Готово» и
 * «Выполнен»: раньше они стояли отдельными строками экрана.
 */
export function TodayDealPanel({ view, project, stage, now, onPlan, onSnooze, standalone }: TodayDealPanelProps) {
  const { source, cls } = view;
  const { data: moves } = useFieldMoves(source.id);
  const stepMoves = moves?.step.count ?? 0;
  const { events, isLoading: feedLoading } = useEntityTimeline('project', source.id, undefined, FEED_PAGE);
  const gauge = useStageTimeGauge(project.stage_entered_at, stage ? { id: stage.id, phase_group: stage.phase_group } : null);
  const { data: contact } = useContactBrief(source.contactId);
  const updateTask = useUpdateTask();
  const updateCall = useUpdateCall();

  const pulseDays = buildPulseDays(view.touches, source.next_action_date, now);
  const anyTouch = pulseDays.some((d) => d.count > 0);
  const dueInWindow = pulseDays.some((d) => d.isDue);
  const nowMs = now.getTime();
  const pastEvents = events.filter((e) => new Date(e.date).getTime() <= nowMs).slice(0, FEED_EVENTS);
  const href = projectHref(project);
  const step = source.next_step?.trim();

  const stepMeta = [
    cls.overdueDays !== null && source.next_action_date
      ? `Шаг · срок был ${dayText(source.next_action_date)}`
      : cls.stepAhead && source.next_action_date
        ? `Шаг на ${dayWeekdayText(source.next_action_date)}`
        : 'Шага нет',
    stepMoves >= 2 ? `перенесён ${stepMoves} ${pluralRu(stepMoves, 'раз', 'раза', 'раз')}` : null,
  ].filter(Boolean).join(' · ');

  const quoteExpired = view.signals.find((s) => s.key === 'quote_expired');

  return (
    <div className={cn('px-4 py-4', standalone ? 'sheet' : 'border-t border-border bg-surface2')}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-text-dim">
        {source.companyName && <span>{source.companyName}</span>}
        {source.companyName && source.stage && <span aria-hidden="true">·</span>}
        {source.stage && <span>{source.stage.name}</span>}
        {view.amount.amount !== null && <span>· {formatBudget(view.amount.amount)}</span>}
        <span className="flex-1" />
        <Link href={href} className="text-xs font-medium text-text-main underline-offset-2 hover:underline">
          Открыть сделку
        </Link>
      </div>

      <div className="today-panel-cols">
        <Column title="Было · 30 дней">
          <PulseDayStrip
            days={pulseDays}
            dueLabel={dueInWindow && source.next_action_date ? dayText(source.next_action_date) : undefined}
          />
          {!anyTouch && (
            <p className="mt-2 text-xs text-text-dim">За 30 дней по сделке не было ни одного касания</p>
          )}
          <div className="mt-3 space-y-1.5">
            {feedLoading && <div className="h-3 w-3/4 animate-pulse rounded bg-surface3" />}
            {pastEvents.map((e) => (
              <div key={e.id} className="flex gap-2 text-xs">
                <span className="w-12 shrink-0 tabular-nums text-text-mute">{dayText(e.date)}</span>
                <span className="line-clamp-2 min-w-0 text-text-main" title={e.title}>{e.title}</span>
              </div>
            ))}
          </div>
          <Link href={href} className="mt-2 inline-block text-xs text-text-dim underline-offset-2 hover:underline">
            Вся лента сделки
          </Link>
        </Column>

        <Column title="Сейчас">
          <p className={cn('text-[0.9375rem] font-medium leading-snug', step ? 'text-text-main' : 'text-text-dim')}>
            {step ? `«${step}»` : 'Шаг не задан'}
          </p>
          <p className="mt-1 text-xs text-text-dim">{stepMeta}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" onClick={onPlan}>Запланировать шаг</Button>
            <button
              type="button"
              onClick={onSnooze}
              className="rounded px-2 py-1 text-xs text-text-mute transition-colors hover:bg-surface hover:text-text-main"
            >
              Отложить
            </button>
          </div>

          {(view.tasks.length > 0 || view.calls.length > 0) && (
            <ul className="mt-3 space-y-1.5">
              {view.tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-xs">
                  <span className="min-w-0 flex-1 text-text-main">
                    Задача «{t.text}»
                    {t.deadline && (
                      <span className={t.overdue ? 'text-warning-text' : 'text-text-dim'}>
                        {' '}· {t.overdue ? 'срок был' : 'срок'} {dayText(t.deadline)}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateTask.mutate({ id: t.id, lane: 'done' })}
                    className="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-text-dim transition-colors hover:text-text-main"
                  >
                    Готово
                  </button>
                </li>
              ))}
              {view.calls.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-xs">
                  <span className={cn('min-w-0 flex-1', c.overdue ? 'text-warning-text' : 'text-text-main')}>
                    Звонок {dayText(c.date)}, {mskTime(c.date)}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateCall.mutate({ id: c.id, status: 'done' })}
                    className="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-text-dim transition-colors hover:text-text-main"
                  >
                    Выполнен
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 space-y-1 text-xs text-text-dim">
            {quoteExpired && <p className="text-warning-text">КП истекло {dayText(quoteExpired.since)}</p>}
            {project.deadline && <p>Дедлайн сделки · {dayText(project.deadline)}</p>}
            {gauge && gauge.days !== null && source.stage && (
              <p>
                Стадия «{source.stage.name}»: {gauge.days} {pluralRu(gauge.days, 'день', 'дня', 'дней')}
                {gauge.norm !== null && ` при норме ${gauge.norm}`}
              </p>
            )}
          </div>

          {contact && (
            <div className="mt-3">
              <ContactCallChip
                name={formatContactName(contact.first_name, contact.last_name)}
                position={contact.position}
                initialsFrom={contact.first_name}
                phone={contact.phone}
                email={contact.email}
              />
            </div>
          )}
        </Column>

        <Column title="Впереди">
          {cls.stepAhead || view.planned ? (
            <div className="space-y-1.5 text-xs text-text-main">
              {cls.stepAhead && source.next_action_date && (
                <p>Шаг {dayWeekdayText(source.next_action_date)}{step ? `: ${step}` : ''}</p>
              )}
              {view.planned && <p className="first-letter:uppercase">{plannedText(view.planned)}</p>}
            </div>
          ) : (
            <p className="text-xs text-text-dim">Шага впереди нет — сделка без плана</p>
          )}
        </Column>
      </div>
    </div>
  );
}
