import { describe, it, expect } from 'vitest';
import {
  getDealSignals,
  DEFAULT_SIGNAL_THRESHOLDS,
  type DealSignal,
  type DealSignalContext,
  type SignalKey,
} from '@/lib/domain/deal-signals';
import type { StageTimeGauge } from '@/lib/domain/stage-norm';

// «Сейчас» фиксировано: функция принимает now параметром именно затем, чтобы тест
// не зависел от часов машины (урок S-LEAD-HUB-2b — leadStaleness читала Date.now()
// мимо переданного времени, и тест этого не ловил).
const NOW = new Date('2026-08-23T12:00:00Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86400000).toISOString();
}
/** Ключ дня (YYYY-MM-DD) со сдвигом от NOW — формат колонок `date`. */
function dateKey(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * 86400000).toISOString().slice(0, 10);
}

const OK_GAUGE: StageTimeGauge = { days: 2, norm: 21, pct: 10, state: 'ok' };

function ctx(patch: Partial<DealSignalContext> = {}): DealSignalContext {
  return {
    gauge: OK_GAUGE,
    phaseGroup: 'attraction',
    stakeholderCount: 2,
    lastActivityAt: daysAgo(0),
    ...patch,
  };
}

function find(signals: DealSignal[], key: SignalKey): DealSignal | undefined {
  return signals.find((s) => s.key === key);
}

