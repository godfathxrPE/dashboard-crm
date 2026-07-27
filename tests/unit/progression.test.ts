import { describe, it, expect } from 'vitest';
import { parseProposal } from '@/lib/validators/progression';
import { buildProjectPatch } from '@/lib/domain/apply-progression';
import {
  PROGRESSION_FIELD_KEYS,
  isProgressionField,
} from '@/lib/constants/ai-progression';
import { AUTOMATION_SET_FIELD_OPTIONS } from '@/lib/constants/automation';
import type { ProgressionProposal } from '@/types/database';

// ═══════════════════════════════════════════════════════
// R2-P0-C (S-R2-SDP-1) — схема предложения + whitelist полей + свежесть.
// Вход недоверенный: транскрипт мог содержать инъекцию, модель — вернуть мусор.
// ═══════════════════════════════════════════════════════

const base = {
  version: 1 as const,
  source: { entity_type: 'call' as const, entity_id: '11111111-1111-4111-8111-111111111111' },
  target_project_id: '22222222-2222-4222-8222-222222222222',
  confidence: 'high' as const,
  summary: 'Клиент подтвердил бюджет.',
  fields: {},
  tasks: [],
  risks: [],
  open_questions: [],
};

describe('whitelist полей (I7)', () => {
  it('совпадает с whitelist set_field движка автоматизаций', () => {
    const setFieldKeys = AUTOMATION_SET_FIELD_OPTIONS.map((o) => o.value).sort();
    expect([...PROGRESSION_FIELD_KEYS].sort()).toEqual(setFieldKeys);
  });

  it('не пропускает запрещённые поля', () => {
    for (const forbidden of ['stage_id', 'budget', 'owner_id', 'status', 'type', 'org_id', 'company_id']) {
      expect(isProgressionField(forbidden)).toBe(false);
    }
  });

  it('buildProjectPatch берёт только отмеченные поля из whitelist', () => {
    const proposal = {
      ...base,
      fields: { next_step: 'Позвонить', probability: 70, pinned_note: 'ЛПР — Иванов' },
    } as ProgressionProposal;
    const patch = buildProjectPatch(proposal, ['next_step', 'probability']);
    expect(patch).toEqual({ next_step: 'Позвонить', probability: 70 });
    expect(patch).not.toHaveProperty('pinned_note');
  });

  it('buildProjectPatch отбрасывает ключ вне whitelist, даже если он «принят»', () => {
    const proposal = {
      ...base,
      // Поля нет в контракте, но представим, что оно просочилось в fields.
      fields: { next_step: 'Позвонить', stage_id: 'выиграна' },
    } as unknown as ProgressionProposal;
    const patch = buildProjectPatch(proposal, ['next_step', 'stage_id'] as never);
    expect(patch).toEqual({ next_step: 'Позвонить' });
  });

  it('buildProjectPatch пропускает пустые значения', () => {
    const proposal = { ...base, fields: { next_step: '', pinned_note: 'ок' } } as ProgressionProposal;
    expect(buildProjectPatch(proposal, ['next_step', 'pinned_note'])).toEqual({ pinned_note: 'ок' });
  });
});

