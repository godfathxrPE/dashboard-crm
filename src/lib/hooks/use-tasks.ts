'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import type { Task, TaskInsert, TaskUpdate } from '@/types/entities';
import type { TaskLane } from '@/types/database';
import { logActivity } from './use-activity-log';

const QUERY_KEY = ['tasks'] as const;

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
        .select('*, project:projects(id, name), company:companies(id, name)')
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
      const previous = queryClient.getQueryData<Task[]>(QUERY_KEY);

      const optimistic: Task = {
        id: `temp-${Date.now()}`,
        text: input.text ?? '',
        lane: input.lane ?? 'now',
        priority: input.priority ?? 'normal',
        project_id: input.project_id ?? null,
        company_id: input.company_id ?? null,
        contact_id: input.contact_id ?? null,
        deadline: input.deadline ?? null,
        remind_min: input.remind_min ?? null,
        sort_order: input.sort_order ?? 0,
        assigned_to: input.assigned_to ?? null,
        created_by: null,
        org_id: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData<Task[]>(QUERY_KEY, (old) => [
        optimistic,
        ...(old ?? []),
      ]);

      return { previous };
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
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
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
      const previous = queryClient.getQueryData<Task[]>(QUERY_KEY);

      queryClient.setQueryData<Task[]>(QUERY_KEY, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, ...updates } : t)),
      );

      return { previous };
    },
    onSuccess: (result, vars) => {
      if (vars.lane === 'done' && result.project_id) {
        logActivity(result.project_id, 'task_completed', { title: result.text });
      }
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
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
      const previous = queryClient.getQueryData<Task[]>(QUERY_KEY);

      queryClient.setQueryData<Task[]>(QUERY_KEY, (old) =>
        (old ?? []).filter((t) => t.id !== id),
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
