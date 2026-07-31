import { describe, it, expect } from 'vitest';
import {
  canRetryDelivery,
  DELIVERIES_PAGE_SIZE,
  DELIVERY_LABEL,
  DELIVERY_TONE,
  hasMoreDeliveries,
  MAX_ATTEMPTS,
} from '../../src/lib/constants/webhooks';
import { MAX_ATTEMPTS as TRANSPORT_MAX_ATTEMPTS } from '../../supabase/functions/webhook-dispatch/transport';
import type { WebhookDeliveryStatus } from '../../src/types/database';

// ═══════════════════════════════════════════════════════
// S-R2-WEBHOOK-JOURNAL — юниты 1–4 из текста спринта.
//
// Чистая логика без БД: полнота Record'ов статусов, гейт кнопки «Повторить»
// и граница «Показать ещё».
// ═══════════════════════════════════════════════════════

const ALL_STATUSES: WebhookDeliveryStatus[] = ['pending', 'delivered', 'failed', 'dropped'];

// ── 1/2. полнота Record'ов ──
describe('DELIVERY_LABEL / DELIVERY_TONE', () => {
  it('покрывают все четыре статуса непустыми значениями', () => {
    for (const s of ALL_STATUSES) {
      expect(DELIVERY_LABEL[s], `ярлык для ${s}`).toBeTruthy();
      expect(DELIVERY_TONE[s], `тон для ${s}`).toBeTruthy();
    }
    expect(Object.keys(DELIVERY_LABEL)).toHaveLength(4);
    expect(Object.keys(DELIVERY_TONE)).toHaveLength(4);
  });

  it('тона — только семантические классы тем, без hex', () => {
    // Хардкод-цветов в проекте нет: правки тем скоупятся в .t-aura {} и т.п.
    for (const s of ALL_STATUSES) {
      expect(DELIVERY_TONE[s]).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it('dropped и failed различимы: отклонено нами ≠ отказ приёмника', () => {
    expect(DELIVERY_LABEL.dropped).not.toBe(DELIVERY_LABEL.failed);
    expect(DELIVERY_TONE.dropped).not.toBe(DELIVERY_TONE.failed);
  });
});

// ── 3. гейт кнопки «Повторить» — зеркало проверок retry_webhook_delivery (091) ──
describe('canRetryDelivery', () => {
  it('failed и dropped на живом endpoint — можно', () => {
    expect(canRetryDelivery('failed', true)).toBe(true);
    expect(canRetryDelivery('dropped', true)).toBe(true);
  });

  it('pending нельзя: строка может быть под 5-минутным лизингом → двойная отправка', () => {
    expect(canRetryDelivery('pending', true)).toBe(false);
  });

  it('delivered нельзя: повторять нечего', () => {
    expect(canRetryDelivery('delivered', true)).toBe(false);
  });

  it('отключённый endpoint запрещает любой статус: повтор немедленно стал бы dropped', () => {
    for (const s of ALL_STATUSES) {
      expect(canRetryDelivery(s, false), `статус ${s} при выключенном endpoint`).toBe(false);
    }
  });
});

// ── 4. граница «Показать ещё» ──
describe('hasMoreDeliveries', () => {
  it('ровно страница — кнопки нет (запрашиваем limit+1, пришло limit)', () => {
    expect(hasMoreDeliveries(DELIVERIES_PAGE_SIZE, DELIVERIES_PAGE_SIZE)).toBe(false);
  });

  it('пришла лишняя строка — кнопка есть', () => {
    expect(hasMoreDeliveries(DELIVERIES_PAGE_SIZE + 1, DELIVERIES_PAGE_SIZE)).toBe(true);
  });

  it('неполная страница и пустой журнал — кнопки нет', () => {
    expect(hasMoreDeliveries(7, DELIVERIES_PAGE_SIZE)).toBe(false);
    expect(hasMoreDeliveries(0, DELIVERIES_PAGE_SIZE)).toBe(false);
  });
});

// ── 5. зеркало константы через границу Deno/Next ──
describe('MAX_ATTEMPTS', () => {
  it('зеркало в src/ совпадает с transport.ts', () => {
    // Знаменатель «попытка N / 7» в журнале обязан идти от той же цифры, по которой
    // диспетчер прекращает ретраи. Модуль transport.ts в бандл Next не тащим
    // (конвенция validators/webhook.ts), поэтому равенство держит этот тест.
    expect(MAX_ATTEMPTS).toBe(TRANSPORT_MAX_ATTEMPTS);
  });
});
