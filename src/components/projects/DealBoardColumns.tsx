'use client';

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { InlineConfirm } from '@/components/ui/InlineConfirm';
import { TaskModal } from '@/components/tasks/TaskModal';
import { useProjectColumns } from '@/lib/hooks/use-project-columns';
import {
  useCreateTask,
  useDeleteTask,
  useMoveTask,
  useProjectBoard,
  useUpdateTask,
} from '@/lib/hooks/use-tasks';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { getInitialsFromFullName } from '@/lib/utils/avatar';
import {
  cardDeadline,
  categoryToLane,
  planBoardDrop,
  type CardDeadlineTone,
} from '@/lib/domain/deal-board';
import type { ColumnCategory } from '@/types/database';
import type { ProjectColumn, Task } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-DEAL-BOARD-1 (W3 · КОЛОНКИ): колонки доски задач сделки по спеке.
//
// Отдельный компонент, а не рестайл `ProjectBoard`: тот же `ProjectBoard` —
// доска внедрения (фазы, шаблоны, CRUD колонок), и правка его вида задела бы
// delivery. Механика общая — DnD = смена `column_id`, lane пересчитывает БД
// (`resolve_task_board`); план броска — чистая `planBoardDrop`.
//
// Спека: grid N × 1fr без подложек, колонки разделены hairline слева (первая —
// без); заголовок — точка 8 + имя 12.5/600 + счётчик 11; карточка — «одна
// фигура» (border · r12 · p 10/12 · gap 6); «+ Добавить» прижат книзу колонки.
// CRUD колонок у сделки нет: в проде у всех сделок четыре дефолтные колонки
// (замер 24.09: 25 из 25), а у спеки управления колонками нет вовсе.
//
// ⚠️ Кегль и цвет текста в одной строке классов НЕ проходят через `cn()`:
// он теряет `text-meta` рядом с `text-<цвет>` (долг G-1, STATUS). Здесь классы
// склеиваются `join`, а конфликтов в них нет по построению.
// ═══════════════════════════════════════════════════════

/** Точка колонки по категории (спека: Бэклог line-4 · В работе green · Ожидание amber · Готово ink). */
const COLUMN_DOT: Record<ColumnCategory, string> = {
  backlog: 'bg-border2',
  started: 'bg-green',
  paused: 'bg-warning',
  done: 'bg-text-main',
  phase: 'bg-border2',
};

/** Тон строки срока. Состояние несёт слово («сегодня», «просрочено»), не только цвет. */
const DEADLINE_TEXT: Record<CardDeadlineTone, string> = {
  overdue: 'text-danger-text font-semibold',
  today: 'text-text-main font-semibold',
  waiting: 'text-warning-text font-medium',
  plain: 'text-text-mute',
  done: 'text-text-mute',
};

const PRIORITY_MARK: Partial<Record<Task['priority'], { label: string; cls: string }>> = {
  important: { label: '· важно', cls: 'text-warning-text font-semibold' },
  critical: { label: '· критично', cls: 'text-danger-text font-semibold' },
};

