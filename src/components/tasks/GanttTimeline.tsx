'use client';

import { useMemo, useState } from 'react';
import { useProjectSchedule, type GanttTask } from '@/lib/hooks/use-project-schedule';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { LANE_CONFIG } from '@/lib/validators/task';
import { DELIVERY_TASK_STATUS_LABELS } from '@/lib/constants/delivery-phases';
import {
  mskDateKey,
  bucketKeyOf,
  bucketIndexOf,
  buildBuckets,
  type GanttZoom,
} from '@/lib/utils/date-helpers';
import type { Task } from '@/types/entities';

interface GanttTimelineProps {
  projectId: string;
  onEditTask: (task: Task) => void;
}

type GanttFilter = 'open' | 'all' | 'milestones';

const LABEL_W = '12.5rem'; // колонка названий (rem — конвенция проекта, не px)
const ROW_H = '1.75rem';   // высота ряда — синхронно в левой колонке и таймлайне

const ZOOMS: { value: GanttZoom; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
];
const FILTERS: { value: GanttFilter; label: string }[] = [
  { value: 'open', label: 'Открытые' },
  { value: 'all', label: 'Все' },
  { value: 'milestones', label: 'Вехи' },
];

// цвет бара/ромба по приоритету; done — приглушённо
function barClass(task: Task): string {
  if (task.lane === 'done') return 'bg-green';
  switch (task.priority) {
    case 'critical': return 'bg-red';
    case 'important': return 'bg-yellow';
    default: return 'bg-accent';
  }
}

// lane-статус с fallback: delivery → DELIVERY_TASK_STATUS_LABELS; иначе → LANE_CONFIG
function laneLabel(lane: Task['lane'], phaseMode: boolean): string {
  return phaseMode
    ? (DELIVERY_TASK_STATUS_LABELS[lane] ?? lane)
    : (LANE_CONFIG[lane]?.label ?? lane);
}

