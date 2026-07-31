'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, RefreshCw, ScrollText, Send, Trash2, Webhook } from 'lucide-react';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import {
  useDeleteWebhookEndpoint,
  useRotateWebhookSecret,
  useSendTestWebhook,
  useWebhookDelivery,
  useWebhookEndpoints,
} from '@/lib/hooks/use-webhook-endpoints';
import { DELIVERY_LABEL } from '@/lib/constants/webhooks';
import { WebhookCreateModal } from './webhooks/WebhookCreateModal';
import { WebhookSecretModal } from './webhooks/WebhookSecretModal';
import { WebhookDeliveriesModal } from './webhooks/WebhookDeliveriesModal';
import type { WebhookEndpoint } from '@/types/database';

/**
 * Исход последней тестовой отправки. Отдельный компонент, потому что опрос
 * доставки должен жить и останавливаться сам по себе, не перерисовывая список.
 */
function TestResult({ deliveryId }: { deliveryId: string }) {
  const { data: delivery } = useWebhookDelivery(deliveryId);
  if (!delivery) return <span className="text-meta text-text-mute">тест: в очереди…</span>;

  const ok = delivery.status === 'delivered';
  const code = delivery.response_status ? ` ${delivery.response_status}` : '';
  return (
    <span
      className={`text-meta ${ok ? 'text-text-dim' : 'text-red'}`}
      title={delivery.error ?? delivery.response_body ?? undefined}
    >
      тест: {DELIVERY_LABEL[delivery.status]}{code}
    </span>
  );
}

/**
 * Секция «Вебхуки» в Настройках (B2) — видно только owner/admin.
 *
 * Эпик закрыт: транспорт (088/089), действие движка (090) и журнал доставок с
 * повтором и ретеншном (091). Кнопка «Журнал» открывает историю отправок ОДНОГО
 * получателя — общего по org журнала нет намеренно: под per-endpoint есть индекс
 * `idx_webhook_deliveries_endpoint`, а на странице настроек общему негде жить.
 *
 * ⚠️ РЕДАКТИРОВАНИЕ endpoint'а по-прежнему НЕ реализовано — ни в 091, ни раньше.
 *    Менять адрес живого получателя, к которому уже привязаны правила и подпись,
 *    это отдельное решение (что делать с секретом и с доставками в полёте), и оно
 *    не принималось. Не искать его в 091: там его нет.
 */
