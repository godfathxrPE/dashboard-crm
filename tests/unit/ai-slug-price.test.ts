import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PRICE_BY_SLUG, priceForSlug } from '@/lib/constants/ai-presets';

// ═══════════════════════════════════════════════════════
// S-DEBT-1, Задача 3–4 — цена по слагу не должна гаснуть молча.
//
// Два разных написания ОДНОЙ модели: Anthropic в своём API зовёт её
// `claude-haiku-4-5`, каталог OpenRouter — `anthropic/claude-haiku-4.5`
// (сверено по `/api/v1/models` 2026-08-19: дефисной формы там нет вовсе).
// До этого спринта вторая форма давала `null`, то есть цена прогона через
// OpenRouter пропадала из карточки МОЛЧА.
//
// Тесты ниже фиксируют ровно две вещи:
//   • точка версии схлопывается в дефис У ANTHROPIC и ТОЛЬКО у него;
//   • набор слагов в дефолтах кода и в таблице цен не разъезжается —
//     следующая правка обязана разойтись ГРОМКО, а не тихо.
// Сеть не трогаем: сверка с живым каталогом — работа человека, не CI.
// ═══════════════════════════════════════════════════════

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('priceForSlug — новые слаги эпика OpenRouter', () => {
  it('deepseek-v4-flash: $0.083 / $0.165 за 1M', () => {
    expect(priceForSlug('deepseek/deepseek-v4-flash')).toEqual({ in: 0.083, out: 0.165 });
    // Бесвендорная форма: адаптер дописывает вендор только anthropic-слагам.
    expect(priceForSlug('deepseek-v4-flash')).toEqual({ in: 0.083, out: 0.165 });
  });

  it('grok-4.3: $1.25 / $2.50 за 1M', () => {
    expect(priceForSlug('x-ai/grok-4.3')).toEqual({ in: 1.25, out: 2.5 });
    expect(priceForSlug('grok-4.3')).toEqual({ in: 1.25, out: 2.5 });
  });
});

describe('normalizeSlug — точка версии против дефиса', () => {
  const HAIKU = { in: 1, out: 5 };

  it('anthropic: каталожная форма с точкой находит ту же строку, что дефисная', () => {
    expect(priceForSlug('anthropic/claude-haiku-4.5')).toEqual(HAIKU);
    expect(priceForSlug('claude-haiku-4.5')).toEqual(HAIKU);
    expect(priceForSlug('claude-haiku-4-5')).toEqual(HAIKU);
    // Датированный слаг прямого Anthropic — отдельная строка таблицы, не нормализация.
    expect(priceForSlug('claude-haiku-4-5-20251001')).toEqual(HAIKU);
  });

  it('anthropic: точка схлопывается и в остальных семействах', () => {
    expect(priceForSlug('anthropic/claude-sonnet-4.6')).toEqual({ in: 3, out: 15 });
    expect(priceForSlug('anthropic/claude-opus-4.8')).toEqual({ in: 5, out: 25 });
  });

  it('НЕ-anthropic вендор нормализации не получает: выдуманное написание — не цена', () => {
    // `x-ai/grok-4-3` в каталоге не существует. Склеить его с `grok-4.3` значит
    // решить за вендора, что это одна модель, — ровно то угадывание, от которого
    // уходит весь эпик. Пустое место честнее правдоподобного числа.
    expect(priceForSlug('x-ai/grok-4-3')).toBeNull();
    expect(priceForSlug('deepseek/deepseek-v4.flash')).toBeNull();
  });

  it('побочные формы каталога цены не получают — у них другой тариф', () => {
    expect(priceForSlug('anthropic/claude-sonnet-5:batch')).toBeNull();
    expect(priceForSlug('anthropic/claude-opus-5-fast')).toBeNull();
  });

  it('чужой вендор с anthropic-именем модели цену Anthropic не получает', () => {
    expect(priceForSlug('bedrock/claude-opus-5')).toBeNull();
  });
});

