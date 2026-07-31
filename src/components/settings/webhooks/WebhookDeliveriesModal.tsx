'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { RotateCw, ScrollText } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useRetryWebhookDelivery,
  useWebhookDeliveries,
} from '@/lib/hooks/use-webhook-endpoints';
import {
  canRetryDelivery,
  DELIVERIES_PAGE_SIZE,
  DELIVERY_LABEL,
  DELIVERY_TONE,
  hasMoreDeliveries,
  MAX_ATTEMPTS,
} from '@/lib/constants/webhooks';
import { formatRelative } from '@/lib/utils/dates';
import type { WebhookDelivery, WebhookEndpoint } from '@/types/database';

/**
 * Журнал доставок ОДНОГО endpoint'а (091).
 *
 * На endpoint, а не общий по org: под это есть индекс
 * `idx_webhook_deliveries_endpoint (endpoint_id, created_at desc)` из 088, а на странице
 * настроек шириной max-w-2xl общему журналу негде жить. `idx_webhook_deliveries_org`
 * остаётся под будущий раздел аналитики.
 *
 * ⚠️ Роль здесь НЕ проверяется намеренно: секция «Вебхуки» целиком закрыта гейтом
 *    canManage, а SELECT на webhook_deliveries открыт RLS только owner/admin. Третья
 *    проверка была бы вторым источником правды. RPC повтора при этом гейтит роль сам.
 */
export function WebhookDeliveriesModal({
  endpoint,
  onClose,
}: {
  endpoint: WebhookEndpoint;
  onClose: () => void;
}) {
  const [limit, setLimit] = useState(DELIVERIES_PAGE_SIZE);
  const { data: fetched = [], isLoading } = useWebhookDeliveries(endpoint.id, limit);
  const retry = useRetryWebhookDelivery();

  // Хук просит limit + 1: лишняя строка не рисуется, она отвечает «есть ли ещё».
  const rows = fetched.slice(0, limit);
  const hasMore = hasMoreDeliveries(fetched.length, limit);

  const onRetry = async (deliveryId: string) => {
    try {
      await retry.mutateAsync(deliveryId);
      toast.success('Повтор поставлен в очередь');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось повторить доставку');
    }
  };

  return (
    <Modal
      title={`Доставки — ${endpoint.name}`}
      description="История отправок на этот адрес. Хранится 30 дней."
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      {endpoint.consecutive_failures > 0 && (
        // Ручной повтор идёт тем же путём, что автоматический: неуспех увеличит
        // счётчик и на пороге погасит endpoint. Пользователь должен видеть, где он.
        <p className="mb-3 rounded bg-surface2 px-2.5 py-2 text-meta text-red">
          Провалов подряд: {endpoint.consecutive_failures}. Endpoint отключается
          автоматически, когда их накопится слишком много; успешная доставка обнуляет счётчик.
        </p>
      )}

      {isLoading ? (
        <p className="text-meta text-text-mute">Загружаем журнал…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={28} />}
          title="Доставок пока не было"
          description="Нажмите «Тест» в списке получателей или настройте правило с действием «Отправить вебхук»."
        />
      ) : (
        <>
          <div className="divide-y divide-border">
            {rows.map((d) => (
              <DeliveryRow
                key={d.id}
                delivery={d}
                endpointActive={endpoint.is_active}
                retrying={retry.isPending}
                onRetry={() => onRetry(d.id)}
              />
            ))}
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + DELIVERIES_PAGE_SIZE)}
              className="mt-3 w-full rounded border border-border px-3 py-1.5 text-xs text-text-dim transition-colors hover:bg-surface2"
            >
              Показать ещё
            </button>
          )}
        </>
      )}
    </Modal>
  );
}

function DeliveryRow({
  delivery: d,
  endpointActive,
  retrying,
  onRetry,
}: {
  delivery: WebhookDelivery;
  endpointActive: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Скопировано');
    } catch {
      toast.error('Буфер обмена недоступен — скопируйте вручную');
    }
  };

  return (
    <div className="py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${DELIVERY_TONE[d.status]}`}
        >
          {DELIVERY_LABEL[d.status]}
        </span>

        <span className="font-mono text-xs text-text-main">{d.event}</span>

        <span
          className="text-meta text-text-mute"
          title={new Date(d.created_at).toLocaleString('ru-RU')}
        >
          {formatRelative(d.created_at)}
        </span>

        {/* `attempt: 3` само по себе ничего не говорит — нужен знаменатель. */}
        <span className="text-meta text-text-mute">
          попытка {d.attempt} / {MAX_ATTEMPTS}
        </span>

        {d.response_status !== null && (
          <span className="text-meta text-text-mute">HTTP {d.response_status}</span>
        )}

        {canRetryDelivery(d.status, endpointActive) && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="ml-auto flex shrink-0 items-center gap-1 rounded border border-border px-2 py-0.5 text-meta text-text-dim transition-colors hover:bg-surface2 disabled:opacity-40"
            title="Отправить это же событие заново — создастся новая доставка"
          >
            <RotateCw size={11} /> Повторить
          </button>
        )}
        {!endpointActive && (d.status === 'failed' || d.status === 'dropped') && (
          <span className="ml-auto text-meta text-text-mute">
            повтор недоступен: endpoint отключён
          </span>
        )}
      </div>

      {d.error && <p className="mt-0.5 text-meta text-red">{d.error}</p>}

      <details className="mt-1">
        <summary className="cursor-pointer text-meta text-text-mute transition-colors hover:text-text-dim">
          Тело
        </summary>
        <div className="mt-1 space-y-1">
          <button
            type="button"
            onClick={() => copy(JSON.stringify(d.payload, null, 2))}
            className="rounded border border-border px-2 py-0.5 text-meta text-text-dim transition-colors hover:bg-surface2"
          >
            Копировать
          </button>
          <pre className="max-h-64 overflow-auto rounded bg-surface2 p-2 text-meta text-text-dim">
            {JSON.stringify(d.payload, null, 2)}
          </pre>
          {d.response_body && (
            <>
              <p className="text-meta text-text-mute">Ответ приёмника:</p>
              {/* Чужой HTML, обрезанный до 8 КБ. Только текстом — никакого
                  dangerouslySetInnerHTML. */}
              <pre className="max-h-64 overflow-auto rounded bg-surface2 p-2 text-meta text-text-dim">
                {d.response_body}
              </pre>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
