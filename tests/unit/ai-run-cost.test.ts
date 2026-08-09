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
//
// S-COST-TRUTH-1 — калибровка по 12 прогонам в проде (2026-08-09) при курсе 85 ₽/$.
// Числа ниже — арифметика, а не «красивые»: диапазон обязан НАКРЫВАТЬ крайние
// замеры, иначе прогноз противоречит факту, который сам же обещает бракетить.
// ⚠️ Тест намеренно завязан на снапшот курса `USD_RUB`: курс меняется — числа
// пересчитываются вместе с ним и вместе с датой в комментарии у константы.
// ═══════════════════════════════════════════════════════

/** Крайние замеры `ai_runs` (status='done', preset_key='company_brief'), 12 прогонов. */
const FACT_MIN = { inTok: 45_219, outTok: 1_928 };
const FACT_MAX = { inTok: 124_755, outTok: 5_610 };

const ROOT = path.resolve(__dirname, '../..');
const EDGE = readFileSync(path.join(ROOT, 'supabase/functions/ai-run/index.ts'), 'utf8');

describe('оценка прогона с веб-поиском', () => {
  it('диапазон, а не число: верх заметно выше низа, обе границы — целые рубли', () => {
    const { min, max } = estimateWebRunCostRub('sonnet');
    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(min);
    expect(Number.isInteger(min)).toBe(true);
    expect(Number.isInteger(max)).toBe(true);
  });

  it('перестала занижать: оценка брифа кратно выше прежней формулы по символам', () => {
    const byChars = estimateRunCostRub(4_000, 'sonnet'); // как считалось до спринта
    const { min } = estimateWebRunCostRub('sonnet');
    expect(min).toBeGreaterThan(byChars * 5);
  });

  it('считается по границам замера: 45–125К вход, 2–5.6К выход, 5 поисков', () => {
    // S-COST-TRUTH-1. Низ: (45 000×$3 + 2 000×$15)/1M = $0.165 + 5 поисков по $0.01
    //   = $0.215 → 18.3 ₽ → 18. Верх: (125 000×$3 + 5 600×$15)/1M = $0.459 + $0.05
    //   = $0.509 → 43.3 ₽ → 44 (округление НАРУЖУ, см. ниже).
    expect(estimateWebRunCostRub('sonnet')).toEqual({ min: 18, max: 44 });
  });

  it('ДИАПАЗОН НАКРЫВАЕТ ФАКТ: оба крайних прогона попадают внутрь оценки', () => {
    // Смысл оценки — бракетить факт. Вылезает факт за прогноз — прогноз бесполезен,
    // и именно поэтому границы округляются наружу: на курсе 85 верхний замер стоил
    // 43.2 ₽, а `Math.round` дал бы max = 43, то есть оценку, которую живой прогон
    // уже опроверг.
    const { min, max } = estimateWebRunCostRub('sonnet');
    const lo = actualRunCostRub(FACT_MIN.inTok, FACT_MIN.outTok, 'sonnet', 5);
    const hi = actualRunCostRub(FACT_MAX.inTok, FACT_MAX.outTok, 'sonnet', 5);

    expect(lo).toBe(18.2);
    expect(hi).toBe(43.2);
    expect(lo).toBeGreaterThanOrEqual(min);
    expect(hi).toBeLessThanOrEqual(max);
  });
});

describe('факт по завершённому прогону', () => {
  it('токены считаются по прайсу модели', () => {
    // (10 000×$3 + 1 000×$15)/1M = $0.045 → ×85 = 3.8 ₽ (было 4.5 при курсе 100)
    expect(actualRunCostRub(10_000, 1_000, 'sonnet')).toBe(3.8);
  });

  it('веб-запросы прибавляются по $10 за 1000', () => {
    const withoutSearches = actualRunCostRub(10_000, 1_000, 'sonnet');
    // $0.045 + 5×$0.01 = $0.095 → 8.1 ₽. Сравнение не «плюс N ₽»: обе цены
    // округляются до десятых по отдельности, и разность целой не обязана быть.
    expect(actualRunCostRub(10_000, 1_000, 'sonnet', 5)).toBe(8.1);
    expect(actualRunCostRub(10_000, 1_000, 'sonnet', 5)).toBeGreaterThan(withoutSearches);
  });

  it('searches = null не считается нулём поисков и не считается пятью — просто не влияет', () => {
    expect(actualRunCostRub(10_000, 1_000, 'sonnet', null))
      .toBe(actualRunCostRub(10_000, 1_000, 'sonnet', 0));
  });

  it('живой прогон 2026-08-03 (84 125 / 5 503 токена, 10 поисков) стоил ~37 ₽, а не 3.5', () => {
    // 43.5 ₽ этот же прогон «стоил» до S-COST-TRUTH-1 — курс 100 завышал ФАКТ
    // на четверть ровно так же, как прогноз.
    expect(actualRunCostRub(84_125, 5_503, 'sonnet', 10)).toBe(37);
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
