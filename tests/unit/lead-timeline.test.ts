import { describe, it, expect } from 'vitest';
import { parentHref } from '@/lib/timeline/kind-meta';
import { rpcRowToEvent, type TimelineRpcRow } from '@/lib/timeline/rpc-adapter';

// ═══════════════════════════════════════════════════════
// S-LEAD-HUB-2a: лид как сущность ленты.
//
// Обе проверки — про ТИХИЕ потери, которые смок не поймал бы:
//   1. `PARENT_TYPES` — фильтр, а не документация: без `'lead'` в списке
//      `isParentType` вернёт false, и родитель схлопнется в `null` БЕЗ ошибки.
//      Событие просто отрисуется без ссылки, и это выглядит как «так и было».
//   2. `parentHref` без ветки лида проваливался бы в финальный fallthrough
//      `/contacts/<id>` — ссылка на карточку несуществующего контакта, то есть
//      404 через раз, а не отсутствие ссылки.
// ═══════════════════════════════════════════════════════

const LEAD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CALL_ID = '11111111-2222-3333-4444-555555555555';
const NOW = Date.parse('2026-08-10T12:00:00Z');

function row(over: Partial<TimelineRpcRow> & Pick<TimelineRpcRow, 'kind'>): TimelineRpcRow {
  return {
    ts: '2026-08-09T10:00:00+00:00',
    id: `${over.kind}:${CALL_ID}`,
    source: 'test',
    actor_id: null,
    ref_type: null,
    ref_id: null,
    payload: null,
    ...over,
  };
}

describe('parentHref — лид', () => {
  it('ведёт на карточку лида, а не на контакт', () => {
    expect(parentHref('lead', LEAD_ID)).toBe(`/leads/${LEAD_ID}`);
  });

  it('прочие типы не задеты', () => {
    expect(parentHref('project', LEAD_ID)).toBe(`/deals/${LEAD_ID}`);
    expect(parentHref('company', LEAD_ID)).toBe(`/companies/${LEAD_ID}`);
    expect(parentHref('contact', LEAD_ID)).toBe(`/contacts/${LEAD_ID}`);
    expect(parentHref(null, LEAD_ID)).toBeNull();
    expect(parentHref('lead', null)).toBeNull();
  });
});

describe('rpcRowToEvent — parent_type=lead', () => {
  it('лид доезжает до события парой (тип, id)', () => {
    const e = rpcRowToEvent(
      row({
        kind: 'call',
        payload: { status: 'done' },
        parent_type: 'lead',
        parent_id: LEAD_ID,
      }),
      NOW,
    );
    expect(e.parentType).toBe('lead');
    expect(e.parentId).toBe(LEAD_ID);
  });

  it('незнакомый тип родителя по-прежнему отсекается парой целиком', () => {
    const e = rpcRowToEvent(
      row({ kind: 'call', parent_type: 'invoice', parent_id: LEAD_ID }),
      NOW,
    );
    expect(e.parentType).toBeNull();
    expect(e.parentId).toBeNull();
  });
});
