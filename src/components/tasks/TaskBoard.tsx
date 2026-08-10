'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useUpdateTask } from '@/lib/hooks/use-tasks';
import { BoardColumn } from './BoardColumn';
import {
  boardColumns,
  deadlineForBucket,
  taskDateBucket,
  BUCKET_ORDER,
  type DateBucket,
} from '@/lib/utils/task-view';
import type { Task } from '@/types/entities';

/**
 * Высота рабочей области доски. Тем же приёмом, что `CHAT_HEIGHT` в ChatView:
 * готового паттерна полноэкранной страницы в проекте нет, а flex от контейнера
 * не работает — у `main` из layout высота не ограничена, и колонка без
 * фиксированной высоты растягивает страницу вместо собственного скролла.
 *
 * 18rem = ContentHeader + заголовок раздела + строка фильтров + поиск + подпись
 * про строки плана: замерено на живой странице (верх доски 260px при высоте
 * окна 902px), плюс запас на округление. `min-h` держит доску пригодной на
 * низком окне — там скроллится вся страница, и это нормально.
 * dvh, а не vh — на мобильных адресная строка съедает vh.
 */
const BOARD_HEIGHT = 'h-[calc(100dvh-18rem)] min-h-[26rem]';

function isBucket(v: string): v is DateBucket {
  return (BUCKET_ORDER as readonly string[]).includes(v);
}

interface TaskBoardProps {
  tasks: Task[];
  now: Date;
  onEdit: (task: Task) => void;
  canEdit: boolean;
  /**
   * Пропсы 1:1 с `TaskStream`, но удаление на доске в этот спринт не входит:
   * доска — про планирование сроков, удаление живёт в Списке в режиме
   * «Выполнено». Оставлено в контракте, чтобы третий вид не пришлось звать
   * иначе, чем два соседних.
   */
  canDelete?: (task: Task) => boolean;
}

/**
 * S-TASKS-BOARD-1: третий вид раздела Задачи — канбан по СРОКАМ.
 *
 * Колонки — дата-бакеты (`DateBucket`), дроп карточки = запись `deadline`
 * (конец дня МСК). Колонка «Без даты» — зона разбора: доска существует ровно
 * затем, чтобы разгребать её перетаскиванием на день.
 *
 * Чего доска НЕ делает намеренно:
 * - реордер внутри колонки: `sort_order` lane-scoped, и его перемешивание
 *   датами сломало бы порядок lane-борда и Ганта. Порядок в колонке — по
 *   дедлайну (`compareInBucket`), как в Списке;
 * - `reminded_at` не зануляет — это делает триггер БД `trg_ab_reset_reminded_at`
 *   на изменении `deadline` (108). Клиентский дубль разошёлся бы с ним при
 *   первой правке триггера.
 */
export function TaskBoard({ tasks, now, onEdit, canEdit }: TaskBoardProps) {
  const updateTask = useUpdateTask();
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const columns = useMemo(() => boardColumns(tasks, now), [tasks, now]);

  // Те же значения, что в KanbanBoard — поведение drag во всём приложении одинаковое.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string;
      setActiveTask(tasks.find((t) => t.id === id) ?? null);
    },
    [tasks],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;

      const overId = String(over.id);
      if (!isBucket(overId)) return;

      const task = tasks.find((t) => t.id === active.id);
      if (!task) return;

      // Дроп — ДЕЙСТВИЕ, а не рендер: часы читаем здесь, а не берём `now` пропом.
      // `now` из TasksView пересчитывается только при смене ССЫЛКИ на tasks, а
      // React Query её сохраняет, когда данные не изменились, — во вкладке,
      // открытой через полночь, проп указывает на вчера, и в БД уехал бы
      // вчерашний конец дня: задача просрочена сразу после дропа, молча.
      // Правило «никаких Date.now() в домене» не нарушено: домен по-прежнему
      // получает «сейчас» аргументом, просто его читает тот, кто совершает
      // действие. Следствие: если сутки сменились при открытой вкладке, карточка
      // встанет не в ту колонку, куда её бросили, — и это верно, день реально
      // другой; рефетч перерисует доску. Подгонять под ожидание нельзя.
      const at = new Date();

      // Дроп в свой же бакет — no-op: писать тот же день значило бы сдвинуть
      // время дедлайна на конец дня и без нужды сбросить reminded_at триггером.
      if (taskDateBucket(task, at) === overId) return;

      const drop = deadlineForBucket(overId, at);
      if (drop === null) return;

      // ОДНА мутация на дроп: useUpdateTask уже несёт optimistic + патч всех
      // срезов кэша. Никаких reorder_tasks — sort_order здесь не трогаем вовсе.
      updateTask.mutate({ id: task.id, deadline: drop.deadline });
    },
    [tasks, updateTask],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={`${BOARD_HEIGHT} flex min-h-0 gap-3.5 overflow-x-auto overflow-y-hidden pb-4`}>
        {columns.map(({ bucket, tasks: colTasks }) => (
          <BoardColumn
            key={bucket}
            bucket={bucket}
            tasks={colTasks}
            now={now}
            onEdit={onEdit}
            canEdit={canEdit}
          />
        ))}
      </div>

      {/* Здесь elevation уместен — это floating-слой, а не карточка в потоке. */}
      <DragOverlay>
        {activeTask ? (
          <div className="max-w-[280px] rotate-2 rounded-lg border border-accent/50 bg-surface p-3 opacity-90 elevation-3">
            <p className="text-sm text-text-main">{activeTask.text}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
