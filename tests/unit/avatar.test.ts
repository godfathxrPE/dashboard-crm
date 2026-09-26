import { describe, it, expect } from 'vitest';
import { getAvatarColor, getAvatarTone } from '@/lib/utils/avatar';

// S-DEAL-STAKE-VIEW-1: мягкий аватар «Стейкхолдеров» и сплошной на карточке
// компании обязаны дать человеку ОДИН оттенок — иначе аватар перестаёт быть
// опознавательным знаком между экранами.
describe('avatar — оттенок по имени', () => {
  it('getAvatarTone и getAvatarColor указывают на один токен', () => {
    for (const name of ['Наталья Н.', 'Руслан Алиев', 'Михаил', '', 'A']) {
      expect(getAvatarColor(name)).toBe(`var(--${getAvatarTone(name)})`);
    }
  });

  it('детерминирован', () => {
    expect(getAvatarTone('Олег Мазурок')).toBe(getAvatarTone('Олег Мазурок'));
  });
});
