'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  rectIntersection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Loader2, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import {
  useProjectColumns,
  useCreateColumn,
  useUpdateColumn,
  useDeleteColumn,
} from '@/lib/hooks/use-project-columns';
import {
  useProjectBoard,
  useMoveTask,
  useUpdateTask,
  useDeleteTask,
} from '@/lib/hooks/use-tasks';
import { TaskCard } from './TaskCard';
import { TaskQuickAdd } from './TaskQuickAdd';
import { TaskModal } from './TaskModal';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { isPhaseBoard } from '@/lib/constants/delivery-phases';
import type { Task, ProjectColumn } from '@/types/entities';
import type { ColumnCategory } from '@/types/database';

const CATEGORY_LABEL: Record<ColumnCategory, string> = {
  backlog: 'Бэклог',
  started: 'В работе',
  paused: 'Ожидание',
  done: 'Готово',
  phase: 'Фаза',
};

// phase не выбирается вручную — фазы создаёт copy_delivery_template (P2a)
const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABEL) as ColumnCategory[])
  .filter((c) => c !== 'phase')
  .map((c) => ({
    value: c,
    label: CATEGORY_LABEL[c],
  }));

// ═══════════════════════════════════════════════════════
// Column
// ═══════════════════════════════════════════════════════

interface BoardColumnProps {
  projectId: string;
  column: ProjectColumn;
  tasks: Task[];
  canEdit: boolean;
  /** P2b (B0): CRUD колонок/фаз — по контракту RLS (owner/admin ∨ владелец проекта) */
  canManageColumns: boolean;
  /** P2a: колонка = фаза; статус задачи = badge (lane) */
  phaseMode: boolean;
  onEditTask: (t: Task) => void;
  onDeleteTask: (id: string) => void;
  onRename: (id: string, name: string, category: ColumnCategory) => void;
  onRequestDelete: (col: ProjectColumn) => void;
}

