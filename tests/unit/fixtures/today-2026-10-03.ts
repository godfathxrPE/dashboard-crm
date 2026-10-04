// Снимок живой БД на 03.10.2026 — эталон экрана «Сегодня» v3 (S-TODAY-V3-DOMAIN-1).
//
// 17 сделок экрана. Сумма уже посчитана по `dealHeaderAmount` (копейки). Касания —
// в 12:00 МСК своего дня, кроме отскока «Зерде Фито»: его строки журнала хранятся
// сырыми (`event_type`, `created_at`, `payload`), тест сам приводит их к
// `StageChangeRow` и пропускает через `dropStageBounces`.
//
// У всех сделок шаг задан, `status` — `open`, `planned` — `null`, никто не отложен.

import type { DealTouch, TouchKind } from '@/lib/domain/deal-touch';
import type { QuoteStatus } from '@/lib/validators/quote';

export interface FixtureActivityRow {
  event_type: string;
  created_at: string;
  payload: { from_stage_id: string | null; to_stage_id: string | null };
}

export interface FixtureDeal {
  id: string;
  phaseGroup: string;
  stageOrder: number;
  nextActionDate: string;
  amount: number | null;
  createdAt: string;
  touches: DealTouch[];
  stageLog: FixtureActivityRow[];
  quotes: { id: string; status: QuoteStatus; created_at: string; valid_until: string | null }[];
  tasks: { lane: string; deadline: string | null }[];
  calls: { status: string; date: string }[];
}

/** 12:00 МСК дня `MM-DD` 2026 года. */
function noon(monthDay: string): string {
  return `2026-${monthDay}T12:00:00+03:00`;
}

function t(spec: string): DealTouch[] {
  if (!spec) return [];
  return spec.split(', ').map((part) => {
    const [day, kind] = part.split(' ');
    return { at: noon(day), kind: kind as TouchKind };
  });
}

function deal(
  id: string,
  phaseGroup: string,
  stageOrder: number,
  nextActionDate: string,
  amount: number | null,
  createdDay: string,
  touches: string,
  extra: Partial<Pick<FixtureDeal, 'stageLog' | 'quotes' | 'tasks' | 'calls'>> = {},
): FixtureDeal {
  return {
    id,
    phaseGroup,
    stageOrder,
    nextActionDate,
    amount,
    createdAt: noon(createdDay),
    touches: t(touches),
    stageLog: extra.stageLog ?? [],
    quotes: extra.quotes ?? [],
    tasks: extra.tasks ?? [],
    calls: extra.calls ?? [],
  };
}

export const TODAY_2026_10_03: FixtureDeal[] = [
  deal('lorenz', 'working', 4, '2026-09-30', 1432697600, '08-24',
    '09-07 stage, 09-09 note, 09-15 note, 09-18 note, 09-22 note, 09-24 note, 09-29 stage'),
  deal('ar', 'attraction', 2, '2026-09-30', null, '09-30', '09-30 note'),
  deal('nytva', 'attraction', 3, '2026-09-25', null, '09-18', '09-21 note, 09-22 note, 09-24 note'),
  deal('fitnes', 'approval', 6, '2026-10-09', 390000000, '08-05',
    '09-08 note, 09-09 note, 09-16 note, 09-22 note, 09-23 note', {
      quotes: [{ id: 'fitnes-q1', status: 'sent', created_at: noon('09-04'), valid_until: '2026-09-18' }],
      tasks: [{ lane: 'now', deadline: noon('09-15') }],
    }),
  deal('glorus', 'closing', 5, '2026-09-08', 500000000, '09-04',
    '09-04 call, 09-07 note, 09-09 note, 09-14 stage, 09-30 stage'),
  deal('prodfond', 'attraction', 3, '2026-09-04', 150000000, '08-06', '09-16 note'),
  deal('hleb', 'working', 4, '2026-09-22', null, '08-11',
    '09-07 note, 09-09 note, 09-15 note, 09-16 note, 09-22 note, 09-23 task'),
  deal('rodina', 'attraction', 2, '2026-09-16', null, '09-10', '09-10 note, 09-16 note, 09-24 note, 09-30 note'),
  deal('mdm', 'attraction', 3, '2026-09-15', null, '08-21', '09-15 note, 09-16 note'),
  deal('hn', 'attraction', 2, '2026-09-18', 1000000000, '07-14', '09-14 note, 09-15 stage, 09-17 note'),
  deal('lid', 'attraction', 1, '2026-09-18', 100000, '09-17', ''),
  deal('rus', 'attraction', 2, '2026-09-18', null, '09-15', '09-15 note'),
  deal('agroh', 'attraction', 3, '2026-09-15', null, '08-21', '09-09 stage'),
  deal('agros', 'attraction', 2, '2026-09-10', null, '09-10', ''),
  deal('zerde', 'attraction', 1, '2026-08-26', null, '08-26', '', {
    stageLog: [
      {
        event_type: 'stage_changed',
        created_at: '2026-10-03T14:56:39Z',
        payload: { from_stage_id: 'lead', to_stage_id: 'won' },
      },
      {
        event_type: 'stage_changed',
        created_at: '2026-10-03T15:07:26Z',
        payload: { from_stage_id: 'won', to_stage_id: 'lead' },
      },
    ],
  }),
  deal('stroy', 'attraction', 2, '2026-10-05', null, '10-02', '10-02 note'),
  deal('anfish', 'attraction', 3, '2026-10-05', null, '10-02', '10-02 meeting, 10-02 note'),
];
