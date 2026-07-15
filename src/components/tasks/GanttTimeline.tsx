'use client';

import { useMemo, useState } from 'react';
import { useProjectSchedule, type GanttTask } from '@/lib/hooks/use-project-schedule';
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

const LABEL_W = '12.5rem'; // колонка названий (rem — конвенция проекта, не px)
const ROW_H = '1.75rem';   // высота ряда — синхронно в левой колонке и таймлайне

const ZOOMS: { value: GanttZoom; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
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

export function GanttTimeline({ projectId, onEditTask }: GanttTimelineProps) {
  const { swimlanes, undated, isLoading, isError } = useProjectSchedule(projectId);
  const [zoom, setZoom] = useState<GanttZoom>('week');

  const model = useMemo(() => {
    const allTasks: GanttTask[] = swimlanes.flatMap((sl) => sl.tasks);
    if (allTasks.length === 0) {
      return { buckets: [] as { key: string; label: string }[], idxByKey: new Map<string, number>(), todayIdx: -1 };
    }
    const min = allTasks.reduce((m, t) => (t.start < m ? t.start : m), allTasks[0].start);
    const max = allTasks.reduce((m, t) => (t.end > m ? t.end : m), allTasks[0].end);
    const buckets = buildBuckets(min, max, zoom);
    const idxByKey = new Map(buckets.map((b, i) => [b.key, i]));
    const todayIdx = bucketIndexOf(mskDateKey(new Date()), zoom, buckets);
    return { buckets, idxByKey, todayIdx };
  }, [swimlanes, zoom]);

  // isLoading (в т.ч. пока грузятся колонки) → только «Загрузка…», без флеша плоского режима
  if (isLoading) return <div className="py-8 text-center text-xs text-text-mute">Загрузка…</div>;
  if (isError)   return <div className="py-8 text-center text-xs text-red">Не удалось загрузить задачи</div>;

  const { buckets, idxByKey, todayIdx } = model;

  if (buckets.length === 0 && undated.length === 0) {
    return <div className="py-8 text-center text-xs text-text-mute">Нет задач для таймлайна</div>;
  }

  const gridCols = { gridTemplateColumns: `repeat(${buckets.length}, minmax(28px, 1fr))` };
  const wideRange = zoom === 'day' && buckets.length > 180;
  const laneRows = swimlanes.filter((sl) => sl.tasks.length > 0);

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-3">
      {/* Панель: zoom */}
      <div className="mb-3 flex items-center gap-1">
        {ZOOMS.map((z) => (
          <button
            key={z.value}
            type="button"
            onClick={() => setZoom(z.value)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              zoom === z.value
                ? 'border-accent text-accent'
                : 'border-border text-text-mute hover:text-text-main'
            }`}
          >
            {z.label}
          </button>
        ))}
      </div>

      {wideRange && (
        <div className="mb-2 rounded-lg border border-yellow bg-yellow-l px-3 py-1.5 text-xs text-text-main">
          Широкий диапазон — переключи на неделю или месяц для читаемости.
        </div>
      )}

      {buckets.length > 0 && (
        // C0: split-layout — фикс.левая колонка (вне скролла) + отдельный scrollable timeline-body
        <div className="flex">
          {/* ── Левая колонка: названия фаз/задач (sticky, вне overflow) ── */}
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
                    return (
                      <div key={gt.task.id} className="grid border-t border-border/40" style={{ ...gridCols, height: ROW_H }}>
                        {gt.isMilestone ? (
                          <button
                            type="button"
                            onClick={() => onEditTask(gt.task)}
                            style={{ gridColumn: `${s + 1}`, gridRow: 1 }}
                            className="flex items-center justify-center"
                            title={`${gt.task.text} (веха): ${gt.start}`}
                            aria-label={`${gt.task.text} (веха): ${gt.start}`}
                          >
                            <span className={`inline-block h-2.5 w-2.5 rotate-45 rounded-[1px] ${barClass(gt.task)}`} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onEditTask(gt.task)}
                            style={{ gridColumn: `${s + 1} / ${e + 2}`, gridRow: 1 }}
                            className={`my-1 h-4 self-center rounded ${barClass(gt.task)} ${gt.task.lane === 'done' ? 'opacity-50' : 'opacity-90'} transition-opacity hover:opacity-100`}
                            title={`${gt.start} → ${gt.end}`}
                            aria-label={`${gt.task.text}: ${gt.start} → ${gt.end}`}
                          />
                        )}
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
      {undated.length > 0 && (
        <div className="mt-3 border-t border-border/40 pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">Без дат</div>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((task) => (
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
    </div>
  );
}
