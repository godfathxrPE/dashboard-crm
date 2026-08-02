'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import {
  uploadChatAttachments,
  removeChatAttachmentObjects,
} from './use-message-attachments';
import type { MessageWithAuthor } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-CHAT-HUB-1a: лента сообщений канала (094). Прямой наследник use-project-messages
// (067): та же механика, ключ переехал с project_id на conversation_id — одна лента
// обслуживает и вкладку «Чат» на карточке, и хаб 1b.
//
// org_id проставляет trg_set_org_id, author_id — DEFAULT auth.uid() → клиент их НЕ
// передаёт (RLS INSERT дополнительно требует author_id = auth.uid()).
// Realtime — через общий refcount-менеджер useRealtimeSync (не свой канал).
// ═══════════════════════════════════════════════════════

const MESSAGE_COLS = `id, org_id, conversation_id, author_id, body, edited_at, created_at,
  author:profiles!author_id(id, full_name, avatar_url)`;

const messagesKey = (conversationId: string) => ['messages', conversationId] as const;

/** Optimistic-вставка помечается temp-id — realtime/refetch заменит реальной строкой. */
const TEMP_PREFIX = 'temp-';
export const isTempMessage = (m: MessageWithAuthor) => m.id.startsWith(TEMP_PREFIX);

/** Лента сообщений канала (старые сверху) + live-подписка. */
export function useMessages(conversationId: string) {
  const supabase = createClient();
  // Один канал на таблицу на всё приложение; инвалидируем весь срез ['messages'] —
  // при событии обновятся все открытые ленты (обычно одна). RLS режет чужие каналы.
  useRealtimeSync('messages');

  const query = useQuery({
    queryKey: messagesKey(conversationId),
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_COLS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MessageWithAuthor[];
    },
  });

  return { messages: query.data ?? [], isLoading: query.isLoading };
}

interface SendMessageInput {
  body: string;
  /** Текущий пользователь — для optimistic-строки (аватар/имя до ответа БД). */
  me: { id: string; full_name: string; avatar_url: string | null } | null;
  /** S-CHAT-HUB-1d: вложения. Проверены вызывающим (checkAttachmentBatch) ДО отправки. */
  files?: File[];
}

/** Результат отправки: само сообщение + признак «файлы не прицепились». */
export interface SendMessageResult {
  message: MessageWithAuthor;
  /**
   * Сообщение создано, а строки вложений — нет. Не ошибка отправки: откатывать уже
   * доставленное сообщение хуже, чем сказать про файлы. Вызывающий показывает
   * отдельный тост.
   */
  attachmentsFailed: boolean;
}

/**
 * Отправить сообщение. Optimistic: temp-строка сразу, invalidate заменит реальной.
 *
 * S-CHAT-HUB-1d, порядок жёсткий: id генерируется на клиенте → файлы уезжают в
 * `chat-files` по пути `<conversation_id>/<id>/…` → вставляется сообщение с ЯВНЫМ id →
 * вставляются строки вложений. Иначе путь в Storage неоткуда взять: он содержит
 * message_id, а тот появляется только после вставки.
 *
 * Если upload упал — сообщение НЕ отправляется вовсе (а не отправляется без файла):
 * пузырь без обещанного скриншота читается как «отправил», и человек уходит.
 */
