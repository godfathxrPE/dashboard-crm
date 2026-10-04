import { describe, it, expect } from 'vitest';
import {
  planLeaveWithoutStep,
  planRestore,
  planStepWrites,
  stepAlreadyCleared,
  validateStepInput,
  type StepPrev,
  type StepWrite,
} from '@/lib/domain/step-flow';
import { countStepMoves, type AuditRow } from '@/lib/domain/field-moves';
import { stepActionsFor } from '@/lib/domain/step-actions';

const PREV: StepPrev = { next_step: 'Подготовить КП', next_action_date: '2026-09-30' };
const EMPTY: StepPrev = { next_step: null, next_action_date: null };

describe('planStepWrites', () => {
  it('done, шаг был, итог непустой → заметка, снять, назначить', () => {
    expect(planStepWrites('done', PREV, { note: 'Созвонились', nextStep: 'Отправить КП', dateKey: '2026-10-06' })).toEqual([
      { kind: 'note', body: 'Созвонились' },
      { kind: 'project', next_step: null, next_action_date: null },
      { kind: 'project', next_step: 'Отправить КП', next_action_date: '2026-10-06' },
    ]);
  });

  it('done, итог из пробелов → две записи без заметки', () => {
    const plan = planStepWrites('done', PREV, { note: '   ', nextStep: 'Отправить КП', dateKey: '2026-10-06' });
    expect(plan.map((w) => w.kind)).toEqual(['project', 'project']);
  });

  it('done, шага и даты не было → заметка и одна запись проекта', () => {
    expect(planStepWrites('done', EMPTY, { note: 'Итог', nextStep: 'Шаг', dateKey: '2026-10-06' })).toEqual([
      { kind: 'note', body: 'Итог' },
      { kind: 'project', next_step: 'Шаг', next_action_date: '2026-10-06' },
    ]);
  });

  it.each(['update', 'revive'] as const)('%s → порядок как у done, без заметки при пустом итоге', (mode) => {
    expect(planStepWrites(mode, PREV, { note: '', nextStep: 'Шаг', dateKey: '2026-10-06' })).toEqual([
      { kind: 'project', next_step: null, next_action_date: null },
      { kind: 'project', next_step: 'Шаг', next_action_date: '2026-10-06' },
    ]);
  });

  it('move → одна запись: текст прежний, дата новая', () => {
    expect(planStepWrites('move', PREV, { note: 'игнор', nextStep: 'игнор', dateKey: '2026-10-12' })).toEqual([
      { kind: 'project', next_step: 'Подготовить КП', next_action_date: '2026-10-12' },
    ]);
  });

  it('текст шага с пробелами по краям → записан без них', () => {
    const plan = planStepWrites('update', EMPTY, { note: '', nextStep: '  Позвонить  ', dateKey: '2026-10-06' });
    expect(plan).toEqual([{ kind: 'project', next_step: 'Позвонить', next_action_date: '2026-10-06' }]);
  });
});

describe('planLeaveWithoutStep / planRestore', () => {
  it('«Оставить без шага» с итогом → заметка и снятие', () => {
    expect(planLeaveWithoutStep(PREV, 'Клиент думает')).toEqual([
      { kind: 'note', body: 'Клиент думает' },
      { kind: 'project', next_step: null, next_action_date: null },
    ]);
  });

  it('шага не было и итог пуст → пустой план', () => {
    expect(planLeaveWithoutStep(EMPTY, '  ')).toEqual([]);
  });

  it('«Вернуть» → одна запись прежних значений', () => {
    expect(planRestore(PREV)).toEqual([{ kind: 'project', next_step: 'Подготовить КП', next_action_date: '2026-09-30' }]);
  });
});

describe('validateStepInput', () => {
  const TODAY = '2026-10-04';

  it('done без текста → no_step; без даты → no_date; move без текста с датой → null', () => {
    expect(validateStepInput('done', { note: '', nextStep: ' ', dateKey: '2026-10-06' }, TODAY, PREV)).toBe('no_step');
    expect(validateStepInput('done', { note: '', nextStep: 'Шаг', dateKey: '' }, TODAY, PREV)).toBe('no_date');
    expect(validateStepInput('move', { note: '', nextStep: '', dateKey: '2026-10-06' }, TODAY, PREV)).toBe(null);
    expect(validateStepInput('move', { note: '', nextStep: '', dateKey: '' }, TODAY, PREV)).toBe('no_date');
  });

  it('done: дата вчера → past_date; дата сегодня → null', () => {
    expect(validateStepInput('done', { note: '', nextStep: 'Шаг', dateKey: '2026-10-03' }, TODAY, PREV)).toBe('past_date');
    expect(validateStepInput('done', { note: '', nextStep: 'Шаг', dateKey: TODAY }, TODAY, PREV)).toBe(null);
  });

  it('move: та же дата → same_date, в т.ч. когда прежняя пришла таймстампом; дата позже → null', () => {
    const prev: StepPrev = { next_step: 'Шаг', next_action_date: '2026-10-08' };
    expect(validateStepInput('move', { note: '', nextStep: '', dateKey: '2026-10-08' }, TODAY, prev)).toBe('same_date');
    const prevTs: StepPrev = { next_step: 'Шаг', next_action_date: '2026-10-08T00:00:00+00:00' };
    expect(validateStepInput('move', { note: '', nextStep: '', dateKey: '2026-10-08' }, TODAY, prevTs)).toBe('same_date');
    expect(validateStepInput('move', { note: '', nextStep: '', dateKey: '2026-10-09' }, TODAY, prev)).toBe(null);
  });

  it('порядок: done без текста и с датой в прошлом → no_step', () => {
    expect(validateStepInput('done', { note: '', nextStep: '', dateKey: '2026-09-01' }, TODAY, PREV)).toBe('no_step');
  });
});

