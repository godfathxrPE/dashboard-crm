import { describe, it, expect } from 'vitest';
import { buildStageProfile, PROFILE_BAR_H } from '@/lib/domain/stage-profile';
import type { StageTimeGauge } from '@/lib/domain/stage-norm';

// «Сейчас» фиксировано — функция принимает now параметром (правило проекта).
const NOW = new Date('2026-09-24T09:00:00Z');

const STAGES = [
  { id: 'a', name: 'Лид', phase_group: 'attraction' },
  { id: 'b', name: 'Квалификация', phase_group: 'attraction' },
  { id: 'c', name: 'Подготовка КП', phase_group: 'working' },
  { id: 'd', name: 'Защита КП', phase_group: 'closing' },
  { id: 'e', name: 'Договор', phase_group: 'closing' },
];

const NORMS = { a: 2, b: 3, c: 5, d: 10, e: 7 };

function gauge(days: number | null, norm: number | null): StageTimeGauge {
  if (days == null) return { days: null, norm, pct: null, state: 'ok' };
  if (norm == null) return { days, norm: null, pct: null, state: 'ok' };
  const raw = (days / norm) * 100;
  return {
    days,
    norm,
    pct: Math.min(100, Math.round(raw)),
    state: days > norm ? 'over' : raw >= 70 ? 'warn' : 'ok',
  };
}

describe('buildStageProfile — масштаб', () => {
  it('pxPerDay = H / max(нормы, факт текущей)', () => {
    const p = buildStageProfile(STAGES, { a: 1, b: 2, c: 4 }, NORMS, gauge(3, 10), NOW, { currentIndex: 3 });
    expect(p.pxPerDay).toBe(PROFILE_BAR_H / 10);
    expect(p.scaleLabel).toBe('9 px = 1 день');
  });

  it('pxPerDay < 1 — подпись «1 px = N дн.»', () => {
    // fix-S-STAGE-PROFILE-2: масштаб задаёт текущая (180), а не выброс прошлой.
    const p = buildStageProfile(STAGES, { a: 1 }, NORMS, gauge(180, 3), NOW, { currentIndex: 1 });
    expect(p.pxPerDay).toBe(0.5);
    expect(p.scaleLabel).toBe('1 px = 2 дн.');
    // короткий факт схлопывается до минимума, а не исчезает
    expect(p.columns[0].fillPx).toBe(3);
  });

  it('выброс прошлой не задаёт масштаб: обрезан до столбика с флагом clipped', () => {
    // «ЭЙЧ ЭНД ЭН»: «Лид» 62 при норме 2, текущая «Квалификация» 9 при норме 3.
    const norms = { a: 2, b: 3, c: 5, d: 7, e: 7 };
    const p = buildStageProfile(STAGES, { a: 62 }, norms, gauge(9, 3), NOW, { currentIndex: 1 });
    expect(p.pxPerDay).toBe(PROFILE_BAR_H / 9);
    const [lead, cur] = p.columns;
    expect(lead.clipped).toBe(true);
    expect(lead.fillPx).toBe(PROFILE_BAR_H);
    expect(lead.fact).toBe(62); // число над столбиком — честный факт
    expect(lead.overPx).toBeCloseTo(PROFILE_BAR_H - lead.contourPx); // от обрезанной высоты
    expect(cur.fillPx).toBe(PROFILE_BAR_H);
    expect(cur.clipped).toBeFalsy();
  });

  it('прошлая в пределах масштаба — не clipped', () => {
    const p = buildStageProfile(STAGES, { a: 1, b: 2 }, NORMS, gauge(4, 5), NOW, { currentIndex: 2 });
    expect(p.columns[0].clipped).toBeFalsy();
    expect(p.columns[1].clipped).toBeFalsy();
  });

  it('allDone — масштаб по всем фактам, как до фикса, clipped ни у кого', () => {
    const facts = { a: 62, b: 3, c: 4, d: 5, e: 6 };
    const p = buildStageProfile(STAGES, facts, NORMS, gauge(0, null), NOW, {
      currentIndex: -1,
      allDone: true,
      locked: true,
    });
    expect(p.pxPerDay).toBe(PROFILE_BAR_H / 62);
    expect(p.columns.some((c) => c.clipped)).toBe(false);
  });

  it('нет норм — масштаб по фактам, как до фикса', () => {
    const p = buildStageProfile(STAGES, { a: 62 }, {}, gauge(9, null), NOW, { currentIndex: 1 });
    expect(p.hasNorms).toBe(false);
    expect(p.pxPerDay).toBe(PROFILE_BAR_H / 62);
    expect(p.columns[0].clipped).toBeFalsy();
  });

  it('факт 0 — заглушка 2px, а не пустота', () => {
    const p = buildStageProfile(STAGES, { a: 0 }, NORMS, gauge(1, 3), NOW, { currentIndex: 1 });
    expect(p.columns[0].fact).toBe(0);
    expect(p.columns[0].fillPx).toBe(2);
  });
});