describe('сторож: таблица цен', () => {
  it('каждая строка таблицы ДОСТИЖИМА своим же ключом', () => {
    // Ключ, который не переживает собственную нормализацию, найти нельзя никогда:
    // строка есть, а цены по ней не будет. Молчаливее дефекта не бывает.
    for (const [slug, price] of Object.entries(PRICE_BY_SLUG)) {
      expect(priceForSlug(slug), `слаг ${slug} недостижим`).toEqual(price);
    }
  });

  it('ключи anthropic записаны в дефисной форме, точки версии в них нет', () => {
    for (const slug of Object.keys(PRICE_BY_SLUG)) {
      if (!slug.startsWith('claude-')) continue;
      expect(/\d\.\d/.test(slug), `слаг ${slug} должен быть дефисным`).toBe(false);
    }
  });

  it('состав таблицы зафиксирован — правка обязана быть осознанной', () => {
    expect(Object.keys(PRICE_BY_SLUG).sort()).toEqual([
      'claude-fable-5',
      'claude-haiku-4-5',
      'claude-haiku-4-5-20251001',
      'claude-opus-4-6',
      'claude-opus-4-7',
      'claude-opus-4-8',
      'claude-opus-5',
      'claude-sonnet-4-6',
      'claude-sonnet-5',
      'deepseek-v4-flash',
      'deepseek/deepseek-v4-flash',
      'grok-4.3',
      'x-ai/grok-4.3',
    ]);
  });
});

// ═══ Дефолты моделей, вытащенные из ИСХОДНИКОВ ═══
//
// Секреты не читаем и читать не можем — сверяем ровно то, что лежит в коде.
// Регулярка перестала матчиться (строку перенесли, кавычки сменили) — снапшот
// ниже разойдётся, и правка станет видимой. Это и есть задача сторожа.

function slugsFrom(rel: string, re: RegExp): string[] {
  const src = read(rel);
  const out: string[] = [];
  for (const m of src.matchAll(re)) out.push(m[1]);
  return out;
}

function codeDefaults(): string[] {
  const found = [
    ...slugsFrom(
      'supabase/functions/ai-run/index.ts',
      /Deno\.env\.get\('AI_RUN_MODEL_[A-Z]+'\)\s*\?\?\s*'([^']+)'/g,
    ),
    ...slugsFrom('supabase/functions/ai-capture/index.ts', /const DEFAULT_MODEL = '([^']+)'/g),
    ...slugsFrom('supabase/functions/ai-summarize/index.ts', /const DEFAULT_MODEL = '([^']+)'/g),
    ...slugsFrom('supabase/functions/transcribe/cleanup-prompt.ts', /const CLEANUP_MODEL = "([^"]+)"/g),
    ...slugsFrom(
      'supabase/functions/_shared/llm.ts',
      /Deno\.env\.get\('OPENROUTER_(?:SEARCH|STRUCT)_MODEL'\)[^\n]*?\|\| '([^']+)'/g,
    ),
  ];
  return [...new Set(found)].sort();
}

function probeDefaults(): string[] {
  const src = read('scripts/llm-probe.py');
  const block = /DEFAULT_MODELS = \[([\s\S]*?)\]/.exec(src);
  if (!block) return [];
  return [...new Set([...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]))].sort();
}

describe('сторож: дефолты моделей в коде', () => {
  it('набор дефолтов зафиксирован', () => {
    expect(codeDefaults()).toEqual([
      'claude-haiku-4-5',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-5',
      'deepseek/deepseek-v4-flash',
      'x-ai/grok-4.3',
    ]);
    expect(probeDefaults()).toEqual(['anthropic/claude-haiku-4-5', 'deepseek/deepseek-v4-flash']);
  });

  it('у каждого дефолта есть цена — иначе карточка прогона останется без рублей', () => {
    for (const slug of [...codeDefaults(), ...probeDefaults()]) {
      expect(priceForSlug(slug), `нет цены для дефолта ${slug}`).not.toBeNull();
    }
  });

  it('дефолты anthropic записаны в дефисной форме — как ключи таблицы', () => {
    // ⚠️ Это сторож ФОРМАТА, а не существования: `claude-haiku-4-5-20251001` в
    // каталоге OpenRouter отсутствует (сверено 2026-08-19), и дефолт остаётся
    // рабочим только для прямого Anthropic. Переключение — секретом, не кодом.
    for (const slug of [...codeDefaults(), ...probeDefaults()]) {
      if (!slug.includes('claude-')) continue;
      expect(/\d\.\d/.test(slug), `дефолт ${slug} должен быть дефисным`).toBe(false);
    }
  });
});