describe('stepAlreadyCleared', () => {
  const done = planStepWrites('done', PREV, { note: 'Итог', nextStep: 'Шаг', dateKey: '2026-10-06' });

  it('done с заметкой: упал на заметке или снятии → false; на назначении → true', () => {
    expect(done.map((w) => w.kind)).toEqual(['note', 'project', 'project']);
    expect(stepAlreadyCleared(done, 0)).toBe(false);
    expect(stepAlreadyCleared(done, 1)).toBe(false);
    expect(stepAlreadyCleared(done, 2)).toBe(true);
  });

  it('move, from = 0 → false; «Оставить без шага», упал на снятии → false', () => {
    expect(stepAlreadyCleared(planStepWrites('move', PREV, { note: '', nextStep: '', dateKey: '2026-10-12' }), 0)).toBe(false);
    const leave = planLeaveWithoutStep(PREV, 'Итог');
    expect(stepAlreadyCleared(leave, leave.length - 1)).toBe(false);
  });
});

// ── Связь с аудитом: строки, которые оставит план, через настоящую countStepMoves ──

/**
 * Модель аудита 087: на каждый UPDATE, где `next_action_date` поменялся, пишется
 * строка `changes.next_action_date = { from, to }`. Возвращает строки по убыванию
 * времени — так их отдаёт `useFieldMoves`.
 */
function auditAfter(start: string | null, history: readonly (string | null)[], writes: readonly StepWrite[]): AuditRow[] {
  const rows: AuditRow[] = [];
  let current = start;
  let t = 0;
  const push = (to: string | null) => {
    if (to === current) return;
    t += 1;
    rows.push({
      created_at: new Date(Date.UTC(2026, 8, 1, 0, t)).toISOString(),
      payload: { changes: { next_action_date: { from: current, to } } },
    });
    current = to;
  };
  for (const d of history) push(d);
  for (const w of writes) if (w.kind === 'project') push(w.next_action_date);
  return rows.reverse();
}

describe('план и счётчик переносов', () => {
  // Шаг назначен с нуля и перенесён вперёд шесть раз.
  const HISTORY = ['2026-09-01', '2026-09-05', '2026-09-10', '2026-09-15', '2026-09-20', '2026-09-25', '2026-09-30'];
  const prev: StepPrev = { next_step: 'Подготовить КП', next_action_date: '2026-09-30' };
  const count = (writes: StepWrite[]) => countStepMoves(auditAfter(null, HISTORY, writes)).count;

  it('до хода — 6', () => {
    expect(count([])).toBe(6);
  });

  it('после done — 0: новая дата назначена с нуля', () => {
    expect(count(planStepWrites('done', prev, { note: '', nextStep: 'Отправить КП', dateKey: '2026-10-06' }))).toBe(0);
  });

  it('после move на более позднюю дату — 7', () => {
    expect(count(planStepWrites('move', prev, { note: '', nextStep: '', dateKey: '2026-10-12' }))).toBe(7);
  });

  it('после done и «Вернуть» — 0: возврат назад не считается, счёт обрывается на null', () => {
    const done = planStepWrites('done', prev, { note: '', nextStep: 'Отправить КП', dateKey: '2026-10-06' });
    expect(count([...done, ...planRestore(prev)])).toBe(0);
  });

  it('после move и «Вернуть» — 7: перенос остаётся в аудите', () => {
    const move = planStepWrites('move', prev, { note: '', nextStep: '', dateKey: '2026-10-12' });
    expect(count([...move, ...planRestore(prev)])).toBe(7);
  });
});

// ── Кнопки хода (задача 4) ───────────────────────────────


describe('stepActionsFor', () => {
  const base = { noStep: false, assignedToday: null, group: 'fresh' as const };

  it('шага нет — «Назначить шаг» в любой группе и даже назначенное, без переноса', () => {
    for (const group of ['fresh', 'stale', 'decide', 'plan', 'risk'] as const) {
      expect(stepActionsFor({ ...base, noStep: true, group })).toEqual({
        primary: { label: 'Назначить шаг', mode: 'update' }, canMove: false, closeLink: false,
      });
    }
    expect(stepActionsFor({ noStep: true, assignedToday: { time: '11:00' }, group: 'plan' }).primary.mode).toBe('update');
  });

  it('назначено на сегодня побеждает группу: «Сделано» + «Перенести» даже у stale', () => {
    expect(stepActionsFor({ noStep: false, assignedToday: { time: null }, group: 'stale' }))
      .toEqual({ primary: { label: 'Сделано', mode: 'done' }, canMove: true, closeLink: false });
  });

  it('fresh и plan — «Сделано» + «Перенести»; stale и risk — «Обновить шаг»; decide — «Вернуть в работу» + ссылка', () => {
    expect(stepActionsFor({ ...base, group: 'plan' }).canMove).toBe(true);
    expect(stepActionsFor({ ...base, group: 'stale' })).toEqual({ primary: { label: 'Обновить шаг', mode: 'update' }, canMove: false, closeLink: false });
    expect(stepActionsFor({ ...base, group: 'risk' }).primary.label).toBe('Обновить шаг');
    expect(stepActionsFor({ ...base, group: 'decide' })).toEqual({ primary: { label: 'Вернуть в работу', mode: 'revive' }, canMove: false, closeLink: true });
  });
});
