import { describe, it, expect } from 'vitest';
import {
  TOUCH_EVENT_TYPES,
  dropStageBounces,
  lastTouchAt,
  touchKindOfActivity,
  touchesFromRows,
  type ActivityTouchRow,
  type DealTouch,
  type StageChangeRow,
} from '@/lib/domain/deal-touch';
import { TODAY_2026_10_03 } from './fixtures/today-2026-10-03';

// «Сейчас» — аргументом, середина дня по МСК.
const NOW = new Date('2026-10-03T12:00:00+03:00');

function row(at: string, from: string | null, to: string | null): StageChangeRow {
  return { at, fromStageId: from, toStageId: to };
}

describe('touchKindOfActivity', () => {
  it.each([
    ['stage_changed', 'stage'],
    ['task_completed', 'task'],
    ['call_logged', 'call'],
    ['meeting_scheduled', 'meeting'],
  ])('%s → %s', (eventType, kind) => {
    expect(touchKindOfActivity(eventType)).toBe(kind);
  });

  it.each([
    'project_updated',
    'comment_added',
    'task_created',
    'entity_deleted',
    'automation_fired',
    'stage_transition_committed',
    'lead_status_changed',
    'что-то-новое',
  ])('%s → null', (eventType) => {
    expect(touchKindOfActivity(eventType)).toBeNull();
  });

  it('каждый тип из TOUCH_EVENT_TYPES — касание: список запроса и таблица видов не расходятся', () => {
    for (const eventType of TOUCH_EVENT_TYPES) {
      expect(touchKindOfActivity(eventType)).not.toBeNull();
    }
  });
});

describe('dropStageBounces', () => {
  it('A→B в 17:56 и B→A в 18:07 — пара снята', () => {
    const rows = [
      row('2026-10-03T17:56:00+03:00', 'A', 'B'),
      row('2026-10-03T18:07:00+03:00', 'B', 'A'),
    ];
    expect(dropStageBounces(rows)).toEqual([]);
  });

  it('те же две строки через 31 минуту — обе остаются', () => {
    const rows = [
      row('2026-10-03T17:56:00+03:00', 'A', 'B'),
      row('2026-10-03T18:27:00+03:00', 'B', 'A'),
    ];
    expect(dropStageBounces(rows)).toEqual(rows);
  });

  it('A→B, затем B→C — обе остаются', () => {
    const rows = [
      row('2026-10-03T17:56:00+03:00', 'A', 'B'),
      row('2026-10-03T18:00:00+03:00', 'B', 'C'),
    ];
    expect(dropStageBounces(rows)).toEqual(rows);
  });

  it('A→B, B→A, A→B за десять минут — остаётся третья', () => {
    const third = row('2026-10-03T18:06:00+03:00', 'A', 'B');
    const rows = [
      row('2026-10-03T17:56:00+03:00', 'A', 'B'),
      row('2026-10-03T18:01:00+03:00', 'B', 'A'),
      third,
    ];
    expect(dropStageBounces(rows)).toEqual([third]);
  });

  it('вход в обратном порядке времени — тот же результат', () => {
    const third = row('2026-10-03T18:06:00+03:00', 'A', 'B');
    const rows = [
      third,
      row('2026-10-03T18:01:00+03:00', 'B', 'A'),
      row('2026-10-03T17:56:00+03:00', 'A', 'B'),
    ];
    expect(dropStageBounces(rows)).toEqual([third]);
  });

  it('строки с null вместо id стадий в пределах десяти минут — обе остаются', () => {
    const rows = [
      row('2026-10-03T17:56:00+03:00', null, null),
      row('2026-10-03T18:00:00+03:00', null, null),
    ];
    expect(dropStageBounces(rows)).toEqual(rows);
  });
});

