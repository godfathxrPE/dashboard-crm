import type { WebhookDeliveryStatus } from '@/types/database';

// ═══════════════════════════════════════════════════════
// Исходящие вебхуки — общие константы UI (091).
//
// До журнала `DELIVERY_LABEL` жил локально в WebhooksSection. Второй потребитель
// (модалка журнала) сделал бы его дублем — вынесен сюда, локальное определение снято.
// ═══════════════════════════════════════════════════════

export const DELIVERY_LABEL: Record<WebhookDeliveryStatus, string> = {
  pending: 'в очереди…',
  delivered: 'доставлено',
  failed: 'не доставлено',
  dropped: 'отброшено',
};

/**
 * Тон бейджа статуса — только семантические классы тем, без hex.
 *
 * `dropped` ≠ `failed` по смыслу: адрес отклонён НАШЕЙ проверкой (не https, IP-литерал,
 * приватный диапазон, отключённый endpoint) и до приёмника не дошёл вовсе. Это не отказ
 * той стороны, поэтому тон приглушённый, а не красный.
 */
export const DELIVERY_TONE: Record<WebhookDeliveryStatus, string> = {
  pending: 'bg-surface2 text-text-mute',
  delivered: 'bg-accent-l text-accent',
  failed: 'bg-surface2 text-red',
  dropped: 'bg-surface2 text-text-dim',
};

/** Размер страницы журнала. «Показать ещё» увеличивает лимит на столько же. */
export const DELIVERIES_PAGE_SIZE = 50;

/**
 * Знаменатель для «попытка N / 7» в журнале.
 *
 * ⚠️ ЗЕРКАЛО `MAX_ATTEMPTS` из `supabase/functions/webhook-dispatch/transport.ts`.
 *    Дублирование осознанное и следует уже принятому в проекте решению (см. шапку
 *    `src/lib/validators/webhook.ts`): тащить Deno-модуль в бандл Next дороже, чем
 *    повторить одно число. Расходиться им нельзя — правится одно, правится и второе;
 *    равенство проверяет юнит `tests/unit/webhook-journal.test.ts`.
 */
export const MAX_ATTEMPTS = 7;

/**
 * Повторять можно только терминальный неуспех и только в живой endpoint —
 * зеркало гейтов `retry_webhook_delivery` (091).
 *
 * `pending` нельзя: строка либо ждёт своей минуты, либо взята под 5-минутный лизинг,
 * и повтор дал бы двойную отправку. `delivered` повторять нечего. Отключённый endpoint
 * немедленно даёт `dropped` — вторую мёртвую строку.
 *
 * Чистой функцией, а не инлайном в JSX: иначе не тестируется.
 */
export function canRetryDelivery(
  status: WebhookDeliveryStatus,
  endpointActive: boolean,
): boolean {
  if (!endpointActive) return false;
  return status === 'failed' || status === 'dropped';
}

/**
 * Есть ли следующая страница. Запрашиваем `pageSize + 1` строку, показываем `pageSize`:
 * иначе ровно на границе (получили столько же, сколько просили) кнопка «Показать ещё»
 * висела бы на последней странице и обещала то, чего нет.
 */
export function hasMoreDeliveries(fetched: number, pageSize: number): boolean {
  return fetched > pageSize;
}
