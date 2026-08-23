import { describe, it, expect } from 'vitest';
import {
  snoozeKey,
  isSnoozed,
  isSnoozeActive,
  activeSnoozes,
  activeSnoozeKeys,
  excludeSnoozed,
  splitDealsByHealth,
  noPlanReason,
  type QueueSnooze,
} from '@/lib/domain/queue-snooze';

// ═══════════════════════════════════════════════════════
// S-QUEUE-1 — очередь дня: отложенные строки и разделение «гниющих» сделок.
//
// «Сегодня» везде фиксировано параметром: с `Date.now()` внутри тест был бы зелёным
// только до полуночи. Исключение — `splitDealsByHealth`: `getDealHealth` читает
// текущее время само, поэтому даты в кейсах заведомо далёкие от границы суток.
// ═══════════════════════════════════════════════════════

const TODAY = '2026-08-23';
const YESTERDAY = '2026-08-22';
const TOMORROW = '2026-08-24';

const snooze = (over: Partial<QueueSnooze> = {}): QueueSnooze => ({
  id: 's1',
  entity_type: 'deal',
  entity_id: 'e1',
  until: TOMORROW,
  ...over,
});

describe('isSnoozed — граница «до какого дня включительно»', () => {
  it('until = сегодня → строка ещё СКРЫТА (обещание «до завтра» включает сегодня)', () => {
    const list = [snooze({ until: TODAY })];
    expect(isSnoozed('deal:e1', list, TODAY)).toBe(true);
    expect(isSnoozeActive(list[0], TODAY)).toBe(true);
  });

  it('until = вчера → строка снова видна', () => {
    const list = [snooze({ until: YESTERDAY })];
    expect(isSnoozed('deal:e1', list, TODAY)).toBe(false);
    expect(isSnoozeActive(list[0], TODAY)).toBe(false);
  });

  it('until = завтра → скрыта', () => {
    expect(isSnoozed('deal:e1', [snooze({ until: TOMORROW })], TODAY)).toBe(true);
  });

  it('пустой список snooze не прячет ничего', () => {
    expect(isSnoozed('deal:e1', [], TODAY)).toBe(false);
  });

  it('activeSnoozes отсеивает просроченные, оставляя сегодняшние', () => {
    const list = [
      snooze({ id: 'a', until: YESTERDAY }),
      snooze({ id: 'b', entity_id: 'e2', until: TODAY }),
      snooze({ id: 'c', entity_id: 'e3', until: TOMORROW }),
    ];
    expect(activeSnoozes(list, TODAY).map((s) => s.id)).toEqual(['b', 'c']);
  });
});

describe('snoozeKey — тип входит в ключ', () => {
  it('ключ строится как `type:id`', () => {
    expect(snoozeKey('deal', 'abc')).toBe('deal:abc');
    expect(snoozeKey('lead', 'abc')).toBe('lead:abc');
    expect(snoozeKey('contact', 'abc')).toBe('contact:abc');
  });

  it('сделка и лид с ОДИНАКОВЫМ uuid не путаются', () => {
    const shared = '11111111-1111-4111-8111-111111111111';
    const list = [snooze({ entity_type: 'deal', entity_id: shared })];

    expect(isSnoozed(snoozeKey('deal', shared), list, TODAY)).toBe(true);
    // Лид с тем же id отложен НЕ был — прятать его нельзя.
    expect(isSnoozed(snoozeKey('lead', shared), list, TODAY)).toBe(false);
    expect(isSnoozed(snoozeKey('contact', shared), list, TODAY)).toBe(false);
  });

  it('activeSnoozeKeys отдаёт ключи только активных', () => {
    const keys = activeSnoozeKeys(
      [
        snooze({ id: 'a', entity_type: 'lead', entity_id: 'L1', until: TOMORROW }),
        snooze({ id: 'b', entity_type: 'deal', entity_id: 'D1', until: YESTERDAY }),
      ],
      TODAY,
    );
    expect([...keys]).toEqual(['lead:L1']);
  });
});

