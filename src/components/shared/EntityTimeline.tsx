'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Phone, Calendar, CheckSquare, FolderKanban, Activity, Sparkles,
  ChevronRight, Loader2, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useEntityTimeline, type TimelineEntityType, type UseEntityTimelineOptions } from '@/lib/hooks/use-entity-timeline';
import type { TimelineEvent, TimelineKind } from '@/types/timeline';

// ═══════════════════════════════════════════════════════
// <EntityTimeline> — переиспользуемая лента активности сущности.
// Данные — useEntityTimeline (серверный фильтр). Компонент тонкий:
// группировка (Просрочено → Этот месяц → Ранее), клиентский фильтр
// по kind (данные уже в памяти, без повторных запросов), клик по
// событию → onOpenEvent (родитель решает, что открыть).
// ═══════════════════════════════════════════════════════

interface EntityTimelineProps {
  entityType: TimelineEntityType;
  entityId: string;
  onOpenEvent?: (event: TimelineEvent) => void;
  /** Опциональное действие в строке (напр. AI-кнопка для звонков) — держит компонент generic */
  renderAction?: (event: TimelineEvent) => ReactNode;
  options?: UseEntityTimelineOptions;
  className?: string;
}

const KIND_META: Record<TimelineKind, { icon: LucideIcon; dot: string; fg: string }> = {
  call:     { icon: Phone,        dot: 'bg-blue-l',   fg: 'text-blue' },
  meeting:  { icon: Calendar,     dot: 'bg-green-l',  fg: 'text-green' },
  task:     { icon: CheckSquare,  dot: 'bg-yellow-l', fg: 'text-yellow' },
  project:  { icon: FolderKanban, dot: 'bg-accent-l', fg: 'text-accent' },
  activity: { icon: Activity,     dot: 'bg-surface2', fg: 'text-text-mute' },
  ai_run:   { icon: Sparkles,     dot: 'bg-accent-l', fg: 'text-accent' },
};

// Клиентские табы фильтра — по прямым источникам Sprint A
const FILTERS: { key: 'all' | TimelineKind; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'call', label: 'Звонки' },
  { key: 'meeting', label: 'Встречи' },
  { key: 'task', label: 'Задачи' },
  { key: 'project', label: 'Сделки' },
];

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

export function EntityTimeline({ entityType, entityId, onOpenEvent, renderAction, options, className }: EntityTimelineProps) {
  const { events, isLoading } = useEntityTimeline(entityType, entityId, options);
  const [filter, setFilter] = useState<'all' | TimelineKind>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.kind === filter)),
    [events, filter],
  );

  const groups = useMemo(() => {
    const now = new Date();
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
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Фильтр-табы (клиентский фильтр по kind — без повторных запросов) */}
      <div className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              filter === f.key
                ? 'bg-accent-l text-accent'
                : 'text-text-mute hover:bg-surface2 hover:text-text-main',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-mute italic">Пока нет активности</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-mute italic">Нет событий этого типа</p>
      ) : (
        <div className="max-h-[560px] space-y-4 overflow-y-auto pr-1">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-mute">
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
    </div>
  );
}
