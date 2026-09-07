import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  sectionStorageKey,
  readSectionExpanded,
  writeSectionExpanded,
} from '@/lib/utils/section-state';

beforeEach(() => {
  localStorage.clear();
});

describe('sectionStorageKey', () => {
  test('ключ строится из projectId + sectionId', () => {
    expect(sectionStorageKey('p1', 'board')).toBe('deal-section:p1:board');
    expect(sectionStorageKey('p2', 'org')).toBe('deal-section:p2:org');
  });
});

describe('readSectionExpanded', () => {
  test('нет значения ⇒ дефолт', () => {
    expect(readSectionExpanded('p1', 'board', true)).toBe(true);
    expect(readSectionExpanded('p1', 'board', false)).toBe(false);
  });

  test('"1"/"0" читаются как true/false', () => {
    writeSectionExpanded('p1', 'board', true);
    expect(readSectionExpanded('p1', 'board', false)).toBe(true);
    writeSectionExpanded('p1', 'board', false);
    expect(readSectionExpanded('p1', 'board', true)).toBe(false);
  });

  test('неизвестное значение в хранилище ⇒ дефолт', () => {
    localStorage.setItem(sectionStorageKey('p1', 'org'), 'garbage');
    expect(readSectionExpanded('p1', 'org', true)).toBe(true);
    expect(readSectionExpanded('p1', 'org', false)).toBe(false);
  });

  test('выброс из localStorage (приватный режим) ⇒ дефолт, без падения', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('приватный режим');
      });
    expect(() => readSectionExpanded('p1', 'board', true)).not.toThrow();
    expect(readSectionExpanded('p1', 'board', true)).toBe(true);
    expect(readSectionExpanded('p1', 'board', false)).toBe(false);
    spy.mockRestore();
  });

  test('ключи разных секций/сделок не пересекаются', () => {
    writeSectionExpanded('p1', 'board', true);
    expect(readSectionExpanded('p1', 'org', false)).toBe(false);
    expect(readSectionExpanded('p2', 'board', false)).toBe(false);
  });
});

describe('writeSectionExpanded', () => {
  test('сбой записи (приватный режим) не падает', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('приватный режим');
      });
    expect(() => writeSectionExpanded('p1', 'board', true)).not.toThrow();
    spy.mockRestore();
  });
});
