'use client';

import { useMemo } from 'react';
import { useProjectBoard } from '@/lib/hooks/use-tasks';
import { mskDateKey } from '@/lib/utils/date-helpers';
import type { Task } from '@/types/entities';

interface GanttTimelineProps {
  projectId: string;
  onEditTask: (task: Task) => void;
}

const DAY_MS = 86_400_000;
const LABEL_W = '12.5rem'; // колонка названий (rem — конвенция проекта, не px)

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

// [min..max] включительно; UTC-полдень → без TZ-дрейфа при инкременте дня
function buildDays(min: string, max: string): string[] {
  const days: string[] = [];
  let t = Date.parse(`${min}T12:00:00Z`);
  const end = Date.parse(`${max}T12:00:00Z`);
  while (t <= end) {
    days.push(new Date(t).toISOString().slice(0, 10));
    t += DAY_MS;
  }
  return days;
}

export function GanttTimeline({ projectId, onEditTask }: GanttTimelineProps) {
  const { tasks, isLoading, isError } = useProjectBoard(projectId);

  const model = useMemo(() => {
    const list = tasks ?? [];
    const dated: { task: Task; start: string; end: string }[] = [];
    const undated: Task[] = [];
    for (const task of list) {
      const span = taskSpan(task);
      if (span) dated.push({ task, ...span });
      else undated.push(task);
    }
    const index = new Map<string, number>();
    if (dated.length === 0) return { days: [] as string[], index, dated, undated, todayIdx: -1 };
    const min = dated.reduce((m, d) => (d.start < m ? d.start : m), dated[0].start);
    const max = dated.reduce((m, d) => (d.end > m ? d.end : m), dated[0].end);
    const days = buildDays(min, max);
    days.forEach((d, i) => index.set(d, i));
    dated.sort((a, b) => (a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)));
    return { days, index, dated, undated, todayIdx: index.get(mskDateKey(new Date())) ?? -1 };
  }, [tasks]);

  if (isLoading) return <div className="py-8 text-center text-xs text-text-mute">Загрузка…</div>;
  if (isError)   return <div className="py-8 text-center text-xs text-red">Не удалось загрузить задачи</div>;

  const { days, index, dated, undated, todayIdx } = model;

  if (days.length === 0 && undated.length === 0) {
    return <div className="py-8 text-center text-xs text-text-mute">Нет задач для таймлайна</div>;
  }

  const gridCols = { gridTemplateColumns: `repeat(${days.length}, minmax(28px, 1fr))` };

  return (
    <div className="mb-4 overflow-x-auto rounded-xl border border-border bg-surface p-3">
      {days.length > 0 && (
        <div className="min-w-max">
          {/* Шапка: спейсер + дни */}
          <div className="flex">
            <div className="shrink-0" style={{ width: LABEL_W }} />
            <div className="grid flex-1" style={gridCols}>
              {days.map((d, i) => (
                <div
                  key={d}
                  className={`border-l border-border/40 px-1 py-1 text-center text-[10px] tabular-nums ${
                    i === todayIdx ? 'font-semibold text-accent' : 'text-text-mute'
                  }`}
                >
                  {d.slice(8, 10)}
                  {(i === 0 || d.slice(8, 10) === '01') && <div className="text-text-dim">{d.slice(5, 7)}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Строки задач */}
          {dated.map(({ task, start, end }) => {
            const s = index.get(start)!;
            const e = index.get(end)!;
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
