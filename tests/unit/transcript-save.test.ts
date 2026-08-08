import { describe, it, expect } from 'vitest';
import {
  isSavableTranscriptText,
  shouldCreateNewTranscript,
  formatCharCount,
} from '@/lib/domain/transcript';

// S-AI-VIS-1. Решение «переиспользовать строку или завести новую» переехало из
// мутации запуска прогона в чистую функцию — им теперь пользуются двое: запуск
// пресета и сохранение расшифровки по факту готовности. Правило проверяемо без
// Supabase, и именно оно защищает машинную версию текста от затирания правкой.

describe('shouldCreateNewTranscript', () => {
  it('тот же текст → переиспользуем существующую строку', () => {
    expect(shouldCreateNewTranscript('Здравствуйте, это Олег.', 'Здравствуйте, это Олег.')).toBe(false);
  });

  it('изменённый текст → новая строка (история машинной версии сохраняется)', () => {
    expect(shouldCreateNewTranscript('Здравствуйте, это Олег.', 'Здравствуйте, это Олег!')).toBe(true);
  });

  it('строки транскрипта ещё нет → новая', () => {
    expect(shouldCreateNewTranscript(null, 'первая расшифровка')).toBe(true);
    expect(shouldCreateNewTranscript(undefined, 'первая расшифровка')).toBe(true);
  });

  it('разница только в пробеле — это тоже другая версия', () => {
    // Нормализация здесь склеила бы версии, которые edge-функция видит как разные.
    expect(shouldCreateNewTranscript('текст', 'текст ')).toBe(true);
  });

  it('пустая существующая строка против пустой новой — не дублируем', () => {
    expect(shouldCreateNewTranscript('', '')).toBe(false);
  });
});

describe('isSavableTranscriptText', () => {
  it('пустой и пробельный текст не сохраняем', () => {
    expect(isSavableTranscriptText('')).toBe(false);
    expect(isSavableTranscriptText('   \n\t ')).toBe(false);
    expect(isSavableTranscriptText(null)).toBe(false);
    expect(isSavableTranscriptText(undefined)).toBe(false);
  });

  it('непустой текст сохраняем', () => {
    expect(isSavableTranscriptText('  есть что сохранить  ')).toBe(true);
  });
});

describe('formatCharCount', () => {
  it('до тысячи — точное число знаков', () => {
    expect(formatCharCount(840)).toBe('840 знаков');
  });

  it('от тысячи — тысячи', () => {
    expect(formatCharCount(12_431)).toBe('12 тыс. знаков');
  });

  it('ноль и мусор не дают «NaN знаков»', () => {
    expect(formatCharCount(0)).toBe('0 знаков');
    expect(formatCharCount(Number.NaN)).toBe('0 знаков');
  });
});
