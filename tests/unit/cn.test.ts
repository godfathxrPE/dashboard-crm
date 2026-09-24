import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils/cn';

// G-1: проектные кегли text-meta/text-body — группа font-size, а не цвет текста.
describe('cn — проектные кегли', () => {
  it('кегль и цвет из разных аргументов живут вместе', () => {
    expect(cn('text-meta', 'text-text-dim')).toBe('text-meta text-text-dim');
  });

  it('кегль и цвет в одной строке живут вместе', () => {
    expect(cn('text-body text-text-main')).toBe('text-body text-text-main');
  });

  it('два кегля — побеждает последний', () => {
    expect(cn('text-meta', 'text-body')).toBe('text-body');
  });

  it('два цвета — побеждает последний', () => {
    expect(cn('text-text-dim', 'text-text-mute')).toBe('text-text-mute');
  });
});
