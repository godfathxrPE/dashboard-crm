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
// ⚠️ Читаем АКТУАЛЬНУЮ редакцию обоих CHECK'ов, а не первую. 085 их завела, 104
// (S-COMPANY-AI-1) переписала под company/company_brief — сверяться с 085 значит
// сверяться с историей. Следующая миграция, трогающая эти constraint'ы, обязана
// заменить путь здесь; иначе тест начнёт охранять прошлое.
//
// Строки-комментарии выкидываем: в шапке миграции описан ОТКАТ, и он содержит те же
// имена constraint'ов со старыми списками — регексп по сырому файлу нашёл бы их.
const MIGRATION = readFileSync(
  path.join(ROOT, 'supabase/migrations/104_ai_runs_company.sql'),
  'utf8',
)
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const EDGE = readFileSync(path.join(ROOT, 'supabase/functions/ai-run/index.ts'), 'utf8');
// Общая точка вызова LLM (S-LLM-OPENROUTER-1): тело запроса к провайдеру живёт здесь.
const ADAPTER = readFileSync(path.join(ROOT, 'supabase/functions/_shared/llm.ts'), 'utf8');

/** Ключи из `preset_key in ('a','b',…)` конкретного CHECK'а. */
function presetsInCheck(sql: string): string[] {
  const body = /constraint ai_runs_transcript_required[\s\S]*?preset_key in \(([^)]*)\)/i.exec(sql);
  if (!body) throw new Error('CHECK ai_runs_transcript_required не найден в 104');
  return [...body[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

/** Типы из `entity_type in ('a','b',…)` (берём определение constraint'а, не откат). */
function entityTypesInCheck(sql: string): string[] {
  const body = /add constraint ai_runs_entity_type_check[\s\S]*?entity_type in \(([^)]*)\)/i.exec(sql);
  if (!body) throw new Error('CHECK ai_runs_entity_type_check не найден в 104');
  return [...body[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
}

describe('104 ↔ реестр пресетов', () => {
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

  // S-LLM-OPENROUTER-1: форс переехал из ai-run в общий адаптер `_shared/llm.ts`
  // вместе с самим вызовом. Инвариант не исчез — сменился его адрес, поэтому тест
  // смотрит туда же, куда смотрит код, а не удалён «за неактуальностью».
  it('tool_choice форсирован в адаптере, на обоих провайдерах', () => {
    expect(ADAPTER).toContain("tool_choice: { type: 'tool', name: opts.tool.name }");
    expect(ADAPTER).toContain("tool_choice: { type: 'function', function: { name: opts.tool.name } }");
  });

  it('ai-run зовёт адаптер, а не собирает запрос к провайдеру сам', () => {
    expect(EDGE).toContain("from '../_shared/llm.ts'");
    expect(EDGE).not.toContain("tool_choice: { type: 'tool', name: preset.tool.name }");
  });
});

// S-COMPANY-AI-1 (104): веб-поиск живёт ТОЛЬКО на новом пути. Инвариант дорогой:
// попади web_search в callClaude — все пресеты начали бы ходить наружу и платить
// за поиск, а форс tool_choice сделал бы этот поиск ещё и бесполезным.
describe('веб-поиск изолирован в отдельном пути', () => {
  /**
   * Тело функции: от объявления до закрывающей скобки в нулевой колонке.
   * Резать «до следующей async function» нельзя — между ними живут константы
   * веб-поиска, и они попали бы в тело callClaude, ложно провалив тест.
   */
  function bodyOf(name: string): string {
    const start = EDGE.indexOf(`async function ${name}(`);
    expect(start, `функция ${name} не найдена в edge`).toBeGreaterThan(-1);
    const end = EDGE.indexOf('\n}\n', start);
    expect(end, `не найден конец функции ${name}`).toBeGreaterThan(start);
    return EDGE.slice(start, end);
  }

  it('callClaude не знает о вебе — старые пресеты идут прежним путём', () => {
    expect(bodyOf('callClaude')).not.toContain('web_search');
  });

  it('callClaudeWithSearch не форсирует tool_choice (форс несовместим с поиском)', () => {
    const body = bodyOf('callClaudeWithSearch');
    expect(body).toContain("tool_choice: { type: 'auto' }");
    expect(body).not.toContain("type: 'tool'");
  });

  it('webSearch включён ровно у пресетов, которым он положен', () => {
    const withSearch = [...EDGE.matchAll(/^\s{4}webSearch: true,$/gm)].length;
    expect(withSearch).toBe(1); // company_brief и только он
    expect(AI_PRESETS.some((p) => p.key === 'company_brief')).toBe(true);
  });
});
