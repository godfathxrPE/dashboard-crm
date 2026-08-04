import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AI_PRESETS,
  estimateRunCostRub,
  estimateWebRunCostRub,
  actualRunCostRub,
} from '@/lib/constants/ai-presets';

// ═══════════════════════════════════════════════════════
// S-COMPANY-AI-1a — экономика прогона.
//
// Кнопка обещала «≈ 3.5 ₽» при факте в разы больше: estimateRunCostRub считает вход
// как карточку компании, а у пресета с веб-поиском вход задают втянутые в контекст
// страницы плюс отдельный тариф на сами запросы. Тест держит три вещи: занижения
// больше нет, факт считается по токенам прогона, и флаг webSearch не разъехался
// между клиентским реестром и edge.
// ═══════════════════════════════════════════════════════

const ROOT = path.resolve(__dirname, '../..');
const EDGE = readFileSync(path.join(ROOT, 'supabase/functions/ai-run/index.ts'), 'utf8');

describe('оценка прогона с веб-поиском', () => {
  it('диапазон, а не число: верх (с ретраем) заметно выше низа', () => {
    const { min, max } = estimateWebRunCostRub('sonnet');
    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(min);
  });

  it('перестала занижать: оценка брифа кратно выше прежней формулы по символам', () => {
    const byChars = estimateRunCostRub(4_000, 'sonnet'); // как считалось до спринта
    const { min } = estimateWebRunCostRub('sonnet');
    expect(min).toBeGreaterThan(byChars * 5);
  });

  it('считается по замерам, а не по charCount (40К вход + 3К выход + 5 поисков)', () => {
    // (40 000×$3 + 3 000×$15)/1M = $0.165, плюс 5 поисков по $0.01 = $0.215 → 21.5 ₽
    expect(estimateWebRunCostRub('sonnet').min).toBe(22);
  });
});

describe('факт по завершённому прогону', () => {
  it('токены считаются по прайсу модели', () => {
    // (10 000×$3 + 1 000×$15)/1M = $0.045 → 4.5 ₽
    expect(actualRunCostRub(10_000, 1_000, 'sonnet')).toBe(4.5);
  });

  it('веб-запросы прибавляются по $10 за 1000', () => {
    const withoutSearches = actualRunCostRub(10_000, 1_000, 'sonnet');
    expect(actualRunCostRub(10_000, 1_000, 'sonnet', 5)).toBe(withoutSearches + 5);
  });

  it('searches = null не считается нулём поисков и не считается пятью — просто не влияет', () => {
    expect(actualRunCostRub(10_000, 1_000, 'sonnet', null))
      .toBe(actualRunCostRub(10_000, 1_000, 'sonnet', 0));
  });

  it('живой прогон 2026-08-03 (84 125 / 5 503 токена, 10 поисков) стоил ~43 ₽, а не 3.5', () => {
    expect(actualRunCostRub(84_125, 5_503, 'sonnet', 10)).toBe(43.5);
  });
});

describe('флаг webSearch синхронен с edge', () => {
  /** Пресеты edge, у которых объявлен `webSearch: true`. Границы реестра важны:
   *  ниже по файлу слово webSearch встречается в коде развилки и в комментариях. */
  function edgePresetsWithSearch(): string[] {
    const start = EDGE.indexOf('const PRESETS: Record<string, Preset> = {');
    expect(start, 'реестр PRESETS не найден в edge').toBeGreaterThan(-1);
    const end = EDGE.indexOf('\n};\n', start);
    const registry = EDGE.slice(start, end);
    const keys = [...registry.matchAll(/^ {4}key: '([a-z_]+)',$/gm)];
    return keys
      .filter((m, i) => {
        const from = m.index ?? 0;
        const to = i + 1 < keys.length ? keys[i + 1].index ?? registry.length : registry.length;
        return /^ {4}webSearch: true,$/m.test(registry.slice(from, to));
      })
      .map((m) => m[1]);
  }

  it('одни и те же пресеты ходят в веб на клиенте и в edge', () => {
    const fromClient = AI_PRESETS.filter((p) => p.webSearch).map((p) => p.key).sort();
    expect(fromClient).toEqual(['company_brief']);
    expect(edgePresetsWithSearch().sort()).toEqual(fromClient);
  });
});

describe('ретрай формы у пресета с поиском продолжает диалог', () => {
  it('вторая попытка идёт с priorMessages первой, а не с нуля', () => {
    expect(EDGE).toContain('callClaudeWithSearch(apiKey, preset, SHAPE_RETRY_HINT, firstSearch.messages)');
  });

  it('старые пресеты ретраятся прежним путём — полным повтором userTurn с подсказкой', () => {
    expect(EDGE).toContain('await callClaude(apiKey, preset, `${userTurn}\\n\\n${SHAPE_RETRY_HINT}`)');
  });

  it('продолжение диалога закрывает tool_use прошлой попытки tool_result (иначе 400)', () => {
    expect(EDGE).toContain("type: 'tool_result'");
  });

  it('причина ретрая и число поисков доезжают до meta прогона', () => {
    expect(EDGE).toContain('retry_reason: retryReason.slice(0, 5)');
    expect(EDGE).toContain('{ searches }');
  });
});
