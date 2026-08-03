'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import { attachmentStoragePath } from '@/lib/utils/chat-attachments';
import { fetchInBatches } from '@/lib/utils/query-batching';
import type { MessageAttachment } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-CHAT-HUB-1d: вложения сообщений (097).
//
// Байты — в приватном бакете `chat-files`, метаданные — в `message_attachments`.
// Путь объекта: <conversation_id>/<message_id>/<uuid>.<ext>. Первый сегмент — канал,
// и именно на нём стоит проверка доступа (`can_access_chat_file` → is_conversation_member):
// вложение обязан видеть весь канал, а не только загрузивший, поэтому own-path модель
// `project-files` (055) сюда не годится.
//
// Ключ хранилища НИКОГДА не строится из имени файла: кириллица, пробелы и `../` — это
// проблема ключа, а не отображения. Исходное имя живёт только в `file_name`.
// ═══════════════════════════════════════════════════════

export const CHAT_BUCKET = 'chat-files';

// Лимиты партии, формат размера, разбор расширения и сборка ключа — в utils
// (чистая логика, покрыта тестами). Реэкспорт: потребителям хука незачем знать,
// что часть правил живёт в соседнем модуле.
export {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  isImageAttachment,
  formatAttachmentSize,
  checkAttachmentBatch,
  attachmentProblemMessage,
  attachmentStoragePath,
  type AttachmentBatchProblem,
} from '@/lib/utils/chat-attachments';

/** Сколько живёт подписанная ссылка. 60 с — как в use-project-files. */
const SIGNED_URL_TTL_SEC = 60;

const ATTACHMENT_COLS =
  'id, org_id, message_id, storage_path, file_name, file_size, mime_type, created_by, created_at';

/**
 * Ключ среза вложений.
 *
 * ⚠️ В ключе есть производная от `messageIds` — длина и последний id. Без них ключ не
 * зависел бы от того, от чего зависит запрос: входящее сообщение с вложением приезжает
 * ДВУМЯ realtime-событиями разных таблиц (`messages` и `message_attachments`), у каждого
 * свой 150-мс дебаунс, и порядок не гарантирован. Отработай инвалидация вложений раньше
 * рефетча ленты — запрос ушёл бы со СТАРЫМ `messageIds`, вернул пусто, а после дозагрузки
 * ленты ключ бы не изменился и второго запроса не было. Пользователь видел бы пустой
 * прямоугольник вместо скриншота до смены канала или F5.
 *
 * Пары «длина + последний id» достаточно: лента грузится целиком и монотонна.
 *
 * Инвалидация в use-messages идёт ПРЕФИКСОМ `['message_attachments']` — удлинение ключа
 * её не ломает (проверено грепом по invalidateQueries).
 */
const attachmentsKey = (conversationId: string, ids: readonly string[]) =>
  ['message_attachments', conversationId, ids.length, ids[ids.length - 1] ?? ''] as const;
const signedUrlKey = (path: string) => ['message_attachment-url', path] as const;

/**
 * Вложения для набора сообщений одной ленты — одним запросом, без N+1.
 * `messageIds` приходят из уже загруженной ленты (приём use-message-reactions).
 *
 * Возврат — `Map<messageId, MessageAttachment[]>`.
 */
export function useMessageAttachments(conversationId: string, messageIds: string[]) {
  const supabase = createClient();
  // Дефолтный ключ ['message_attachments'] префиксно инвалидирует
  // ['message_attachments', conversationId] — как в use-messages / use-message-reactions.
  useRealtimeSync('message_attachments');

  const query = useQuery({
    queryKey: attachmentsKey(conversationId, messageIds),
    // Пустой `.in()` роняет PostgREST (грабля W3 из 068) — при пустой ленте запроса нет.
    enabled: messageIds.length > 0,
    // Длинный `.in()` роняет его же (лимит длины URL) — режем ленту на батчи.
    // Порядок между батчами не сохраняется; здесь он и не нужен — ниже раскладка в Map,
    // а внутри сообщения порядок держит `.order('created_at')` каждого батча
    // (вложения одного сообщения всегда попадают в один батч: батчим по message_id).
    queryFn: () =>
      fetchInBatches(messageIds, async (batch) => {
        const { data, error } = await supabase
          .from('message_attachments')
          .select(ATTACHMENT_COLS)
          .in('message_id', batch)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []) as unknown as MessageAttachment[];
      }),
  });

  const byMessage = useMemo(() => {
    const map = new Map<string, MessageAttachment[]>();
    for (const a of query.data ?? []) {
      const list = map.get(a.message_id);
      if (list) list.push(a);
      else map.set(a.message_id, [a]);
    }
    return map;
  }, [query.data]);

  return { byMessage, isLoading: query.isLoading };
}

/**
 * Подписанная ссылка на объект. Кэш react-query живёт 50 секунд — меньше срока жизни
 * самой ссылки (60 с): протухшая ссылка в кэше выглядела бы как битая картинка, а
 * запас в 10 секунд закрывает и время рендера, и клик по свежеотданному URL.
 *
 * `enabled` управляет моментом запроса: превью просит ссылку сразу, файл-строка — нет
 * (её URL нужен только по клику на «Скачать»).
 */
