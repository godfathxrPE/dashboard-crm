import { describe, it, expect } from 'vitest';
import {
  isTimelineRpcRow,
  rpcRowToEvent,
  type TimelineRpcRow,
} from '@/lib/timeline/rpc-adapter';
import { presetTitle } from '@/lib/constants/ai-presets';

// S-TL-1. Лента переехала в SQL-функцию `entity_timeline`, но заголовки по-прежнему
// собирает TypeScript. Здесь проверяется ровно шов между ними: строка RPC → событие
// ленты. Адаптеры (`adapters.ts`, `describeEvent`, `presetTitle`) спринт не трогал,
// поэтому тесты смотрят на то, что из них ВЫШЛО через новый переходник.
//
// Чистая функция, без Supabase — по образцу `ai-run-timeline.test.ts`.

const UUID = '11111111-2222-3333-4444-555555555555';

/** `now` фиксирован: `overdue` — функция текущего времени, `Date.now()` в тесте врал бы. */
const NOW = Date.parse('2026-08-08T12:00:00Z');

function row(over: Partial<TimelineRpcRow> & Pick<TimelineRpcRow, 'kind'>): TimelineRpcRow {
  return {
    ts: '2026-08-05T10:00:00+00:00',
    id: `${over.kind}:${UUID}`,
    source: 'test',
    actor_id: null,
    ref_type: null,
    ref_id: null,
    payload: null,
    ...over,
  };
}

