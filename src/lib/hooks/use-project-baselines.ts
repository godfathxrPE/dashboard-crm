'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

// ═══════════════════════════════════════════════════════
// S-GANTT-BASELINE-1: слепки сроков проекта (план) для план/факт.
// Запись заголовка — ТОЛЬКО RPC create_project_baseline (SECURITY DEFINER): прямой INSERT
// заблокирован (INSERT-политик нет). Delete — hard, по RLS (owner/admin org), строки слепка
// уходят каскадом в БД. Типы project_baselines/baseline_tasks/RPC живут в gen-типах (074
// применена, реген в дереве) — клиент типизирован напрямую, без стаб-кастов.
// ═══════════════════════════════════════════════════════

export interface ProjectBaseline {
  id: string;
  project_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

/** План-старт/финиш задачи из выбранного слепка (YYYY-MM-DD). */
export interface BaselineSpan {
  start: string;
  end: string;
}

const baselinesKey = (projectId: string) => ['project_baselines', projectId] as const;
const baselineTasksKey = (baselineId: string) => ['baseline_tasks', baselineId] as const;

/** Тост-текст по коду ошибки (паттерн parseDependencyError). */
function baselineError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  switch (e?.code) {
    case '42501':
      return 'Недостаточно прав для этого действия с планом';
    case '22023':
      return 'Название плана обязательно';
    case '23503':
      return 'Проект или задача не найдены';
    default:
      return e?.message ?? 'Не удалось выполнить операцию с планом';
  }
}

/** Список слепков проекта, свежие сверху. */
export function useProjectBaselines(projectId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: baselinesKey(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectBaseline[]> => {
      const { data, error } = await supabase
        .from('project_baselines')
        .select('id, project_id, name, created_by, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Строки выбранного слепка как Map<task_id, {start,end}> для ghost-баров. */
export function useBaselineTasks(baselineId: string | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: baselineTasksKey(baselineId ?? ''),
    enabled: !!baselineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baseline_tasks')
        .select('task_id, start_date, end_date')
        .eq('baseline_id', baselineId!);
      if (error) throw error;
      return new Map<string, BaselineSpan>(
        (data ?? []).map((r) => [r.task_id, { start: r.start_date, end: r.end_date }]),
      );
    },
  });
}

/** Зафиксировать план: RPC create_project_baseline (атомарный слепок одним стейтментом). */
export function useCreateBaseline(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useMutation({
    // Тост об ошибке зовём сами (baselineError) — глушим глобальный MutationCache.onError,
    // иначе на каждую ошибку два тоста.
    meta: { silentError: true },
    mutationFn: async (name: string) => {
      // RPC типизирован Returns: string — id нового baseline, каст не нужен.
      const { data, error } = await supabase.rpc('create_project_baseline', {
        p_project_id: projectId,
        p_name: name,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('План зафиксирован');
      queryClient.invalidateQueries({ queryKey: baselinesKey(projectId) });
    },
    onError: (err) => toast.error(baselineError(err)),
  });
}

/** Удалить слепок (hard, owner/admin). Оптимистик по 5-шаговой конвенции; тост на 42501. */
export function useDeleteBaseline(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useMutation({
    // Тост об ошибке зовём сами (baselineError) — глушим глобальный MutationCache.onError.
    meta: { silentError: true },
    mutationFn: async (baselineId: string) => {
      // .select() обязателен: RLS-deny (manager/viewer) удаляет 0 строк и НЕ отдаёт error.
      // Пустой data ⇒ прав нет ⇒ бросаем 42501, чтобы оптимистик откатился и всплыл тост.
      const { data, error } = await supabase
        .from('project_baselines')
        .delete()
        .eq('id', baselineId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        const denied = new Error('Недостаточно прав для удаления плана') as Error & { code?: string };
        denied.code = '42501';
        throw denied;
      }
      return baselineId;
    },
    onMutate: async (baselineId: string) => {
      await queryClient.cancelQueries({ queryKey: baselinesKey(projectId) });
      const previous = queryClient.getQueryData<ProjectBaseline[]>(baselinesKey(projectId));
      queryClient.setQueryData<ProjectBaseline[]>(baselinesKey(projectId), (old) =>
        (old ?? []).filter((b) => b.id !== baselineId),
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      // !== undefined, а не truthy: пустой снапшот [] тоже нужно откатить.
      if (ctx?.previous !== undefined) queryClient.setQueryData(baselinesKey(projectId), ctx.previous);
      toast.error(baselineError(err));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: baselinesKey(projectId) });
    },
  });
}