function BoardColumn({
  projectId,
  column,
  tasks,
  canEdit,
  canManageColumns,
  phaseMode,
  onEditTask,
  onDeleteTask,
  onRename,
  onRequestDelete,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);
  const [category, setCategory] = useState<ColumnCategory>(column.category);

  function saveEdit() {
    const trimmed = name.trim();
    if (trimmed) onRename(column.id, trimmed, category);
    setEditing(false);
  }

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-surface2">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 border-b border-border px-3 py-2">
        {editing ? (
          <div className="flex flex-1 flex-col gap-1.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') { setName(column.name); setCategory(column.category); setEditing(false); }
              }}
              className="w-full rounded border border-input bg-surface px-2 py-1 text-sm text-text-main focus:border-accent focus:outline-none"
            />
            {/* P2b (B5): у фазы редактируется ТОЛЬКО имя — category остаётся 'phase' */}
            {!phaseMode && (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ColumnCategory)}
                className="w-full rounded border border-input bg-surface px-2 py-1 text-xs text-text-dim focus:border-accent focus:outline-none"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
            <div className="flex justify-end gap-1">
              <button onClick={saveEdit} className="rounded p-1 text-green hover:bg-surface" aria-label="Сохранить"><Check size={14} /></button>
              <button onClick={() => { setName(column.name); setCategory(column.category); setEditing(false); }} className="rounded p-1 text-text-mute hover:bg-surface" aria-label="Отмена"><X size={14} /></button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-text-main">{column.name}</span>
                <span className="shrink-0 rounded-full bg-surface px-1.5 text-xs text-text-mute">{tasks.length}</span>
              </div>
              {/* В phase-режиме подпись «Фаза» у всех колонок — шум, не показываем */}
              {!phaseMode && (
                <span className="text-xs uppercase tracking-wider text-text-mute">{CATEGORY_LABEL[column.category]}</span>
              )}
            </div>
            {/* P2b (B5): rename/delete фаз возвращены; права = RLS (canManageColumns) */}
            {canManageColumns && (
              <div className="flex shrink-0 gap-0.5">
                <button onClick={() => setEditing(true)} className="rounded p-1 text-text-mute hover:text-accent" aria-label="Переименовать"><Pencil size={13} /></button>
                <button onClick={() => onRequestDelete(column)} className="rounded p-1 text-text-mute hover:text-red" aria-label="Удалить колонку"><Trash2 size={13} /></button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Tasks */}
      <div
        ref={setNodeRef}
        className={`flex min-h-[80px] flex-1 flex-col gap-1 p-2 transition-colors ${isOver ? 'bg-accent-l/40' : ''}`}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} phaseMode={phaseMode} onEdit={onEditTask} onDelete={onDeleteTask} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <p className="py-4 text-center text-[11px] text-text-mute">Пусто</p>
        )}
        {canEdit && (
          <div className="mt-1">
            {/* phase: lane='next' явно, иначе DEFAULT БД 'now' родит задачу «В работе» */}
            <TaskQuickAdd projectId={projectId} columnId={column.id} lane={phaseMode ? 'next' : undefined} />
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Board
// ═══════════════════════════════════════════════════════

interface ProjectBoardProps {
  projectId: string;
  /**
   * P2b (B0): права CRUD колонок/фаз и «Создать из шаблона» = контракт RLS
   * (owner/admin ∨ владелец проекта); прокидывает ProjectDetail через
   * canManageDeliveryProject. Без пропа — fallback на canEdit (легаси-поведение).
   * canEdit задач (создание/статус/DnD) НЕ сужаем — org-wide работа остаётся.
   */
  canManageColumns?: boolean;
}

export function ProjectBoard({ projectId, canManageColumns }: ProjectBoardProps) {
  const { data: columns = [], isLoading: colsLoading } = useProjectColumns(projectId);
  const { tasksByColumn, isLoading: tasksLoading } = useProjectBoard(projectId);
  const moveTask = useMoveTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createColumn = useCreateColumn(projectId);
  const updateColumn = useUpdateColumn(projectId);
  const deleteColumn = useDeleteColumn(projectId);
  const qc = useQueryClient();
  const { data: role } = useOrgRole();
  const canEdit = role !== 'viewer';
  const canManageCols = canManageColumns ?? canEdit;
  // P2a: фазовый режим — от данных, не от project.type (компонент проект не знает)
  const phaseMode = isPhaseBoard(columns);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<ColumnCategory>('backlog');
  const [deletingCol, setDeletingCol] = useState<ProjectColumn | null>(null);
  const [targetColId, setTargetColId] = useState<string>('');
  // P2b (B4): «Создать из шаблона» на пустой фазовой доске
  const [applyPending, setApplyPending] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const getColumnTasks = useCallback(
    (colId: string) => tasksByColumn[colId] ?? [],
    [tasksByColumn],
  );
  const allTasks = useMemo(() => Object.values(tasksByColumn).flat(), [tasksByColumn]);

  const handleDragStart = useCallback(
    (e: DragStartEvent) => {
      const t = allTasks.find((x) => x.id === e.active.id);
      if (t) setActiveTask(t);
    },
    [allTasks],
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = e;
      if (!over) return;

      const taskId = active.id as string;
      const overId = over.id as string;
      const task = allTasks.find((t) => t.id === taskId);
      if (!task) return;

      // Целевая колонка: droppable-колонка ИЛИ колонка задачи, над которой бросили.
      let targetCol: string | null = null;
      if (columns.some((c) => c.id === overId)) targetCol = overId;
      else {
        const overTask = allTasks.find((t) => t.id === overId);
        if (overTask?.column_id) targetCol = overTask.column_id;
      }
      if (!targetCol) return;

      const sourceCol = task.column_id;
      const targetTasks = getColumnTasks(targetCol).filter((t) => t.id !== taskId);

      let idx = targetTasks.length;
      if (overId !== targetCol) {
        const i = targetTasks.findIndex((t) => t.id === overId);
        if (i !== -1) idx = i;
      }

      if (sourceCol === targetCol) {
        const oldIndex = getColumnTasks(targetCol).findIndex((t) => t.id === taskId);
        if (oldIndex === idx) return;
      }

      const newList = [...targetTasks.slice(0, idx), task, ...targetTasks.slice(idx)];
      newList.forEach((t, i) => {
        if (t.id === taskId) {
          if (sourceCol !== targetCol || t.sort_order !== i) {
            moveTask.mutate({ id: t.id, column_id: targetCol!, sort_order: i, project_id: projectId });
          }
        } else if (t.sort_order !== i) {
          updateTask.mutate({ id: t.id, sort_order: i });
        }
      });
    },
    [allTasks, columns, getColumnTasks, moveTask, updateTask, projectId],
  );

  function handleAddColumn() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const maxPos = columns.reduce((m, c) => Math.max(m, c.position), 0);
    // P2b (B5): на фазовой доске «+ Фаза» — только имя, category='phase'
    createColumn.mutate(
      { name: trimmed, category: phaseMode ? 'phase' : newCategory, position: maxPos + 1 },
      { onSuccess: () => { setNewName(''); setNewCategory('backlog'); setAdding(false); } },
    );
  }

  // P2b (B4): фазы из шаблона направления/вида (RPC 037; по образцу spawn в ProjectDetail)
  async function handleApplyTemplate() {
    setApplyPending(true);
    setApplyError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc('apply_delivery_template', { p_project_id: projectId });
    setApplyPending(false);
    if (error) {
      const e = error as { code?: string; message?: string };
      setApplyError(
        e.code === '42501'
          ? 'Недостаточно прав: фазы создаёт владелец проекта или админ организации'
          : e.message?.includes('project already has columns')
            ? 'У проекта уже есть фазы — обнови страницу'
            : e.message?.startsWith('no template')
              ? 'Для этого направления и вида внедрения нет активного шаблона'
              : e.message ?? 'Не удалось создать фазы из шаблона',
      );
      return;
    }
    qc.invalidateQueries({ queryKey: ['project_columns', projectId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    // прогресс N/M (progress_total) пересчитал БД-триггер
    qc.invalidateQueries({ queryKey: ['projects'] });
  }

  function confirmDeleteColumn() {
    if (!deletingCol) return;
    const hasTasks = getColumnTasks(deletingCol.id).length > 0;
    deleteColumn.mutate(
      { id: deletingCol.id, targetId: hasTasks ? targetColId : null },
      {
        onSuccess: () => { setDeletingCol(null); setTargetColId(''); },
        onError: (err) => {
          alert(err instanceof Error ? err.message : 'Не удалось удалить колонку');
        },
      },
    );
  }

  if (colsLoading || tasksLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin text-accent" />
      </div>
    );
  }

  // 0 колонок бывает только у delivery-проекта без шаблона направления
  // (internal/client сидятся 4 дефолтными)
  if (columns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center">
        <p className="text-sm text-text-dim">Фазы не созданы</p>
        <p className="mt-1 text-xs text-text-mute">Для этого направления нет шаблона внедрения</p>
        {/* P2b (B4): права = гарды RPC (owner/created_by ∨ owner/admin), см. B0 */}
        {canManageCols && (
          <div className="mt-4">
            <button
              onClick={handleApplyTemplate}
              disabled={applyPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs
                         font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {applyPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Создать из шаблона
            </button>
            {applyError && <p className="mt-2 text-xs text-red">{applyError}</p>}
          </div>
        )}
      </div>
    );
  }

  const deleteHasTasks = deletingCol ? getColumnTasks(deletingCol.id).length > 0 : false;
  const deleteTargets = deletingCol ? columns.filter((c) => c.id !== deletingCol.id) : [];

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((col) => (
            <BoardColumn
              key={col.id}
              projectId={projectId}
              column={col}
              tasks={getColumnTasks(col.id)}
              canEdit={canEdit}
              canManageColumns={canManageCols}
              phaseMode={phaseMode}
              onEditTask={(t) => { setEditTask(t); setModalOpen(true); }}
              onDeleteTask={(id) => { if (confirm('Удалить задачу?')) deleteTask.mutate(id); }}
              onRename={(id, name, category) => updateColumn.mutate({ id, name, category })}
              onRequestDelete={(c) => { setDeletingCol(c); setTargetColId(''); }}
            />
          ))}

          {/* Add column — P2b (B5): в phase-режиме «+ Фаза» (только имя, category='phase') */}
          {canManageCols && (
            <div className="w-72 shrink-0">
              {adding ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface2 p-3">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') setAdding(false); }}
                    placeholder={phaseMode ? 'Название фазы' : 'Название колонки'}
                    className="w-full rounded border border-input bg-surface px-2 py-1.5 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
                  />
                  {!phaseMode && (
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as ColumnCategory)}
                      className="w-full rounded border border-input bg-surface px-2 py-1.5 text-xs text-text-dim focus:border-accent focus:outline-none"
                    >
                      {CATEGORY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setAdding(false)} className="rounded border border-border px-2.5 py-1 text-xs text-text-dim hover:bg-surface">Отмена</button>
                    <button onClick={handleAddColumn} className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90">Добавить</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-text-mute transition-colors hover:border-accent hover:text-accent"
                >
                  <Plus size={14} /> {phaseMode ? 'Фаза' : 'Колонка'}
                </button>
              )}
            </div>
          )}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="max-w-[280px] rounded border border-accent/50 bg-surface p-2 elevation-3 opacity-90">
              <p className="text-[0.8125rem] text-text-main">{activeTask.text}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Delete column dialog */}
      {deletingCol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingCol(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 elevation-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-sm font-semibold text-text-main">Удалить колонку «{deletingCol.name}»?</h3>
            {deleteHasTasks ? (
              <>
                <p className="mb-2 text-xs text-text-mute">В колонке есть задачи. Куда их перенести?</p>
                <select
                  value={targetColId}
                  onChange={(e) => setTargetColId(e.target.value)}
                  className="mb-4 w-full rounded border border-input bg-surface px-2 py-1.5 text-sm text-text-main focus:border-accent focus:outline-none"
                >
                  <option value="">Выбрать колонку…</option>
                  {deleteTargets.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </>
            ) : (
              <p className="mb-4 text-xs text-text-mute">Колонка пуста — будет удалена безвозвратно.</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingCol(null)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-dim hover:bg-surface2">Отмена</button>
              <button
                onClick={confirmDeleteColumn}
                disabled={deleteHasTasks && !targetColId}
                className="rounded-lg bg-red px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      <TaskModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditTask(null); }}
        editTask={editTask}
        defaultProjectId={projectId}
      />
    </div>
  );
}