export function useSendMessage(conversationId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ body, files }: SendMessageInput): Promise<SendMessageResult> => {
      const batch = files ?? [];
      const messageId = crypto.randomUUID();

      // Падение здесь — партия уже откатана внутри (все-или-ничего), сообщения нет.
      const uploaded =
        batch.length > 0 ? await uploadChatAttachments(conversationId, messageId, batch) : [];

      const { data, error } = await supabase
        .from('messages')
        .insert({ id: messageId, conversation_id: conversationId, body })
        .select(MESSAGE_COLS)
        .single();
      if (error) {
        // Сообщения не будет — байты в бакете станут сиротами, убираем сразу.
        await removeChatAttachmentObjects(uploaded.map((u) => u.storage_path)).catch(
          () => undefined,
        );
        throw error;
      }

      let attachmentsFailed = false;
      if (uploaded.length > 0) {
        const { error: attachError } = await supabase
          .from('message_attachments')
          .insert(uploaded.map((u) => ({ message_id: messageId, ...u })));
        // Объекты остаются в бакете сиротами — допустимо (решение спринта), чистилки
        // отдельной джобой в 1d нет.
        attachmentsFailed = !!attachError;
      }

      return { message: data as unknown as MessageWithAuthor, attachmentsFailed };
    },
    onMutate: async ({ body, me }) => {
      await queryClient.cancelQueries({ queryKey: messagesKey(conversationId) });
      const previous = queryClient.getQueryData<MessageWithAuthor[]>(messagesKey(conversationId));
      const temp: MessageWithAuthor = {
        id: `${TEMP_PREFIX}${Math.random().toString(36).slice(2)}`,
        org_id: '',
        conversation_id: conversationId,
        author_id: me?.id ?? null,
        body,
        edited_at: null,
        created_at: new Date().toISOString(),
        author: me,
      };
      queryClient.setQueryData<MessageWithAuthor[]>(messagesKey(conversationId), (old) => [
        ...(old ?? []),
        temp,
      ]);
      return { previous, tempId: temp.id };
    },
    onSuccess: ({ message: real }, _input, ctx) => {
      // Заменяем temp реальной строкой сразу (не ждём invalidate) — без дублей:
      // realtime-инвалидация затем просто перезапишет кэш тем же содержимым.
      queryClient.setQueryData<MessageWithAuthor[]>(messagesKey(conversationId), (old) => {
        const withoutTemp = (old ?? []).filter((m) => m.id !== ctx.tempId);
        return withoutTemp.some((m) => m.id === real.id) ? withoutTemp : [...withoutTemp, real];
      });
      // Вложения приезжают своим срезом — его кэш о новых строках не знает.
      queryClient.invalidateQueries({ queryKey: ['message_attachments'] });
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(messagesKey(conversationId), ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
    },
  });
}

/** Править своё сообщение (RLS: только автор; edited_at — штамп «изм.»). */
export function useEditMessage(conversationId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { data, error } = await supabase
        .from('messages')
        .update({ body, edited_at: new Date().toISOString() })
        .eq('id', id)
        .select(MESSAGE_COLS)
        .single();
      if (error) throw error;
      return data as unknown as MessageWithAuthor;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<MessageWithAuthor[]>(messagesKey(conversationId), (old) =>
        (old ?? []).map((m) => (m.id === updated.id ? updated : m)),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
    },
  });
}

/**
 * Удалить сообщение (hard; RLS: автор или org owner/admin). Optimistic с откатом.
 *
 * S-CHAT-HUB-1d: каскад БД уносит строки `message_attachments`, но НЕ объекты Storage —
 * бакет про внешние ключи не знает. Поэтому пути читаются ДО удаления (после каскада
 * читать уже нечего) и объекты сносятся после. Тот же приём, что в use-project-files.
 */
export function useDeleteMessage(conversationId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Ошибку чтения путей глотаем: она не повод оставить сообщение в ленте —
      // худший исход здесь сирота в бакете, а не потеря удаления.
      const { data: paths } = await supabase
        .from('message_attachments')
        .select('storage_path')
        .eq('message_id', id);

      const { error } = await supabase.from('messages').delete().eq('id', id);
      if (error) throw error;

      await removeChatAttachmentObjects((paths ?? []).map((p) => p.storage_path)).catch(
        () => undefined,
      );
      return id;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: messagesKey(conversationId) });
      const previous = queryClient.getQueryData<MessageWithAuthor[]>(messagesKey(conversationId));
      queryClient.setQueryData<MessageWithAuthor[]>(messagesKey(conversationId), (old) =>
        (old ?? []).filter((m) => m.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(messagesKey(conversationId), ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
    },
  });
}