describe('buildStageProfile — состояния колонок', () => {
  it('пересвет прошлой: over, пересвет = заливка − контур', () => {
    const p = buildStageProfile(STAGES, { a: 1, b: 5 }, NORMS, gauge(1, 5), NOW, { currentIndex: 2 });
    const b = p.columns[1];
    expect(b.kind).toBe('past');
    expect(b.over).toBe(true);
    expect(b.overPx).toBeCloseTo(b.fillPx - b.contourPx);
    expect(p.columns[0].over).toBe(false);
  });

  it('over текущей: факт из gauge.days, тон over, линия «сегодня» на высоте факта', () => {
    const p = buildStageProfile(STAGES, { a: 1, b: 2, c: 4, d: 99 }, NORMS, gauge(14, 10), NOW, { currentIndex: 3 });
    const d = p.columns[3];
    expect(d.kind).toBe('current');
    expect(d.fact).toBe(14); // gauge.days, а не totalByStage (99 — все заходы)
    expect(d.tone).toBe('over');
    expect(d.over).toBe(true);
    expect(d.todayPx).toBe(d.fillPx);
    expect(p.groups[2].tone).toBe('over');
  });

  it('пропущенная стадия: нет ключа в factDays → skipped, без заливки', () => {
    const p = buildStageProfile(STAGES, { a: 1 }, NORMS, gauge(2, 5), NOW, { currentIndex: 2 });
    expect(p.columns[1].kind).toBe('skipped');
    expect(p.columns[1].fact).toBeNull();
    expect(p.columns[1].fillPx).toBe(0);
  });

  it('revisit: число заходов из visits, факт = сумма заходов', () => {
    const p = buildStageProfile(STAGES, { a: 5, b: 2 }, NORMS, gauge(1, 5), NOW, {
      currentIndex: 2,
      visits: { a: 3, b: 1 },
    });
    expect(p.columns[0].visits).toBe(3);
    expect(p.columns[0].fact).toBe(5);
  });

  it('next и todo: следующая за текущей — next, дальше — todo', () => {
    const p = buildStageProfile(STAGES, { a: 1 }, NORMS, gauge(1, 3), NOW, { currentIndex: 1 });
    expect(p.columns.map((c) => c.kind)).toEqual(['past', 'current', 'next', 'todo', 'todo']);
  });

  it('история будущей колонки (откат назад): historic, без пересвета, в «прошло» входит', () => {
    // «Продовольственный фонд»: была на «Подготовке КП», откатили на «Квалификацию».
    const p = buildStageProfile(STAGES, { a: 1, c: 9 }, NORMS, gauge(2, 3), NOW, { currentIndex: 1 });
    const c = p.columns[2];
    expect(c.kind).toBe('next');
    expect(c.historic).toBe(true);
    expect(c.over).toBe(false);
    expect(p.footer.mode).toBe('open');
    if (p.footer.mode === 'open') expect(p.footer.priorFact).toBe(10);
    // Σ факт группы = числам над столбиками: у будущей там «≈ норма»
    expect(p.groups[1].factSum).toBeNull();
  });

  it('gauge.days === null — текущая без заливки и без «сегодня»', () => {
    const p = buildStageProfile(STAGES, { a: 1 }, NORMS, gauge(null, 3), NOW, { currentIndex: 1 });
    expect(p.columns[1].fact).toBeNull();
    expect(p.columns[1].fillPx).toBe(0);
    expect(p.columns[1].todayPx).toBeNull();
  });
});

