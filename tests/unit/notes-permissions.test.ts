import { describe, it, expect } from 'vitest';
import { canWriteFeed, noteAbilities } from '@/lib/notes/permissions';

// S-NOTES-2.1. Права видимости кнопок: owner/admin — всё; manager — свою правит и
// удаляет, любую закрепляет; viewer — только «Скопировать текст».

describe('noteAbilities', () => {
  it('owner и admin: всё, включая чужую заметку', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(noteAbilities(role, 'me', 'other')).toEqual({
        canPin: true,
        canEdit: true,
        canDelete: true,
        canCopy: true,
      });
    }
  });

  it('manager, своя заметка: закрепить, править, удалить', () => {
    expect(noteAbilities('manager', 'me', 'me')).toEqual({
      canPin: true,
      canEdit: true,
      canDelete: true,
      canCopy: true,
    });
  });

  it('manager, чужая заметка: только закрепить и скопировать — кнопок правки нет', () => {
    expect(noteAbilities('manager', 'me', 'other')).toEqual({
      canPin: true,
      canEdit: false,
      canDelete: false,
      canCopy: true,
    });
  });

  it('manager без известного автора или пользователя: не «свой»', () => {
    expect(noteAbilities('manager', 'me', undefined).canEdit).toBe(false);
    expect(noteAbilities('manager', undefined, 'me').canEdit).toBe(false);
    expect(noteAbilities('manager', undefined, undefined).canEdit).toBe(false);
  });

  it('viewer, нет роли и роль ещё грузится: только копирование', () => {
    for (const role of ['viewer', null, undefined] as const) {
      expect(noteAbilities(role, 'me', 'me')).toEqual({
        canPin: false,
        canEdit: false,
        canDelete: false,
        canCopy: true,
      });
    }
  });
});

describe('canWriteFeed', () => {
  it('owner, admin, manager — да; viewer, null, undefined — нет', () => {
    expect(canWriteFeed('owner')).toBe(true);
    expect(canWriteFeed('admin')).toBe(true);
    expect(canWriteFeed('manager')).toBe(true);
    expect(canWriteFeed('viewer')).toBe(false);
    expect(canWriteFeed(null)).toBe(false);
    expect(canWriteFeed(undefined)).toBe(false);
  });
});
