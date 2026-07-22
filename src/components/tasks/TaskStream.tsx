'use client';

import { useMemo } from 'react';
import { ListChecks } from 'lucide-react';
import { TaskStreamRow } from './TaskStreamRow';
import { groupByBucket, BUCKET_LABELS } from '@/lib/utils/task-view';
import { staggerClass } from '@/lib/utils/stagger';
import type { Task } from '@/types/entities';

interface TaskStreamProps {
  tasks: Task[];
  now: Date;
  onEdit: (task: Task) => void;
  canEdit: boolean;
}

/**
 * S-TASKS-RESTRUCTURE-1: дефолтный вид «Список» — стрим задач, сгруппированный
 * по дедлайну (Pipedrive-паттерн). Порядок групп: Просрочено → Сегодня → Завтра →
 * Эта неделя → Позже → Без даты. Пустые группы скрыты. «Без даты» — зона триажа.
 * Цвета — только CSS-переменные (inline var), без хардкода фона.
 */
export function TaskStream({ tasks, now, onEdit, canEdit }: TaskStreamProps) {
  const groups = useMemo(() => groupByBucket(tasks, now), [tasks, now]);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
        <ListChecks size={28} className="mb-2 text-text-mute" />
        <p className="text-sm text-text-mute">Задач нет — чисто.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ bucket, tasks: bucketTasks }, gi) => {
        const isOverdue = bucket === 'overdue';
        const isNoDate = bucket === 'no_date';
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
                  {bucketTasks.map((t) => (
                    <TaskStreamRow
                      key={t.id}
                      task={t}
                      now={now}
                      isOverdue={false}
                      onEdit={onEdit}
                      canEdit={canEdit}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {bucketTasks.map((t) => (
                  <TaskStreamRow
                    key={t.id}
                    task={t}
                    now={now}
                    isOverdue={isOverdue}
                    onEdit={onEdit}
                    canEdit={canEdit}
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
