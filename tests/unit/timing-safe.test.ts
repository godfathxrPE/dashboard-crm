// tests/unit/timing-safe.test.ts — S-BRIEF-IN-DEAL-1.1
//
// Общая копия сравнения секрета для X-Dispatch-Key (`_shared/timing-safe.ts`).

import { describe, expect, it } from 'vitest';
import { timingSafeEqual } from '../../supabase/functions/_shared/timing-safe.ts';

describe('timingSafeEqual', () => {
  it('равные строки → true', () => {
    expect(timingSafeEqual('s3cr3t-key', 's3cr3t-key')).toBe(true);
  });

  it('та же длина, другое содержимое → false', () => {
    expect(timingSafeEqual('s3cr3t-key', 's3cr3t-kez')).toBe(false);
  });

  it('разная длина → false', () => {
    expect(timingSafeEqual('s3cr3t', 's3cr3t-key')).toBe(false);
  });

  it('пустая и пустая → true: пустой ожидаемый ключ отсекает вызывающий, не функция', () => {
    // handleAutoDispatch (ai-run) отвечает 401 при пустом BRIEF_AUTO_KEY ДО сравнения.
    expect(timingSafeEqual('', '')).toBe(true);
  });
});
