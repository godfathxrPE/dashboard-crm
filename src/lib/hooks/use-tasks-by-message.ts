'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import { fetchInBatches } from '@/lib/utils/query-batching';
import type { TaskLane } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-CHAT-TASK-1: какие сообщения ленты уже превращены в задачи (099).
//
// Один запрос на ленту, а не на сообщение — тот же приём, что у реакций (068) и
// вложений (1d): `.in('source_message_id', …id ленты…)`.
//
// ⚠️ КЛЮЧ КЭША НАМЕРЕННО НЕ ПОД ПРЕФИКСОМ ['tasks']. `use-tasks` патчит ВСЕ срезы
//    этого префикса (`setQueriesData({queryKey: ['tasks']})`) литералами `Task[]` —
//    личный борд, доска проекта, Гант. Наш срез хранит другую форму и в эту механику
//    не укладывается: попав под префикс, он был бы затёрт первым же optimistic-апдейтом
//    задачи. Взамен подписываемся на ту же таблицу через `useRealtimeSync` со СВОИМ
//    ключом — инвалидация приезжает, форму никто не трогает.
//
// ⚠️ RLS ЧЕСТНО МОЖЕТ ОТДАТЬ ПУСТО. Политики `tasks` — «свои + проекты, где я
//    участник»; задача, созданная по сообщению другим человеком и назначенная третьему,
//    для читателя невидима. Значит «иконка показывает „создать“» НЕ означает «задачи
//    нет»: единственная настоящая защита от дубля — unique-индекс в БД, и вызывающий
//    обязан уметь показать его отказ (23505) человеческим текстом.
// ═══════════════════════════════════════════════════════

/** Минимум для ленты: показать «задача создана» и увести к ней. */
export interface TaskFromMessage {
  id: string;
  text: string;
  lane: TaskLane;
  deadline: string | null;
  assigned_to: string | null;
  source_message_id: string;
}

const COLS = 'id, text, lane, deadline, assigned_to, source_message_id';

/** Корень ключа — цель точечной инвалидации после создания задачи из чата. */
export const TASKS_BY_MESSAGE_KEY = ['tasks-by-message'] as const;

/**
 * Полный ключ среза. Кроме канала в нём длина ленты и последний id — производная от
 * `messageIds`, от которых зависит РЕЗУЛЬТАТ запроса. Без них инвалидация, пришедшая
 * раньше рефетча ленты, ушла бы со старым списком и закэшировала неполный ответ под
 * ключом, который больше не изменится (та же механика, что у вложений). Лента грузится
 * целиком и монотонна, поэтому пары достаточно.
 *
 * Инвалидация идёт ПРЕФИКСОМ `TASKS_BY_MESSAGE_KEY` — удлинение ключа её не ломает.
 */
const tasksByMessageKey = (conversationId: string, ids: readonly string[]) =>
  [...TASKS_BY_MESSAGE_KEY, conversationId, ids.length, ids[ids.length - 1] ?? ''] as const;

const EMPTY: ReadonlyMap<string, TaskFromMessage> = new Map();

export function useTasksBySourceMessages(conversationId: string, messageIds: string[]) {
  const supabase = createClient();
  // Таблица `tasks`, ключ — свой (см. шапку). Дефолтный ключ ['tasks-by-message']
  // префиксно накрывает ['tasks-by-message', conversationId].
  useRealtimeSync('tasks', TASKS_BY_MESSAGE_KEY);

  const query = useQuery({
    queryKey: tasksByMessageKey(conversationId, messageIds),
    // Пустой `.in()` роняет PostgREST (грабля W3 из 068) — при пустой ленте запроса нет.
    enabled: messageIds.length > 0,
    // Длинный `.in()` роняет его же (лимит длины URL) — режем ленту на батчи.
    queryFn: () =>
      fetchInBatches(messageIds, async (batch) => {
        const { data, error } = await supabase
          .from('tasks')
          .select(COLS)
          .in('source_message_id', batch);
        if (error) throw error;
        return (data ?? []) as unknown as TaskFromMessage[];
      }),
  });

  const byMessage = useMemo(() => {
    if (!query.data?.length) return EMPTY;
    const map = new Map<string, TaskFromMessage>();
    // Одно сообщение → одна задача (uq_tasks_source_message); при гонке до применения
    // 099 выигрывает первая — второй записи в БД просто не будет.
    for (const t of query.data) if (!map.has(t.source_message_id)) map.set(t.source_message_id, t);
    return map;
  }, [query.data]);

  return { byMessage };
}

/** Инвалидация после создания задачи из чата — иконка сообщения должна смениться сразу. */
export function useInvalidateTasksByMessage() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: TASKS_BY_MESSAGE_KEY });
}
