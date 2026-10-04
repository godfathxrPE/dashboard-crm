import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BRIEF_PANEL_OPEN_KEY,
  briefSeenKey,
  readBriefPanelOpen,
  writeBriefPanelOpen,
  readBriefSeen,
  writeBriefSeen,
} from '@/lib/utils/brief-panel-state';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('открытость панели', () => {
  test('по умолчанию свёрнута', () => {
    expect(readBriefPanelOpen()).toBe(false);
  });
  test('запись и чтение', () => {
    writeBriefPanelOpen(true);
    expect(localStorage.getItem(BRIEF_PANEL_OPEN_KEY)).toBe('1');
    expect(readBriefPanelOpen()).toBe(true);
    writeBriefPanelOpen(false);
    expect(readBriefPanelOpen()).toBe(false);
  });
});

describe('увиденный бриф', () => {
  test('ключ per-компания', () => {
    expect(briefSeenKey('c1')).toBe('deal-brief:seen:c1');
  });
  test('нет записи → null; запись перезаписывает прежнюю', () => {
    expect(readBriefSeen('c1')).toBeNull();
    writeBriefSeen('c1', 'r1');
    writeBriefSeen('c1', 'r2');
    expect(readBriefSeen('c1')).toBe('r2');
    expect(readBriefSeen('c2')).toBeNull();
  });
});

describe('хранилище бросает (приватный режим)', () => {
  test('чтение → дефолты, запись → без исключения', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(readBriefPanelOpen()).toBe(false);
    expect(readBriefSeen('c1')).toBeNull();
    expect(() => writeBriefPanelOpen(true)).not.toThrow();
    expect(() => writeBriefSeen('c1', 'r1')).not.toThrow();
  });
});