describe('splitDealsByHealth — «просрочен шаг» против «без плана»', () => {
  const deal = (over: Record<string, unknown> = {}) => ({
    id: 'd',
    status: 'open' as const,
    next_step: null as string | null,
    next_action_date: null as string | null,
    ...over,
  });

  it('шаг написан, даты нет → «Без плана», а не «Просрочен шаг»', () => {
    const d = deal({ id: 'd1', next_step: 'Позвонить в понедельник', next_action_date: null });
    const { overdueStep, noPlan } = splitDealsByHealth([d]);
    expect(noPlan.map((x) => x.id)).toEqual(['d1']);
    expect(overdueStep).toHaveLength(0);
  });

  it('шага нет вовсе → «Без плана»', () => {
    const { noPlan } = splitDealsByHealth([deal({ id: 'd2' })]);
    expect(noPlan.map((x) => x.id)).toEqual(['d2']);
  });

  it('шаг и дата в прошлом → «Просрочен шаг»', () => {
    const d = deal({ id: 'd3', next_step: 'Отправить КП', next_action_date: '2020-01-01' });
    const { overdueStep, noPlan } = splitDealsByHealth([d]);
    expect(overdueStep.map((x) => x.id)).toEqual(['d3']);
    expect(noPlan).toHaveLength(0);
  });

  it('дата в будущем → сделка здорова и не попадает ни в одну секцию', () => {
    const d = deal({ id: 'd4', next_step: 'Встреча', next_action_date: '2099-01-01' });
    const { overdueStep, noPlan } = splitDealsByHealth([d]);
    expect(overdueStep).toHaveLength(0);
    expect(noPlan).toHaveLength(0);
  });

  it('закрытая сделка не «гниёт» — ни в одну секцию', () => {
    const d = deal({ id: 'd5', status: 'won' as const });
    const { overdueStep, noPlan } = splitDealsByHealth([d]);
    expect(overdueStep).toHaveLength(0);
    expect(noPlan).toHaveLength(0);
  });

  it('noPlanReason различает повод: «нет даты» против «нет шага»', () => {
    expect(noPlanReason({ next_step: 'Позвонить', next_action_date: null })).toBe('no-date');
    expect(noPlanReason({ next_step: '   ', next_action_date: null })).toBe('no-step');
    expect(noPlanReason({ next_step: null, next_action_date: null })).toBe('no-step');
  });
});

describe('total считает только видимое', () => {
  const deals = [{ id: 'D1' }, { id: 'D2' }, { id: 'D3' }];
  const leads = [{ id: 'L1' }, { id: 'L2' }];

  it('отложенная строка выходит и из списка, и из счётчика', () => {
    const keys = activeSnoozeKeys(
      [snooze({ entity_type: 'deal', entity_id: 'D2', until: TOMORROW })],
      TODAY,
    );
    const visibleDeals = excludeSnoozed(deals, 'deal', (d) => d.id, keys);
    const visibleLeads = excludeSnoozed(leads, 'lead', (l) => l.id, keys);

    expect(visibleDeals.map((d) => d.id)).toEqual(['D1', 'D3']);
    expect(visibleDeals.length + visibleLeads.length).toBe(4); // было 5
  });

  it('просроченный snooze счётчик не уменьшает', () => {
    const keys = activeSnoozeKeys(
      [snooze({ entity_type: 'deal', entity_id: 'D2', until: YESTERDAY })],
      TODAY,
    );
    expect(excludeSnoozed(deals, 'deal', (d) => d.id, keys)).toHaveLength(3);
  });

  it('snooze на лид не вычитает одноимённую сделку', () => {
    const keys = activeSnoozeKeys(
      [snooze({ entity_type: 'lead', entity_id: 'D1', until: TOMORROW })],
      TODAY,
    );
    expect(excludeSnoozed(deals, 'deal', (d) => d.id, keys)).toHaveLength(3);
  });
});
