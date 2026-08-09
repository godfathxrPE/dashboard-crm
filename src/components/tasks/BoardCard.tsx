'use client';

import Link from 'next/link';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Check, Briefcase, Building2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useUpdateTask } from '@/lib/hooks/use-tasks';
import { daysOverdue } from '@/lib/utils/task-view';
import { mskTimeRange } from '@/lib/utils/date-helpers';
import type { Task } from '@/types/entities';

// Точка приоритета — семантические токены темы inline (как в TaskStreamRow).
// `normal` в записи нет намеренно: обычный приоритет точку не рисует вовсе,
// иначе на доске из 373 карточек серая точка стоит у каждой и не значит ничего.
const PRIORITY_DOT: Record<string, string> = {
  critical: 'var(--danger)',
  important: 'var(--warning)',
};

const PRIORITY_TITLE: Record<string, string> = {
  critical: 'Критичный',
  important: 'Важный',
};

function projectHref(t: Task): string | null {
  if (!t.project_id || !t.project) return null;
  // routing-split: client → /deals, internal|delivery → /projects (как в TaskStreamRow)
  return t.project.type === 'client' ? `/deals/${t.project_id}` : `/projects/${t.project_id}`;
}

interface BoardCardProps {
  task: Task;
  now: Date;
  onEdit: (task: Task) => void;
  canEdit: boolean;
}

/**
 * S-TASKS-BOARD-1: карточка доски по срокам.
 *
 * Своя, а не переиспользованный `TaskCard`: у того другая анатомия (lane-борд,
 * собственный InlineConfirm, свой набор действий). Связывание двух видов одним
 * компонентом с ветвлениями стоило бы дороже этой копипасты.
 *
 * Внутри карточки НЕТ поповеров и JS-тултипов: доска лежит в `overflow-x-auto`,
 * всплывашка там клиппится краем скролл-контейнера. Подсказки — нативный `title`.
 */
export function BoardCard({ task, now, onEdit, canEdit }: BoardCardProps) {
  const updateTask = useUpdateTask();
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const done = task.lane === 'done';
  const href = projectHref(task);
  const overdueBy = daysOverdue(task, now);
  const timeBlock = mskTimeRange(task.scheduled_start, task.scheduled_end);
  const dot = PRIORITY_DOT[task.priority];
  // Нижняя строка рисуется только когда в ней есть что показать — пустая
  // «полка» под каждой карточкой съедала бы высоту колонки ни за что.
  const hasMeta = Boolean(dot || href || task.company || timeBlock || overdueBy > 0);

  function toggleDone(e: React.MouseEvent) {
    e.stopPropagation();
    updateTask.mutate({ id: task.id, lane: done ? 'now' : 'done' });
  }

  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(task)}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'flex touch-none cursor-grab flex-col gap-[7px] rounded border border-border bg-surface',
        'px-3 py-2.5 shadow-card transition-shadow active:cursor-grabbing',
        'hover:border-border2 hover:shadow-card-hover',
        isDragging && 'opacity-40',
      )}
    >
      {/* Верхняя строка: чекбокс + текст */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={toggleDone}
          disabled={!canEdit}
          aria-checked={done}
          role="checkbox"
          aria-label={done ? 'Вернуть в работу' : 'Отметить выполненной'}
          style={done ? { background: 'var(--green)', borderColor: 'var(--green)' } : undefined}
          className={cn(
            'mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border',
            'transition-colors disabled:opacity-40',
            done ? 'text-white' : 'border-input hover:border-accent',
          )}
        >
          {done && <Check size={12} strokeWidth={3} />}
        </button>

        <p
          className={cn(
            'line-clamp-2 min-w-0 flex-1 text-body leading-snug',
            done ? 'text-text-mute line-through' : 'text-text-main',
          )}
        >
          {task.text}
        </p>
      </div>

      {/* Нижняя строка мета. 23px — значение из макета (чекбокс 15px + gap 8px);
          чекбокс здесь 18px по конвенции TaskStreamRow, так что мета встаёт на
          3px левее начала текста. Так и надо: выбор сделан в пользу макета. */}
      {hasMeta && (
        <div className="flex min-h-4 items-center gap-2 pl-[23px]">
          {dot && (
            <span
              aria-hidden
              title={PRIORITY_TITLE[task.priority]}
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: dot }}
            />
          )}

          {href && task.project ? (
            <Link
              href={href}
              onClick={(e) => e.stopPropagation()}
              title={task.project.name}
              className="flex min-w-0 shrink items-center gap-1 text-meta text-text-mute hover:text-accent"
            >
              <Briefcase size={11} className="shrink-0" />
              <span className="truncate">{task.project.name}</span>
            </Link>
          ) : task.company ? (
            <Link
              href={`/companies/${task.company_id}`}
              onClick={(e) => e.stopPropagation()}
              title={task.company.name}
              className="flex min-w-0 shrink items-center gap-1 text-meta text-text-mute hover:text-accent"
            >
              <Building2 size={11} className="shrink-0" />
              <span className="truncate">{task.company.name}</span>
            </Link>
          ) : null}

          {timeBlock && (
            <span className="flex shrink-0 items-center gap-1 text-meta tabular-nums text-text-mute">
              <Clock size={11} className="shrink-0" />
              {timeBlock}
            </span>
          )}

          {overdueBy > 0 && (
            <span
              title={`Просрочено на ${overdueBy} дн.`}
              className="ml-auto shrink-0 text-meta font-semibold tabular-nums"
              style={{ color: 'var(--danger-text)' }}
            >
              {overdueBy} дн.
            </span>
          )}
        </div>
      )}
    </article>
  );
}
