import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
// Без расширения в пути: Deno-код внутри импортирует './llm-error.ts', но тесты идут
// через tsc/vite, а там расширение запрещено (TS5097).
import {
  classifyLlmError,
  type LlmErrorKind,
} from '../../supabase/functions/_shared/llm-error';
import { parseRunError, isRunErrorRetryable, runErrorText } from '@/lib/domain/ai-run-error';

// ═══════════════════════════════════════════════════════
// S-LLM-SEARCH-1 — «недоступно» ≠ «не получилось».
//
// Боевой случай: три нажатия «Повторить» подряд (19:27, 19:46, 19:48), все три
// прогона умерли за ~1.1 с с `credit balance is too low`. Повтор не помогал и
// помочь не мог — но кнопка стояла, потому что интерфейс не различал классы.
//
// Тест держит цепочку целиком: HTTP-код → класс → префикс в `ai_runs.error` →
// решение UI про кнопку. Рвётся любое звено — ломается тест, а не пользователь.
// ═══════════════════════════════════════════════════════

const ROOT = path.resolve(__dirname, '../..');

describe('classifyLlmError — код в класс', () => {
  it('деньги и доступ → access, повтор не поможет', () => {
    expect(classifyLlmError(401)).toBe('access');
    expect(classifyLlmError(402)).toBe('access'); // OpenRouter: кончились кредиты
    expect(classifyLlmError(403)).toBe('access');
  });

  it('исчерпание кредитов Anthropic приходит как 400 — ловится по телу', () => {
    // ⚠️ Одного кода мало: у Anthropic это 400 invalid_request_error, у OpenRouter 402.
    const body = '{"type":"error","error":{"type":"invalid_request_error",'
      + '"message":"Your credit balance is too low to access the Anthropic API."}}';
    expect(classifyLlmError(400, body)).toBe('access');
    expect(classifyLlmError(400, 'insufficient funds')).toBe('access');
    expect(classifyLlmError(400, 'billing issue')).toBe('access');
    expect(classifyLlmError(400, 'quota exceeded')).toBe('access');
  });

  it('обычный 400 (кривой запрос) в access НЕ попадает', () => {
    expect(classifyLlmError(400, 'messages: roles must alternate')).toBe('upstream');
    expect(classifyLlmError(400)).toBe('upstream');
  });

  it('лимит и сбой апстрима → upstream', () => {
    expect(classifyLlmError(429)).toBe('upstream');
    expect(classifyLlmError(500)).toBe('upstream');
    expect(classifyLlmError(529)).toBe('upstream');
  });

  it('нет структуры → shape, сеть/таймаут → network', () => {
    expect(classifyLlmError(422)).toBe('shape');
    expect(classifyLlmError(0)).toBe('network');
  });

  it('незнакомый код → upstream: ошибаемся в сторону «дать попробовать»', () => {
    // Тупик без единого действия хуже лишней кнопки.
    expect(classifyLlmError(418)).toBe('upstream');
    expect(isRunErrorRetryable('upstream')).toBe(true);
  });
});

describe('parseRunError — префикс класса в ai_runs.error', () => {
  it('разбирает kind|текст', () => {
    const p = parseRunError('access|Сервис ИИ недоступен: нет доступа к провайдеру.');
    expect(p.kind).toBe('access');
    expect(p.message).toBe('Сервис ИИ недоступен: нет доступа к провайдеру.');
  });

  it('СТАРАЯ строка без префикса читается целиком — бэкфилла не нужно', () => {
    const p = parseRunError('Не удалось выполнить анализ. Попробуйте повторить.');
    expect(p.kind).toBeNull();
    expect(p.message).toBe('Не удалось выполнить анализ. Попробуйте повторить.');
  });

  it('незнакомый префикс НЕ отрезается — это часть текста, а не класс', () => {
    // Иначе кусок сообщения съедался бы ради ярлыка, которого нет.
    const p = parseRunError('foo|bar');
    expect(p.kind).toBeNull();
    expect(p.message).toBe('foo|bar');
  });

  it('null и пустая строка не роняют разбор', () => {
    expect(parseRunError(null)).toEqual({ kind: null, message: '' });
    expect(runErrorText(null)).toBe('Ошибка выполнения');
    expect(runErrorText('')).toBe('Ошибка выполнения');
  });
});

describe('решение UI: показывать ли «Повторить»', () => {
  it('access — кнопки нет', () => {
    expect(isRunErrorRetryable('access')).toBe(false);
  });

  it('upstream / shape / network — кнопка есть', () => {
    for (const kind of ['upstream', 'shape', 'network'] as LlmErrorKind[]) {
      expect(isRunErrorRetryable(kind)).toBe(true);
    }
  });

  it('класс неизвестен (прогоны до спринта) — кнопка есть', () => {
    expect(isRunErrorRetryable(null)).toBe(true);
  });

  it('сквозной путь: 402 апстрима → строка прогона → кнопки нет', () => {
    const kind = classifyLlmError(402);
    const stored = `${kind}|Сервис ИИ недоступен: нет доступа к провайдеру. Проверьте ключ и баланс.`;
    const parsed = parseRunError(stored);
    expect(parsed.kind).toBe('access');
    expect(isRunErrorRetryable(parsed.kind)).toBe(false);
    expect(parsed.message).not.toContain('|');
  });
});

describe('edge пишет ошибку в согласованном формате', () => {
  const EDGE = readFileSync(path.join(ROOT, 'supabase/functions/ai-run/index.ts'), 'utf8');

  it('runError клеит префикс, а не пишет голый текст', () => {
    // Проверяем СКЛЕЙКУ, а не выражение справа: с S-LLM-SEARCH-2 у `shape` появился
    // второй текст (пустой поиск), и жёсткий адрес ломался бы на каждой такой правке.
    expect(EDGE).toMatch(/return `\$\{kind\}\|\$\{[^`]+\}`;/);
  });

  it('S-LLM-SEARCH-2: текст можно переопределить, класс — нет', () => {
    // Пустой веб-поиск остаётся классом `shape` (кнопка «Повторить» на месте),
    // но объясняется своими словами: «неверный формат» про него соврало бы.
    expect(EDGE).toContain("runError('shape', hasEmptySources(claims) ? EMPTY_SOURCES_TEXT : undefined)");
  });

  it('классы edge и клиента — один список', () => {
    // Разъедутся — клиент перестанет узнавать префикс и молча вернёт кнопку туда,
    // где повтор не помогает.
    const m = EDGE.match(/function runError\(kind: ([^)]+)\)/);
    expect(m, 'runError не найден в edge').not.toBeNull();
    const kinds = (m![1].match(/'([a-z]+)'/g) ?? []).map((k) => k.replaceAll("'", '')).sort();
    expect(kinds).toEqual(['access', 'network', 'shape', 'upstream']);
  });

  it('текст access не предлагает повторить — кнопки там всё равно нет', () => {
    const access = EDGE.match(/access: '([^']+)'/);
    expect(access).not.toBeNull();
    expect(access![1]).not.toMatch(/повтор/i);
  });
});
