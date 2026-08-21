'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { DepType } from '@/types/database';

/**
 * S-DEPS-1: рёбра DAG между задачами проекта (Gantt-зависимости, FS v1).
 *
 * `task_dependencies` не несёт своей project_id-колонки, а RLS отдаёт ВСЕ рёбра
 * org (SELECT org-wide, как project_columns). Поэтому читаем строго по id задач
 * текущего борда: оба конца IN taskIds ⇒ ребро своего проекта, не чужого.
 */

/** Проекция ребра, которую рисует Гант (без org_id/created_by/created_at). */
export interface DependencyEdge {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dep_type: DepType;
  lag_days: number;
}

const depsKey = (projectId: string) => ['task-dependencies', projectId] as const;

/**
 * Рёбра проекта. `taskIds` — id всех задач текущего борда (из useProjectSchedule /
 * useProjectBoard). Пустой список ⇒ запрос не дёргаем (нечего фильтровать).
 */
export function useTaskDependencies(projectId: string, taskIds: string[]) {
  const supabase = createClient();

  return useQuery({
    queryKey: depsKey(projectId),
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_dependencies')
        .select('id, predecessor_id, successor_id, dep_type, lag_days')
        // ⚠️ Батчинга `.in()` тут НЕТ (S-DEBT-TRUTH-1): фильтров два, и оба по одному
        // и тому же списку — нарезав один, второй всё равно везёшь целиком, а нарезав
        // оба, получаешь N² запросов. Правильная нарезка = батчить predecessor, а
        // successor фильтровать на клиенте по Set — это смена семантики запроса, и она
        // не входила в спринт. Граница: ~500 задач на борде ≈ 36 КБ URL. Записано остатком.
        .in('predecessor_id', taskIds)
        .in('successor_id', taskIds); // оба конца в проекте → своё ребро, не чужой проект org

      if (error) throw error;
      return (data ?? []) as DependencyEdge[];
    },
  });
}

/**
 * Человекочитаемый текст отказов create/delete по errcode валидатора/RLS
 * (миграция 048). Тостим сами (meta.silentError), чтобы не дублировать глобальный
 * humanizeError общими формулировками.
 */
export function parseDependencyError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  switch (e?.code) {
    case 'P0001':
      return 'Нельзя: получится циклическая зависимость';
    case '23514':
      return 'Задачи должны быть в одном проекте (и нельзя связать задачу саму с собой)';
    case '23505':
      return 'Такая связь уже есть';
    case '42501':
      return 'Недостаточно прав или задачи из разных пространств';
    case '23503':
      return 'Одна из задач не найдена';
    default:
      return e?.message ?? 'Не удалось изменить зависимость';
  }
}

/** Создать FS-ребро (predecessor → successor). Оптимистик по 5-шаговой конвенции. */
export function useCreateTaskDependency(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const key = depsKey(projectId);

  return useMutation({
    // ошибку тостим сами (parseDependencyError) — глобальный handler пропускает
    meta: { silentError: true },
    mutationFn: async (input: { predecessor_id: string; successor_id: string }) => {
      const { data, error } = await supabase
        .from('task_dependencies')
        .insert({ predecessor_id: input.predecessor_id, successor_id: input.successor_id })
        .select('id, predecessor_id, successor_id, dep_type, lag_days')
        .single();

      if (error) throw error;
      return data as DependencyEdge;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DependencyEdge[]>(key);
      const optimistic: DependencyEdge = {
        id: `temp-${input.predecessor_id}-${input.successor_id}`,
        predecessor_id: input.predecessor_id,
        successor_id: input.successor_id,
        dep_type: 'FS',
        lag_days: 0,
      };
      queryClient.setQueryData<DependencyEdge[]>(key, (old) => [...(old ?? []), optimistic]);
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous);
      toast.error(parseDependencyError(err));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** Целое ≥ 0 (v1 без lead-time / отрицательного lag); NaN из инпута → 0. */
const normalizeLag = (lag: number): number => {
  const n = Math.floor(lag);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * S-SCHEDULE-1a: правка ребра. Шлём СТРОГО lag_days и dep_type — смена
 * predecessor/successor через UPDATE обошла бы DAG-валидатор 048 (он BEFORE INSERT
 * only, см. 062), поэтому третьего поля в input быть не должно. Тот же
 * оптимистик-паттерн.
 *
 * S-GANTT-DEPTYPES: оба поля опциональны и уезжают одним UPDATE — апдейт собирается
 * только из переданных ключей, чтобы правка одного lag не переписывала тип (и наоборот).
 */
export function useUpdateTaskDependency(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const key = depsKey(projectId);

  return useMutation({
    meta: { silentError: true },
    mutationFn: async (input: { id: string; lag_days?: number; dep_type?: DepType }) => {
      const patch: { lag_days?: number; dep_type?: DepType } = {};
      if (input.lag_days !== undefined) patch.lag_days = normalizeLag(input.lag_days);
      if (input.dep_type !== undefined) patch.dep_type = input.dep_type;
      // Оба поля не переданы — менять нечего. Сейчас недостижимо (единственный вызов
      // шлёт оба), но пустой .update({}) — это 400 от PostgREST, а не no-op: выходим
      // до сети, отдав текущее состояние ребра из кэша.
      if (Object.keys(patch).length === 0) {
        const cached = queryClient
          .getQueryData<DependencyEdge[]>(key)
          ?.find((e) => e.id === input.id);
        if (cached) return cached;
        throw new Error('useUpdateTaskDependency: пустой патч и ребра нет в кэше');
      }

      const { data, error } = await supabase
        .from('task_dependencies')
        .update(patch)
        .eq('id', input.id)
        .select('id, predecessor_id, successor_id, dep_type, lag_days')
        .single();

      if (error) throw error;
      return data as DependencyEdge;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DependencyEdge[]>(key);
      queryClient.setQueryData<DependencyEdge[]>(key, (old) =>
        (old ?? []).map((e) =>
          e.id === input.id
            ? {
                ...e,
                ...(input.lag_days !== undefined ? { lag_days: normalizeLag(input.lag_days) } : {}),
                ...(input.dep_type !== undefined ? { dep_type: input.dep_type } : {}),
              }
            : e,
        ),
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous);
      toast.error(parseDependencyError(err));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** Удалить ребро по id. Тот же оптимистик-паттерн. */
export function useDeleteTaskDependency(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const key = depsKey(projectId);

  return useMutation({
    meta: { silentError: true },
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('task_dependencies').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DependencyEdge[]>(key);
      queryClient.setQueryData<DependencyEdge[]>(key, (old) => (old ?? []).filter((e) => e.id !== id));
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous);
      toast.error(parseDependencyError(err));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
