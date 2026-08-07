import { describe, it, expect } from 'vitest';
import { findChunkBounds } from '@/lib/transcribe/audio';

/**
 * S-R3-VOICE-1. `findChunkBounds` — чистая функция над `Float32Array`, Web Audio API
 * ей не нужен: тестируется без jsdom-заглушек.
 *
 * Масштаб уменьшен параметрами (боевые 16 кГц/120 с дали бы массив на 2 млн сэмплов
 * ради проверки арифметики): rate 1000, номинал 1 с = 1000 сэмплов, окно поиска
 * 0.3 с = 300 сэмплов, окно тишины 100 мс = 100 сэмплов, шаг 25.
 */
const OPTS = { sampleRate: 1000, chunkSeconds: 1, searchSeconds: 0.3, silenceWindowMs: 100 };
const NOMINAL = 1000;
const SEARCH_SPAN = 300;

/** Ровный «громкий» сигнал: амплитуда 1 везде. */
function loud(length: number): Float32Array {
  return new Float32Array(length).fill(1);
}

/** Тот же сигнал с нулевым (тихим) участком [from, to). */
function withSilence(length: number, from: number, to: number): Float32Array {
  const samples = loud(length);
  samples.fill(0, from, to);
  return samples;
}

describe('findChunkBounds', () => {
  it('аудио короче номинальной границы — одна граница, нарезки нет', () => {
    expect(findChunkBounds(loud(500), OPTS)).toEqual([0, 500]);
    // Ровно номинал тоже не режем: условие цикла строгое (`> nominal`).
    expect(findChunkBounds(loud(NOMINAL), OPTS)).toEqual([0, NOMINAL]);
  });

  it('тишина в окне поиска — рез в самой тихой точке, а не на номинальной границе', () => {
    // Тишина [800, 900) целиком укладывается в окно поиска [700, 1000).
    const bounds = findChunkBounds(withSilence(2500, 800, 900), OPTS);

    // Рез — в середине тихого окна, а не на 1000.
    expect(bounds[1]).toBe(850);
    expect(bounds[1]).not.toBe(NOMINAL);
  });

  it('сплошная речь без пауз — рез внутри окна поиска, цикл завершается', () => {
    // Энергия всюду одинакова, минимум не выражен: важно, что функция не уходит
    // в бесконечный поиск и не выносит границу за номинальную точку.
    const bounds = findChunkBounds(loud(5_000), OPTS);

    expect(bounds.length).toBeGreaterThan(2);
    expect(bounds[1]).toBeGreaterThanOrEqual(NOMINAL - SEARCH_SPAN);
    expect(bounds[1]).toBeLessThanOrEqual(NOMINAL);
  });

  it('две границы подряд не совпадают — пустой чанк не создаётся', () => {
    // Периодические паузы: 50 мс тишины каждые 900 сэмплов.
    const samples = loud(10_000);
    for (let start = 850; start < 10_000; start += 900) samples.fill(0, start, start + 50);

    const bounds = findChunkBounds(samples, OPTS);

    for (let i = 1; i < bounds.length; i++) {
      expect(bounds[i]).toBeGreaterThan(bounds[i - 1]);
    }
  });

  it('сумма чанков покрывает весь сигнал — ни один сэмпл не пропал', () => {
    const length = 7_777;
    const bounds = findChunkBounds(withSilence(length, 900, 950), OPTS);

    expect(bounds[0]).toBe(0);
    expect(bounds[bounds.length - 1]).toBe(length);

    let covered = 0;
    for (let i = 1; i < bounds.length; i++) covered += bounds[i] - bounds[i - 1];
    expect(covered).toBe(length);
  });

  it('вырожденный вход — пустой массив не роняет функцию', () => {
    expect(findChunkBounds(new Float32Array(0), OPTS)).toEqual([0, 0]);
    expect(findChunkBounds(new Float32Array(1), OPTS)).toEqual([0, 1]);
  });

  it('без параметров работает на боевых константах (16 кГц, 120 с)', () => {
    // Полторы секунды при боевом номинале в 120 с — нарезки быть не должно,
    // и массив на 2 млн сэмплов для этой проверки собирать не нужно.
    expect(findChunkBounds(new Float32Array(24_000))).toEqual([0, 24_000]);
  });
});
