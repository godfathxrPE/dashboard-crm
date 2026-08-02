'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from './use-auth';
import type { ConversationMemberWithProfile } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-CHAT-HUB-1c: состав ГРУППЫ (096).
//
// Таблица `conversation_members` существует только ради kind='group': у общего канала
// и канала проекта членство ВЫЧИСЛЯЕТСЯ в is_conversation_member() (вся org / зеркало
// видимости проекта) и строк не имеет. Поэтому все хуки здесь зовутся с enabled-гардом
// по kind — запрос на project-канал вернул бы пустой массив и читался бы как «в канале
// никого», хотя людей там полно.
//
// Создание группы живёт в use-conversations (RPC), а не здесь: там же лежит список,
// который создание инвалидирует.
// ═══════════════════════════════════════════════════════

const MEMBER_COLS = `conversation_id, profile_id, org_id, added_by, created_at,
  profile:profiles!profile_id(id, full_name, avatar_url)`;

export const conversationMembersKey = (conversationId: string) =>
  ['conversation-members', conversationId] as const;

/** Тот же ключ, что в use-conversations — список каналов инвалидируют обе стороны. */
const conversationsListKey = ['conversations', 'list'] as const;

/**
 * Состав канала с профилями.
 *
 * `enabled` — второй гард поверх `conversationId`: вызывающий передаёт сюда
 * `kind === 'group'`. Без него шапка треда ходила бы за участниками общего канала.
 */
export function useConversationMembers(conversationId: string | null, enabled = true) {
  const supabase = createClient();

  const query = useQuery({
    queryKey: conversationMembersKey(conversationId ?? ''),
    enabled: !!conversationId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_members')
        .select(MEMBER_COLS)
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ConversationMemberWithProfile[];
    },
  });

  return { members: query.data ?? [], isLoading: query.isLoading };
}

/** Профиль для optimistic-строки: у вызывающего он уже есть из useTeamMembers(). */
export interface AddMemberInput {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

/**
 * Добавить участников (RLS: автор канала или org owner/admin, и только в группу).
 *
 * `org_id` не шлём — его ставит триггер set_org_id; `added_by` приходит из
 * DEFAULT auth.uid(). Optimistic: список участников открыт в модалке, и задержка
 * в полсекунды на каждой галочке читалась бы как «не сработало».
 */
export function useAddMembers(conversationId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const key = conversationMembersKey(conversationId);

  return useMutation({
    mutationFn: async (members: AddMemberInput[]) => {
      if (members.length === 0) return;
      const { error } = await supabase
        .from('conversation_members')
        .insert(members.map((m) => ({ conversation_id: conversationId, profile_id: m.id })));
      if (error) throw error;
    },
    onMutate: async (members) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ConversationMemberWithProfile[]>(key);
      queryClient.setQueryData<ConversationMemberWithProfile[]>(key, (old) => {
        const rows = old ?? [];
        const known = new Set(rows.map((r) => r.profile_id));
        const added = members
          .filter((m) => !known.has(m.id))
          .map((m) => ({
            conversation_id: conversationId,
            profile_id: m.id,
            // org_id/added_by проставит БД — до ответа их значения неизвестны, и
            // выдумывать их нельзя: строка живёт в кеше до invalidate.
            org_id: '',
            added_by: null,
            created_at: new Date().toISOString(),
            profile: { id: m.id, full_name: m.full_name, avatar_url: m.avatar_url },
          }));
        return [...rows, ...added];
      });
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      // Список каналов — у добавленного канал появится, но у СЕБЯ состав не меняет
      // видимость; инвалидируем ради счётчика участников в шапке.
      queryClient.invalidateQueries({ queryKey: conversationsListKey });
    },
  });
}

/**
 * Убрать участника (RLS: автор канала или org owner/admin; своя строка — тоже, но для
 * выхода есть отдельный хук с другим побочным эффектом).
 */
export function useRemoveMember(conversationId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const key = conversationMembersKey(conversationId);

  return useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase
        .from('conversation_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('profile_id', profileId);
      if (error) throw error;
    },
    onMutate: async (profileId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ConversationMemberWithProfile[]>(key);
      queryClient.setQueryData<ConversationMemberWithProfile[]>(key, (old) =>
        (old ?? []).filter((m) => m.profile_id !== profileId),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: conversationsListKey });
    },
  });
}

/**
 * Выйти из группы — удалить СВОЮ строку (единственный механизм выхода, отдельной
 * колонки «вышел» нет).
 *
 * Optimistic-правки состава здесь нет намеренно: после успеха канал перестаёт быть
 * виден по RLS, и кеш состава всё равно уезжает в мусор — вызывающий обязан увести
 * пользователя с канала (снять `?c=`) в своём `onSuccess`.
 *
 * Автору выход не предлагается (кнопки нет): `created_by` не меняется, и вышедший автор
 * сохранил бы право управлять группой, которую перестал видеть. Ограничение UI-уровня —
 * политика 096 своей строке выйти разрешает.
 */
export function useLeaveConversation(conversationId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const myId = user?.id ?? null;

  return useMutation({
    mutationFn: async () => {
      if (!myId) throw new Error('Нет активной сессии');
      const { error } = await supabase
        .from('conversation_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('profile_id', myId);
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: conversationMembersKey(conversationId) });
      queryClient.invalidateQueries({ queryKey: conversationsListKey });
    },
  });
}
