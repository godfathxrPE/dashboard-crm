'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import type { ProjectMessageWithAuthor } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-CHAT-1: чат проекта (067). Отдельный модуль — НЕ activity_log/EntityTimeline.
// org_id проставляет trg_set_org_id, author_id — DEFAULT auth.uid() → клиент
// их НЕ передаёт (RLS INSERT дополнительно требует author_id = auth.uid()).
// Realtime — через общий refcount-менеджер useRealtimeSync (не свой канал).
// ═══════════════════════════════════════════════════════

const MESSAGE_COLS = `id, org_id, project_id, author_id, body, edited_at, created_at,
  author:profiles!author_id(id, full_name, avatar_url)`;

const messagesKey = (projectId: string) => ['project_messages', projectId] as const;

/** Optimistic-вставка помечается temp-id — realtime/refetch заменит реальной строкой. */
const TEMP_PREFIX = 'temp-';
export const isTempMessage = (m: ProjectMessageWithAuthor) => m.id.startsWith(TEMP_PREFIX);

/** Лента сообщений проекта (старые сверху) + live-подписка. */
export function useProjectMessages(projectId: string) {
  const supabase = createClient();
  // Один канал на таблицу на всё приложение; инвалидируем весь срез ['project_messages'] —
  // при событии обновятся все открытые проекты (обычно один). RLS режет чужие проекты.
  useRealtimeSync('project_messages');

  const query = useQuery({
    queryKey: messagesKey(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_messages')
        .select(MESSAGE_COLS)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectMessageWithAuthor[];
    },
  });

  return { messages: query.data ?? [], isLoading: query.isLoading };
}

interface SendMessageInput {
  body: string;
  /** Текущий пользователь — для optimistic-строки (аватар/имя до ответа БД). */
  me: { id: string; full_name: string; avatar_url: string | null } | null;
}

/** Отправить сообщение. Optimistic: temp-строка сразу, invalidate заменит реальной. */
export function useSendMessage(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ body }: SendMessageInput) => {
      const { data, error } = await supabase
        .from('project_messages')
        .insert({ project_id: projectId, body })
        .select(MESSAGE_COLS)
        .single();
      if (error) throw error;
      return data as unknown as ProjectMessageWithAuthor;
    },
    onMutate: async ({ body, me }) => {
      await queryClient.cancelQueries({ queryKey: messagesKey(projectId) });
      const previous = queryClient.getQueryData<ProjectMessageWithAuthor[]>(messagesKey(projectId));
      const temp: ProjectMessageWithAuthor = {
        id: `${TEMP_PREFIX}${Math.random().toString(36).slice(2)}`,
        org_id: '',
        project_id: projectId,
        author_id: me?.id ?? null,
        body,
        edited_at: null,
        created_at: new Date().toISOString(),
        author: me,
      };
      queryClient.setQueryData<ProjectMessageWithAuthor[]>(messagesKey(projectId), (old) => [
        ...(old ?? []),
        temp,
      ]);
      return { previous, tempId: temp.id };
    },
    onSuccess: (real, _input, ctx) => {
      // Заменяем temp реальной строкой сразу (не ждём invalidate) — без дублей:
      // realtime-инвалидация затем просто перезапишет кэш тем же содержимым.
      queryClient.setQueryData<ProjectMessageWithAuthor[]>(messagesKey(projectId), (old) => {
        const withoutTemp = (old ?? []).filter((m) => m.id !== ctx.tempId);
        return withoutTemp.some((m) => m.id === real.id) ? withoutTemp : [...withoutTemp, real];
      });
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(messagesKey(projectId), ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey(projectId) });
    },
  });
}

/** Править своё сообщение (RLS: только автор; edited_at — штамп «изм.»). */
export function useEditMessage(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { data, error } = await supabase
        .from('project_messages')
        .update({ body, edited_at: new Date().toISOString() })
        .eq('id', id)
        .select(MESSAGE_COLS)
        .single();
      if (error) throw error;
      return data as unknown as ProjectMessageWithAuthor;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<ProjectMessageWithAuthor[]>(messagesKey(projectId), (old) =>
        (old ?? []).map((m) => (m.id === updated.id ? updated : m)),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey(projectId) });
    },
  });
}

/** Удалить сообщение (hard; RLS: автор или org owner/admin). Optimistic с откатом. */
export function useDeleteMessage(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_messages').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: messagesKey(projectId) });
      const previous = queryClient.getQueryData<ProjectMessageWithAuthor[]>(messagesKey(projectId));
      queryClient.setQueryData<ProjectMessageWithAuthor[]>(messagesKey(projectId), (old) =>
        (old ?? []).filter((m) => m.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(messagesKey(projectId), ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey(projectId) });
    },
  });
}