describe('buildStageProfile — нет норм', () => {
  it('пустой normDays: контуров нет, подписи масштаба нет, масштаб по фактам', () => {
    const p = buildStageProfile(STAGES, { a: 3, b: 6 }, {}, gauge(2, null), NOW, { currentIndex: 2 });
    expect(p.hasNorms).toBe(false);
    expect(p.scaleLabel).toBeNull();
    expect(p.columns.every((c) => c.contourPx === 0)).toBe(true);
    expect(p.pxPerDay).toBe(PROFILE_BAR_H / 6);
    expect(p.groups[0].normSum).toBeNull();
    if (p.footer.mode === 'open') {
      expect(p.footer.diff).toBeNull();
      expect(p.footer.ahead).toBeNull();
      expect(p.footer.finishKey).toBeNull();
    }
  });

  it('gauge === null — нормы не рисуются, даже если переданы', () => {
    const p = buildStageProfile(STAGES, { a: 3 }, NORMS, null, NOW, { currentIndex: 1 });
    expect(p.hasNorms).toBe(false);
  });
});

describe('buildStageProfile — группы и футер', () => {
  it('Σ группы: факт прошлых + gauge.days текущей, норма — по всем стадиям', () => {
    const p = buildStageProfile(STAGES, { a: 1, b: 2, c: 4 }, NORMS, gauge(8, 10), NOW, { currentIndex: 3 });
    expect(p.groups.map((g) => [g.key, g.span, g.factSum, g.normSum])).toEqual([
      ['attraction', 2, 3, 5],
      ['working', 1, 4, 5],
      ['closing', 2, 8, 17],
    ]);
    expect(p.groups[2].tone).toBe('warn');
  });

  it('футер: прошло vs норма прошлых, впереди = остаток текущей + нормы будущих', () => {
    const p = buildStageProfile(STAGES, { a: 1, b: 5, c: 4 }, NORMS, gauge(3, 10), NOW, { currentIndex: 3 });
    expect(p.footer).toMatchObject({ mode: 'open', priorFact: 10, priorNorm: 10, diff: 0, ahead: 14, overBy: null });
  });

  it('over текущей: «норма исчерпана N дн. назад», остаток текущей не уходит в минус', () => {
    const p = buildStageProfile(STAGES, { a: 1, b: 2, c: 4 }, NORMS, gauge(14, 10), NOW, { currentIndex: 3 });
    expect(p.footer).toMatchObject({ mode: 'open', overBy: 4, ahead: 7 });
  });

  it('прогноз финиша null, если у будущей стадии нет нормы', () => {
    const p = buildStageProfile(STAGES, { a: 1 }, { a: 2, b: 3, c: 5, d: 10 }, gauge(1, 3), NOW, {
      currentIndex: 1,
    });
    if (p.footer.mode !== 'open') throw new Error('ожидался open');
    expect(p.footer.ahead).toBeNull();
    expect(p.footer.finishKey).toBeNull();
  });

  it('финиш — МСК-ключ дня: 22:30 UTC — это уже следующие сутки в Москве', () => {
    const lateUtc = new Date('2026-09-24T22:30:00Z'); // 25.09 01:30 МСК
    const p = buildStageProfile(STAGES, { a: 1, b: 2, c: 4 }, NORMS, gauge(8, 10), lateUtc, { currentIndex: 3 });
    if (p.footer.mode !== 'open') throw new Error('ожидался open');
    expect(p.footer.ahead).toBe(9); // 2 остатка + 7 «Договор»
    expect(p.footer.finishKey).toBe('2026-10-04'); // 25.09 + 9, а не 24.09 + 9
  });

  it('won (allDone): все колонки пройдены, футер «пройдена за»', () => {
    const p = buildStageProfile(STAGES, { a: 1, b: 2, c: 4, d: 8, e: 3 }, NORMS, gauge(40, null), NOW, {
      currentIndex: -1,
      allDone: true,
      locked: true,
    });
    expect(p.columns.every((c) => c.kind === 'past')).toBe(true);
    expect(p.columns.every((c) => c.todayPx === null)).toBe(true);
    expect(p.footer).toEqual({ mode: 'won', visited: 5, totalFact: 18, totalNorm: 27, diff: -9 });
  });

  it('lost: последняя активная стадия — текущая с фактом журнала, тон muted, «сегодня» нет', () => {
    const p = buildStageProfile(STAGES, { a: 1, b: 2, c: 6 }, NORMS, gauge(30, null), NOW, {
      currentIndex: 2,
      locked: true,
    });
    const c = p.columns[2];
    expect(c.kind).toBe('current');
    expect(c.fact).toBe(6); // из factDays, а не из датчика терминальной стадии
    expect(c.tone).toBe('muted');
    expect(c.todayPx).toBeNull();
    expect(p.columns[3].kind).toBe('todo'); // у терминала «следующей» нет
    expect(p.footer).toMatchObject({ mode: 'closed', totalFact: 9 });
  });
});