describe('getDealSignals — терминальные сделки', () => {
  it('выигранная сделка не считается вовсе', () => {
    const r = getDealSignals(
      { status: 'won', created_at: daysAgo(200), deadline: dateKey(-100) },
      ctx({ lastActivityAt: daysAgo(90) }),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    expect(r).toEqual({ verdict: 'ok', signals: [], top: null });
  });
});

describe('getDealSignals — вердикт', () => {
  it('новая сделка с назначенным шагом и без дедлайна — new', () => {
    const r = getDealSignals(
      {
        status: 'open',
        created_at: daysAgo(1),
        next_step: 'Позвонить',
        next_action_date: dateKey(1),
        deadline: null,
      },
      ctx({ lastActivityAt: daysAgo(1) }),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    expect(r.verdict).toBe('new');
    expect(r.top).toBeNull();
  });

  it('bad побеждает grace-период: новая сделка с просроченным шагом — rotting', () => {
    const r = getDealSignals(
      {
        status: 'open',
        created_at: daysAgo(1),
        next_step: 'Позвонить',
        next_action_date: dateKey(-3),
      },
      ctx({ lastActivityAt: daysAgo(1) }),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    expect(r.verdict).toBe('rotting');
    expect(r.top?.key).toBe('next_step');
    expect(r.top?.label).toBe('Шаг просрочен на 3 дн.');
  });

  it('top отдаёт bad, когда есть и bad, и warn', () => {
    const r = getDealSignals(
      {
        status: 'open',
        created_at: daysAgo(60),
        next_step: 'Позвонить',
        next_action_date: dateKey(5), // шаг в порядке
        deadline: dateKey(3), // warn
      },
      ctx({ lastActivityAt: daysAgo(30) }), // тишина 30 дн. — bad
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    expect(r.top?.state).toBe('bad');
    expect(r.top?.key).toBe('silence');
    expect(r.signals.some((s) => s.state === 'warn')).toBe(true);
    // Сортировка: bad → warn → ok
    expect(r.signals[0].state).toBe('bad');
  });

  it('только warn при исчерпанном grace — attention', () => {
    const r = getDealSignals(
      {
        status: 'open',
        created_at: daysAgo(60),
        next_step: 'Позвонить',
        next_action_date: dateKey(5),
        deadline: dateKey(3),
      },
      ctx({ lastActivityAt: daysAgo(0) }),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    expect(r.verdict).toBe('attention');
    expect(r.top?.key).toBe('deadline');
  });
});

describe('getDealSignals — следующий шаг', () => {
  const base = {
    status: 'open' as const,
    created_at: daysAgo(60),
    deadline: null,
  };

  it('шаг написан, даты нет — warn и подпись про ДАТУ, а не «шаг не назначен»', () => {
    const r = getDealSignals(
      { ...base, next_step: 'Ожидаем материалы', next_action_date: null },
      ctx(),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    const s = find(r.signals, 'next_step');
    // warn, а не bad: `DealHealthDot` по той же оси рисует no-action жёлтым, и с
    // 'bad' список и карточка расходились. Шаг написан ⇒ неполнота записи.
    expect(s?.state).toBe('warn');
    expect(s?.label).toBe('У следующего шага нет даты');
    expect(s?.cta).toBe('Поставить дату');
  });

  it('свежая сделка с шагом без даты и без других проблем — new (кейс «М Д М»)', () => {
    // Ровно тот вход, из-за которого правка и делается: сделка создана 2 дня назад,
    // шаг написан словами, даты нет. С прежним 'bad' вердикт был «Киснет» на
    // двухдневной сделке — красный, который приучает игнорировать красный.
    const r = getDealSignals(
      {
        status: 'open',
        created_at: daysAgo(2),
        next_step: 'Ожидаем получение материала',
        next_action_date: null,
        deadline: null,
      },
      ctx({ lastActivityAt: daysAgo(2) }),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    expect(find(r.signals, 'next_step')?.state).toBe('warn');
    expect(r.verdict).toBe('new');
  });

  it('шага нет вовсе — подпись про сам шаг', () => {
    const r = getDealSignals(
      { ...base, next_step: null, next_action_date: null },
      ctx(),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    const s = find(r.signals, 'next_step');
    expect(s?.state).toBe('bad');
    expect(s?.label).toBe('Следующий шаг не назначен');
    expect(s?.cta).toBe('Назначить шаг');
  });
});

describe('getDealSignals — дедлайн', () => {
  const base = {
    status: 'open' as const,
    created_at: daysAgo(60),
    next_step: 'Позвонить',
    next_action_date: dateKey(5),
  };

  it('дедлайн в прошлом — bad', () => {
    const r = getDealSignals({ ...base, deadline: dateKey(-2) }, ctx(), DEFAULT_SIGNAL_THRESHOLDS, NOW);
    const s = find(r.signals, 'deadline');
    expect(s?.state).toBe('bad');
    expect(s?.label).toBe('Дедлайн просрочен на 2 дн.');
  });

  it('дедлайна нет — сигнала нет в списке (na, это полнота, а не динамика)', () => {
    const r = getDealSignals({ ...base, deadline: null }, ctx(), DEFAULT_SIGNAL_THRESHOLDS, NOW);
    expect(find(r.signals, 'deadline')).toBeUndefined();
  });

  it('дедлайн дальше порога — ok, а не наказание за близкий срок', () => {
    const r = getDealSignals({ ...base, deadline: dateKey(20) }, ctx(), DEFAULT_SIGNAL_THRESHOLDS, NOW);
    expect(find(r.signals, 'deadline')?.state).toBe('ok');
  });
});

describe('getDealSignals — single_threaded', () => {
  const base = {
    status: 'open' as const,
    created_at: daysAgo(60),
    next_step: 'Позвонить',
    next_action_date: dateKey(5),
  };

  it('на attraction один контакт — норма, сигнала нет', () => {
    const r = getDealSignals(
      base,
      ctx({ phaseGroup: 'attraction', stakeholderCount: 1 }),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    expect(find(r.signals, 'single_threaded')).toBeUndefined();
  });

  it('на closing один контакт — warn', () => {
    const r = getDealSignals(
      base,
      ctx({ phaseGroup: 'closing', stakeholderCount: 1 }),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    expect(find(r.signals, 'single_threaded')?.state).toBe('warn');
  });

  it('стейкхолдеры не загрузились (null) — сигнала нет, а не «ноль участников»', () => {
    const r = getDealSignals(
      base,
      ctx({ phaseGroup: 'closing', stakeholderCount: null }),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    expect(find(r.signals, 'single_threaded')).toBeUndefined();
  });
});

describe('getDealSignals — тишина', () => {
  const base = {
    status: 'open' as const,
    next_step: 'Позвонить',
    next_action_date: dateKey(5),
  };

  it('журнал пуст — считаем от created_at (иначе сигнал мёртв)', () => {
    const r = getDealSignals(
      { ...base, created_at: daysAgo(12) },
      ctx({ lastActivityAt: null }),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    const s = find(r.signals, 'silence');
    expect(s?.state).toBe('bad');
    expect(s?.label).toBe('Тишина 12 дн.');
  });

  it('половина порога — warn', () => {
    const r = getDealSignals(
      { ...base, created_at: daysAgo(60) },
      ctx({ lastActivityAt: daysAgo(6) }),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    expect(find(r.signals, 'silence')?.state).toBe('warn');
  });
});

describe('getDealSignals — пороги организации', () => {
  it('silenceDays из настроек перекрывает дефолт: тот же вход даёт ok', () => {
    const project = {
      status: 'open' as const,
      created_at: daysAgo(12),
      next_step: 'Позвонить',
      next_action_date: dateKey(5),
    };
    const context = ctx({ lastActivityAt: null });

    const byDefault = getDealSignals(project, context, DEFAULT_SIGNAL_THRESHOLDS, NOW);
    expect(byDefault.verdict).toBe('rotting');

    const relaxed = getDealSignals(
      project,
      context,
      { ...DEFAULT_SIGNAL_THRESHOLDS, silenceDays: 30 },
      NOW,
    );
    expect(find(relaxed.signals, 'silence')?.state).toBe('ok');
    expect(relaxed.verdict).toBe('ok');
  });

  it('graceDays из настроек продлевает льготу', () => {
    const project = {
      status: 'open' as const,
      created_at: daysAgo(10),
      next_step: 'Позвонить',
      next_action_date: dateKey(5),
      deadline: dateKey(3), // warn
    };
    const context = ctx({ lastActivityAt: daysAgo(0) });

    expect(getDealSignals(project, context, DEFAULT_SIGNAL_THRESHOLDS, NOW).verdict).toBe('attention');
    expect(
      getDealSignals(project, context, { ...DEFAULT_SIGNAL_THRESHOLDS, graceDays: 20 }, NOW).verdict,
    ).toBe('new');
  });
});

describe('getDealSignals — стадия', () => {
  const base = {
    status: 'open' as const,
    created_at: daysAgo(60),
    next_step: 'Позвонить',
    next_action_date: dateKey(5),
  };

  it('перерасход нормы — bad и без кнопки (двигать стадию — решение, не починка)', () => {
    const r = getDealSignals(
      base,
      ctx({ gauge: { days: 30, norm: 21, pct: 100, state: 'over' } }),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    const s = find(r.signals, 'stage_dwell');
    expect(s?.state).toBe('bad');
    expect(s?.cta).toBeNull();
    expect(s?.label).toBe('В стадии 30 дн. при норме 21');
  });

  it('нормы нет — сигнала нет', () => {
    const r = getDealSignals(
      base,
      ctx({ gauge: { days: 5, norm: null, pct: null, state: 'ok' } }),
      DEFAULT_SIGNAL_THRESHOLDS,
      NOW,
    );
    expect(find(r.signals, 'stage_dwell')).toBeUndefined();
  });
});