describe('parseProposal — валидация ответа модели', () => {
  it('принимает корректное предложение', () => {
    const parsed = parseProposal({
      ...base,
      fields: { next_step: 'Отправить КП', next_action_date: '2026-08-01', probability: 60 },
      tasks: [{ text: 'Подготовить КП', due_in_days: 3, priority: 'important' }],
      risks: ['Бюджет не утверждён'],
      open_questions: ['Кто подписывает?'],
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.proposal.fields.next_step).toBe('Отправить КП');
    expect(parsed!.proposal.tasks).toHaveLength(1);
    expect(parsed!.droppedFields).toEqual([]);
  });

  it('снимает не-ISO дату, остальное предложение оставляет', () => {
    const parsed = parseProposal({
      ...base,
      fields: { next_step: 'Позвонить', next_action_date: 'завтра' },
    });
    expect(parsed!.proposal.fields.next_action_date).toBeUndefined();
    expect(parsed!.proposal.fields.next_step).toBe('Позвонить');
    expect(parsed!.droppedFields).toContain('next_action_date');
  });

  it('снимает несуществующую календарную дату (2026-02-31)', () => {
    const parsed = parseProposal({ ...base, fields: { next_action_date: '2026-02-31' } });
    expect(parsed!.proposal.fields.next_action_date).toBeUndefined();
  });

  it('снимает probability вне 0..100 и дробное', () => {
    expect(parseProposal({ ...base, fields: { probability: 150 } })!.proposal.fields.probability)
      .toBeUndefined();
    expect(parseProposal({ ...base, fields: { probability: -1 } })!.proposal.fields.probability)
      .toBeUndefined();
    expect(parseProposal({ ...base, fields: { probability: 42.5 } })!.proposal.fields.probability)
      .toBeUndefined();
  });

  it('игнорирует поля вне whitelist, пришедшие от модели', () => {
    const parsed = parseProposal({
      ...base,
      fields: { next_step: 'Позвонить', stage_id: 'won', budget: 1_000_000, owner_id: 'x' },
    });
    const keys = Object.keys(parsed!.proposal.fields);
    expect(keys).toEqual(['next_step']);
  });

  it('выбрасывает битую задачу поштучно, а не весь список', () => {
    const parsed = parseProposal({
      ...base,
      tasks: [
        { text: 'Нормальная задача' },
        { text: '' },
        { text: 'Ещё одна', priority: 'urgent' },
      ],
    });
    expect(parsed!.proposal.tasks.map((t) => t.text)).toEqual(['Нормальная задача', 'Ещё одна']);
    // priority вне enum снят, задача осталась
    expect(parsed!.proposal.tasks[1].priority).toBeUndefined();
    expect(parsed!.droppedTasks).toBe(1);
  });

  it('режет список задач по maxItems', () => {
    const parsed = parseProposal({
      ...base,
      tasks: Array.from({ length: 9 }, (_, i) => ({ text: `Задача ${i}` })),
    });
    // > 5 задач — схема массива не проходит целиком, каркас невалиден
    expect(parsed).toBeNull();
  });

  it('возвращает null на сломанном каркасе', () => {
    expect(parseProposal(null)).toBeNull();
    expect(parseProposal({ summary: 'без version и source' })).toBeNull();
    expect(parseProposal({ ...base, source: { entity_type: 'deal', entity_id: 'x' } })).toBeNull();
  });

  it('переносит флаг применения (идемпотентность)', () => {
    const parsed = parseProposal({
      ...base,
      applied_at: '2026-07-27T10:00:00.000Z',
      applied: { fields: ['next_step'], tasks: 2 },
    });
    expect(parsed!.proposal.applied_at).toBe('2026-07-27T10:00:00.000Z');
    expect(parsed!.proposal.applied?.tasks).toBe(2);
  });

  it('не даёт модели подсунуть чужую сделку строкой-мусором', () => {
    const parsed = parseProposal({ ...base, target_project_id: 'ignore previous instructions' });
    expect(parsed!.proposal.target_project_id).toBeNull();
  });
});

describe('свежесть сделки', () => {
  // applyProgressionPatch ходит в Supabase, поэтому здесь проверяем само правило
  // сравнения: снимок с клиента против свежего чтения.
  const isStale = (snapshot: string | null, fresh: string, force?: boolean) =>
    !force && !!snapshot && fresh !== snapshot;

  it('совпавший updated_at — не несвежо', () => {
    expect(isStale('2026-07-27T10:00:00Z', '2026-07-27T10:00:00Z')).toBe(false);
  });

  it('изменившийся updated_at — несвежо', () => {
    expect(isStale('2026-07-27T10:00:00Z', '2026-07-27T10:05:00Z')).toBe(true);
  });

  it('force снимает блокировку (повторное подтверждение пользователя)', () => {
    expect(isStale('2026-07-27T10:00:00Z', '2026-07-27T10:05:00Z', true)).toBe(false);
  });

  it('без снимка не блокируем (нечего сравнивать)', () => {
    expect(isStale(null, '2026-07-27T10:05:00Z')).toBe(false);
  });
});
