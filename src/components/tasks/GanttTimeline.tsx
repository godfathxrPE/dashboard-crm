'use client';

import { useMemo, useState } from 'react';
import { useProjectBoard } from '@/lib/hooks/use-tasks';
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

const ZOOMS: { value: GanttZoom; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
];

// цвет бара по приоритету; done — приглушённо
function barClass(task: Task): string {
  if (task.lane === 'done') return 'bg-green';
  switch (task.priority) {
    case 'critical': return 'bg-red';
    case 'important': return 'bg-yellow';
    default: return 'bg-accent';
  }
}

// эффективный интервал задачи (YYYY-MM-DD). deadline (timestamptz) → MSK-дата.
function taskSpan(task: Task): { start: string; end: string } | null {
  const dl = task.deadline ? mskDateKey(task.deadline) : null;
  const start = task.start_date ?? task.end_date ?? dl;
  let end = task.end_date ?? dl ?? task.start_date;
  if (!start || !end) return null;   // ни дат, ни дедлайна → «без дат»
  if (end < start) end = start;      // fallback по deadline мог инвертировать порядок
  return { start, end };
}

export function GanttTimeline({ projectId, onEditTask }: GanttTimelineProps) {
  const { tasks, isLoading, isError } = useProjectBoard(projectId);
  const [zoom, setZoom] = useState<GanttZoom>('week');

  const model = useMemo(() => {
    const list = tasks ?? [];
    const dated: { task: Task; start: string; end: string }[] = [];
    const undated: Task[] = [];
    for (const task of list) {
      const span = taskSpan(task);
      if (span) dated.push({ task, ...span });
      else undated.push(task);
    }
    if (dated.length === 0) {
      return { buckets: [] as { key: string; label: string }[], idxByKey: new Map<string, number>(), dated, undated, todayIdx: -1 };
    }
    const min = dated.reduce((m, d) => (d.start < m ? d.start : m), dated[0].start);
    const max = dated.reduce((m, d) => (d.end > m ? d.end : m), dated[0].end);
    const buckets = buildBuckets(min, max, zoom);
    const idxByKey = new Map(buckets.map((b, i) => [b.key, i]));
    dated.sort((a, b) => (a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)));
    const todayIdx = bucketIndexOf(mskDateKey(new Date()), zoom, buckets);
    return { buckets, idxByKey, dated, undated, todayIdx };
  }, [tasks, zoom]);

  if (isLoading) return <div className="py-8 text-center text-xs text-text-mute">Загрузка…</div>;
  if (isError)   return <div className="py-8 text-center text-xs text-red">Не удалось загрузить задачи</div>;

  const { buckets, idxByKey, dated, undated, todayIdx } = model;

  if (buckets.length === 0 && undated.length === 0) {
    return <div className="py-8 text-center text-xs text-text-mute">Нет задач для таймлайна</div>;
  }

  const gridCols = { gridTemplateColumns: `repeat(${buckets.length}, minmax(28px, 1fr))` };
  const wideRange = zoom === 'day' && buckets.length > 180;

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

      <div className="overflow-x-auto">
        {buckets.length > 0 && (
          <div className="min-w-max">
            {/* Шапка: спейсер + бакеты */}
            <div className="flex">
              <div className="shrink-0" style={{ width: LABEL_W }} />
              <div className="grid flex-1" style={gridCols}>
                {buckets.map((b, i) => (
                  <div
                    key={b.key}
                    className={`border-l border-border/40 px-1 py-1 text-center text-[10px] tabular-nums ${
                      i === todayIdx ? 'font-semibold text-accent' : 'text-text-mute'
                    }`}
                  >
                    {b.label}
                    {zoom === 'day' && (i === 0 || b.key.slice(8, 10) === '01') && (
                      <div className="text-text-dim">{b.key.slice(5, 7)}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Строки задач */}
            {dated.map(({ task, start, end }) => {
              const s = idxByKey.get(bucketKeyOf(start, zoom)) ?? 0;
              const e = idxByKey.get(bucketKeyOf(end, zoom)) ?? s;
              return (
                <div key={task.id} className="flex items-center border-t border-border/40">
                  <div
                    className="shrink-0 truncate py-1.5 pr-2 text-xs text-text-main"
                    style={{ width: LABEL_W }}
                    title={task.text}
                  >
                    {task.text}
                  </div>
                  <div className="grid flex-1" style={gridCols}>
                    <button
                      type="button"
                      onClick={() => onEditTask(task)}
                      style={{ gridColumn: `${s + 1} / ${e + 2}`, gridRow: 1 }}
                      className={`my-1 h-4 rounded ${barClass(task)} ${task.lane === 'done' ? 'opacity-50' : 'opacity-90'} transition-opacity hover:opacity-100`}
                      title={`${start} → ${end}`}
                      aria-label={`${task.text}: ${start} → ${end}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