describe('lastTouchAt', () => {
  it('пусто → null', () => {
    expect(lastTouchAt([], NOW)).toBeNull();
  });

  it('касание завтрашним днём не считается', () => {
    const touches: DealTouch[] = [{ at: '2026-10-04T10:00:00+03:00', kind: 'note' }];
    expect(lastTouchAt(touches, NOW)).toBeNull();
  });

  it('касание сегодня на час позже now считается', () => {
    const at = '2026-10-03T13:00:00+03:00';
    expect(lastTouchAt([{ at, kind: 'note' }], NOW)).toBe(at);
  });

  it('возвращается максимум, а не первый элемент', () => {
    const touches: DealTouch[] = [
      { at: '2026-09-20T12:00:00+03:00', kind: 'note' },
      { at: '2026-10-01T12:00:00+03:00', kind: 'stage' },
      { at: '2026-09-25T12:00:00+03:00', kind: 'task' },
    ];
    expect(lastTouchAt(touches, NOW)).toBe('2026-10-01T12:00:00+03:00');
  });
});

describe('touchesFromRows', () => {
  const note = (project_id: string | null, created_at: string | null, kind = 'note') => ({ project_id, created_at, kind });
  const act = (project_id: string | null, event_type: string, created_at: string | null, payload: unknown = {}): ActivityTouchRow =>
    ({ project_id, event_type, created_at, payload });

  it('заметка и stage_changed одной сделки → два касания по возрастанию времени', () => {
    const map = touchesFromRows(
      [note('p1', '2026-10-02T12:00:00+03:00')],
      [act('p1', 'stage_changed', '2026-10-01T12:00:00+03:00', { from_stage_id: 'a', to_stage_id: 'b' })],
    );
    expect(map.get('p1')).toEqual([
      { at: '2026-10-01T12:00:00+03:00', kind: 'stage' },
      { at: '2026-10-02T12:00:00+03:00', kind: 'note' },
    ]);
  });

  it('строки без project_id и без created_at пропущены', () => {
    const map = touchesFromRows(
      [note(null, '2026-10-02T12:00:00+03:00'), note('p1', null)],
      [act(null, 'task_completed', '2026-10-02T12:00:00+03:00'), act('p1', 'call_logged', null)],
    );
    expect(map.size).toBe(0);
  });

  it('заметка kind = stage_comment касанием не становится', () => {
    const map = touchesFromRows([note('p1', '2026-10-02T12:00:00+03:00', 'stage_comment')], []);
    expect(map.get('p1')).toBeUndefined();
  });

  it('project_updated и неизвестный тип пропущены', () => {
    const map = touchesFromRows(
      [],
      [act('p1', 'project_updated', '2026-10-02T12:00:00+03:00'), act('p1', 'что-то-новое', '2026-10-02T13:00:00+03:00')],
    );
    expect(map.get('p1')).toBeUndefined();
  });

  it('отскок «Зерде Фито» из фикстуры → касаний нет', () => {
    const zerde = TODAY_2026_10_03.find((d) => d.id === 'zerde');
    const rows = (zerde?.stageLog ?? []).map((r) => act('zerde', r.event_type, r.created_at, r.payload));
    expect(rows).toHaveLength(2);
    expect(touchesFromRows([], rows).get('zerde')).toBeUndefined();
  });

  it.each([
    ['строка', 'lead→won'],
    ['null', null],
    ['массив', ['lead', 'won']],
  ])('payload — %s → id стадий пустые, строка остаётся касанием', (_label, payload) => {
    const map = touchesFromRows(
      [],
      [
        act('p1', 'stage_changed', '2026-10-03T17:56:00+03:00', payload),
        act('p1', 'stage_changed', '2026-10-03T18:00:00+03:00', payload),
      ],
    );
    expect(map.get('p1')).toHaveLength(2);
  });

  it('события двух сделок не смешиваются (и отскок не собирается из двух сделок)', () => {
    const map = touchesFromRows(
      [note('p2', '2026-10-02T12:00:00+03:00')],
      [
        act('p1', 'stage_changed', '2026-10-03T17:56:00+03:00', { from_stage_id: 'a', to_stage_id: 'b' }),
        act('p2', 'stage_changed', '2026-10-03T18:00:00+03:00', { from_stage_id: 'b', to_stage_id: 'a' }),
      ],
    );
    expect(map.get('p1')).toEqual([{ at: '2026-10-03T17:56:00+03:00', kind: 'stage' }]);
    expect(map.get('p2')?.map((t) => t.kind)).toEqual(['note', 'stage']);
  });
});
