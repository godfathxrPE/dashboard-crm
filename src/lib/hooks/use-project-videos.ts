'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { ProjectVideo, ProjectVideoInsert } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-VIDEO-EMBED-1: видео-материалы проекта (066).
// org_id проставляет триггер trg_set_org_id, created_by — DEFAULT auth.uid()
// → клиент их НЕ передаёт. Hard-delete по RLS (owner/admin ∨ ownership проекта).
// Без realtime — раздел низкочастотный, invalidate после мутаций достаточно.
// ═══════════════════════════════════════════════════════

const VIDEO_COLS = 'id, org_id, project_id, url, provider, title, sort_order, created_by, created_at';

const videosKey = (projectId: string) => ['project_videos', projectId] as const;

/** Видео проекта в порядке добавления (sort_order). */
export function useProjectVideos(projectId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: videosKey(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_videos')
        .select(VIDEO_COLS)
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectVideo[];
    },
  });
}

/** Добавить видео (url + stored provider для badge + опц. title). */
export function useAddVideo(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<ProjectVideoInsert, 'project_id' | 'org_id' | 'created_by'>) => {
      const { data, error } = await supabase
        .from('project_videos')
        .insert({ ...input, project_id: projectId })
        .select(VIDEO_COLS)
        .single();
      if (error) throw error;
      return data as ProjectVideo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: videosKey(projectId) });
    },
  });
}

/** Удалить видео (hard-delete). Optimistic: строка исчезает сразу, откат при ошибке. */
export function useDeleteVideo(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_videos').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: videosKey(projectId) });
      const previous = queryClient.getQueryData<ProjectVideo[]>(videosKey(projectId));
      queryClient.setQueryData<ProjectVideo[]>(videosKey(projectId), (old) =>
        (old ?? []).filter((v) => v.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(videosKey(projectId), ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: videosKey(projectId) });
    },
  });
}
