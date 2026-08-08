'use client';

import { useEffect, useRef } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import type { Task, TaskInsert, TaskUpdate } from '@/types/entities';
import type { TaskLane, Json } from '@/types/database';
import { logActivity } from './use-activity-log';

const QUERY_KEY = ['tasks'] as const;

// ─── Общая механика optimistic по ВСЕМ срезам префикса ['tasks'] ───────────────
// Личный борд читает ['tasks'], проектная доска и Гант — ['tasks','board',projectId]
// (useProjectBoard). Мутации обязаны патчить ОБА, иначе доска «прыгает» назад до
// рефетча (ровно грабля S-GANTT-VIEW-2, которую чинил useUpdateTaskDates вручную).
// Кэш каждого среза — Task[].
type TaskSnapshots = [QueryKey, Task[] | undefined][];

function snapshotTaskCaches(qc: QueryClient): TaskSnapshots {
  return qc.getQueriesData<Task[]>({ queryKey: QUERY_KEY });
}

/** Патч по id — единообразно во всех срезах (update/delete/dates). */
function patchTaskCaches(qc: QueryClient, patch: (old: Task[] | undefined) => Task[]): void {
  qc.setQueriesData<Task[]>({ queryKey: QUERY_KEY }, patch);
}

function rollbackTaskCaches(qc: QueryClient, snapshots: TaskSnapshots | undefined): void {
  for (const [key, data] of snapshots ?? []) qc.setQueryData(key, data);
}

/**
 * Загрузка всех задач текущего пользователя.
 * RLS фильтрует на уровне БД — фронт получает только "свои".
 */
export function useTasks() {
  const supabase = createClient();

  // Подписка на Realtime — при изменениях кеш инвалидируется автоматически
  useRealtimeSync('tasks');

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, project:projects(id, name, type), company:companies(id, name)')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Task[];
    },
  });

  return query;
}

/**
 * Группировка задач по колонкам Kanban.
 */
export function useTasksByLane() {
  const { data: tasks, ...rest } = useTasks();

  const lanes: Record<TaskLane, Task[]> = {
    now: [],
    next: [],
    wait: [],
    done: [],
  };

  if (tasks) {
    for (const task of tasks) {
      lanes[task.lane].push(task);
    }
  }

  return { lanes, tasks, ...rest };
}

/**
 * PCT-1: задачи одного проекта, сгруппированные по колонкам доски.
 * Ключ ['tasks', 'board', projectId] — префикс ['tasks'] ловится
 * useRealtimeSync('tasks') и инвалидацией мутаций.
 */
export function useProjectBoard(projectId: string) {
  const supabase = createClient();
  useRealtimeSync('tasks');

  const query = useQuery({
    queryKey: ['tasks', 'board', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, project:projects(id, name, type), company:companies(id, name)')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Task[];
    },
    enabled: !!projectId,
  });

  const tasksByColumn: Record<string, Task[]> = {};
  for (const t of query.data ?? []) {
    const key = t.column_id ?? '__unassigned__';
    (tasksByColumn[key] ??= []).push(t);
  }

  return { ...query, tasks: query.data, tasksByColumn };
}

/**
 * PCT-1: перенос задачи по проектной доске (column_id + sort_order).
 * lane пересчитает БД-триггер → инвалидируем ['tasks'] целиком, чтобы личный
 * борд не показал устаревший lane.
 */
export function useMoveTask() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      column_id,
      sort_order,
    }: {
      id: string;
      column_id: string;
      sort_order: number;
      project_id?: string;
    }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({ column_id, sort_order })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Task;
    },
    onMutate: async (vars) => {
      const key = vars.project_id ? ['tasks', 'board', vars.project_id] : null;
      if (!key) return { previous: undefined as Task[] | undefined, key };
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Task[]>(key);
      queryClient.setQueryData<Task[]>(key, (old) =>
        (old ?? []).map((t) =>
          t.id === vars.id ? { ...t, column_id: vars.column_id, sort_order: vars.sort_order } : t,
        ),
      );
      return { previous, key };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous && context.key) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      // AUDIT 2.9: задача влияет на KPI дашборда (активные задачи) и ленты сущностей
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      // P2b (B3): смена column_id на НЕ-фазовой доске каскадит lane (резолвер) →
      // прогресс delivery (progress_done/total) пересчитал БД-триггер; префикс
      // ['projects'] покрывает и ['projects', id]
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/**
 * Создание задачи с оптимистичным обновлением.
 */