export function WebhooksSection() {
  const { data: role } = useOrgRole();
  const { data: endpoints = [] } = useWebhookEndpoints();
  const rotate = useRotateWebhookSecret();
  const remove = useDeleteWebhookEndpoint();
  const sendTest = useSendTestWebhook();

  const [creating, setCreating] = useState(false);
  const [rotated, setRotated] = useState<string | null>(null);
  // Подтверждение удаления — инлайном. window.confirm в проекте запрещён: он
  // блокирует браузерные смоки (грабля GanttTimeline).
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [testDelivery, setTestDelivery] = useState<Record<string, string>>({});
  // Держим весь endpoint, а не id: модалке нужны name, is_active и счётчик провалов,
  // и второй запрос за той же строкой был бы лишним.
  const [journalFor, setJournalFor] = useState<WebhookEndpoint | null>(null);

  const canManage = role === 'owner' || role === 'admin';
  if (!canManage) return null;

  const onRotate = async (id: string) => {
    try {
      setRotated(await rotate.mutateAsync(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось перегенерировать секрет');
    }
  };

  const onDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      setConfirmingDelete(null);
      toast.success('Endpoint удалён');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось удалить endpoint');
    }
  };

  const onTest = async (id: string) => {
    try {
      const deliveryId = await sendTest.mutateAsync(id);
      setTestDelivery((prev) => ({ ...prev, [id]: deliveryId }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось отправить тест');
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Webhook size={14} className="text-text-dim" />
          <h2 className="text-xs font-semibold text-text-dim">Вебхуки</h2>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={13} /> Endpoint
        </button>
      </div>

      <p className="mb-3 text-meta text-text-mute">
        Torii CRM отправляет события на внешние адреса подписанным POST-запросом.
        Кнопка «Тест» проверяет приёмник; боевые события отправляет действие
        «Отправить вебхук» в разделе <strong className="text-text-dim">Настройки → Автоматизации</strong>.
      </p>

      {endpoints.length === 0 ? (
        <p className="py-2 text-center text-xs text-text-mute">Получатели ещё не заданы.</p>
      ) : (
        <div className="divide-y divide-border">
          {endpoints.map((ep) => (
            <div key={ep.id} className="py-2">
              <div className="flex items-center gap-2">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    ep.is_active ? 'bg-accent-l text-accent' : 'bg-surface2 text-text-mute'
                  }`}
                  title={ep.disabled_reason ?? undefined}
                >
                  {ep.is_active ? 'вкл' : 'выкл'}
                </span>

                <span className="min-w-0 flex-1 truncate text-xs text-text-main" title={ep.url}>
                  {ep.name} — <span className="text-text-mute">{ep.url}</span>
                </span>

                <button
                  onClick={() => onTest(ep.id)}
                  disabled={sendTest.isPending || !ep.is_active}
                  className="shrink-0 p-1.5 text-text-mute transition-colors hover:text-text-main disabled:opacity-40"
                  aria-label="Отправить тест"
                  title={ep.is_active ? 'Отправить тест' : 'Endpoint отключён'}
                >
                  <Send size={13} />
                </button>

                <button
                  onClick={() => setJournalFor(ep)}
                  className="shrink-0 p-1.5 text-text-mute transition-colors hover:text-text-main disabled:opacity-40"
                  aria-label="Журнал доставок"
                  title="Журнал доставок"
                >
                  <ScrollText size={13} />
                </button>

                <button
                  onClick={() => onRotate(ep.id)}
                  disabled={rotate.isPending}
                  className="shrink-0 p-1.5 text-text-mute transition-colors hover:text-text-main disabled:opacity-40"
                  aria-label="Перегенерировать секрет"
                  title="Перегенерировать секрет"
                >
                  <RefreshCw size={13} />
                </button>

                <button
                  onClick={() => setConfirmingDelete(ep.id)}
                  disabled={remove.isPending}
                  className="shrink-0 p-1.5 text-text-mute transition-colors hover:text-text-main disabled:opacity-40"
                  aria-label="Удалить endpoint"
                  title="Удалить endpoint"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 pl-1 text-meta text-text-mute">
                {ep.last_status_code !== null && <span>последний ответ: {ep.last_status_code}</span>}
                {ep.consecutive_failures > 0 && (
                  <span className="text-red">провалов подряд: {ep.consecutive_failures}</span>
                )}
                {ep.disabled_reason && <span className="text-red">{ep.disabled_reason}</span>}
                {testDelivery[ep.id] && <TestResult deliveryId={testDelivery[ep.id]} />}
              </div>

              {confirmingDelete === ep.id && (
                <div className="mt-2 rounded-lg border border-border bg-surface2 p-3">
                  <p className="text-xs text-text-dim">
                    Удалить «{ep.name}»? Вместе с ним уйдут секрет подписи и журнал доставок.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => onDelete(ep.id)}
                      disabled={remove.isPending}
                      className="rounded border border-border px-2.5 py-1 text-xs text-red transition-colors hover:bg-surface-hover disabled:opacity-50"
                    >
                      Удалить
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(null)}
                      className="rounded border border-border px-2.5 py-1 text-xs text-text-dim transition-colors hover:bg-surface-hover"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {journalFor && (
        <WebhookDeliveriesModal endpoint={journalFor} onClose={() => setJournalFor(null)} />
      )}
      {creating && <WebhookCreateModal onClose={() => setCreating(false)} />}
      {rotated && (
        <WebhookSecretModal
          title="Новый секрет"
          secret={rotated}
          onClose={() => setRotated(null)}
        />
      )}
    </div>
  );
}
