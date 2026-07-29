'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  Tables,
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookEndpoint,
  WebhookEndpointCreated,
} from '@/types/database';

/**
 * Исходящие вебхуки — конфигурация получателей (B2, спринт 1, миграции 088/089).
 *
 * ⚠️ ЗАПИСЬ ИДЁТ ТОЛЬКО ЧЕРЕЗ RPC. INSERT/UPDATE/DELETE на `webhook_endpoints` у
 *    `authenticated` отозваны в 088 — и это не перестраховка: секрет подписи
 *    генерируется в БД и кладётся в Vault, а прямой INSERT позволил бы завести
 *    строку с чужим `secret_id`. Хук поэтому зовёт create/rotate/delete_webhook_endpoint.
 *
 * ⚠️ СЕКРЕТ ПОКАЗЫВАЕТСЯ ОДИН РАЗ. `create_webhook_endpoint` и
 *    `rotate_webhook_secret` — единственные места, где он покидает БД. Ни в кеш
 *    react-query, ни в состояние списка он не кладётся: живёт в локальном стейте
 *    модалки до её закрытия. Поведение GitHub/Stripe, и в UI это сказано словами.
 *
 * Ключи кеша без org_id — конвенция проекта (use-segments / use-automation-rules):
 * смена организации означает перелогин, кеш поднимается заново.
 */

// ═══════════════════════════════════════════════════════
// Row → домен
// ═══════════════════════════════════════════════════════
// 088 применена 2026-07-29, типы перегенерены — стаб схемы `DatabaseWithWebhooks`
// и обёртка `webhooksClient()` сняты, клиент берётся напрямую.

/**
 * `secret_id` не доезжает до домена (см. тип `WebhookEndpoint`), поэтому колонки
 * перечислены в `select` явно: `select('*')` тянул бы его в память приложения без
 * единого потребителя.
 *
 * ⚠️ Одной строкой, без склейки через `+`. postgrest выводит форму результата из
 *    ЛИТЕРАЛЬНОГО типа аргумента `select`, а конкатенация расширяет его до `string` —
 *    и результат схлопывается в `GenericStringError[]`. Тот же класс, что стаб через
 *    `interface` вместо `type`: сообщение об ошибке на причину не намекает.
 */
const ENDPOINT_COLUMNS =
  'id, org_id, name, url, is_active, description, last_delivery_at, last_status_code, consecutive_failures, disabled_reason, created_by, created_at, updated_at';

/** `status` в БД — text + CHECK (не enum), поэтому уточняем union здесь. */
function toDelivery(row: Tables<'webhook_deliveries'>): WebhookDelivery {
  return { ...row, status: row.status as WebhookDeliveryStatus };
}

export const webhookEndpointsKey = () => ['webhook-endpoints'] as const;
export const webhookDeliveryKey = (id: string) => ['webhook-delivery', id] as const;

// ═══════════════════════════════════════════════════════
// Read
// ═══════════════════════════════════════════════════════

/** Список получателей. RLS отдаёт только свою org. */
export function useWebhookEndpoints(enabled = true) {
  return useQuery({
    queryKey: webhookEndpointsKey(),
    enabled,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<WebhookEndpoint[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('webhook_endpoints')
        .select(ENDPOINT_COLUMNS)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Одна доставка — чтобы показать исход тестовой отправки.
 *
 * Опрос, а не `setTimeout` на 2–3 секунды: доставка либо доезжает за сотни
 * миллисекунд, либо не доезжает вовсе, и фиксированная пауза одинаково плохо
 * работает в обоих случаях. Пока строка `pending`, перечитываем раз в 1.5 с;
 * как только статус финальный — опрос прекращается сам.
 *
 * ⚠️ SELECT на `webhook_deliveries` открыт только owner/admin (в payload бюджеты и
 *    имена контактов). Секция вебхуков рисуется той же ролью, так что рядовой
 *    участник сюда не доходит.
 */
export function useWebhookDelivery(deliveryId: string | null) {
  return useQuery({
    queryKey: webhookDeliveryKey(deliveryId ?? ''),
    enabled: !!deliveryId,
    staleTime: 0,
    refetchInterval: (query) => {
      const row = query.state.data as WebhookDelivery | undefined;
      return !row || row.status === 'pending' ? 1500 : false;
    },
    queryFn: async (): Promise<WebhookDelivery | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('webhook_deliveries')
        .select('*')
        .eq('id', deliveryId!)
        .maybeSingle();
      if (error) throw error;
      return data ? toDelivery(data) : null;
    },
  });
}

// ═══════════════════════════════════════════════════════
// Mutations — все через RPC (гейт роли owner/admin внутри функций)
// ═══════════════════════════════════════════════════════

export interface WebhookEndpointInput {
  name: string;
  url: string;
  description?: string;
}

/**
 * Создаёт endpoint и отдаёт секрет РОВНО ОДИН РАЗ.
 *
 * Возврат намеренно не кладётся в кеш: секрет не должен пережить закрытие модалки.
 */
export function useCreateWebhookEndpoint() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: WebhookEndpointInput): Promise<WebhookEndpointCreated> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('create_webhook_endpoint', {
        p_name: input.name,
        p_url: input.url,
        // `undefined`, а не `null`: в сгенерированных Args параметр опционален
        // (`p_description?: string`), и SQL-дефолт `null` подставляется сам.
        p_description: input.description?.trim() || undefined,
      });
      if (error) throw error;
      // `returns table (…)` приезжает массивом даже на одной строке.
      const row = (data ?? [])[0];
      if (!row) throw new Error('Не удалось создать endpoint');
      return { endpoint_id: row.endpoint_id, secret: row.secret };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: webhookEndpointsKey() }),
  });
}

/** Перегенерирует секрет. Старый перестаёт действовать немедленно. */
export function useRotateWebhookSecret() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (endpointId: string): Promise<string> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('rotate_webhook_secret', {
        p_endpoint_id: endpointId,
      });
      if (error) throw error;
      if (!data) throw new Error('Не удалось перегенерировать секрет');
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: webhookEndpointsKey() }),
  });
}

/**
 * Удаляет endpoint вместе с его секретом в Vault.
 *
 * Через RPC, а не `.delete()`: DELETE у `authenticated` отозван, и без функции
 * секрет остался бы в Vault сиротой.
 */
export function useDeleteWebhookEndpoint() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (endpointId: string): Promise<void> => {
      const supabase = createClient();
      const { error } = await supabase.rpc('delete_webhook_endpoint', {
        p_endpoint_id: endpointId,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: webhookEndpointsKey() }),
  });
}

/** Ставит в очередь тестовую доставку и возвращает её id. */
export function useSendTestWebhook() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (endpointId: string): Promise<string> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('send_test_webhook', {
        p_endpoint_id: endpointId,
      });
      if (error) throw error;
      if (!data) throw new Error('Не удалось поставить тестовую доставку');
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: webhookEndpointsKey() }),
  });
}
