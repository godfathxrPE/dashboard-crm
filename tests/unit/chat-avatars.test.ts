import { describe, it, expect } from 'vitest';
import {
  CHANNEL_GRADIENTS,
  channelInitials,
  djb2,
  gradientFor,
} from '@/lib/constants/chat-avatars';

// S-CHAT-HUB-1e: аватар канала обязан быть одинаковым между рендерами и устройствами —
// это единственное, что делает его опознавательным знаком, а не украшением.

describe('djb2 / gradientFor', () => {
  it('стабилен: один и тот же id всегда даёт ту же пару', () => {
    const id = '3f1c0f4e-0000-4000-8000-000000000001';
    expect(djb2(id)).toBe(djb2(id));
    expect(gradientFor(id)).toBe(gradientFor(id));
  });

  it('всегда возвращает пару ИЗ палитры (индекс не уезжает за границы)', () => {
    for (let i = 0; i < 200; i += 1) {
      const g = gradientFor(`conversation-${i}`);
      expect(CHANNEL_GRADIENTS).toContain(g);
    }
  });

  it('разводит соседние id по разным парам (uuid отличается одним символом)', () => {
    const a = gradientFor('3f1c0f4e-0000-4000-8000-000000000001');
    const b = gradientFor('3f1c0f4e-0000-4000-8000-000000000002');
    expect(a).not.toBe(b);
  });

  it('покрывает всю палитру, а не пару цветов', () => {
    const used = new Set(
      Array.from({ length: 400 }, (_, i) => gradientFor(`c-${i}`).name),
    );
    expect(used.size).toBe(CHANNEL_GRADIENTS.length);
  });
});

describe('channelInitials', () => {
  it('два первых слова — по первой букве', () => {
    expect(channelInitials('Завод Атлант')).toBe('ЗА');
    expect(channelInitials('Завод Атлант Северный')).toBe('ЗА');
  });

  it('одно слово — две первые буквы', () => {
    expect(channelInitials('Атлант')).toBe('АТ');
  });

  it('кириллица через toUpperCase, без транслита', () => {
    expect(channelInitials('щит и меч')).toBe('ЩИ');
  });

  it('лишние пробелы не создают пустых слов', () => {
    expect(channelInitials('  Завод   Атлант  ')).toBe('ЗА');
  });

  // Смоук 1e: «Стратек — внедрение» рисовал «С—» — тире считалось словом.
  it('пунктуация словом не считается', () => {
    expect(channelInitials('Стратек — внедрение')).toBe('СВ');
    expect(channelInitials('Атлант (склад)')).toBe('АС');
    expect(channelInitials('— — —')).toBe('');
  });

  it('пустое название — пустые инициалы (пустой градиент лучше «?»)', () => {
    expect(channelInitials('')).toBe('');
    expect(channelInitials('   ')).toBe('');
  });

  it('однобуквенное слово не падает', () => {
    expect(channelInitials('А')).toBe('А');
  });
});
