// ═══════════════════════════════════════════════════════
// S-CHAT-HUB-1d: чистая логика вложений чата — лимиты партии, ключ объекта, форматы.
//
// Вынесено из хука намеренно: это правила («что не отправляем», «как строится ключ
// хранилища»), они не зависят от сети и обязаны быть покрыты тестами. Ключ объекта —
// вообще security-поверхность: из имени файла он не строится НИКОГДА.
// ═══════════════════════════════════════════════════════

/** Потолок на файл. Зеркало `file_size_limit` бакета `chat-files` (097). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Сообщение с двадцатью вложениями — это не сообщение. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/** Картинки показываем превью, остальное — строкой с иконкой. */
export function isImageAttachment(a: { mime_type: string | null }): boolean {
  return !!a.mime_type && a.mime_type.startsWith('image/');
}

export function formatAttachmentSize(bytes: number | null): string {
  if (bytes == null || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Проблема с партией файлов до всякой сети. `null` — претензий нет. */
export type AttachmentBatchProblem =
  | { kind: 'too_many'; limit: number }
  | { kind: 'too_large'; fileName: string; size: number };

/**
 * Проверка партии ДО загрузки, целиком.
 *
 * Частичная отправка хуже отказа: иначе человек видит отправленное сообщение и думает,
 * что приложил пять файлов, а приложил четыре. Поэтому один негодный файл отменяет всю
 * партию, а не выкидывается молча.
 */
export function checkAttachmentBatch(
  files: { name: string; size: number }[],
): AttachmentBatchProblem | null {
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { kind: 'too_many', limit: MAX_ATTACHMENTS_PER_MESSAGE };
  }
  const tooBig = files.find((f) => f.size > MAX_ATTACHMENT_BYTES);
  if (tooBig) return { kind: 'too_large', fileName: tooBig.name, size: tooBig.size };
  return null;
}

export function attachmentProblemMessage(problem: AttachmentBatchProblem): string {
  if (problem.kind === 'too_many') {
    return `Не больше ${problem.limit} файлов в одном сообщении`;
  }
  return `«${problem.fileName}» — ${formatAttachmentSize(problem.size)}, лимит ${formatAttachmentSize(
    MAX_ATTACHMENT_BYTES,
  )}`;
}

/**
 * Расширение для КЛЮЧА объекта — не для отображения.
 *
 * Всё, что не похоже на расширение (кириллица, пробелы, точки в конце, 40 символов
 * «хвоста»), схлопывается в `bin`: ключ хранилища не место для пользовательского ввода.
 */
export function attachmentExtension(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length < 2) return 'bin';
  const ext = parts.pop()!.toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin';
}

/**
 * Ключ объекта: `<conversation_id>/<message_id>/<uuid>.<ext>`.
 *
 * Первый сегмент — КАНАЛ, и на нём стоит проверка доступа (`can_access_chat_file` →
 * `is_conversation_member`, 097): вложение обязан видеть весь канал, а не только
 * загрузивший — поэтому own-path модель `project-files` (055) сюда не годится.
 * Второй сегмент — сообщение, поэтому его id генерируется на клиенте ДО вставки.
 *
 * Исходное имя файла в ключ не попадает никогда — оно живёт только в `file_name`.
 */
export function attachmentStoragePath(
  conversationId: string,
  messageId: string,
  fileName: string,
): string {
  return `${conversationId}/${messageId}/${crypto.randomUUID()}.${attachmentExtension(fileName)}`;
}
