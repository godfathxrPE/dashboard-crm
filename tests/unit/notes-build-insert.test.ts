import { describe, it, expect } from 'vitest';
import { buildNoteInsert, noteErrorMessage, NOTE_MAX_LENGTH } from '@/lib/notes/build-insert';

// S-NOTES-1: сборка строки INSERT в `notes`. Клиент шлёт только то, что разрешают
// column-GRANT'ы миграции 134; лишний или пустой ключ — это 42501 / ложный родитель.

const LEAD = '11111111-2222-3333-4444-555555555555';
const PROJECT = '66666666-7777-8888-9999-000000000000';

describe('buildNoteInsert', () => {
  it('передан только lead_id — других FK в объекте нет вовсе (не undefined)', () => {
    const row = buildNoteInsert({ lead_id: LEAD, body: 'Позвонить в пятницу' });
    expect(row).toEqual({ lead_id: LEAD, body: 'Позвонить в пятницу' });
    expect(Object.keys(row).sort()).toEqual(['body', 'lead_id']);
    expect('project_id' in row).toBe(false);
  });

  it('тело обрезается по краям', () => {
    expect(buildNoteInsert({ project_id: PROJECT, body: '  текст \n' }).body).toBe('текст');
  });

  it('комментарий перехода: kind и meta едут, остальное — нет', () => {
    const row = buildNoteInsert({
      project_id: PROJECT,
      body: 'Закрыли этап',
      kind: 'stage_comment',
      meta: { from_stage_id: 'a', to_stage_id: 'b' },
    });
    expect(row).toEqual({
      project_id: PROJECT,
      body: 'Закрыли этап',
      kind: 'stage_comment',
      meta: { from_stage_id: 'a', to_stage_id: 'b' },
    });
  });

  it('без kind/meta их нет в объекте — дефолты держит БД', () => {
    const row = buildNoteInsert({ project_id: PROJECT, body: 'x' });
    expect('kind' in row).toBe(false);
    expect('meta' in row).toBe(false);
  });

  it('пустая строка вместо FK не считается привязкой', () => {
    const row = buildNoteInsert({ project_id: '', lead_id: LEAD, body: 'x' });
    expect('project_id' in row).toBe(false);
    expect(row.lead_id).toBe(LEAD);
  });

  it('ключей, которых клиенту писать нельзя, в строке не бывает', () => {
    const row = buildNoteInsert({ project_id: PROJECT, body: 'x', kind: 'note', meta: {} });
    for (const forbidden of ['org_id', 'created_by', 'pinned_at', 'pinned_by', 'deleted_at', 'edited_at']) {
      expect(forbidden in row).toBe(false);
    }
  });
});

describe('noteErrorMessage', () => {
  it('23514 (check notes_body_len) → понятный текст', () => {
    expect(noteErrorMessage({ code: '23514', message: 'violates check constraint' })).toBe(
      'Заметка пустая или длиннее 20 000 символов',
    );
  });

  it('прочие ошибки — общий текст, сырое сообщение Postgres не утекает', () => {
    expect(noteErrorMessage({ code: '42501', message: 'permission denied for table notes' })).toBe(
      'Не удалось сохранить заметку',
    );
    expect(noteErrorMessage(new Error('boom'))).toBe('Не удалось сохранить заметку');
    expect(noteErrorMessage(null)).toBe('Не удалось сохранить заметку');
  });

  it('потолок совпадает с check в миграции 134', () => {
    expect(NOTE_MAX_LENGTH).toBe(20000);
  });
});