export function useCreateTask() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TaskInsert) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as Task;
    },
    // Оптимистичное обновление: добавляем в кеш до ответа сервера
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const snapshots = snapshotTaskCaches(queryClient);

      const optimistic: Task = {
        id: `temp-${Date.now()}`,
        text: input.text ?? '',
        lane: input.lane ?? 'now',
        priority: input.priority ?? 'normal',
        project_id: input.project_id ?? null,
        column_id: input.column_id ?? null,
        company_id: input.company_id ?? null,
        contact_id: input.contact_id ?? null,
        deadline: input.deadline ?? null,
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        // S-TIMEBLOCK-A1: тайм-блок «когда делаю» (optimistic несёт все поля Task)
        scheduled_start: input.scheduled_start ?? null,
        scheduled_end: input.scheduled_end ?? null,
        remind_min: input.remind_min ?? null,
        sort_order: input.sort_order ?? 0,
        assigned_to: input.assigned_to ?? null,
        created_by: null,
        org_id: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // P3: рукотворные задачи — не вехи (флаг ставит только шаблон/бэкфилл)
        is_milestone: input.is_milestone ?? false,
        // S-WBS-1: иерархия (Task требует поля → optimistic обязан их нести)
        parent_task_id: input.parent_task_id ?? null,
        wbs_code: input.wbs_code ?? null,
        // S-RECUR-1: линк спавнится только сервером (spawn_recurring_tasks) — у
        // рукотворных задач всегда null.
        recurrence_template_id: null,
        // S-ANALYTICS-1 (072): completed_at — required в gen Row → optimistic-литерал
        // (тип Task=Row, не Insert) обязан нести поле. Стемпит только БД-триггер на
        // переходе в done; новая задача ('now') не завершена. Истину даст рефетч onSettled.
        completed_at: null,
        // S-CHAT-TASK-1 (099): ссылка на сообщение-источник. Той же природы, что поля
        // выше — Task=Row требует поле в литерале. Непусто только у задач из чата.
        source_message_id: input.source_message_id ?? null,
        // S-TG-2 (108): отметка об отправленном напоминании. Той же природы, что
        // completed_at выше — ставит только планировщик enqueue_task_reminders, у
        // только что созданной задачи её быть не может. Истину даст рефетч onSettled.
        reminded_at: null,
      };

      // Личный борд ['tasks'] — всегда; доска ['tasks','board',pid] отфильтрована
      // .eq('project_id') → добавляем только в доску СВОЕГО проекта.
      for (const [key] of snapshots) {
        const isBoard = key[1] === 'board';
        if (isBoard && (!input.project_id || key[2] !== input.project_id)) continue;
        queryClient.setQueryData<Task[]>(key, (old) => [optimistic, ...(old ?? [])]);
      }

      return { snapshots };
    },
    onSuccess: (result, input) => {
      if (input.project_id) {
        logActivity(input.project_id, 'task_created', {
          title: input.text,
          priority: input.priority ?? 'normal',
        });
      }
    },
    onError: (_err, _input, context) => {
      rollbackTaskCaches(queryClient, context?.snapshots);
    },
    onSettled: (_data, _err, input) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // AUDIT 2.9: задача влияет на KPI дашборда (активные задачи) и ленты сущностей
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      // P2b (B3): новая задача проекта меняет progress_total (БД-триггер 037)
      if (input.project_id) {
        queryClient.invalidateQueries({ queryKey: ['projects'] });
      }
      // S-FIX-CO360-1: upcoming-слагаемое strength зависит от задач контакта.
      // ⚠️ Только при contact_id, а не безусловно: на доске задач мутации идут
      // пачками, и безусловная инвалидация гоняла бы три запроса strength на
      // каждый drag. Задача без контакта на strength не влияет вовсе.
      if (input.contact_id) {
        queryClient.invalidateQueries({ queryKey: ['contact-strength'] });
      }
    },
  });
}

