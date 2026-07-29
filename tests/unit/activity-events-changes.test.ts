import { describe, test, expect } from 'vitest';
import { describeEvent } from '@/lib/utils/activity-events';
import type { ActivityLog } from '@/types/entities';

/**
 * S-R2-FIELD-AUDIT (087): `describeEvent` на payload с `changes`.
 *
 * Значения в `changes` приходят из SQL текстом (`v_old ->> field`) — тесты
 * повторяют ровно эту форму, а не «удобную» числовую.
 */
function entry(event_type: string, payload: unknown): ActivityLog {
  return { event_type, payload } as ActivityLog;
}

const UUID_FROM = '11111111-1111-1111-1111-111111111111';
const UUID_TO = '22222222-2222-2222-2222-222222222222';

describe('describeEvent — project_updated с changes (087)', () => {
  test('бюджет: и старое, и новое значение в формате formatBudget', () => {
    const text = describeEvent(
      entry('project_updated', {
        fields_changed: ['budget'],
        changes: { budget: { from: '1000000000', to: '1200000000' } },
      }),
    );
    // formatBudget(копейки) → «10.0M ₽» / «12.0M ₽»
    expect(text).toContain('10.0M ₽');
    expect(text).toContain('12.0M ₽');
    expect(text).toContain('→');
    expect(text).not.toContain('1000000000');
  });

  test('без changes (запись до 087) → прежний рендер по fields_changed', () => {
    const text = describeEvent(entry('project_updated', { fields_changed: ['budget'] }));
    expect(text).toBe('Обновлено: бюджет');
  });

  test('owner_id → имена, сырого UUID в строке нет', () => {
    const text = describeEvent(
      entry('project_updated', {
        fields_changed: ['owner_id'],
        changes: {
          owner_id: {
            from: UUID_FROM, to: UUID_TO,
            from_name: 'Олег Мазков', to_name: 'Иван Петров',
          },
        },
      }),
    );
    expect(text).toBe('Ответственный: Олег Мазков → Иван Петров');
    expect(text).not.toContain(UUID_FROM);
    expect(text).not.toContain(UUID_TO);
  });

  test('owner_id без имён (профиль удалён) → «—», без падения и без UUID', () => {
    const text = describeEvent(
      entry('project_updated', {
        fields_changed: ['owner_id'],
        changes: {
          owner_id: { from: UUID_FROM, to: UUID_TO, from_name: null, to_name: null },
        },
      }),
    );
    expect(text).toBe('Ответственный: — → —');
    expect(text).not.toContain(UUID_FROM);
    expect(text).not.toContain(UUID_TO);
  });

  test('три изменённых поля → первое разворачивается, остальные счётчиком', () => {
    const text = describeEvent(
      entry('project_updated', {
        fields_changed: ['budget', 'next_action_date', 'next_step'],
        changes: {
          budget: { from: '1000000000', to: '1200000000' },
          next_action_date: { from: null, to: '2026-08-05' },
          next_step: { changed: true },
        },
      }),
    );
    expect(text).toContain('10.0M ₽');
    expect(text).toContain('и ещё 2');
  });

  test('поле класса «факт» → только лейбл, без значения', () => {
    const text = describeEvent(
      entry('project_updated', {
        fields_changed: ['pinned_note'],
        changes: { pinned_note: { changed: true } },
      }),
    );
    expect(text).toBe('Заметка');
  });

  test('дата: null → дата и дата → null («не задан» на нужной стороне)', () => {
    const set = describeEvent(
      entry('project_updated', {
        fields_changed: ['deadline'],
        changes: { deadline: { from: null, to: '2026-08-05' } },
      }),
    );
    expect(set.startsWith('Дедлайн: не задан → ')).toBe(true);
    expect(set).not.toMatch(/→\s*не задан/);

    const cleared = describeEvent(
      entry('project_updated', {
        fields_changed: ['deadline'],
        changes: { deadline: { from: '2026-08-05', to: null } },
      }),
    );
    expect(cleared.endsWith('→ не задан')).toBe(true);
    expect(cleared).not.toMatch(/:\s*не задан/);
  });

  test('вероятность и статус — человеческие значения', () => {
    expect(
      describeEvent(
        entry('project_updated', {
          fields_changed: ['probability'],
          changes: { probability: { from: '30', to: '60' } },
        }),
      ),
    ).toBe('Вероятность: 30% → 60%');

    expect(
      describeEvent(
        entry('project_updated', {
          fields_changed: ['status'],
          changes: { status: { from: 'open', to: 'on_hold' } },
        }),
      ),
    ).toBe('Статус: Открыта → На паузе');
  });
});

describe('describeEvent — stage_changed с changes (087)', () => {
  test('стадия + прочие поля перехода', () => {
    const text = describeEvent(
      entry('stage_changed', {
        from_stage_id: 's1', to_stage_id: 's2',
        from_name: 'Квалификация', to_name: 'Переговоры',
        fields_changed: ['contact_id'],
        changes: {
          contact_id: {
            from: null, to: UUID_TO,
            from_name: null, to_name: 'Мария Сидорова',
          },
        },
      }),
    );
    expect(text).toContain('Стадия: Квалификация → Переговоры');
    expect(text).toContain('Контакт: — → Мария Сидорова');
    expect(text).not.toContain(UUID_TO);
  });

  test('без changes (запись до 087) → только стадия, как раньше', () => {
    const text = describeEvent(
      entry('stage_changed', {
        from_name: 'Квалификация', to_name: 'Переговоры',
        fields_changed: ['contact_id'],
      }),
    );
    expect(text).toBe('Стадия: Квалификация → Переговоры');
  });
});
