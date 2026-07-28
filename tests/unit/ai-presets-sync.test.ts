import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AI_PRESETS, type AiEntityType } from '@/lib/constants/ai-presets';

// ═══════════════════════════════════════════════════════
// S-R2-AI-HARDEN (085) — синхронность реестра пресетов и БД.
//
// Один и тот же факт живёт в трёх местах: CHECK'и миграции 085, реестр PRESETS в
// supabase/functions/ai-run/index.ts и AI_PRESETS здесь. Разъедутся — прогон упадёт
// на CHECK уже в проде, потому что edge и клиент договорятся между собой.
// Комментарием это не удержать, поэтому держим тестом: клиентский реестр сверяется
// с текстом миграции и с реестром edge.
// ═══════════════════════════════════════════════════════

const ROOT = path.resolve(__dirname, '../..');
// Строки-комментарии выкидываем: в шапке 085 описан ОТКАТ, и он содержит те же
// имена constraint'ов со старыми списками — регексп по сырому файлу нашёл бы их.
const MIGRATION = readFileSync(
  path.join(ROOT, 'supabase/migrations/085_ai_runs_nullable_transcript.sql'),
  'utf8',
)
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const EDGE = readFileSync(path.join(ROOT, 'supabase/functions/ai-run/index.ts'), 'utf8');

/** Ключи из `preset_key in ('a','b',…)` конкретного CHECK'а. */
function presetsInCheck(sql: string): string[] {
  const body = /constraint ai_runs_transcript_required[\s\S]*?preset_key in \(([^)]*)\)/i.exec(sql);
  if (!body) throw new Error('CHECK ai_runs_transcript_required не найден в 085');
  return [...body[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

/** Типы из `entity_type in ('a','b',…)` (берём определение constraint'а, не откат). */
function entityTypesInCheck(sql: string): string[] {
  const body = /add constraint ai_runs_entity_type_check[\s\S]*?entity_type in \(([^)]*)\)/i.exec(sql);
  if (!body) throw new Error('CHECK ai_runs_entity_type_check не найден в 085');
  return [...body[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
}

describe('085 ↔ реестр пресетов', () => {
  it('CHECK ai_runs_transcript_required перечисляет ровно пресеты с needsTranscript: false', () => {
    const fromClient = AI_PRESETS.filter((p) => !p.needsTranscript).map((p) => p.key).sort();
    expect(presetsInCheck(MIGRATION)).toEqual(fromClient);
  });

  it('CHECK ai_runs_entity_type_check покрывает все типы сущностей реестра', () => {
    const fromClient = [
      ...new Set(AI_PRESETS.flatMap((p) => p.entityTypes as AiEntityType[])),
    ].sort();
    expect(entityTypesInCheck(MIGRATION)).toEqual(fromClient);
  });
});

describe('edge ↔ клиентский реестр', () => {
  it('в edge объявлен каждый пресет клиентского реестра', () => {
    for (const p of AI_PRESETS) {
      expect(EDGE, `пресет ${p.key} отсутствует в ai-run/index.ts`).toContain(`key: '${p.key}'`);
    }
  });

  it('в клиентском реестре есть каждый пресет edge', () => {
    const edgeKeys = [...EDGE.matchAll(/^\s{4}key: '([a-z_]+)',$/gm)].map((m) => m[1]).sort();
    expect(edgeKeys.length).toBeGreaterThan(0);
    expect(edgeKeys).toEqual(AI_PRESETS.map((p) => p.key).sort());
  });

  it('ANTI_INJECTION подставлен в system КАЖДОГО пресета edge', () => {
    const systems = [...EDGE.matchAll(/^\s{4}system:\s*$/gm)].length;
    const guarded = [...EDGE.matchAll(/\$\{ANTI_INJECTION\}/g)].length;
    expect(systems).toBe(AI_PRESETS.length);
    expect(guarded).toBe(AI_PRESETS.length);
  });

  it('tool_choice форсирован (модель обязана ответить вызовом инструмента)', () => {
    expect(EDGE).toContain("tool_choice: { type: 'tool', name: preset.tool.name }");
  });
});