/**
 * Обновление задачи (edit, move lane, reorder).
 */
export function useUpdateTask() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: TaskUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Task;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const snapshots = snapshotTaskCaches(queryClient);

      // Патч по id во всех срезах: смена column_id из TaskModal двигает карточку
      // на проектной доске мгновенно, без «прыжка».
      patchTaskCaches(queryClient, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, ...updates } : t)),
      );

      return { snapshots };
    },
    onSuccess: (result, vars) => {
      if (vars.lane === 'done' && result.project_id) {
        logActivity(result.project_id, 'task_completed', { title: result.text });
      }
    },
    onError: (_err, _input, context) => {
      rollbackTaskCaches(queryClient, context?.snapshots);
    },
    onSettled: (data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // AUDIT 2.9: задача влияет на KPI дашборда (активные задачи) и ленты сущностей
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      // P2b (B3): lane/project_id/column_id меняют прогресс delivery (триггер 037)
      if (vars.lane !== undefined || vars.project_id !== undefined || vars.column_id !== undefined) {
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        // P3: закрытие/переоткрытие вехи меняет чеклист гейта завершения (038)
        queryClient.invalidateQueries({ queryKey: ['delivery-gate'] });
      }
      // S-FIX-CO360-1: upcoming-слагаемое strength зависит от задач контакта.
      // Источник contact_id — СТРОКА ОТВЕТА (`data`), а не только payload: закрытие
      // задачи или сдвиг дедлайна шлют `lane`/`deadline` без `contact_id`, но
      // hasUpcoming при этом переключается. `vars.contact_id` оставлен вторым
      // источником на случай ошибки мутации, когда `data` пуст.
      // ⚠️ Условие обязательно: безусловная инвалидация гоняла бы strength на
      // каждой правке любой задачи. Перетаскивание по доске идёт через
      // useMoveTask/useReorderTasks — те не тронуты намеренно.
      if (data?.contact_id ?? vars.contact_id) {
        queryClient.invalidateQueries({ queryKey: ['contact-strength'] });
      }
    },
  });
}

/**
 * S-GANTT-VIEW-2: правка дат задачи перетаскиванием бара на Гантте.
 * ГЛАВНАЯ ГРАБЛЯ: Гант читает кэш ['tasks','board',projectId] (useProjectBoard),
 * а патч только ['tasks'] → полоса дёргалась бы назад до рефетча. W2: унифицировано
 * с create/update/delete — общий patchTaskCaches патчит ВСЕ срезы префикса, одна
 * механика вместо ручного дубля по двум ключам.
 * onSettled: invalidate ['tasks'] (префикс ловит и board) + dashboard/timeline;
 * ['projects']/['delivery-gate'] НЕ нужны — даты не влияют на progress/gate.
 */