export function GanttTimeline({ projectId, onEditTask }: GanttTimelineProps) {
  const { swimlanes, undated, phaseMode, isLoading, isError } = useProjectSchedule(projectId);
  const { data: team = [] } = useTeamMembers();
  const [zoom, setZoom] = useState<GanttZoom>('week');
  const [filter, setFilter] = useState<GanttFilter>('open');
  const [tip, setTip] = useState<{ x: number; y: number; text: string; assignee: string; status: string } | null>(null);

  const nameById = useMemo(() => new Map(team.map((m) => [m.id, m.full_name])), [team]);

  const filteredSwimlanes = useMemo(() => {
    const pred = (gt: GanttTask) =>
      filter === 'all' ? true : filter === 'milestones' ? gt.isMilestone : gt.task.lane !== 'done';
    return swimlanes.map((sl) => ({ ...sl, tasks: sl.tasks.filter(pred) }));
  }, [swimlanes, filter]);

  const filteredUndated = useMemo(() => {
    if (filter === 'milestones') return [];              // вехи без дат — не в этот фильтр (см. заметки гейта)
    if (filter === 'open') return undated.filter((t) => t.lane !== 'done');
    return undated;
  }, [undated, filter]);

  const model = useMemo(() => {
    const allTasks: GanttTask[] = filteredSwimlanes.flatMap((sl) => sl.tasks);
    if (allTasks.length === 0) {
      return { buckets: [] as { key: string; label: string }[], idxByKey: new Map<string, number>(), todayIdx: -1 };
    }
    const min = allTasks.reduce((m, t) => (t.start < m ? t.start : m), allTasks[0].start);
    const max = allTasks.reduce((m, t) => (t.end > m ? t.end : m), allTasks[0].end);
    const buckets = buildBuckets(min, max, zoom);
    const idxByKey = new Map(buckets.map((b, i) => [b.key, i]));
    const todayIdx = bucketIndexOf(mskDateKey(new Date()), zoom, buckets);
    return { buckets, idxByKey, todayIdx };
  }, [filteredSwimlanes, zoom]);

  // isLoading (в т.ч. пока грузятся колонки) → только «Загрузка…», без флеша плоского режима
  if (isLoading) return <div className="py-8 text-center text-xs text-text-mute">Загрузка…</div>;
  if (isError)   return <div className="py-8 text-center text-xs text-red">Не удалось загрузить задачи</div>;

  const { buckets, idxByKey, todayIdx } = model;
  const laneRows = filteredSwimlanes.filter((sl) => sl.tasks.length > 0);
  const gridCols = { gridTemplateColumns: `repeat(${buckets.length}, minmax(28px, 1fr))` };
  const wideRange = zoom === 'day' && buckets.length > 180;

  const controls = (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        {ZOOMS.map((z) => (
          <button
            key={z.value}
            type="button"
            onClick={() => setZoom(z.value)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              zoom === z.value ? 'border-accent text-accent' : 'border-border text-text-mute hover:text-text-main'
            }`}
          >
            {z.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === f.value ? 'border-accent text-accent' : 'border-border text-text-mute hover:text-text-main'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );

  if (buckets.length === 0 && filteredUndated.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-border bg-surface p-3">
        {controls}
        <div className="py-8 text-center text-xs text-text-mute">Нет задач под фильтр</div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-3">
      {controls}

      {wideRange && (
        <div className="mb-2 rounded-lg border border-yellow bg-yellow-l px-3 py-1.5 text-xs text-text-main">
          Широкий диапазон — переключи на неделю или месяц для читаемости.
        </div>
      )}

      {buckets.length > 0 && (
        // C0: split-layout — фикс.левая колонка (вне скролла) + отдельный scrollable timeline-body
        <div className="flex">
          {/* ── Левая колонка: названия фаз/задач (вне overflow) ── */}
          <div className="shrink-0" style={{ width: LABEL_W }}>
            <div style={{ height: ROW_H }} /> {/* спейсер под шапку бакетов */}
            {laneRows.map((sl) => (
              <div key={sl.id}>
                {sl.label !== null && (
                  <div className="truncate px-1 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
                    {sl.label}
                  </div>
                )}
                {sl.tasks.map((gt) => (
                  <div
                    key={gt.task.id}
                    className="flex items-center truncate pr-2 text-xs text-text-main"
                    style={{ height: ROW_H }}
                    title={gt.task.text}
                  >
                    <span className="truncate">{gt.task.text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* ── Timeline-body: скроллится по X, внутри — шапка, ряды, today-оверлей ── */}
          <div className="flex-1 overflow-x-auto">
            <div className="relative min-w-max">
              {/* Шапка бакетов */}
              <div className="grid" style={{ ...gridCols, height: ROW_H }}>
                {buckets.map((b, i) => (
                  <div
                    key={b.key}
                    className={`flex flex-col items-center justify-center border-l border-border/40 text-[10px] tabular-nums ${
                      i === todayIdx ? 'font-semibold text-accent' : 'text-text-mute'
                    }`}
                  >
                    <span>{b.label}</span>
                    {zoom === 'day' && (i === 0 || b.key.slice(8, 10) === '01') && (
                      <span className="text-text-dim">{b.key.slice(5, 7)}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Ряды по фазам */}
              {laneRows.map((sl) => (
                <div key={sl.id}>
                  {sl.label !== null && <div className="pt-2 pb-0.5 text-[10px]">&nbsp;</div>}
                  {sl.tasks.map((gt) => {
                    const s = idxByKey.get(bucketKeyOf(gt.start, zoom)) ?? 0;
                    const e = idxByKey.get(bucketKeyOf(gt.end, zoom)) ?? s;
                    const assignee = nameById.get(gt.task.assigned_to ?? '') ?? '—';
                    const status = laneLabel(gt.task.lane, phaseMode);
                    return (
                      <div key={gt.task.id} className="grid border-t border-border/40" style={{ ...gridCols, height: ROW_H }}>
                        <div className="relative" style={{ gridColumn: gt.isMilestone ? `${s + 1}` : `${s + 1} / ${e + 2}`, gridRow: 1 }}>
                          {gt.isMilestone ? (
                            <button
                              type="button"
                              onClick={() => onEditTask(gt.task)}
                              onMouseEnter={(ev) => setTip({ x: ev.clientX, y: ev.clientY, text: gt.task.text, assignee, status })}
                              onMouseMove={(ev) => setTip((t) => (t ? { ...t, x: ev.clientX, y: ev.clientY } : t))}
                              onMouseLeave={() => setTip(null)}
                              className="flex h-full w-full items-center justify-center"
                              aria-label={`${gt.task.text} (веха): ${gt.start}`}
                            >
                              <span className={`inline-block h-2.5 w-2.5 rotate-45 rounded-[1px] ${barClass(gt.task)}`} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onEditTask(gt.task)}
                              onMouseEnter={(ev) => setTip({ x: ev.clientX, y: ev.clientY, text: gt.task.text, assignee, status })}
                              onMouseMove={(ev) => setTip((t) => (t ? { ...t, x: ev.clientX, y: ev.clientY } : t))}
                              onMouseLeave={() => setTip(null)}
                              className={`my-1 block h-4 w-full rounded ${barClass(gt.task)} ${gt.task.lane === 'done' ? 'opacity-50' : 'opacity-90'} transition-opacity hover:opacity-100`}
                              aria-label={`${gt.task.text}: ${gt.start} → ${gt.end}`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Today line — оверлей поверх шапки+рядов, выровнен по той же бакет-сетке */}
              {todayIdx !== -1 && (
                <div className="pointer-events-none absolute inset-0 grid" style={gridCols}>
                  <div style={{ gridColumn: `${todayIdx + 1}` }} className="border-l border-accent" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Без дат */}
      {filteredUndated.length > 0 && (
        <div className="mt-3 border-t border-border/40 pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">Без дат</div>
          <div className="flex flex-wrap gap-1.5">
            {filteredUndated.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onEditTask(task)}
                className="max-w-[200px] truncate rounded border border-border px-2 py-1 text-xs text-text-dim hover:text-text-main"
                title={task.text}
              >
                {task.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Общий fixed-поповер (эскейпит overflow таймлайна; следует за курсором) */}
      {tip && (
        <div
          className="pointer-events-none fixed z-50 w-max max-w-[240px] rounded-lg border border-border bg-surface2 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
        >
          <div className="font-medium text-text-main">{tip.text}</div>
          <div className="mt-0.5 text-text-dim">Исполнитель: {tip.assignee}</div>
          <div className="text-text-dim">Статус: {tip.status}</div>
        </div>
      )}
    </div>
  );
}