describe('rpcRowToEvent', () => {
  it('call: выполненный звонок отдаёт заголовок, статус, detail и префиксный id', () => {
    const e = rpcRowToEvent(
      row({
        kind: 'call',
        ref_type: 'call',
        ref_id: UUID,
        actor_id: 'actor-1',
        payload: { status: 'done', next_step: 'Прислать КП', agreements: 'Договорились' },
      }),
      NOW,
    );

    expect(e.title).toBe('Звонок выполнен');
    expect(e.status).toBe('done');
    // next_step приоритетнее agreements — как в callToEvent до спринта
    expect(e.detail).toBe('Прислать КП');
    expect(e.id).toBe(`call:${UUID}`);
    expect(e.sourceId).toBe(UUID);
    expect(e.actorId).toBe('actor-1');
    expect(e.date).toBe('2026-08-05T10:00:00+00:00');
  });

  it('meeting: с названием — «Встреча: …», без названия — «Встреча»', () => {
    const withTitle = rpcRowToEvent(
      row({ kind: 'meeting', payload: { title: 'Демо WMS', next_step: null, notes: 'заметка' } }),
      NOW,
    );
    expect(withTitle.title).toBe('Встреча: Демо WMS');
    expect(withTitle.detail).toBe('заметка');

    // `meetings.title` в БД NOT NULL, но пустая строка проходит — заголовок не должен
    // выродиться в «Встреча: » с висящим двоеточием.
    const withoutTitle = rpcRowToEvent(
      row({ kind: 'meeting', payload: { title: '', next_step: null, notes: null } }),
      NOW,
    );
    expect(withoutTitle.title).toBe('Встреча');
  });

  it('task: дедлайн в прошлом и lane ≠ done — статус overdue', () => {
    const e = rpcRowToEvent(
      row({
        kind: 'task',
        ts: '2026-08-01T09:00:00+00:00',
        payload: {
          text: 'Согласовать ДС',
          lane: 'now',
          deadline: '2026-08-01T09:00:00+00:00',
          created_at: '2026-07-20T09:00:00+00:00',
        },
      }),
      NOW,
    );

    expect(e.status).toBe('overdue');
    expect(e.title).toBe('Задача: Согласовать ДС');
    // дата события — дедлайн, а не created_at
    expect(e.date).toBe('2026-08-01T09:00:00+00:00');
  });

  it('task: без дедлайна датой служит created_at, а detail отсутствует', () => {
    const e = rpcRowToEvent(
      row({
        kind: 'task',
        ts: '2026-07-20T09:00:00+00:00',
        payload: {
          text: 'Позвонить',
          lane: 'next',
          deadline: null,
          created_at: '2026-07-20T09:00:00+00:00',
        },
      }),
      NOW,
    );

    expect(e.date).toBe('2026-07-20T09:00:00+00:00');
    expect(e.detail).toBeUndefined();
    expect(e.status).toBe('pending');
  });

  it('project: internal — «Проект: …», остальные — «Сделка: …»', () => {
    const internal = rpcRowToEvent(
      row({ kind: 'project', payload: { name: 'Миграция почты', type: 'internal' } }),
      NOW,
    );
    expect(internal.title).toBe('Проект: Миграция почты');

    const client = rpcRowToEvent(
      row({ kind: 'project', payload: { name: 'Фитнес Десерты. WMS', type: 'client' } }),
      NOW,
    );
    expect(client.title).toBe('Сделка: Фитнес Десерты. WMS');
  });

  it('activity: заголовок собирает describeEvent, eventType доезжает до события', () => {
    const e = rpcRowToEvent(
      row({
        kind: 'activity',
        actor_id: 'actor-2',
        // payload источника лежит ВНУТРИ payload строки, рядом с event_type
        payload: { event_type: 'stage_change', payload: { from: 'kp_sent', to: 'won' } },
      }),
      NOW,
    );

    expect(e.title).toBe('Стадия: КП отпр. → Выигр.');
    // S-UI-CLARITY-1: без eventType системную запись не отличить от заметки
    expect(e.eventType).toBe('stage_change');
    expect(e.actorId).toBe('actor-2');
    // S-COST-TRUTH-1: у события не про задачу ссылки на задачу быть не должно
    expect(e.refType).toBeUndefined();
    expect(e.sourceId).toBe(UUID);
  });

  // ═══ S-COST-TRUTH-1: событие журнала о задаче открывается ═══
  const TASK_UUID = '99999999-8888-7777-6666-555555555555';

  it('activity: task_created с task_id — sourceId это id ЗАДАЧИ, событие помечено refType', () => {
    const e = rpcRowToEvent(
      row({
        kind: 'activity',
        payload: {
          event_type: 'task_created',
          payload: { task_id: TASK_UUID, title: 'Приёмка отчёта', priority: 'normal' },
        },
      }),
      NOW,
    );

    expect(e.sourceId).toBe(TASK_UUID);
    expect(e.refType).toBe('task');
    // Ключ строки остаётся id записи ЖУРНАЛА — иначе два события об одной задаче
    // («создана» и «выполнена») схлопнулись бы в один React-key.
    expect(e.id).toBe(`activity:${UUID}`);
    // Заголовок спринт не трогает
    expect(e.title).toBe('Задача: Приёмка отчёта');
    expect(e.eventType).toBe('task_created');
  });

  it('activity: task_completed с task_id — тот же разбор', () => {
    const e = rpcRowToEvent(
      row({
        kind: 'activity',
        payload: { event_type: 'task_completed', payload: { task_id: TASK_UUID, title: 'Приёмка отчёта' } },
      }),
      NOW,
    );

    expect(e.sourceId).toBe(TASK_UUID);
    expect(e.refType).toBe('task');
    expect(e.title).toBe('Выполнено: Приёмка отчёта');
  });

  it('activity: старое событие без task_id — поведение прежнее, клик молчит', () => {
    // 478 записей в проде написаны до спринта: task_id в payload нет и не появится.
    const e = rpcRowToEvent(
      row({
        kind: 'activity',
        payload: { event_type: 'task_created', payload: { title: 'Приёмка отчёта', priority: 'normal' } },
      }),
      NOW,
    );

    expect(e.refType).toBeUndefined();
    // sourceId остался id записи журнала — открывать по нему задачу нечем
    expect(e.sourceId).toBe(UUID);
    expect(e.title).toBe('Задача: Приёмка отчёта');
  });

  it('activity: task_id не строка — как будто его нет (payload пишет клиент, не БД)', () => {
    const e = rpcRowToEvent(
      row({
        kind: 'activity',
        payload: { event_type: 'task_created', payload: { task_id: 42, title: 'Приёмка отчёта' } },
      }),
      NOW,
    );

    expect(e.refType).toBeUndefined();
    expect(e.sourceId).toBe(UUID);
  });

  it('ai_run: в заголовке человеческое имя пресета, а не машинный ключ', () => {
    const e = rpcRowToEvent(
      row({
        kind: 'ai_run',
        payload: { preset_key: 'analytic_note', entity_type: 'call', status: 'done' },
      }),
      NOW,
    );

    expect(e.title).toBe(`AI: ${presetTitle('analytic_note')}`);
    expect(e.title).toBe('AI: Аналитическая записка');
    expect(e.title).not.toContain('analytic_note');
    // актора у прогонов лента не показывала и не должна начать
    expect(e.actorId).toBeUndefined();
  });
});

describe('isTimelineRpcRow', () => {
  it('отсекает мусор и пропускает валидную строку', () => {
    expect(isTimelineRpcRow(null)).toBe(false);
    expect(isTimelineRpcRow({})).toBe(false);
    expect(isTimelineRpcRow('call:1')).toBe(false);
    expect(isTimelineRpcRow([])).toBe(false);
    // объект без ts
    expect(
      isTimelineRpcRow({
        id: `call:${UUID}`, source: 'calls', kind: 'call',
        actor_id: null, ref_type: null, ref_id: null, payload: null,
      }),
    ).toBe(false);
    // неизвестный kind — иначе rpcRowToEvent осталась бы с веткой «не знаю такого»
    expect(isTimelineRpcRow(row({ kind: 'quote' as TimelineRpcRow['kind'] }))).toBe(false);

    expect(isTimelineRpcRow(row({ kind: 'call' }))).toBe(true);
  });
});
