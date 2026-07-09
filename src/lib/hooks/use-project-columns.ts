'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import type { ProjectColumn } from '@/types/entities';
import type { ColumnCategory } from '@/types/database';

/**
 * PCT-1: колонки проектной доски (per-project custom Kanban columns).
 * RLS SELECT — org-wide, поэтому member видит колонки даже в чужом проекте.
 *
 * Ключ ['project_columns', projectId] — префикс совпадает с именем таблицы,
 * поэтому useRealtimeSync('project_columns') инвалидирует его автоматически.
 */
export function useProjectColumns(projectId: string) {
  const supabase = createClient();
  useRealtimeSync('project_columns');

  return useQuery({
    queryKey: ['project_columns', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_columns')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true });

      if (error) throw error;
      return data as ProjectColumn[];
    },
    enabled: !!projectId,
  });
}

/** Создать колонку. position — в конец (max+1), вычисляем от текущего кеша. */
export function useCreateColumn(projectId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; category: ColumnCategory; position?: number }) => {
      const { data, error } = await supabase
        .from('project_columns')
        .insert({ project_id: projectId, ...input })
        .select()
        .single();

      if (error) throw error;
      return data as ProjectColumn;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['project_columns', projectId] }),
  });
}

/** Переименовать / сменить category / переставить колонку. */
export function useUpdateColumn(projectId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & Partial<Pick<ProjectColumn, 'name' | 'category' | 'position' | 'wip_limit'>>) => {
      const { data, error } = await supabase
        .from('project_columns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ProjectColumn;
    },
    onMutate: async ({ id, ...updates }) => {
      const key = ['project_columns', projectId];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ProjectColumn[]>(key);
      qc.setQueryData<ProjectColumn[]>(key, (old) =>
        (old ?? []).map((c) => (c.id === id ? { ...c, ...updates } : c)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(['project_columns', projectId], ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['project_columns', projectId] });
      // смена category каскадит lane задач (триггер) → освежаем и tasks
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Удалить колонку через RPC (клиентский bulk-update чужих задач упрётся в RLS).
 * targetId обязателен, если в колонке есть задачи.
 */
export function useDeleteColumn(projectId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, targetId }: { id: string; targetId?: string | null }) => {
      const { error } = await supabase.rpc('delete_project_column', {
        p_column_id: id,
        p_target_column_id: targetId ?? null,
      });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['project_columns', projectId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
