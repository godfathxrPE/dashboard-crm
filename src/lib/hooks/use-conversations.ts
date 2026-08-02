'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from './use-auth';
import { useRealtimeSync } from './use-realtime';
import type { Conversation } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-CHAT-HUB-1a: каналы (094). Сообщение висит на КАНАЛЕ, а не на проекте — чат
// проекта это conversation с kind='project'.
//
// Каналы СИСТЕМНЫЕ: general заводит сидер на organizations, project — сидер на
// projects, INSERT-политик у клиента нет. Поэтому здесь только чтение + отметка
// прочтения; мутации «создать канал» не будет и в 1b.
// ═══════════════════════════════════════════════════════

const CONVERSATION_COLS = 'id, org_id, kind, project_id, title, created_by, created_at';

/**
 * Заголовок общего канала организации. Экспортируется: одна строка обслуживает и
 * список каналов, и заголовок треда — расхождение названия между хабом и лентой
 * читалось бы как два разных канала.
 */
export const GENERAL_CHANNEL_TITLE = 'Общий чат';

/** Канал проекта — свой ключ: он статичен и живёт дольше, чем список. */
const projectConversationKey = (projectId: string) =>
  ['conversations', 'project', projectId] as const;
/** Список каналов юзера — отдельный ключ, инвалидируется на каждое сообщение. */
const conversationsListKey = ['conversations', 'list'] as const;

/**
 * Канал проекта. `staleTime` длинный: канал заводится сидером один раз и не меняется —
 * рефетчить его на каждый фокус окна незачем.
 *
 * `null` в data — не ошибка сети, а «канала нет» (проект создан до бэкфилла 094).
 * Вызывающий обязан отличать это состояние от загрузки.
 */
export function useProjectConversation(projectId: string) {
  const supabase = createClient();

  const query = useQuery({
    queryKey: projectConversationKey(projectId),
    enabled: !!projectId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_COLS)
        .eq('project_id', projectId)
        .eq('kind', 'project')
        // maybeSingle, НЕ single: отсутствие канала — легальный ответ (PGRST116 у single
        // прилетел бы как ошибка и увёл ветку рендера не туда).
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Conversation | null;
    },
  });

  return {
    conversation: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/** Строка списка каналов: сам канал + когда в нём писали в последний раз. */
export interface ConversationListItem {
  conversation: Conversation;
  /**
   * Заголовок строки: общий канал — константа, проектный — имя проекта.
   * Колонку `conversations.title` НЕ читаем: она заведена под группы (1c) и у
   * системных каналов пуста — fallback на неё закрепил бы несуществующую семантику.
   */
  title: string;
  /** ISO последнего сообщения; null — в канале пусто. */
  lastMessageAt: string | null;
  hasUnread: boolean;
}

/** Форма ответа PostgREST: канал + вложенные срезы. Оба embed'а — массивы. */
type ConversationRow = Conversation & {
  messages: { created_at: string }[];
  conversation_reads: { last_read_at: string }[];
  // to-one embed (FK conversations.project_id → projects.id) — объект, а не массив;
  // null, если у канала нет проекта (kind='general') или проект не виден по RLS.
  project: { name: string } | null;
};

/**
 * Список каналов текущего пользователя (что видно — режет RLS через
 * `is_conversation_member`). Написан в 1a, потребитель — хаб-UI 1b.
 *
 * Последнее сообщение берётся вложенным ресурсом: order/limit применяются к embed'у
 * через `referencedTable` — это документированный синтаксис PostgREST, а не строковый
 * трюк внутри select. Один запрос вместо N+1.
 *
 * `conversation_reads` фильтровать по user_id не нужно: RLS отдаёт только свою строку.
 */
export function useConversations() {
  const supabase = createClient();
  // Канал статичен (создаётся сидером) — подписка на `conversations` не нужна.
  // Список пересобираем на события `messages`: меняется порядок и бейджи.
  useRealtimeSync('messages', ['conversations', 'list']);

  const query = useQuery({
    queryKey: conversationsListKey,
    // Хук поднят в сайдбар (1b) → монтируется на каждой странице. staleTime как у
    // calls/leads: свежесть держит realtime-инвалидация на `messages`, а не рефетч
    // по фокусу окна.
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(
          `${CONVERSATION_COLS}, project:projects(name), messages(created_at), conversation_reads(last_read_at)`,
        )
        .order('created_at', { referencedTable: 'messages', ascending: false })
        .limit(1, { referencedTable: 'messages' });
      if (error) throw error;

      const rows = (data ?? []) as unknown as ConversationRow[];
      const items: ConversationListItem[] = rows.map((row) => {
        const { messages, conversation_reads, project, ...conversation } = row;
        const lastMessageAt = messages[0]?.created_at ?? null;
        const lastReadAt = conversation_reads[0]?.last_read_at ?? null;
        return {
          conversation,
          // Проект мог не подтянуться (удалён/невиден) — канал в списке остаётся,
          // но без имени: пустая строка хуже нейтральной заглушки.
          title:
            conversation.kind === 'general' ? GENERAL_CHANNEL_TITLE : project?.name ?? 'Проект',
          lastMessageAt,
          // Ни разу не открывал канал, а сообщения есть → непрочитано. ISO-строки
          // сравнимы лексикографически (обе из Postgres, один формат и зона).
          hasUnread: lastMessageAt !== null && (lastReadAt === null || lastMessageAt > lastReadAt),
        };
      });

      // Живые каналы вверху; пустые — по дате создания (внутри группы порядок стабилен).
      return items.sort((a, b) => {
        if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.localeCompare(a.lastMessageAt);
        if (a.lastMessageAt) return -1;
        if (b.lastMessageAt) return 1;
        return b.conversation.created_at.localeCompare(a.conversation.created_at);
      });
    },
  });

  return { conversations: query.data ?? [], isLoading: query.isLoading };
}

/**
 * Отметить канал прочитанным. Upsert по PK (conversation_id, user_id) — строка у пары
 * ровно одна, повторный вызов просто двигает штамп.
 *
 * `user_id` шлём явно, хотя в БД он DEFAULT auth.uid(): для ON CONFLICT нужен полный
 * ключ конфликта в payload, а RLS всё равно проверит совпадение с auth.uid().
 */
export function useMarkRead(conversationId: string | null) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const myId = user?.id ?? null;

  return useMutation({
    mutationFn: async () => {
      if (!conversationId || !myId) return;
      const { error } = await supabase
        .from('conversation_reads')
        .upsert(
          {
            conversation_id: conversationId,
            user_id: myId,
            last_read_at: new Date().toISOString(),
          },
          { onConflict: 'conversation_id,user_id' },
        );
      if (error) throw error;
    },
    // Бейджи живут в списке; тред от своей же отметки не перерисовывается.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationsListKey });
    },
    // Молча: отметка прочтения — фоновая гигиена, тост о ней был бы шумом.
  });
}