export function useUpdateTaskDates() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      start_date,
      end_date,
    }: {
      id: string;
      start_date: string;
      end_date: string;
    }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({ start_date, end_date })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Task;
    },
    onMutate: async ({ id, start_date, end_date }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const snapshots = snapshotTaskCaches(queryClient);
      patchTaskCaches(queryClient, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, start_date, end_date } : t)),
      );
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      // откат всех срезов (сервер вернул 23514 при нарушении CHECK и т.п.)
      rollbackTaskCaches(queryClient, context?.snapshots);
    },
    onSettled: () => {
      // префикс ['tasks'] инвалидирует и board, и личный борд
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

/**
 * S-GANTT-POLISH: минимум, нужный для записи дат. `CascadeShift` (deltaDays>0 +
 * reason) удовлетворяет структурно, поэтому существующий вызов каскада
 * компилируется без правок; обратному батчу undo reason/дельта не нужны, а
 * дельта у него вообще отрицательная — под `CascadeShift` он не лёг бы.
 */
export interface DateWrite {
  id: string;
  start: string;
  end: string;
}

export interface ShiftTasksVars {
  shifts: DateWrite[];
  /** false — это и есть обратный батч undo: повторный undo не предлагаем */
  undoable?: boolean;
  /** строки, дописываемые в обратный батч: якорь драга писался через
   *  useUpdateTaskDates и в shifts не входит, но вернуть его надо вместе с хвостом */
  undoExtra?: DateWrite[];
}

/**
 * S-SCHEDULE-1B: батч-сдвиг дат зависимых задач (авто-каскад). Один
 * оптимистичный патч по всем срезам префикса ['tasks'] (мапой по id, как
 * useUpdateTaskDates), затем N параллельных UPDATE через allSettled.
 *
 * Долг: батч НЕ атомарен — при RLS-отказе на части строк применится часть.
 * Осознанно (атомарность стоит миграции RPC shift_tasks_dates + apply-гейт, а
 * спринт UI-only). Частичный отказ ресинкается инвалидацией из onSettled.
 *
 * projectId не нужен: как useUpdateTaskDates, патчим/инвалидируем весь префикс
 * ['tasks'] (ловит и board ['tasks','board',id], и личный борд).
 *
 * S-GANTT-POLISH: тост успеха несёт `cancel: Вернуть как было` — обратный батч
 * тем же хуком. Undo только при ПОЛНОМ успехе: батч не атомарен, и при failed>0
 * обратная запись «вернула» бы и те строки, что не менялись, отрапортовав об
 * отмене того, чего не было.
 */
export function useShiftTasks() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  // Самоссылка для undo (обратный батч — та же мутация). Взять mutate прямо в
  // onSuccess нельзя: ссылка на `mutation` внутри собственного инициализатора даёт
  // циклический вывод типа. Присваивание — строго в эффекте, не в рендере: мутация
  // ref'а во время рендера нечиста, и при конкурентном рендере коммит может быть
  // отброшен уже после записи. mutate у React Query стабилен → эффект по сути разовый.
  const selfRef = useRef<((vars: ShiftTasksVars) => void) | null>(null);

  const mutation = useMutation({
    meta: { silentError: true },   // тостим сами (частичный отказ ≠ throw)
    mutationFn: async ({ shifts }: ShiftTasksVars) => {
      const results = await Promise.allSettled(
        shifts.map((s) =>
          supabase
            .from('tasks')
            .update({ start_date: s.start, end_date: s.end })
            .eq('id', s.id)
            .then(({ error }) => {
              if (error) throw error;   // RLS 42501 / CHECK → rejected в allSettled
            }),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      return { ok: shifts.length - failed, failed, total: shifts.length };
    },
    onMutate: async ({ shifts }: ShiftTasksVars) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const snapshots = snapshotTaskCaches(queryClient);
      // Значения ДО патча — источник обратного батча undo. snapshotTaskCaches для
      // этого не годится: это снимок для отката кеша, а не строки для записи в БД.
      // Пустые start/end не берём — вернуть их этой мутацией нечем (NOT NULL в апдейте).
      const wanted = new Set(shifts.map((s) => s.id));
      const seen = new Set<string>();
      const prev: DateWrite[] = [];
      for (const [, rows] of queryClient.getQueriesData<Task[]>({ queryKey: QUERY_KEY })) {
        for (const t of rows ?? []) {
          if (!wanted.has(t.id) || seen.has(t.id)) continue;   // первое попадание по id
          seen.add(t.id);
          if (!t.start_date || !t.end_date) continue;
          prev.push({ id: t.id, start: t.start_date, end: t.end_date });
        }
      }
      const byId = new Map(shifts.map((s) => [s.id, s]));
      patchTaskCaches(queryClient, (old) =>
        (old ?? []).map((t) => {
          const s = byId.get(t.id);
          return s ? { ...t, start_date: s.start, end_date: s.end } : t;
        }),
      );
      return { snapshots, prev };
    },
    onError: (_err, _vars, context) => {
      // Полный откат — сюда попадаем только при неожиданном throw самой мутации
      // (allSettled частичные отказы не бросает; их ловит onSuccess + инвалидация).
      rollbackTaskCaches(queryClient, context?.snapshots);
      toast.error('Не удалось сдвинуть задачи');
    },
    onSuccess: ({ ok, failed, total }, vars, context) => {
      if (failed > 0) {
        toast.error(`Сдвинуто ${ok} из ${total} — остальные отклонены (нет прав)`);
        return;
      }
      // Обратный батч = якорь драга (undoExtra) + prev сдвинутых
      const reverse = [...(vars.undoExtra ?? []), ...(context?.prev ?? [])];
      if (vars.undoable === false || reverse.length === 0) {
        toast.success(`Сдвинуто задач: ${ok}`);
        return;
      }
      toast.success(`Сдвинуто задач: ${ok}`, {
        duration: 12_000,
        cancel: {
          label: 'Вернуть как было',
          onClick: () => selfRef.current?.({ shifts: reverse, undoable: false }),
        },
      });
    },
    onSettled: () => {
      // Один invalidate префикса ['tasks'] — ловит и board, и личный борд, и
      // вернёт правду из БД при частичном отказе. Рёбра не менялись → deps не трогаем.
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
  });

  useEffect(() => {
    selfRef.current = mutation.mutate;
  }, [mutation.mutate]);

  return mutation;
}

/**
 * AUDIT A2.2: массовый перенос карточек Kanban ОДНОЙ мутацией (RPC 039).
 * Вход — список перестановок + флаг смены лейна. Один optimistic-снапшот на весь
 * батч (cancel → снимок → перестановка в кеше → откат целиком), а не N мутаций,
 * где откат одной затирал соседние успешные (было в KanbanBoard).
 */
export interface TaskMove {
  id: string;
  lane: TaskLane;
  sort_order: number;
}

export function useReorderTasks() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ moves }: { moves: TaskMove[]; affectsLane?: boolean }) => {
      if (moves.length === 0) return;
      const { error } = await supabase.rpc('reorder_tasks', { p_moves: moves as unknown as Json });
      if (error) throw error;
    },
    onMutate: async ({ moves }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<Task[]>(QUERY_KEY);
      const byId = new Map(moves.map((m) => [m.id, m]));
      queryClient.setQueryData<Task[]>(QUERY_KEY, (old) =>
        (old ?? []).map((t) => {
          const mv = byId.get(t.id);
          return mv ? { ...t, lane: mv.lane, sort_order: mv.sort_order } : t;
        }),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: (_data, _err, { affectsLane }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // AUDIT 2.9: задача влияет на KPI дашборда (активные задачи) и ленты сущностей
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      // Как в useUpdateTask: смена лейна каскадит прогресс delivery (037) и
      // чеклист гейта завершения (038). Внутрилейновый reorder их не трогает.
      if (affectsLane) {
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        queryClient.invalidateQueries({ queryKey: ['delivery-gate'] });
      }
    },
  });
}

/**
 * Удаление задачи.
 */
export function useDeleteTask() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const snapshots = snapshotTaskCaches(queryClient);

      patchTaskCaches(queryClient, (old) => (old ?? []).filter((t) => t.id !== id));

      return { snapshots };
    },
    onError: (_err, _id, context) => {
      rollbackTaskCaches(queryClient, context?.snapshots);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // AUDIT 2.9: задача влияет на KPI дашборда (активные задачи) и ленты сущностей
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      // P2b (B3): variables — только id; удаление могло уменьшить progress_total
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
