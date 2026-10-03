import { describe, it, expect } from 'vitest';
import { isPinLimitError } from '@/lib/notes/errors';

// S-NOTES-2.1. Четвёртое закрепление: `set_note_pinned` (134) бросает `P0001` с
// `hint = 'notes_pin_limit'`. Тост «закреплено три» показывается ТОЛЬКО на него.

describe('isPinLimitError', () => {
  it('P0001 + notes_pin_limit → true', () => {
    expect(isPinLimitError({ code: 'P0001', hint: 'notes_pin_limit' })).toBe(true);
  });

  it('PostgrestError целиком (message/details тоже есть) → true', () => {
    expect(
      isPinLimitError({
        code: 'P0001',
        message: 'pin limit',
        details: null,
        hint: 'notes_pin_limit',
      }),
    ).toBe(true);
  });

  it('P0001 с другим hint или без него → false', () => {
    expect(isPinLimitError({ code: 'P0001', hint: 'something_else' })).toBe(false);
    expect(isPinLimitError({ code: 'P0001' })).toBe(false);
    expect(isPinLimitError({ code: 'P0001', hint: null })).toBe(false);
  });

  it('тот же hint с другим кодом → false', () => {
    expect(isPinLimitError({ code: '42501', hint: 'notes_pin_limit' })).toBe(false);
  });

  it('не-объект, null и undefined → false', () => {
    expect(isPinLimitError(null)).toBe(false);
    expect(isPinLimitError(undefined)).toBe(false);
    expect(isPinLimitError('P0001')).toBe(false);
    expect(isPinLimitError(42)).toBe(false);
    expect(isPinLimitError(new Error('pin limit'))).toBe(false);
  });
});
