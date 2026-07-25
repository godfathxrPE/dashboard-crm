'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

// ═══════════════════════════════════════════════════════
// S-GANTT-BASELINE-1: слепки сроков проекта (план) для план/факт.
// Таблицы project_baselines + baseline_tasks и RPC create_project_baseline появятся
// в gen-типах ПОСЛЕ apply миграции 074 гейтом — до этого локальные типы-стабы (та же
// грабля database.ts≠supabase.gen.ts, что quotes/videos до регена).
// Запись заголовка — ТОЛЬКО RPC (SECURITY DEFINER): прямой INSERT заблокирован (INSERT-политик
// нет). Delete — hard, по RLS (owner/admin org), строки слепка уходят каскадом в БД.
// ═══════════════════════════════════════════════════════

export interface ProjectBaseline {
  id: string;
  project_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

interface BaselineTaskRow {
  task_id: string;
  start_date: string;
  end_date: string;
  is_milestone: boolean;
}

/** План-старт/финиш задачи из выбранного слепка (YYYY-MM-DD). */
export interface BaselineSpan {
  start: string;
  end: string;
}

// Стаб-типизация до регена: узкий интерфейс ровно под используемые вызовы. project_baselines,
// baseline_tasks и RPC create_project_baseline попадут в gen-типы ПОСЛЕ apply миграции 074
// гейтом — тогда каст `as unknown as BaselineDb` можно снять. Моделируем через `unknown`
// (никаких untyped-эскейпов), поэтому типы data корректны уже сейчас.
type PgError = { code?: string; message?: string } | null;
type SelectBuilder<T> = PromiseLike<{ data: T[] | null; error: PgError }> & {
  eq(col: string, val: string): SelectBuilder<T>;
  order(col: string, opts: { ascending: boolean }): SelectBuilder<T>;
};
interface FromBuilder<T> {
  select(cols: string): SelectBuilder<T>;
  // .delete().eq().select() — возвращаем удалённые строки: под RLS-deny их 0 БЕЗ error,
  // поэтому «удалил ли» определяем по числу строк, а не по error (см. useDeleteBaseline).
  delete(): { eq(col: string, val: string): { select(cols: string): PromiseLike<{ data: { id: string }[] | null; error: PgError }> } };
}
interface BaselineDb {
  from(table: 'project_baselines'): FromBuilder<ProjectBaseline>;
  from(table: 'baseline_tasks'): FromBuilder<BaselineTaskRow>;
  rpc(
    fn: 'create_project_baseline',
    args: { p_project_id: string; p_name: string },
  ): PromiseLike<{ data: string | null; error: PgError }>;
}
const baselineDb = (): BaselineDb => createClient() as unknown as BaselineDb;

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
  const supabase = baselineDb();
  return useQuery({
    queryKey: baselinesKey(projectId),
    enabled: !!projectId,
    queryFn: async () => {
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
  const supabase = baselineDb();
  return useQuery({
    queryKey: baselineTasksKey(baselineId ?? ''),
    enabled: !!baselineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baseline_tasks')
        .select('task_id, start_date, end_date, is_milestone')
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
  const supabase = baselineDb();
  const queryClient = useQueryClient();
  return useMutation({
    // Тост об ошибке зовём сами (baselineError) — глушим глобальный MutationCache.onError,
    // иначе на каждую ошибку два тоста.
    meta: { silentError: true },
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc('create_project_baseline', {
        p_project_id: projectId,
        p_name: name,
      });
      if (error) throw error;
      return data as string; // id нового baseline (RPC возвращает uuid при успехе)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: baselinesKey(projectId) });
    },
    onError: (err) => toast.error(baselineError(err)),
  });
}

/** Удалить слепок (hard, owner/admin). Оптимистик по 5-шаговой конвенции; тост на 42501. */
export function useDeleteBaseline(projectId: string) {
  const supabase = baselineDb();
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
      if (ctx?.previous) queryClient.setQueryData(baselinesKey(projectId), ctx.previous);
      toast.error(baselineError(err));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: baselinesKey(projectId) });
    },
  });
}
