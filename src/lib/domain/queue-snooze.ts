import { getDealHealth } from '@/lib/utils/deal-health';
import type { DealStatus } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-QUEUE-1 — чистая часть «очереди дня»: отложенные строки и разделение сделок.
//
// Живёт в domain, а не в компоненте, ровно чтобы тестироваться без рендера:
// «сегодня» — параметр, а не Date.now(), иначе тест зелёный только до полуночи
// (урок leadStaleness из S-LEAD-HUB-2b).
// ═══════════════════════════════════════════════════════

/** Что можно отложить. Звонки/задачи/встречи сюда не входят: у них есть свой перенос. */
export type SnoozeEntityType = 'deal' | 'lead' | 'contact';

export interface QueueSnooze {
  id: string;
  entity_type: SnoozeEntityType;
  entity_id: string;
  /** 'YYYY-MM-DD' — до какого дня ВКЛЮЧИТЕЛЬНО строка скрыта. */
  until: string;
}

/**
 * Ключ строки очереди. Тип обязателен в ключе: у сделки, лида и контакта id —
 * независимые uuid, и без префикса отложенный лид прятал бы одноимённую сделку.
 */
export function snoozeKey(type: SnoozeEntityType, id: string): string {
  return `${type}:${id}`;
}

/**
 * Активен ли snooze на день `today` ('YYYY-MM-DD').
 *
 * ⚠️ Граница включающая: `until === today` — строка ещё СКРЫТА. «Отложить до завтра»
 * пишет until = завтра, значит весь сегодняшний день строки быть не должно; вчерашний
 * until — просрочен, строка вернулась. Сравнение лексикографическое — на ключах дня
 * фиксированного формата оно совпадает с календарным.
 */
export function isSnoozeActive(snooze: QueueSnooze, today: string): boolean {
  return snooze.until >= today;
}

/** Только активные на `today` — и для рендера блока «Отложено», и для фильтров. */
export function activeSnoozes(
  snoozes: readonly QueueSnooze[],
  today: string,
): QueueSnooze[] {
  return snoozes.filter((s) => isSnoozeActive(s, today));
}

/** Ключи активных snooze — `Set` для дешёвой проверки внутри фильтров списков. */
export function activeSnoozeKeys(
  snoozes: readonly QueueSnooze[],
  today: string,
): Set<string> {
  return new Set(
    activeSnoozes(snoozes, today).map((s) => snoozeKey(s.entity_type, s.entity_id)),
  );
}

/** Скрыта ли строка `key` (вида `type:id`) на день `today`. */
export function isSnoozed(
  key: string,
  snoozes: readonly QueueSnooze[],
  today: string,
): boolean {
  return snoozes.some(
    (s) => snoozeKey(s.entity_type, s.entity_id) === key && isSnoozeActive(s, today),
  );
}

/** Убрать отложенные из списка одного типа. `keys` — результат activeSnoozeKeys. */
export function excludeSnoozed<T>(
  items: readonly T[],
  type: SnoozeEntityType,
  getId: (item: T) => string,
  keys: ReadonlySet<string>,
): T[] {
  return items.filter((item) => !keys.has(snoozeKey(type, getId(item))));
}

// ── Разделение «гниющих» сделок ──────────────────────────────────────────

interface DealForSplit {
  status?: DealStatus | null;
  next_step?: string | null;
  next_action_date?: string | null;
}

/**
 * Две очереди вместо одной: «шаг просрочен» и «плана нет».
 *
 * ⚠️ Формула не своя — тот же `getDealHealth`, что кормит сигналы карточки
 * (`deal-signals.nextStepSignal`). Второй критерий развёл бы список и карточку:
 * сделка была бы «просроченной» в очереди и «без плана» на карточке.
 *
 * `ok`-сделки не попадают никуда — вызывающий вправе передать и полный список.
 */
export function splitDealsByHealth<T extends DealForSplit>(
  deals: readonly T[],
): { overdueStep: T[]; noPlan: T[] } {
  const overdueStep: T[] = [];
  const noPlan: T[] = [];
  for (const d of deals) {
    const health = getDealHealth(d);
    if (health === 'overdue-action') overdueStep.push(d);
    else if (health === 'no-action') noPlan.push(d);
  }
  return { overdueStep, noPlan };
}

/**
 * Подпись строки в секции «Без плана».
 *
 * ⚠️ Различение то же, что в `nextStepSignal`: непустой `next_step` при пустой дате —
 * это НЕ «шаг не назначен». Сигнал, который врёт про повод, чинить не идут.
 */
export function noPlanReason(deal: DealForSplit): 'no-step' | 'no-date' {
  return deal.next_step?.trim() ? 'no-date' : 'no-step';
}