function join(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ═══════════════════════════════════════════════════════
// Карточка
// ═══════════════════════════════════════════════════════

interface CardBodyProps {
  task: Task;
  category: ColumnCategory;
  /** Исполнитель задачи (`assigned_to`); null — инициалов нет. */
  author: { initials: string; name: string } | null;
  now: Date;
}

/** Содержимое карточки — общее для живой карточки и её копии под курсором. */
function CardBody({ task, category, author, now }: CardBodyProps) {
  const isDone = category === 'done';
  const deadline = cardDeadline(task.deadline, category, now);
  const priority = isDone ? undefined : PRIORITY_MARK[task.priority];
  const dot =
    deadline?.tone === 'overdue' ? 'bg-danger'
    : deadline?.tone === 'waiting' ? 'bg-warning'
    : isDone ? 'bg-border2'
    : COLUMN_DOT[category];

  return (
    <>
      <span
        className={join(
          'break-words text-[0.78125rem] leading-[1.4]',
          isDone ? 'text-text-mute line-through' : 'text-text-main',
        )}
      >
        {task.text}
      </span>
      {(deadline || priority || author) && (
        <div className="flex items-center gap-2 text-meta">
          {deadline && (
            <span className={join('flex items-center gap-[0.3125rem]', DEADLINE_TEXT[deadline.tone])}>
              <span aria-hidden className={join('size-1.5 shrink-0 rounded-full', dot)} />
              {deadline.label}
            </span>
          )}
          {priority && <span className={priority.cls}>{priority.label}</span>}
          {author && (
            <span className="ml-auto text-text-mute" title={author.name}>
              {author.initials}
            </span>
          )}
        </div>
      )}
    </>
  );
}

interface BoardTaskCardProps extends CardBodyProps {
  canEdit: boolean;
  onOpen: (task: Task) => void;
  onDelete: (id: string) => void;
}

function BoardTaskCard({ task, category, author, now, canEdit, onOpen, onDelete }: BoardTaskCardProps) {
  const [confirming, setConfirming] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canEdit,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Enter открывает задачу; пробел остаётся за клавиатурным DnD (см. сенсор).
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && e.target === e.currentTarget) {
      e.preventDefault();
      onOpen(task);
      return;
    }
    listeners?.onKeyDown?.(e);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onKeyDown={handleKeyDown}
      onClick={() => onOpen(task)}
      aria-label={`Задача: ${task.text}`}
      className={join(
        'group relative flex flex-col gap-1.5 rounded-xl border border-border px-3 py-2.5 text-left',
        'transition-colors hover:border-border2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        category === 'done' && 'opacity-60',
        isDragging && 'opacity-30',
      )}
    >
      <CardBody task={task} category={category} author={author} now={now} />

      {canEdit && (
        // ⚠️ Карточка — draggable: без stopPropagation на pointerdown нажатие на
        // кнопки действий начинало бы перетаскивание, а клик по ним всплывал бы
        // в обработчик карточки.
        //
        // Карандаш дублирует клик по карточке НАМЕРЕННО: действие, спрятанное
        // только в клик по фигуре, не находится (приёмка владельца, F-2).
        <span
          className={join(
            'absolute right-1.5 top-1.5 flex items-center rounded-md bg-surface',
            confirming ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {confirming ? (
            <InlineConfirm
              question="Удалить задачу?"
              onConfirm={() => { setConfirming(false); onDelete(task.id); }}
              onCancel={() => setConfirming(false)}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpen(task)}
                aria-label="Редактировать задачу"
                className="rounded-md p-1 text-text-mute transition-colors hover:text-text-main"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label="Удалить задачу"
                className="rounded-md p-1 text-text-mute transition-colors hover:text-danger"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// «+ Добавить» внизу колонки
// ═══════════════════════════════════════════════════════

function ColumnAdd({ projectId, column }: { projectId: string; column: ProjectColumn }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const createTask = useCreateTask();

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    // lane — для оптимистичной карточки; на сервере его всё равно выведет колонка.
    createTask.mutate({
      text: trimmed,
      project_id: projectId,
      column_id: column.id,
      lane: categoryToLane(column.category),
    });
    setText('');
    inputRef.current?.focus();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        className="mt-auto flex items-center gap-1.5 py-1.5 text-xs text-text-mute transition-colors hover:text-text-main"
      >
        <Plus size={12} strokeWidth={2.4} />
        Добавить
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { setText(''); setOpen(false); }
      }}
      onBlur={() => { if (!text.trim()) setOpen(false); }}
      placeholder="Новая задача…"
      aria-label={`Новая задача в колонку «${column.name}»`}
      className="mt-auto w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
    />
  );
}

// ═══════════════════════════════════════════════════════
// Колонка
// ═══════════════════════════════════════════════════════

interface ColumnProps {
  projectId: string;
  column: ProjectColumn;
  tasks: Task[];
  first: boolean;
  canEdit: boolean;
  authorOf: (task: Task) => { initials: string; name: string } | null;
  now: Date;
  onOpen: (task: Task) => void;
  onDelete: (id: string) => void;
}

function Column({ projectId, column, tasks, first, canEdit, authorOf, now, onOpen, onDelete }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.name}: ${tasks.length}`}
      // ⚠️ У колонки НЕТ скругления: её `border-l` — разделитель, и на скруглённом
      // блоке линия огибала углы «скобками» (приёмка владельца, F-1). Подсветка
      // броска со своим скруглением живёт на внутреннем списке ниже.
      className={join(
        'flex flex-col py-3 md:min-h-[14.375rem] md:px-3 md:py-0',
        !first && 'border-t border-border md:border-l md:border-t-0',
      )}
    >
      <div className="flex items-center gap-[0.4375rem] pb-1.5 pt-0.5">
        <span aria-hidden className={join('size-2 shrink-0 rounded-full', COLUMN_DOT[column.category])} />
        <span className="truncate text-[0.78125rem] font-semibold text-text-main">{column.name}</span>
        <span className="text-meta tabular-nums text-text-mute">{tasks.length}</span>
      </div>

      {/* Подложки у колонок нет (спека) — тон появляется только под брошенной карточкой. */}
      <div
        className={join(
          'mt-2 flex flex-1 flex-col gap-2 rounded-lg transition-colors',
          isOver && 'bg-surface2',
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <BoardTaskCard
              key={task.id}
              task={task}
              category={column.category}
              author={authorOf(task)}
              now={now}
              canEdit={canEdit}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>

        {canEdit && <ColumnAdd projectId={projectId} column={column} />}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════
// Колонки
// ═══════════════════════════════════════════════════════

export function DealBoardColumns({ projectId }: { projectId: string }) {
  const { data: columns = [], isLoading: colsLoading } = useProjectColumns(projectId);
  const { tasksByColumn, isLoading: tasksLoading } = useProjectBoard(projectId);
  const { data: members = [] } = useTeamMembers();
  const { data: role } = useOrgRole();
  const canEdit = role !== 'viewer';
  const moveTask = useMoveTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [active, setActive] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  // Один «сейчас» на рендер: карточки одного экрана не должны разойтись на полуночи.
  const now = new Date();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Пробел — DnD с клавиатуры, Enter оставлен карточке под «открыть».
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members]);
  // Только исполнитель, без фолбэка на автора: автор у задач сделки почти всегда
  // один, и одинаковые инициалы на каждой карточке ничего не различают (F-3).
  // Нет исполнителя — нет инициалов.
  const authorOf = (task: Task) => {
    const name = task.assigned_to ? nameById.get(task.assigned_to) : undefined;
    return name ? { initials: getInitialsFromFullName(name), name } : null;
  };

  const categoryOf = useMemo(() => new Map(columns.map((c) => [c.id, c.category])), [columns]);

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActive(Object.values(tasksByColumn).flat().find((t) => t.id === id) ?? null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActive(null);
    if (!e.over) return;
    const plan = planBoardDrop(
      tasksByColumn,
      columns.map((c) => c.id),
      String(e.active.id),
      String(e.over.id),
    );
    if (!plan) return;
    if (plan.move) moveTask.mutate({ ...plan.move, project_id: projectId });
    for (const r of plan.reorder) updateTask.mutate(r);
  }

  if (colsLoading || tasksLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={18} className="animate-spin text-text-mute" />
      </div>
    );
  }

  if (columns.length === 0) {
    return <p className="py-6 text-center text-meta text-text-mute">У сделки нет колонок доски</p>;
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActive(null)}
      >
        <div
          className="grid grid-cols-1 md:-mx-3 md:grid-cols-[repeat(var(--board-cols),minmax(0,1fr))]"
          style={{ '--board-cols': columns.length } as CSSProperties}
        >
          {columns.map((col, i) => (
            <Column
              key={col.id}
              projectId={projectId}
              column={col}
              tasks={tasksByColumn[col.id] ?? []}
              first={i === 0}
              canEdit={canEdit}
              authorOf={authorOf}
              now={now}
              onOpen={setEditTask}
              onDelete={(id) => deleteTask.mutate(id)}
            />
          ))}
        </div>

        <DragOverlay>
          {active ? (
            <div className="flex cursor-grabbing flex-col gap-1.5 rounded-xl border border-border2 bg-surface px-3 py-2.5 elevation-3">
              <CardBody
                task={active}
                category={categoryOf.get(active.column_id ?? '') ?? 'backlog'}
                author={authorOf(active)}
                now={now}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskModal
        isOpen={editTask !== null}
        onClose={() => setEditTask(null)}
        editTask={editTask}
        defaultProjectId={projectId}
      />
    </>
  );
}
