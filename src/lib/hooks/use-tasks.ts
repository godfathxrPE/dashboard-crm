'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
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
    onSettled: (_data, _err, vars) => {
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
