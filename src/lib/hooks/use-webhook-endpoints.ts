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

/**
 * Колонки журнала доставок (091). Тоже ОДНОЙ литеральной строкой — грабля выше
 * (склейка через `+` расширяет тип аргумента до `string`, и результат схлопывается
 * в `GenericStringError[]`) относится к любому `select`, не только к endpoint'ам.
 *
 * `payload` и `response_body` тянутся намеренно: без них не показать тело события и
 * ответ приёмника в раскрывающемся блоке, а второй запрос за строкой стоил бы дороже.
 */
const DELIVERY_COLUMNS =
  'id, org_id, endpoint_id, rule_id, event, payload, status, attempt, next_retry_at, response_status, response_body, error, created_at, delivered_at';

/** `status` в БД — text + CHECK (не enum), поэтому уточняем union здесь. */
function toDelivery(row: Tables<'webhook_deliveries'>): WebhookDelivery {
  return { ...row, status: row.status as WebhookDeliveryStatus };
}

export const webhookEndpointsKey = () => ['webhook-endpoints'] as const;
export const webhookDeliveryKey = (id: string) => ['webhook-delivery', id] as const;
/** ⚠️ limit в ключе обязателен: иначе «Показать ещё» отдаст закешированную первую страницу. */
export const webhookDeliveriesKey = (endpointId: string, limit: number) =>
  ['webhook-deliveries', endpointId, limit] as const;

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

/**
 * Журнал доставок одного endpoint'а (091). Под него есть индекс
 * `idx_webhook_deliveries_endpoint (endpoint_id, created_at desc)` из 088.
 *
 * ⚠️ ПАГИНАЦИИ В ПРОЕКТЕ НЕТ И МЫ ЕЁ ЗДЕСЬ НЕ ЗАВОДИМ. `useInfiniteQuery` и `.range()`
 *    не встречаются в `src/` ни разу; `DataTable` листает клиентски поверх целиком
 *    загруженного массива. Берём конвенцию, которая уже есть, — растущий `.limit()`,
 *    как в `use-activity-log.ts` и `use-notifications.ts`.
 *
 *    Честная цена: каждое «Показать ещё» перезапрашивает ВЕСЬ префикс (50 → 100 → 150),
 *    а не догружает хвост. При ретеншне 30 дней это доли секунды и десятки килобайт.
 *    Это осознанный размен на отсутствие новой абстракции ради одного экрана.
 *    ПОРОГ ПЕРЕСМОТРА: если журнал одного endpoint'а начнёт регулярно уходить за ~500
 *    строк — пора за `.range()`, и тогда как общий примитив, а не локально здесь.
 *
 * Запрашиваем на строку больше запрошенного (`limit + 1`): лишняя строка не рисуется,
 * она отвечает на вопрос «есть ли следующая страница» — см. `hasMoreDeliveries`.
 */
export function useWebhookDeliveries(endpointId: string | null, limit: number) {
  return useQuery({
    queryKey: webhookDeliveriesKey(endpointId ?? '', limit),
    enabled: !!endpointId,
    staleTime: 1000 * 10,
    // Только что созданный повтор иначе навсегда останется «в очереди…» на экране.
    // Как в useWebhookDelivery: опрос прекращается сам, когда pending не осталось.
    refetchInterval: (query) => {
      const rows = query.state.data as WebhookDelivery[] | undefined;
      return rows?.some((r) => r.status === 'pending') ? 2000 : false;
    },
    queryFn: async (): Promise<WebhookDelivery[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('webhook_deliveries')
        .select(DELIVERY_COLUMNS)
        .eq('endpoint_id', endpointId!)
        .order('created_at', { ascending: false })
        .limit(limit + 1);
      if (error) throw error;
      return (data ?? []).map(toDelivery);
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

/**
 * Повторяет доставку — создаёт НОВУЮ строку очереди и возвращает её id.
 *
 * ⚠️ Именно новую, а не оживляет старую: `id` уходит получателю в `X-Torii-Delivery`
 *    и служит ключом дедупликации (G3 §4), поэтому повтор с тем же id корректный
 *    приёмник обязан отбросить. Подробности — в комментарии `retry_webhook_delivery` (091).
 *
 * ⚠️ Каст `rpc` — временный: 091 применяет гейт, и до регенерации функции нет в
 *    `supabase.gen.ts`. Правкой сгенерированного файла руками не лезем (конвенция
 *    проекта); после `npm run db:gen-types` каст снимается.
 */
type RetryRpc = (
  fn: 'retry_webhook_delivery',
  args: { p_delivery_id: string },
) => Promise<{ data: string | null; error: { message: string } | null }>;

export function useRetryWebhookDelivery() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (deliveryId: string): Promise<string> => {
      const supabase = createClient();
      const { data, error } = await (supabase.rpc as unknown as RetryRpc)(
        'retry_webhook_delivery',
        { p_delivery_id: deliveryId },
      );
      if (error) throw error;
      if (!data) throw new Error('Не удалось поставить повтор');
      return data;
    },
    // Префиксом — все лимиты журнала сразу; плюс endpoints: у endpoint'а меняются
    // last_status_code и consecutive_failures.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['webhook-deliveries'] });
      qc.invalidateQueries({ queryKey: webhookEndpointsKey() });
    },
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
