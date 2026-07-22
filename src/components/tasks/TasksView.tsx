'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { LayoutList, Table2, Plus, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useAuth } from '@/lib/hooks/use-auth';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { CTAButton } from '@/components/ui/CTAButton';
import { ChipFilter, type ChipOption } from '@/components/ui/ChipFilter';
import { SavedViewChips } from '@/components/ui/SavedViewChips';
import { TaskStream } from './TaskStream';
import { TasksTable } from './TasksTable';
import { TaskModal } from './TaskModal';
import { taskSource, TASK_SOURCES, SOURCE_LABELS, type TaskSource } from '@/lib/utils/task-view';
import type { Task } from '@/types/entities';

const DEFAULT_SOURCES: TaskSource[] = ['deal', 'personal'];

function isSource(v: string): v is TaskSource {
  return (TASK_SOURCES as readonly string[]).includes(v);
}

export function TasksView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: tasks, isLoading: tasksLoading, isError, error } = useTasks();
  const { user, loading: authLoading } = useAuth();
  const { data: role } = useOrgRole();
  const canEdit = role !== 'viewer';
  const currentUserId = user?.id ?? null;

  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  // ─── URL-состояние ───
  const view: 'stream' | 'table' = searchParams.get('view') === 'table' ? 'table' : 'stream';
  const who: 'mine' | 'all' = searchParams.get('who') === 'all' ? 'all' : 'mine';
  const showDone = searchParams.get('done') === '1';
  // MUST: источник — отдельный параметр ?src с явным дефолтом deal,personal (проекты
  // скрыты). Отсутствие параметра = дефолт; пустая строка = «ничего не выбрано».
  const srcRaw = searchParams.get('src');
  const activeSources: TaskSource[] = useMemo(
    () => (srcRaw === null ? DEFAULT_SOURCES : srcRaw.split(',').filter(isSource)),
    [srcRaw],
  );

  const setParam = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const switchView = (v: 'stream' | 'table') =>
    setParam((p) => (v === 'table' ? p.set('view', 'table') : p.delete('view')));

  const setWho = (w: 'mine' | 'all') =>
    setParam((p) => (w === 'all' ? p.set('who', 'all') : p.delete('who')));

  const toggleDone = () =>
    setParam((p) => (showDone ? p.delete('done') : p.set('done', '1')));

  const toggleSource = (src: string) =>
    setParam((p) => {
      const next = activeSources.includes(src as TaskSource)
        ? activeSources.filter((s) => s !== src)
        : [...activeSources, src as TaskSource];
      p.set('src', next.join(','));
    });

  const showProjects = () =>
    setParam((p) => p.set('src', [...new Set([...activeSources, 'project'])].join(',')));

  const openCreate = () => { setEditTask(null); setModalOpen(true); };
  const openEdit = useCallback((t: Task) => { setEditTask(t); setModalOpen(true); }, []);

  // ─── Фильтрация (чистые шаги над массивом) ───
  const all = useMemo(() => tasks ?? [], [tasks]);
  // «Сейчас» пересчитывается при каждой загрузке задач (иначе бакеты устаревают за
  // полночь при открытой вкладке); стабильная ссылка нужна для memo в дочерних видах.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [tasks]);

  const mineOf = useCallback(
    (list: Task[]) => (who === 'mine' ? list.filter((t) => t.assigned_to === currentUserId) : list),
    [who, currentUserId],
  );
  const doneModeOf = useCallback(
    (list: Task[]) => list.filter((t) => (showDone ? t.lane === 'done' : t.lane !== 'done')),
    [showDone],
  );

  // Видимый набор: источник → Мои/Все → done/active
  const visible = useMemo(() => {
    const bySource = all.filter((t) => activeSources.includes(taskSource(t)));
    return doneModeOf(mineOf(bySource));
  }, [all, activeSources, mineOf, doneModeOf]);

  // Счётчики: каждый — по набору, отфильтрованному всем, КРОМЕ своей оси
  const sourceOptions: ChipOption[] = useMemo(() => {
    const scope = doneModeOf(mineOf(all));
    return TASK_SOURCES.map((src) => ({
      label: SOURCE_LABELS[src],
      value: src,
      count: scope.filter((t) => taskSource(t) === src).length,
    }));
  }, [all, mineOf, doneModeOf]);

  const { allCount, mineCount, doneCount, activeCount } = useMemo(() => {
    const bySource = all.filter((t) => activeSources.includes(taskSource(t)));
    const scoped = doneModeOf(bySource); // для Мои/Все — в текущем done-режиме
    const whoScope = mineOf(bySource); // для done-счётчика — в текущем who
    return {
      allCount: scoped.length,
      mineCount: scoped.filter((t) => t.assigned_to === currentUserId).length,
      doneCount: whoScope.filter((t) => t.lane === 'done').length,
      activeCount: whoScope.filter((t) => t.lane !== 'done').length,
    };
  }, [all, activeSources, mineOf, doneModeOf, currentUserId]);

  const headerCount = showDone ? doneCount : activeCount;
  const headerNoun = showDone ? 'выполнено' : who === 'mine' ? 'моих активных' : 'активных';

  if (tasksLoading || authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red/30 bg-red-l p-6 text-center">
        <p className="text-sm text-red font-medium">Ошибка загрузки задач</p>
        <p className="mt-1 text-xs text-text-mute">
          {error instanceof Error ? error.message : 'Неизвестная ошибка'}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Заголовок */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="aura-page-title text-text-main">Задачи</h1>
          <span className="text-sm text-text-mute tabular-nums">
            {headerCount} {headerNoun}
          </span>
        </div>
        {canEdit && (
          <CTAButton onClick={openCreate}>
            <Plus size={16} />
            Задача
          </CTAButton>
        )}
      </div>

      {/* Строка управления */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Переключатель Список / Таблица */}
        <div className="inline-flex items-center rounded-lg border border-border p-0.5">
          <button
            onClick={() => switchView('stream')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium transition-colors',
              view === 'stream' ? 'bg-accent-l text-accent' : 'text-text-mute hover:text-text-main',
            )}
          >
            <LayoutList size={14} /> Список
          </button>
          <button
            onClick={() => switchView('table')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium transition-colors',
              view === 'table' ? 'bg-accent-l text-accent' : 'text-text-mute hover:text-text-main',
            )}
          >
            <Table2 size={14} /> Таблица
          </button>
        </div>

        <span className="h-4 w-px bg-border" />

        {/* Мои / Все */}
        <div className="inline-flex items-center rounded-lg border border-border p-0.5">
          <button
            onClick={() => setWho('mine')}
            className={cn(
              'rounded px-2.5 py-1 text-sm font-medium tabular-nums transition-colors',
              who === 'mine' ? 'bg-accent-l text-accent' : 'text-text-mute hover:text-text-main',
            )}
          >
            Мои {mineCount}
          </button>
          <button
            onClick={() => setWho('all')}
            className={cn(
              'rounded px-2.5 py-1 text-sm font-medium tabular-nums transition-colors',
              who === 'all' ? 'bg-accent-l text-accent' : 'text-text-mute hover:text-text-main',
            )}
          >
            Все {allCount}
          </button>
        </div>

        <span className="h-4 w-px bg-border" />

        {/* Источник: Сделки / Проекты / Личное */}
        <ChipFilter
          options={sourceOptions}
          selected={activeSources}
          onToggle={toggleSource}
        />

        <span className="h-4 w-px bg-border" />

        {/* Выполнено */}
        <button
          onClick={toggleDone}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
            showDone
              ? 'border-green bg-green-l text-green'
              : 'border-input bg-surface text-text-dim hover:border-accent/50',
          )}
        >
          <Check size={14} /> Выполнено
          {doneCount > 0 && <span className="tabular-nums">{doneCount}</span>}
        </button>

        <SavedViewChips />
      </div>

      {/* Подпись про скрытые WBS-задачи проектов */}
      {!activeSources.includes('project') && (
        <p className="mb-3 text-xs text-text-mute">
          WBS-задачи проектов скрыты — живут в досках проектов.{' '}
          <button onClick={showProjects} className="text-accent hover:underline">
            Показать
          </button>
        </p>
      )}

      {/* Контент */}
      {view === 'table' ? (
        <TasksTable tasks={visible} now={now} onEdit={openEdit} canEdit={canEdit} />
      ) : (
        <TaskStream tasks={visible} now={now} onEdit={openEdit} canEdit={canEdit} />
      )}

      <TaskModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditTask(null); }}
        editTask={editTask}
      />
    </>
  );
}
