'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from './use-auth';
import { useRealtimeSync } from './use-realtime';
import type { MessageReactionWithUser } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-CHAT-2: реакции на сообщения (068). Junction message<->user<->emoji.
// Агрегация на клиенте: чип «эмодзи × count», клик = toggle своей реакции.
// org_id/user_id проставляют trg_set_org_id + DEFAULT auth.uid() → клиент шлёт
// только {message_id, emoji}. Realtime — общий refcount-канал useRealtimeSync.
// ═══════════════════════════════════════════════════════

const REACTION_COLS = 'id, message_id, user_id, emoji, user:profiles!user_id(full_name, avatar_url)';

const reactionsKey = (projectId: string) => ['message_reactions', projectId] as const;

/** Одна агрегированная реакция под сообщением (одна пилюля-чип). */
export interface AggregatedReaction {
  emoji: string;
  count: number;
  /** Есть ли строка текущего пользователя в этой группе (подсветка + toggle-remove). */
  mine: boolean;
  /** Имена реакторов — для title-тултипа. */
  users: { name: string }[];
}

/**
 * Реакции для набора сообщений одной ленты. `messageIds` приходят от
 * useProjectMessages — без повторного fetch самой ленты.
 * Возврат: `byMessage` — Map<messageId, AggregatedReaction[]>.
 */
export function useMessageReactions(projectId: string, messageIds: string[]) {
  const supabase = createClient();
  const { user } = useAuth();
  const myId = user?.id ?? null;

  // Дефолтный ключ ['message_reactions'] префиксно инвалидирует ['message_reactions', projectId]
  // (как use-project-messages с ['project_messages', projectId]).
  useRealtimeSync('message_reactions');

  const query = useQuery({
    queryKey: reactionsKey(projectId),
    // W3: пустой .in() → PostgREST ошибка; при пустой ленте — просто нет запроса.
    enabled: messageIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_reactions')
        .select(REACTION_COLS)
        .in('message_id', messageIds)
        .order('created_at', { ascending: true }); // стабильный порядок чипов
      if (error) throw error;
      return (data ?? []) as unknown as MessageReactionWithUser[];
    },
  });

  // Группировка (message_id, emoji): count, mine, имена. Ключ агрегации
  // (message_id,user_id,emoji) идемпотентен — optimistic и realtime-эхо не удваиваются.
  const byMessage = useMemo(() => {
    const rows = query.data ?? [];
    const groups = new Map<string, Map<string, AggregatedReaction>>();
    for (const r of rows) {
      let perMsg = groups.get(r.message_id);
      if (!perMsg) {
        perMsg = new Map();
        groups.set(r.message_id, perMsg);
      }
      let agg = perMsg.get(r.emoji);
      if (!agg) {
        agg = { emoji: r.emoji, count: 0, mine: false, users: [] };
        perMsg.set(r.emoji, agg);
      }
      agg.count += 1;
      if (r.user_id === myId) agg.mine = true;
      agg.users.push({ name: r.user?.full_name ?? 'Участник' });
    }
    const map = new Map<string, AggregatedReaction[]>();
    for (const [msgId, perMsg] of groups) map.set(msgId, Array.from(perMsg.values()));
    return map;
  }, [query.data, myId]);

  return { byMessage };
}

/**
 * Toggle своей реакции на сообщение. `mine` вычисляет вызывающий из агрегации
 * (byMessage): true → DELETE своей строки, false → INSERT. Optimistic + rollback.
 */
export function useToggleReaction(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const myId = user?.id ?? null;

  return useMutation({
    mutationFn: async ({ messageId, emoji, mine }: { messageId: string; emoji: string; mine: boolean }) => {
      if (!myId) throw new Error('Нет активной сессии');
      if (mine) {
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .match({ message_id: messageId, user_id: myId, emoji });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('message_reactions')
          .insert({ message_id: messageId, emoji });
        // W5: 23505 (дубль по UNIQUE) — реакция уже стоит, тихий успех (invalidate синхронизирует).
        if (error && error.code !== '23505') throw error;
      }
    },
    onMutate: async ({ messageId, emoji, mine }) => {
      await queryClient.cancelQueries({ queryKey: reactionsKey(projectId) });
      const previous = queryClient.getQueryData<MessageReactionWithUser[]>(reactionsKey(projectId));
      queryClient.setQueryData<MessageReactionWithUser[]>(reactionsKey(projectId), (old) => {
        const rows = old ?? [];
        if (mine) {
          return rows.filter(
            (r) => !(r.message_id === messageId && r.emoji === emoji && r.user_id === myId),
          );
        }
        // Идемпотентно по (message_id,user_id,emoji) — не удваиваем, если строка уже есть.
        if (rows.some((r) => r.message_id === messageId && r.emoji === emoji && r.user_id === myId)) {
          return rows;
        }
        const optimistic: MessageReactionWithUser = {
          id: `temp-${Math.random().toString(36).slice(2)}`,
          org_id: '',
          message_id: messageId,
          user_id: myId ?? '',
          emoji,
          created_at: new Date().toISOString(),
          user: null,
        };
        return [...rows, optimistic];
      });
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(reactionsKey(projectId), ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: reactionsKey(projectId) });
    },
  });
}
