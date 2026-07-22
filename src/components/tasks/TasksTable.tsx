'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { cn } from '@/lib/utils/cn';
import { useUpdateTask } from '@/lib/hooks/use-tasks';
import { useTeamMembers, type TeamMember } from '@/lib/hooks/use-team-members';
import { PRIORITY_CONFIG } from '@/lib/validators/task';
import {
  taskDateBucket,
  daysOverdue,
  groupByBucket,
  BUCKET_LABELS,
} from '@/lib/utils/task-view';
import type { Task } from '@/types/entities';

function projectHref(t: Task): string | null {
  if (!t.project_id || !t.project) return null;
  return t.project.type === 'client' ? `/deals/${t.project_id}` : `/projects/${t.project_id}`;
}

function DoneCell({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const updateTask = useUpdateTask();
  const done = task.lane === 'done';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, lane: done ? 'now' : 'done' }); }}
      disabled={!canEdit}
      role="checkbox"
      aria-checked={done}
      aria-label={done ? 'Вернуть в работу' : 'Отметить выполненной'}
      style={done ? { background: 'var(--green)', borderColor: 'var(--green)' } : undefined}
      className={cn(
        'flex h-[18px] w-[18px] items-center justify-center rounded-full border transition-colors disabled:opacity-40',
        done ? 'text-white' : 'border-input hover:border-accent',
      )}
    >
      {done && <Check size={12} strokeWidth={3} />}
    </button>
  );
}

function Assignee({ member }: { member: TeamMember | undefined }) {
  if (!member) return <span className="text-xs text-text-mute">—</span>;
  const initials = member.full_name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return (
    <span className="inline-flex items-center gap-1.5">
      {member.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
      ) : (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-l text-[10px] font-bold text-accent">
          {initials || '—'}
        </span>
      )}
      <span className="truncate text-xs text-text-dim">{member.full_name}</span>
    </span>
  );
}

interface TasksTableProps {
  tasks: Task[];
  now: Date;
  onEdit: (task: Task) => void;
  canEdit: boolean;
}

/**
 * S-TASKS-RESTRUCTURE-1: второй вид «Таблица» на shared/DataTable (j/k + peek
 * бесплатно). Строки берутся из единого groupByBucket (порядок групп + сортировка
 * внутри бакета 1:1 со Списком — S-TASKS-POLISH-1); бакет показан меткой в колонке
 * «Срок». Колонки несортируемы, чтобы сохранить группировку. Поиск поднят в
 * TasksView (общий на оба вида) — внутренний поиск DataTable скрыт.
 */
export function TasksTable({ tasks, now, onEdit, canEdit }: TasksTableProps) {
  const { data: members } = useTeamMembers();
  const byId = useMemo(
    () => new Map((members ?? []).map((m) => [m.id, m])),
    [members],
  );

  // Единый источник порядка: тот же groupByBucket, что и в TaskStream (List),
  // развёрнутый в плоский список. Гарантирует идентичную сортировку в двух видах.
  const sorted = useMemo(
    () => groupByBucket(tasks, now).flatMap((g) => g.tasks),
    [tasks, now],
  );

  const columns: Column<Task>[] = useMemo(
    () => [
      {
        key: 'done',
        label: '',
        width: '44px',
        render: (t) => <DoneCell task={t} canEdit={canEdit} />,
      },
      {
        key: 'text',
        label: 'Задача',
        render: (t) => (
          <span className={cn('text-sm', t.lane === 'done' ? 'text-text-mute line-through' : 'text-text-main')}>
            {t.text}
          </span>
        ),
        searchValue: (t) => t.text,
      },
      {
        key: 'link',
        label: 'Связь',
        render: (t) => {
          const href = projectHref(t);
          if (href && t.project) {
            return (
              <Link href={href} onClick={(e) => e.stopPropagation()} className="text-xs text-text-dim hover:text-accent">
                {t.project.name}
              </Link>
            );
          }
          if (t.company) {
            return (
              <Link href={`/companies/${t.company_id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-text-dim hover:text-accent">
                {t.company.name}
              </Link>
            );
          }
          return <span className="text-xs text-text-mute">—</span>;
        },
        searchValue: (t) => t.project?.name ?? t.company?.name ?? '',
      },
      {
        key: 'deadline',
        label: 'Срок',
        width: '160px',
        render: (t) => {
          const bucket = taskDateBucket(t, now);
          const overdue = bucket === 'overdue';
          const overdueBy = overdue ? daysOverdue(t, now) : 0;
          return (
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wide text-text-mute">{BUCKET_LABELS[bucket]}</span>
              {t.deadline && (
                <span className="text-xs tabular-nums" style={overdue ? { color: 'var(--danger)' } : undefined}>
                  <span className={overdue ? undefined : 'text-text-dim'}>
                    {new Date(t.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </span>
                  {overdueBy > 0 && <span className="ml-1">· {overdueBy} дн.</span>}
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: 'priority',
        label: 'Приоритет',
        width: '120px',
        render: (t) => {
          const cfg = PRIORITY_CONFIG[t.priority];
          if (t.priority === 'normal') return <span className="text-xs text-text-mute">—</span>;
          return <span className={cn('text-xs font-medium', cfg.color)}>{cfg.label}</span>;
        },
      },
      {
        key: 'assignee',
        label: 'Исполнитель',
        width: '160px',
        render: (t) => <Assignee member={t.assigned_to ? byId.get(t.assigned_to) : undefined} />,
      },
    ],
    [byId, now, canEdit],
  );

  return (
    <DataTable
      data={sorted}
      columns={columns}
      keyField="id"
      onRowClick={onEdit}
      hideSearch
      emptyMessage="Задач нет"
      peek={(t) => ({
        title: t.text,
        href: projectHref(t) ?? (t.company_id ? `/companies/${t.company_id}` : '#'),
        content: (
          <div className="space-y-2 text-sm">
            <p className="text-text-main">{t.text}</p>
            {t.project?.name && <p className="text-text-mute">Проект: {t.project.name}</p>}
            {t.company?.name && <p className="text-text-mute">Компания: {t.company.name}</p>}
            {t.deadline && (
              <p className="text-text-mute tabular-nums">
                Срок: {new Date(t.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
              </p>
            )}
          </div>
        ),
      })}
    />
  );
}
