import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AI_PRESETS,
  presetByKey,
  PRICE_BY_SLUG,
  priceForSlug,
  isAnthropicSlug,
  actualRunCostRub,
  estimateInputTokens,
  formatTokens,
  runVolumeLabel,
  type PresetMeta,
} from '@/lib/constants/ai-presets';

// ═══════════════════════════════════════════════════════
// S-LLM-OPENROUTER-1 — экономика прогона после переезда на OpenRouter.
//
// До спринта прайс ключевался РОЛЬЮ пресета (`sonnet`/`haiku`), и это работало
// ровно потому, что роль однозначно определяла модель. Теперь слаг приходит из
// секрета, провайдер — из `LLM_PROVIDER`, и роль о цене не говорит ничего.
//
// Тест держит новый контракт: цена считается по СЛАГУ, неизвестный слаг даёт
// `null` (а не ноль и не бросок), надбавка за веб-поиск живёт только у Anthropic,
// а прогноз до запуска рублей не показывает вовсе.
//
// ⚠️ Числа завязаны на снапшоты `USD_RUB` и `PRICE_BY_SLUG`: меняется снапшот —
// пересчитываются вместе с датой в комментарии у константы.
// ═══════════════════════════════════════════════════════

const ROOT = path.resolve(__dirname, '../..');
const EDGE = readFileSync(path.join(ROOT, 'supabase/functions/ai-run/index.ts'), 'utf8');

describe('прайс по слагу, а не по роли пресета', () => {
  it('известный слаг даёт цену, НЕИЗВЕСТНЫЙ — null, а не ноль и не бросок', () => {
    expect(priceForSlug('claude-sonnet-5')).toEqual({ in: 2, out: 10 });
    expect(priceForSlug('deepseek/deepseek-v4-flash')).toBeNull();
    expect(priceForSlug('')).toBeNull();
    expect(priceForSlug(null)).toBeNull();
    expect(priceForSlug(undefined)).toBeNull();
    expect(() => priceForSlug('что-то новое')).not.toThrow();
  });

  it('вендорный префикс нормализуется: anthropic/X и X — одна строка таблицы', () => {
    expect(priceForSlug('anthropic/claude-haiku-4-5')).toEqual(priceForSlug('claude-haiku-4-5'));
    expect(priceForSlug('  ANTHROPIC/Claude-Haiku-4-5  ')).toEqual(priceForSlug('claude-haiku-4-5'));
    expect(actualRunCostRub(10_000, 1_000, 'anthropic/claude-sonnet-5'))
      .toBe(actualRunCostRub(10_000, 1_000, 'claude-sonnet-5'));
  });

  it('срезается ТОЛЬКО anthropic/ — чужой вендор не получает прайс Anthropic', () => {
    // `bedrock/claude-opus-5` тарифицируется иначе; подставить сюда цену Anthropic
    // значило бы вернуть ровно тот дефект, который спринт и чинит.
    expect(priceForSlug('bedrock/claude-opus-5')).toBeNull();
    expect(priceForSlug('openrouter/claude-opus-5')).toBeNull();
  });

  it('haiku стоит 1/5, а не 0.8/4 — прежняя таблица занижала на четверть', () => {
    expect(PRICE_BY_SLUG['claude-haiku-4-5']).toEqual({ in: 1, out: 5 });
    // Дефолт ai-run — датированный слаг; он обязан быть в таблице отдельной строкой.
    expect(priceForSlug('claude-haiku-4-5-20251001')).toEqual({ in: 1, out: 5 });
  });

  it('дефолтные слаги edge-функции таблице известны — иначе цена не покажется никому', () => {
    const defaults = [...EDGE.matchAll(/'(claude-[a-z0-9-]+)'/g)].map((m) => m[1]);
    expect(defaults.length).toBeGreaterThan(0);
    for (const slug of defaults) {
      expect(priceForSlug(slug), `слаг ${slug} отсутствует в PRICE_BY_SLUG`).not.toBeNull();
    }
  });
});

