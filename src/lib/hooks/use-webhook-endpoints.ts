'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type {
  Database,
  Json,
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
 * ⚠️ СТАБ СХЕМЫ ДО РЕГЕНЕРАЦИИ. 088 применяется на гейте, а код пишется до, так что
 *    таблиц и функций ещё нет в `supabase.gen.ts`. После apply + `npm run db:gen-types`
 *    стаб и `webhooksClient()` удаляются, вместо них — `createClient()` напрямую.
 *
 *    ⚠️⚠️ Стаб объявлен через `type`, а НЕ `interface`. postgrest-js требует
 *    `Row extends Record<string, unknown>`; `interface` неявной index signature не
 *    получает, констрейнт `GenericTable` не выполняется, и `.insert()/.update()/.rpc()`
 *    схлопываются в `never`/`undefined` с сообщением, которое на index signature не
 *    намекает никак. На этом уже потерян час в S-R2-SIGNOFF-1 — не «причёсывать».
 *
 * Ключи кеша без org_id — конвенция проекта (use-segments / use-automation-rules):
 * смена организации означает перелогин, кеш поднимается заново.
 */

// ═══════════════════════════════════════════════════════
// Стаб схемы до регенерации
// ═══════════════════════════════════════════════════════

type WebhookEndpointRowDb = {
  id: string;
  org_id: string;
  name: string;
  url: string;
  secret_id: string;
  is_active: boolean;
  description: string | null;
  last_delivery_at: string | null;
  last_status_code: number | null;
  consecutive_failures: number;
  disabled_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type WebhookDeliveryRowDb = {
  id: string;
  org_id: string;
  endpoint_id: string;
  rule_id: string | null;
  event: string;
  payload: Json;
  status: string;
  attempt: number;
  next_retry_at: string | null;
  response_status: number | null;
  response_body: string | null;
  error: string | null;
  created_at: string;
  delivered_at: string | null;
};

type DatabaseWithWebhooks = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables' | 'Functions'> & {
    Tables: Database['public']['Tables'] & {
      webhook_endpoints: {
        Row: WebhookEndpointRowDb;
        Insert: Partial<WebhookEndpointRowDb>;
        Update: Partial<WebhookEndpointRowDb>;
        Relationships: [];
      };
      webhook_deliveries: {
        Row: WebhookDeliveryRowDb;
        Insert: Partial<WebhookDeliveryRowDb>;
        Update: Partial<WebhookDeliveryRowDb>;
        Relationships: [];
      };
    };
    Functions: Database['public']['Functions'] & {
      create_webhook_endpoint: {
        Args: { p_name: string; p_url: string; p_description?: string | null };
        Returns: { endpoint_id: string; secret: string }[];
      };
      rotate_webhook_secret: { Args: { p_endpoint_id: string }; Returns: string };
      delete_webhook_endpoint: { Args: { p_endpoint_id: string }; Returns: undefined };
      send_test_webhook: { Args: { p_endpoint_id: string }; Returns: string };
    };
  };
};

function webhooksClient(): SupabaseClient<DatabaseWithWebhooks> {
  return createClient() as unknown as SupabaseClient<DatabaseWithWebhooks>;
}

// ═══════════════════════════════════════════════════════
// Row → домен
// ═══════════════════════════════════════════════════════

/** `secret_id` в домен НЕ выносим: приложению он не нужен ни для чего. */
function toEndpoint(row: WebhookEndpointRowDb): WebhookEndpoint {
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    url: row.url,
    is_active: row.is_active,
    description: row.description,
    last_delivery_at: row.last_delivery_at,
    last_status_code: row.last_status_code,
    consecutive_failures: row.consecutive_failures,
    disabled_reason: row.disabled_reason,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** `status` в БД — text + CHECK (не enum), поэтому уточняем union здесь. */
function toDelivery(row: WebhookDeliveryRowDb): WebhookDelivery {
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
      const supabase = webhooksClient();
      const { data, error } = await supabase
        .from('webhook_endpoints')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toEndpoint);
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
      const supabase = webhooksClient();
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
      const supabase = webhooksClient();
      const { data, error } = await supabase.rpc('create_webhook_endpoint', {
        p_name: input.name,
        p_url: input.url,
        p_description: input.description?.trim() ? input.description.trim() : null,
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
      const supabase = webhooksClient();
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
      const supabase = webhooksClient();
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
      const supabase = webhooksClient();
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
