'use client';

import { useMemo, useRef } from 'react';
import { TaskStreamRow } from './TaskStreamRow';
import { groupByBucket, BUCKET_LABELS } from '@/lib/utils/task-view';
import { staggerClass } from '@/lib/utils/stagger';
import { useKeyboardNav } from '@/lib/hooks/use-keyboard-nav';
import { useUpdateTask } from '@/lib/hooks/use-tasks';
import type { Task } from '@/types/entities';

interface TaskStreamProps {
  tasks: Task[];
  now: Date;
  onEdit: (task: Task) => void;
  canEdit: boolean;
  /** TaskModal живёт на Modal-примитиве (не в ui-store) — гасим j/k, пока он открыт. */
  modalOpen?: boolean;
}

/**
 * S-TASKS-RESTRUCTURE-1: дефолтный вид «Список» — стрим задач, сгруппированный
 * по дедлайну (Pipedrive-паттерн). Порядок групп: Просрочено → Сегодня → Завтра →
 * Эта неделя → Позже → Без даты. Пустые группы скрыты. «Без даты» — зона триажа.
 * Цвета — только CSS-переменные (inline var), без хардкода фона.
 *
 * S-TASKS-POLISH-1, з.4: j/k по плоской очереди (паттерн TodayView/QueueRow) —
 * Enter открывает модалку, d — «Готово». Table получает то же от DataTable.
 */
export function TaskStream({ tasks, now, onEdit, canEdit, modalOpen }: TaskStreamProps) {
  const groups = useMemo(() => groupByBucket(tasks, now), [tasks, now]);
  const flat = useMemo(() => groups.flatMap((g) => g.tasks), [groups]);
  // Смещения кажд. группы в плоской очереди — для kbdIndex строк внутри groups.map
  const offsets = useMemo(() => {
    const acc: number[] = [];
    let running = 0;
    for (const g of groups) { acc.push(running); running += g.tasks.length; }
    return acc;
  }, [groups]);

  const containerRef = useRef<HTMLDivElement>(null);
  const updateTask = useUpdateTask();

  const { activeIndex } = useKeyboardNav({
    itemCount: flat.length,
    onSelect: (i) => onEdit(flat[i]),
    onAction: canEdit
      ? (i) => {
          const t = flat[i];
          updateTask.mutate({ id: t.id, lane: t.lane === 'done' ? 'now' : 'done' });
        }
      : undefined,
    isActive: () => !modalOpen,
    containerRef,
    enabled: flat.length > 0,
  });

  // Пустой набор — родитель (TasksView) решает, какой empty-state показать
  // (S-TASKS-POLISH-1, з.2: общий EmptyState на оба вида, не плодим свой).
  if (groups.length === 0) return null;

  return (
    <div ref={containerRef} className="flex flex-col gap-6">
      {groups.map(({ bucket, tasks: bucketTasks }, gi) => {
        const isOverdue = bucket === 'overdue';
        const isNoDate = bucket === 'no_date';
        const offset = offsets[gi];
        return (
          <section key={bucket} className={staggerClass(gi)}>
            <header className="mb-2 flex items-baseline gap-2 px-2">
              <h2
                className="text-meta font-semibold uppercase tracking-wide"
                style={{ color: isOverdue ? 'var(--danger)' : 'var(--text-mute)' }}
              >
                {BUCKET_LABELS[bucket]}
              </h2>
              <span className="text-meta tabular-nums text-text-mute">{bucketTasks.length}</span>
            </header>

            {isNoDate ? (
              <div
                className="rounded-xl border border-dashed border-border p-2"
                style={{ background: 'var(--surface)' }}
              >
                <p className="px-2 pb-1 pt-0.5 text-xs text-text-mute">
                  Поставь дату, преврати в шаг сделки или закрой.
                </p>
                <div className="flex flex-col">
                  {bucketTasks.map((t, ti) => (
                    <TaskStreamRow
                      key={t.id}
                      task={t}
                      now={now}
                      isOverdue={false}
                      onEdit={onEdit}
                      canEdit={canEdit}
                      kbdIndex={offset + ti}
                      focused={activeIndex === offset + ti}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {bucketTasks.map((t, ti) => (
                  <TaskStreamRow
                    key={t.id}
                    task={t}
                    now={now}
                    isOverdue={isOverdue}
                    onEdit={onEdit}
                    canEdit={canEdit}
                    kbdIndex={offset + ti}
                    focused={activeIndex === offset + ti}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
