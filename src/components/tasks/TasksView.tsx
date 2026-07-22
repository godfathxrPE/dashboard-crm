'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { LayoutList, Table2, Plus, Loader2, Check, Search, ListChecks, Filter, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useAuth } from '@/lib/hooks/use-auth';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { CTAButton } from '@/components/ui/CTAButton';
import { ChipFilter, type ChipOption } from '@/components/ui/ChipFilter';
import { SavedViewChips } from '@/components/ui/SavedViewChips';
import { EmptyState } from '@/components/ui/EmptyState';
import { TaskStream } from './TaskStream';
import { TasksTable } from './TasksTable';
import { TaskModal } from './TaskModal';
import { taskSource, isMine, matchesQuery, TASK_SOURCES, SOURCE_LABELS, type TaskSource } from '@/lib/utils/task-view';
import type { Task } from '@/types/entities';

const DEFAULT_SOURCES: TaskSource[] = ['deal', 'personal'];

function isSource(v: string): v is TaskSource {
  return (TASK_SOURCES as readonly string[]).includes(v);
}

type EmptyReason = 'no-source' | 'no-search' | 'no-tasks' | null;

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
  // Поиск — общий на оба вида (S-TASKS-POLISH-1, з.3). Локальный стейт, НЕ в URL
  // (learnings: q в URL сознательно не переносим — blast radius).
  const [query, setQuery] = useState('');

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
    (list: Task[]) => (who === 'mine' ? list.filter((t) => isMine(t, currentUserId)) : list),
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

  // + поиск (общий шаг для обоих видов, з.3)
  const queried = useMemo(
    () => (query.trim() ? visible.filter((t) => matchesQuery(t, query)) : visible),
    [visible, query],
  );

  // Причина пустого результата — определяет, какой empty-state показать (з.2).
  // Порядок важен: пустой источник первичнее пустого поиска.
  const emptyReason: EmptyReason = useMemo(() => {
    if (activeSources.length === 0) return 'no-source';
    if (queried.length > 0) return null;
    if (query.trim()) return 'no-search';
    return 'no-tasks';
  }, [activeSources, queried, query]);

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
      mineCount: scoped.filter((t) => isMine(t, currentUserId)).length,
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

      {/* Поиск — паритет Список/Таблица (S-TASKS-POLISH-1, з.3) */}
      <div className="relative mb-3 max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск задач…"
          className="w-full rounded-lg border border-input bg-surface py-1.5 pl-8 pr-3
                     text-sm text-text-main placeholder:text-text-mute
                     focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
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
      {emptyReason ? (
        <TasksEmptyState
          reason={emptyReason}
          query={query}
          showDone={showDone}
          canEdit={canEdit}
          onClearQuery={() => setQuery('')}
          onCreateTask={openCreate}
        />
      ) : view === 'table' ? (
        <TasksTable tasks={queried} now={now} onEdit={openEdit} canEdit={canEdit} />
      ) : (
        <TaskStream tasks={queried} now={now} onEdit={openEdit} canEdit={canEdit} modalOpen={modalOpen} />
      )}

      <TaskModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditTask(null); }}
        editTask={editTask}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════
// Пустые состояния (S-TASKS-POLISH-1, з.2) — общие для Списка и Таблицы,
// на общем EmptyState-примитиве (см. TodayView-паттерн). Три причины,
// проверяются в порядке приоритета: пустой источник → пустой поиск → нет задач.

interface TasksEmptyStateProps {
  reason: EmptyReason;
  query: string;
  showDone: boolean;
  canEdit: boolean;
  onClearQuery: () => void;
  onCreateTask: () => void;
}

function TasksEmptyState({ reason, query, showDone, canEdit, onClearQuery, onCreateTask }: TasksEmptyStateProps) {
  if (reason === 'no-source') {
    return (
      <div className="rounded-xl border border-dashed border-border py-8">
        <EmptyState
          icon={<Filter size={24} />}
          title="Ничего не выбрано"
          description="Включи хотя бы один источник — Сделки, Проекты или Личное — в чипах выше."
        />
      </div>
    );
  }

  if (reason === 'no-search') {
    return (
      <div className="rounded-xl border border-dashed border-border py-8">
        <EmptyState
          icon={<SearchX size={24} />}
          title="Ничего не найдено"
          description={`По запросу «${query.trim()}» задач нет.`}
          action={{ label: 'Очистить поиск', onClick: onClearQuery }}
        />
      </div>
    );
  }

  // reason === 'no-tasks'
  return (
    <div className="rounded-xl border border-dashed border-border py-8">
      <EmptyState
        icon={<ListChecks size={24} />}
        title={showDone ? 'Выполненных нет' : 'Задач нет — чисто'}
        description={showDone ? 'В этом наборе ещё нет выполненных задач.' : 'Всё разобрано либо ещё не заведено.'}
        action={!showDone && canEdit ? { label: 'Задача', onClick: onCreateTask } : undefined}
      />
    </div>
  );
}
