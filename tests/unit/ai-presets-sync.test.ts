import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
// (S-COMPANY-AI-1) переписала под company/company_brief, 127 (S-AI-OBS-1) — под
// capture; сверяться с 104 значит сверяться с историей. Следующая миграция,
// трогающая эти constraint'ы, обязана заменить путь здесь; иначе тест начнёт
// охранять прошлое.
//
// Строки-комментарии выкидываем: в шапке миграции описан ОТКАТ, и он содержит те же
// имена constraint'ов со старыми списками — регексп по сырому файлу нашёл бы их.
const MIGRATION = readFileSync(
  path.join(ROOT, 'supabase/migrations/127_ai_runs_capture.sql'),
  'utf8',
)
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/**
 * Ключи, которые есть в БД и намеренно ОТСУТСТВУЮТ в клиентском реестре.
 *
 * `capture` (S-AI-OBS-1) — разбор быстрого ввода. Это прогон модели и место в
 * журнале ему полагается, но кнопки у него нет и быть не может: он запускается
 * потоком ввода, а не нажатием. В `AI_PRESETS` он попал бы кнопкой на карточке
 * сущности, а в реестре edge `ai-run` — пресетом, которого та функция не знает,
 * и оба зеркальных теста ниже сломались бы правильно.
 */
const NON_UI_PRESETS = ['capture'];
const NON_UI_ENTITY_TYPES = ['capture'];
const EDGE = readFileSync(path.join(ROOT, 'supabase/functions/ai-run/index.ts'), 'utf8');
// Общая точка вызова LLM (S-LLM-OPENROUTER-1): тело запроса к провайдеру живёт здесь.
const ADAPTER = readFileSync(path.join(ROOT, 'supabase/functions/_shared/llm.ts'), 'utf8');

/** Ключи из `preset_key in ('a','b',…)` конкретного CHECK'а. */
function presetsInCheck(sql: string): string[] {
  const body = /constraint ai_runs_transcript_required[\s\S]*?preset_key in \(([^)]*)\)/i.exec(sql);
  if (!body) throw new Error('CHECK ai_runs_transcript_required не найден в 127');
  return [...body[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

/** Типы из `entity_type in ('a','b',…)` (берём определение constraint'а, не откат). */
function entityTypesInCheck(sql: string): string[] {
  const body = /add\s+constraint ai_runs_entity_type_check[\s\S]*?entity_type in \(([^)]*)\)/i.exec(sql);
  if (!body) throw new Error('CHECK ai_runs_entity_type_check не найден в 127');
  return [...body[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
}

describe('127 ↔ реестр пресетов', () => {
  it('CHECK ai_runs_transcript_required — это пресеты с needsTranscript: false плюс внекнопочные', () => {
    const fromClient = AI_PRESETS.filter((p) => !p.needsTranscript).map((p) => p.key);
    expect(presetsInCheck(MIGRATION)).toEqual([...fromClient, ...NON_UI_PRESETS].sort());
  });

  it('CHECK ai_runs_entity_type_check покрывает типы реестра плюс внекнопочные', () => {
    const fromClient = [...new Set(AI_PRESETS.flatMap((p) => p.entityTypes as AiEntityType[]))];
    expect(entityTypesInCheck(MIGRATION)).toEqual([...fromClient, ...NON_UI_ENTITY_TYPES].sort());
  });

  // ⚠️ Обратная сторона послабления выше: список исключений обязан оставаться
  //    списком ИСКЛЮЧЕНИЙ. Попади сюда обычный пресет — оба теста стали бы
  //    пропускать его отсутствие в реестре, то есть ровно перестали бы работать.
  it('внекнопочные ключи не пересекаются с клиентским реестром', () => {
    const keys = AI_PRESETS.map((p) => p.key as string);
    expect(NON_UI_PRESETS.filter((k) => keys.includes(k))).toEqual([]);
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

  // S-LLM-SEARCH-1, проверяемый инвариант спринта: провайдера выбирает ТОЛЬКО адаптер.
  // Прямой вызов Anthropic из функции означал бы, что переключение LLM_PROVIDER её
  // не касается — ровно та поломка, из-за которой бриф падал на пустом балансе.
  it('ни одна edge-функция не ходит в api.anthropic.com напрямую', () => {
    const dir = path.join(ROOT, 'supabase/functions');
    const offenders = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '_shared')
      .map((d) => path.join(dir, d.name, 'index.ts'))
      .filter((f) => existsSync(f))
      .filter((f) => /fetch\(\s*['\`"]https:\/\/api\.anthropic\.com/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  // S-LLM-SEARCH-1: путь поиска уехал в адаптер целиком. Инвариант не исчез —
  // сменил файл, поэтому проверка смотрит туда же, куда смотрит код.
  it('Anthropic-ветка поиска не форсирует tool_choice (форс несовместим с поиском)', () => {
    const start = ADAPTER.indexOf('export async function callLlmSearch(');
    expect(start, 'callLlmSearch не найдена в адаптере').toBeGreaterThan(-1);
    const body = ADAPTER.slice(start);
    expect(body).toContain("tool_choice: { type: 'auto' }");
    expect(body).not.toContain("tool_choice: { type: 'tool'");
  });

  it('OpenRouter ищет плагином, а не инструментом-поиском', () => {
    // У OpenRouter поиск — плагин `web`, никакого web_search_20250305.
    // S-BRIEF-2PASS: плагин собирается с движком (`{ id: 'web', engine }`), а не
    // литералом `{ id: 'web' }` — форма проверяется тестами brief-2pass, здесь
    // держим только сам факт «поиск через plugins».
    expect(ADAPTER).toContain("id: 'web'");
    expect(ADAPTER).toContain('plugins');
  });

  it('S-BRIEF-2PASS: у OpenRouter два прохода, и они не перепутаны', () => {
    // Проход 1 ищет (plugins, без инструментов), проход 2 упаковывает (форс, без
    // plugins). Слаги — из отдельных секретов, с дефолтами из замера.
    expect(ADAPTER).toContain('OPENROUTER_SEARCH_MODEL');
    expect(ADAPTER).toContain('OPENROUTER_STRUCT_MODEL');
    expect(ADAPTER).toContain("'x-ai/grok-4.3'");
    expect(ADAPTER).toContain("'deepseek/deepseek-v4-flash'");
    // Дефолт движка сменился с exa на native ВМЕСТЕ со снятием форса.
    expect(ADAPTER).toContain("|| 'native'");
  });

  it('webSearch включён ровно у пресетов, которым он положен', () => {
    const withSearch = [...EDGE.matchAll(/^\s{4}webSearch: true,$/gm)].length;
    expect(withSearch).toBe(1); // company_brief и только он
    expect(AI_PRESETS.some((p) => p.key === 'company_brief')).toBe(true);
  });
});
