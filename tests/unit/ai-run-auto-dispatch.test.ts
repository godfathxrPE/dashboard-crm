// tests/unit/ai-run-auto-dispatch.test.ts — S-BRIEF-IN-DEAL-1.1 (138)
//
// Чистая часть ветки диспетчера автозапуска брифа в ai-run: разбор тела тика и
// решение, можно ли брать строку ai_runs. SQL-логику (кандидаты, лимит, тик) vitest
// не покрывает — её проверяют ролевые смоки гейта.

import { describe, expect, it } from 'vitest';
import {
  checkAutoRun,
  parseAutoDispatchBody,
  type AutoRunRow,
} from '../../supabase/functions/ai-run/auto-dispatch.ts';

const RUN_ID = '3f2b8c1e-7a4d-4e9b-9c0a-1d2e3f4a5b6c';

const row = (patch: Partial<AutoRunRow> = {}): AutoRunRow => ({
  id: RUN_ID,
  preset_key: 'company_brief',
  entity_type: 'company',
  entity_id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  status: 'pending',
  auto_reason: 'no_brief',
  ...patch,
});

describe('parseAutoDispatchBody', () => {
  it('{ run_id: uuid } → { runId }', () => {
    expect(parseAutoDispatchBody({ run_id: RUN_ID })).toEqual({ runId: RUN_ID });
  });

  it.each([
    ['нет поля', {}],
    ['null', { run_id: null }],
    ['число', { run_id: 42 }],
    ['строка не-uuid', { run_id: 'not-a-uuid' }],
  ])('%s → { error }', (_label, body) => {
    expect(parseAutoDispatchBody(body)).toHaveProperty('error');
  });

  it.each([
    ['null', null],
    ['строка', RUN_ID],
    ['число', 1],
    ['массив', [RUN_ID]],
  ])('не объект (%s) → { error }', (_label, body) => {
    expect(parseAutoDispatchBody(body)).toHaveProperty('error');
  });

  it('лишний ключ рядом с валидным run_id → { runId }', () => {
    expect(
      parseAutoDispatchBody({ run_id: RUN_ID, org_id: 'x', created_by: 'y' }),
    ).toEqual({ runId: RUN_ID });
  });
});

describe('checkAutoRun', () => {
  it('null → not_found', () => {
    expect(checkAutoRun(null)).toBe('not_found');
  });

  it("preset_key = 'deal_summary' → not_auto", () => {
    expect(checkAutoRun(row({ preset_key: 'deal_summary' }))).toBe('not_auto');
  });

  it("entity_type = 'project' → not_auto", () => {
    expect(checkAutoRun(row({ entity_type: 'project' }))).toBe('not_auto');
  });

  it('нет entity_id → not_auto', () => {
    expect(checkAutoRun(row({ entity_id: null }))).toBe('not_auto');
  });

  it('auto_reason = null (ручной прогон) → not_auto', () => {
    expect(checkAutoRun(row({ auto_reason: null }))).toBe('not_auto');
  });

  it.each(['running', 'done', 'error'])('status %s → not_pending', (status) => {
    expect(checkAutoRun(row({ status }))).toBe('not_pending');
  });

  it('валидная строка → ok', () => {
    expect(checkAutoRun(row())).toBe('ok');
  });

  it('и не-авто, и не-pending → not_auto (порядок проверок)', () => {
    expect(checkAutoRun(row({ auto_reason: null, status: 'done' }))).toBe('not_auto');
  });
});
