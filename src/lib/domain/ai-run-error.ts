// ═══════════════════════════════════════════════════════
// S-LLM-SEARCH-1: класс ошибки прогона — «недоступно» ≠ «не получилось».
//
// Поводом стал боевой случай: три нажатия «Повторить» подряд за двадцать минут,
// все три прогона умерли за ~1.1 с с `credit balance is too low`. Интерфейс не
// отличал «нет доступа к провайдеру» от «модель не справилась» и предлагал одно
// и то же действие — а повтор в первом случае не помогает и помочь не может.
//
// Класс едет в `ai_runs.error` префиксом `kind|текст` (миграции нет: колонка уже
// text и уже читается клиентом). Строки БЕЗ префикса — это прогоны до спринта:
// класс неизвестен, поведение прежнее. Обратная совместимость без бэкфилла.
// ═══════════════════════════════════════════════════════

export type AiRunErrorKind = 'access' | 'upstream' | 'shape' | 'network';

const KINDS: readonly AiRunErrorKind[] = ['access', 'upstream', 'shape', 'network'];

export interface ParsedRunError {
  /** null — старая строка без префикса либо незнакомый класс. */
  kind: AiRunErrorKind | null;
  /** Текст для пользователя. У строки без префикса — она сама целиком. */
  message: string;
}

/**
 * Разбор `ai_runs.error`.
 *
 * ⚠️ Незнакомый префикс НЕ отрезается: `foo|bar` — это не «класс foo», а текст,
 * в котором просто встретилась палка. Отрезать её значило бы съесть кусок
 * сообщения ради ярлыка, которого нет.
 */
export function parseRunError(raw: string | null | undefined): ParsedRunError {
  const text = raw ?? '';
  const bar = text.indexOf('|');
  if (bar > 0) {
    const head = text.slice(0, bar);
    if ((KINDS as readonly string[]).includes(head)) {
      return { kind: head as AiRunErrorKind, message: text.slice(bar + 1) };
    }
  }
  return { kind: null, message: text };
}

/**
 * Показывать ли «Повторить».
 *
 * Только `access` запрещает повтор: ключ, права и баланс от повторного нажатия не
 * появятся. Неизвестный класс (`null`) считается повторяемым — так ведут себя
 * прогоны до спринта, и ошибаться лучше в сторону «дать попробовать», чем оставить
 * пользователя в тупике без единого действия.
 */
export function isRunErrorRetryable(kind: AiRunErrorKind | null): boolean {
  return kind !== 'access';
}

/** Текст ошибки прогона для UI; пустая строка → запасная формулировка. */
export function runErrorText(raw: string | null | undefined, fallback = 'Ошибка выполнения'): string {
  const { message } = parseRunError(raw);
  return message.trim() === '' ? fallback : message;
}