export function useAttachmentUrl(storagePath: string | null, enabled = true) {
  const supabase = createClient();

  const query = useQuery({
    queryKey: signedUrlKey(storagePath ?? ''),
    enabled: !!storagePath && enabled,
    staleTime: (SIGNED_URL_TTL_SEC - 10) * 1000,
    gcTime: SIGNED_URL_TTL_SEC * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(CHAT_BUCKET)
        .createSignedUrl(storagePath!, SIGNED_URL_TTL_SEC);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Не удалось получить ссылку на файл');
      return data.signedUrl;
    },
  });

  return {
    url: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    /** Вкладка провисела дольше минуты → картинка не загрузилась: перевыпустить ссылку. */
    refetch: query.refetch,
  };
}

/**
 * Скачать вложение: свежая ссылка по требованию + клик по временной `<a download>`.
 * Ссылка НЕ берётся из кэша — вкладка могла провисеть дольше минуты, и «скачалось
 * ничего» хуже лишнего запроса (приём useDownloadProjectFile).
 */
export function useDownloadAttachment() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return async (attachment: Pick<MessageAttachment, 'storage_path' | 'file_name'>) => {
    const { data, error } = await supabase.storage
      .from(CHAT_BUCKET)
      .createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SEC);
    if (error || !data?.signedUrl) {
      throw error ?? new Error('Не удалось получить ссылку на файл');
    }
    // Свежая ссылка заодно освежает кэш превью того же объекта.
    queryClient.setQueryData(signedUrlKey(attachment.storage_path), data.signedUrl);

    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.download = attachment.file_name;
    link.click();
  };
}

/** Метаданные загруженного объекта — то, что уедет строкой в message_attachments. */
export interface UploadedAttachment {
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
}

/**
 * Загрузить партию файлов в бакет. Возвращает метаданные для вставки строк.
 *
 * НЕ хук и не мутация намеренно: вызывается изнутри `useSendMessage` в строгом порядке
 * (upload → insert message → insert attachments), а мутация внутри мутации дала бы два
 * независимых состояния isPending на одно действие пользователя.
 *
 * Все-или-ничего: упавший файл откатывает уже загруженные. Иначе в бакете остаются
 * байты, на которые никогда не появится строка — а чистилки сирот в проекте нет.
 */
export async function uploadChatAttachments(
  conversationId: string,
  messageId: string,
  files: File[],
): Promise<UploadedAttachment[]> {
  const supabase = createClient();
  const uploaded: UploadedAttachment[] = [];

  try {
    for (const file of files) {
      const path = attachmentStoragePath(conversationId, messageId, file.name);
      const { error } = await supabase.storage.from(CHAT_BUCKET).upload(path, file, {
        // upsert не нужен: имя содержит свежий uuid, коллизия невозможна, а `true`
        // молча перезаписал бы чужой объект при (невозможном) совпадении.
        upsert: false,
        contentType: file.type || undefined,
      });
      if (error) throw error;
      uploaded.push({
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
      });
    }
    return uploaded;
  } catch (e) {
    if (uploaded.length > 0) {
      // Откат best-effort: если и он не прошёл, сирота остаётся — записано в бэклог,
      // отдельной джобы-чистилки в 1d не заводим.
      await supabase.storage
        .from(CHAT_BUCKET)
        .remove(uploaded.map((u) => u.storage_path))
        .catch(() => undefined);
    }
    throw e;
  }
}

/** Удалить объекты вложений из бакета (строки уносит каскад от messages). */
export async function removeChatAttachmentObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = createClient();
  await supabase.storage.from(CHAT_BUCKET).remove(paths);
}

/**
 * S-CHAT-AUDIT-1: все ключи объектов канала — ДО его удаления.
 *
 * Зачем отдельный хелпер, а не третья копия кода `useDeleteMessage`: удаляют канал двумя
 * путями (группа в `useDeleteGroup`, проект вместе со своим каналом в `deleteProject`), и
 * шаг чистки обязан быть одинаковым на обоих.
 *
 * ⚠️ ЗВАТЬ СТРОГО ДО DELETE. После исчезновения строки канала `can_access_chat_file`
 * (097) вернёт false ВСЕМ, включая owner организации: она берёт первый сегмент пути как
 * `conversation_id` и зовёт `is_conversation_member`, а канала уже нет. Ни `select`, ни
 * `delete` по объектам не пройдут — байты станут неудаляемыми из приложения вообще, и на
 * «удалите наши документы» ответить будет нечем, кроме дашборда Supabase под service_role.
 *
 * Никогда не бросает: худший исход здесь — сирота в бакете, а не заблокированное удаление
 * группы или проекта (тот же выбор, что в `useDeleteMessage`).
 */
export async function collectConversationAttachmentPaths(
  conversationId: string,
): Promise<string[]> {
  const supabase = createClient();
  try {
    const { data: messages } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId);

    const messageIds = (messages ?? []).map((m) => m.id);
    // Подзапросом список не получить (PostgREST), поэтому два шага. Пустой `.in()` роняет
    // PostgREST (грабля W3 из 068) — при пустом канале `fetchInBatches` даёт ноль батчей
    // и ни одного запроса. Длинный — упирается в лимит длины URL, поэтому батчи: тут это
    // критичнее, чем в ленте, потому что список — ВСЕ сообщения канала за его жизнь, и
    // потерянный батч означает неудаляемые байты в бакете навсегда (см. ⚠️ выше).
    //
    // Ошибка ОДНОГО батча не роняет остальные: собрать 800 ключей из 1000 лучше, чем
    // ноль. Это же и прежнее поведение функции — «не бросает никогда», только теперь
    // граница глотания проходит по батчу, а не по всему вызову.
    return fetchInBatches(messageIds, async (batch) => {
      try {
        const { data } = await supabase
          .from('message_attachments')
          .select('storage_path')
          .in('message_id', batch);
        return (data ?? []).map((a) => a.storage_path);
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