describe('факт по завершённому прогону', () => {
  it('токены считаются по прайсу слага', () => {
    // (10 000×$2 + 1 000×$10)/1M = $0.03 → ×85 = 2.55 → 2.6 ₽
    expect(actualRunCostRub(10_000, 1_000, 'claude-sonnet-5')).toBe(2.6);
    // Тот же прогон на haiku вдвое дешевле — роль пресета тут ни при чём.
    expect(actualRunCostRub(10_000, 1_000, 'claude-haiku-4-5')).toBe(1.3);
  });

  it('неизвестный слаг ⇒ null: строка про рубли не рисуется вовсе', () => {
    expect(actualRunCostRub(10_000, 1_000, 'deepseek/deepseek-v4-flash')).toBeNull();
    expect(actualRunCostRub(10_000, 1_000, null)).toBeNull();
    // Ноль был бы враньём: «прогон стоил 0 ₽» читается как факт, а не как «не знаю».
    expect(actualRunCostRub(10_000, 1_000, 'нечто')).not.toBe(0);
  });

  it('веб-поиск прибавляется по $10 за 1000 — и ТОЛЬКО у anthropic-слага', () => {
    const withoutSearches = actualRunCostRub(10_000, 1_000, 'claude-sonnet-5')!;
    // $0.03 + 5×$0.01 = $0.08 → 6.8 ₽
    expect(actualRunCostRub(10_000, 1_000, 'claude-sonnet-5', 5)).toBe(6.8);
    expect(actualRunCostRub(10_000, 1_000, 'claude-sonnet-5', 5)!).toBeGreaterThan(withoutSearches);
    expect(actualRunCostRub(10_000, 1_000, 'anthropic/claude-sonnet-5', 5)).toBe(6.8);
  });

  it('searches = null не считается ни нулём поисков, ни пятью — просто не влияет', () => {
    expect(actualRunCostRub(10_000, 1_000, 'claude-sonnet-5', null))
      .toBe(actualRunCostRub(10_000, 1_000, 'claude-sonnet-5', 0));
  });

  it('isAnthropicSlug различает вендора: веб-поиск на OpenRouter не переезжал', () => {
    expect(isAnthropicSlug('claude-opus-5')).toBe(true);
    expect(isAnthropicSlug('anthropic/claude-opus-5')).toBe(true);
    expect(isAnthropicSlug('deepseek/deepseek-v4-flash')).toBe(false);
    expect(isAnthropicSlug(null)).toBe(false);
  });

  it('живой прогон 2026-08-03 (84 125 / 5 503 токена, 10 поисков) на sonnet — ~27.5 ₽', () => {
    // (84 125×$2 + 5 503×$10)/1M = $0.2233 + 10×$0.01 = $0.3233 → ×85 = 27.5 ₽.
    // Тот же прогон «стоил» 43.5 ₽ при курсе 100, 37 ₽ при прайсе sonnet $3/$15 и
    // 27.5 ₽ сейчас — три числа за один прогон: цена и курс обязаны быть снапшотами
    // с датой, иначе «факт» дрейфует молча.
    expect(actualRunCostRub(84_125, 5_503, 'claude-sonnet-5', 10)).toBe(27.5);
  });
});

describe('прогноз до запуска: объём вместо рублей', () => {
  const webPreset = presetByKey('company_brief') as PresetMeta;
  const plainPreset = presetByKey('meeting_protocol') as PresetMeta;

  it('подпись пресета не содержит рублей — клиент не знает модель и провайдер', () => {
    expect(runVolumeLabel(plainPreset, 8_000)).not.toContain('₽');
    expect(runVolumeLabel(webPreset, 4_000)).not.toContain('₽');
  });

  it('обычный пресет: вход считается по символам', () => {
    // 8 000 симв. / 2.5 = 3 200 токенов
    expect(estimateInputTokens(8_000)).toBe(3_200);
    expect(runVolumeLabel(plainPreset, 8_000)).toBe('≈ 3К токенов входа');
  });

  it('пресет с веб-поиском: ДИАПАЗОН замеров, а не оценка по символам', () => {
    // Вход брифа задают втянутые страницы, а не карточка компании.
    expect(runVolumeLabel(webPreset, 4_000)).toBe('≈ 45К–125К токенов входа');
    expect(runVolumeLabel(webPreset, 4_000)).not.toEqual(runVolumeLabel(plainPreset, 4_000));
  });

  it('formatTokens: тысячи с «К», мелочь как есть, отрицательное не пролезает', () => {
    expect(formatTokens(34_000)).toBe('34К');
    expect(formatTokens(850)).toBe('850');
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(-5)).toBe('0');
  });

  it('estimateInputTokens устойчив к нулю и мусору', () => {
    expect(estimateInputTokens(0)).toBe(0);
    expect(estimateInputTokens(-100)).toBe(0);
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
    // ⚠️ Сигнатура сузилась на S-LLM-OPENROUTER-1: ключ и провайдера разрешает
    // адаптер, поэтому `apiKey` из аргументов `callClaude` ушёл. Зеркало обязано
    // следовать за кодом — иначе тест охраняет прошлое.
    expect(EDGE).toContain('await callClaude(preset, `${userTurn}\\n\\n${SHAPE_RETRY_HINT}`)');
  });

  it('продолжение диалога закрывает tool_use прошлой попытки tool_result (иначе 400)', () => {
    expect(EDGE).toContain("type: 'tool_result'");
  });

  it('причина ретрая и число поисков доезжают до meta прогона', () => {
    expect(EDGE).toContain('retry_reason: retryReason.slice(0, 5)');
    expect(EDGE).toContain('{ searches }');
  });
});
