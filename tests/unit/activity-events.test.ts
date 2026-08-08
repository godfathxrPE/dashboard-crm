import { describe, test, expect } from 'vitest';
import { describeEvent, isNoteEvent } from '@/lib/utils/activity-events';
import type { ActivityLog } from '@/types/entities';

function entry(event_type: string, payload: unknown): ActivityLog {
  return { event_type, payload } as ActivityLog;
}

describe('describeEvent — project_updated', () => {
  test('fields_changed → русские лейблы, без сырых имён колонок', () => {
    const text = describeEvent(
      entry('project_updated', { fields_changed: ['stage_id', 'won_reason', 'budget'] }),
    );
    expect(text).toContain('стадия');
    expect(text).toContain('причина выигрыша');
    expect(text).toContain('бюджет');
    // ни одного сырого имени колонки
    expect(text).not.toContain('stage_id');
    expect(text).not.toContain('won_reason');
    expect(text).not.toContain('budget');
  });

  test('легаси `stage` при наличии `stage_id` — не дублируется', () => {
    const text = describeEvent(
      entry('project_updated', { fields_changed: ['stage', 'stage_id'] }),
    );
    // одна «стадия», не две
    expect(text).toBe('Обновлено: стадия');
  });

  test('пустой fields_changed → «Сделка обновлена»', () => {
    expect(describeEvent(entry('project_updated', { fields_changed: [] }))).toBe('Сделка обновлена');
    expect(describeEvent(entry('project_updated', {}))).toBe('Сделка обновлена');
  });

  test('дубли лейблов (won_reason+won_detail) сворачиваются в один', () => {
    const text = describeEvent(
      entry('project_updated', { fields_changed: ['won_reason', 'won_detail'] }),
    );
    // «причина выигрыша» ровно один раз, а не «…, причина выигрыша»
    expect(text).toBe('Обновлено: причина выигрыша');
  });
});

describe('describeEvent — stage_changed (T2)', () => {
  test('готовые имена из payload → «Стадия: A → B»', () => {
    const text = describeEvent(
      entry('stage_changed', {
        from_stage_id: 's1', to_stage_id: 's2',
        from_name: 'Квалификация', to_name: 'Переговоры',
      }),
    );
    expect(text).toBe('Стадия: Квалификация → Переговоры');
  });

  test('нет from_name (первое назначение стадии) → «—» слева', () => {
    const text = describeEvent(
      entry('stage_changed', { from_name: null, to_name: 'Новая' }),
    );
    expect(text).toBe('Стадия: — → Новая');
  });
});

describe('describeEvent — automation_fired', () => {
  test('текст с человеческим триггером, без сырых полей', () => {
    const text = describeEvent(
      entry('automation_fired', { rule_id: 'r1', trigger: 'task_overdue', task_id: 't1' }),
    );
    expect(text).toContain('автоматизация');
    expect(text).toContain('просроченная задача');
    expect(text).not.toContain('rule_id');
    expect(text).not.toContain('task_overdue');
  });

  test('без trigger — общий текст', () => {
    expect(describeEvent(entry('automation_fired', { rule_id: 'r1' }))).toBe('Сработала автоматизация');
  });
});

describe('describeEvent — прочие', () => {
  test('ai_summary_generated → «AI-резюме готово» + тип', () => {
    const text = describeEvent(entry('ai_summary_generated', { entity_type: 'calls', entity_id: 'c1' }));
    expect(text).toContain('AI-резюме готово');
    expect(text).toContain('звонок');
  });

  test('entity_deleted → человеческий тип и имя', () => {
    const text = describeEvent(entry('entity_deleted', { entity_type: 'projects', entity_name: 'Сделка X' }));
    expect(text).toBe('Удалён сделка: Сделка X');
  });

  test('неизвестный тип → фолбэк «Событие: <type>», не голая строка', () => {
    expect(describeEvent(entry('some_new_event', {}))).toBe('Событие: some_new_event');
  });
});

// S-UI-CLARITY-1: чип «Заметки» в ленте — производный срез по event_type.
// Если сюда однажды добавят системный тип, ложный фильтр вернётся молча.
describe('isNoteEvent — заметка человека vs системная запись', () => {
  test('comment_added — заметка', () => {
    expect(isNoteEvent('comment_added')).toBe(true);
  });

  test('системные типы заметками не считаются', () => {
    for (const t of ['stage_changed', 'project_updated', 'task_created', 'automation_fired', 'entity_deleted']) {
      expect(isNoteEvent(t)).toBe(false);
    }
  });

  test('null/undefined — не заметка (события не из activity_log)', () => {
    expect(isNoteEvent(null)).toBe(false);
    expect(isNoteEvent(undefined)).toBe(false);
  });
});

// S-TL-2: запись журнала «встречу запланировали» и сама встреча — РАЗНЫЕ события
// ленты. До этого спринта обе рисовались как «Встреча: X» и на карточке компании
// читались как дубль (находка гейта S-TL-1).
describe('describeEvent — meeting_scheduled не спорит с событием встречи', () => {
  test('запись журнала — «Запланирована встреча: …»', () => {
    expect(describeEvent(entry('meeting_scheduled', { title: 'Фитнес Десерты' }))).toBe(
      'Запланирована встреча: Фитнес Десерты',
    );
  });

  test('заголовок НЕ совпадает с заголовком события kind=meeting того же названия', () => {
    const title = 'Фитнес Десерты';
    // `meetingToEvent` собирает ровно эту строку — дублировать её нельзя.
    const meetingEventTitle = `Встреча: ${title}`;
    expect(describeEvent(entry('meeting_scheduled', { title }))).not.toBe(meetingEventTitle);
  });

  test('без title — заголовок не разваливается', () => {
    expect(describeEvent(entry('meeting_scheduled', {}))).toBe('Запланирована встреча: ');
  });
});
