// S-AI-OBS-1: `ai_runs` перестаёт быть слепым на `ai-capture`.
//
// Контракт живёт в ЧЕТЫРЁХ местах и весь — в разных рантаймах, поэтому общего
// модуля у него быть не может: SQL миграции 127, edge-функция бота (Deno),
// браузерный хук (Next) и Zod-схема ответа. Разойдясь, они дадут не падение,
// а МОЛЧАНИЕ — ровно то слепое пятно, ради которого затевался спринт. Держим тестом.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { captureRunSchema } from '@/lib/validators/capture';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * Тело миграции без комментариев.
 *
 * ⚠️ В шапке 127 перечислены СТАРЫЕ редакции обоих CHECK'ов (описание отката) и
 *    имена всех шести блокировок. Регексп по сырому файлу нашёл бы их и прошёл бы
 *    на миграции, которая ничего не делает.
 */
const MIGRATION = read('supabase/migrations/127_ai_runs_capture.sql')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const TELEGRAM = read('supabase/functions/telegram-webhook/capture.ts');
const WEB_HOOK = read('src/lib/hooks/use-quick-capture.ts');
const AI_CAPTURE = read('supabase/functions/ai-capture/index.ts');

/** Строковые литералы внутри именованного блока `alter … add constraint <name> … ;`. */
function literalsInConstraint(name: string): string[] {
  const re = new RegExp(`add\\s+constraint ${name}[\\s\\S]*?;`, 'i');
  const block = re.exec(MIGRATION);
  expect(block, `constraint ${name} не найден в 127`).not.toBeNull();
  return [...block![0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('127 — четыре блокировки записи сняты', () => {
  it('ai_runs_transcript_required содержит capture и все пять прежних ключей', () => {
    const keys = literalsInConstraint('ai_runs_transcript_required');
    expect(keys).toContain('capture');
    for (const prev of [
      'deal_progression',
      'analytic_note',
      'meeting_prep',
      'deal_summary',
      'company_brief',
    ]) {
      expect(keys, `пресет ${prev} потерян из CHECK`).toContain(prev);
    }
  });

  it('ai_runs_entity_type_check содержит capture и четыре прежних значения', () => {
    const types = literalsInConstraint('ai_runs_entity_type_check');
    expect(types).toContain('capture');
    for (const prev of ['call', 'meeting', 'project', 'company']) {
      expect(types, `тип ${prev} потерян из CHECK`).toContain(prev);
    }
  });

  it('NOT NULL снят с ОБЕИХ колонок — одной мало, capture не знает ни той, ни другой', () => {
    expect(MIGRATION).toMatch(/alter column entity_id\s+drop not null/i);
    expect(MIGRATION).toMatch(/alter column entity_type\s+drop not null/i);
  });

  // Снятие NOT NULL — послабление на всю таблицу, а нужно оно одному виду строк.
  // Без этого CHECK'а сущностный прогон мог бы приехать без привязки и молча
  // выпасть из всех выборок по `entity_id`.
  it('расползание снятого NOT NULL закрыто ai_runs_entity_pair_or_capture', () => {
    expect(MIGRATION).toContain('ai_runs_entity_pair_or_capture');
    const guard = literalsInConstraint('ai_runs_entity_pair_or_capture');
    expect(guard).toContain('capture');
  });
});

// ═══════════════════════════════════════════════════════
// ⚠️ САМАЯ ДОРОГАЯ ЧАСТЬ. CHECK'и и NOT NULL роняют вставку — их отсутствие
// видно сразу. Политики не роняют ничего: строка запишется сервисной ролью
// (бот) и будет лежать НЕВИДИМОЙ для приложения и для владельца организации.
// Контрольный запрос гейта под `postgres` при этом покажет «строки есть».
// ═══════════════════════════════════════════════════════
describe('127 — RLS пропускает и ПОКАЗЫВАЕТ capture', () => {
  function policyBody(name: string): string {
    const start = MIGRATION.indexOf(`create policy ${name}`);
    expect(start, `политика ${name} не пересоздана в 127`).toBeGreaterThan(-1);
    const end = MIGRATION.indexOf('\n\n', start);
    return MIGRATION.slice(start, end === -1 ? undefined : end);
  }

  it('ai_runs_select переписана и содержит ветку capture', () => {
    expect(policyBody('ai_runs_select')).toContain("entity_type = 'capture'");
  });

  it('ai_runs_insert переписана и содержит ветку capture', () => {
    expect(policyBody('ai_runs_insert')).toContain("entity_type = 'capture'");
  });

  // Обе политики перечисляют сущностные ветки поимённо. Перезапись «под capture»
  // легко теряет одну из них, и пропажа выглядит как «прогонов по встречам никто
  // не делал», а не как ошибка.
  it('ни одна сущностная ветка не потеряна при перезаписи политик', () => {
    for (const policy of ['ai_runs_select', 'ai_runs_insert']) {
      const body = policyBody(policy);
      for (const t of ['call', 'meeting', 'project', 'company']) {
        expect(body, `${policy}: ветка ${t} потеряна`).toContain(`entity_type = '${t}'`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════
// Журнал пишут ВЫЗЫВАЮЩИЕ, а не `ai-capture`: у функции разбора нет ни `org_id`,
// ни автора (обе колонки NOT NULL с FK), а принимать их телом запроса — значит
// разрешить браузеру писать прогоны в чужую организацию.
// ═══════════════════════════════════════════════════════
describe('оба вызывающих пишут одну и ту же строку', () => {
  it('и бот, и веб-виджет журналируют прогон', () => {
    for (const [name, src] of [['telegram', TELEGRAM], ['web', WEB_HOOK]] as const) {
      expect(src, `${name}: вставки в ai_runs нет`).toContain("from('ai_runs')");
      expect(src, `${name}: не тот preset_key`).toContain("preset_key: 'capture'");
      expect(src, `${name}: не тот entity_type`).toContain("entity_type: 'capture'");
      expect(src, `${name}: entity_id обязан быть пустым`).toContain('entity_id: null');
    }
  });

  it('источник различается — иначе статистика по источнику бессмысленна', () => {
    expect(TELEGRAM).toContain("source: 'telegram'");
    expect(WEB_HOOK).toContain("source: 'web'");
  });

  // Статус сразу терминальный — не `pending`, как у `ai-run`. Частичный уникальный
  // индекс `ux_ai_runs_active_entity` берёт только pending/running, и терминальная
  // строка не попадает под него вовсе: параллельные разборы не столкнутся.
  it('статус пишется сразу терминальным, одной вставкой', () => {
    for (const [name, src] of [['telegram', TELEGRAM], ['web', WEB_HOOK]] as const) {
      expect(src, `${name}: статус не терминальный`).toContain("? 'done' : 'error'");
      expect(src, `${name}: pending здесь означал бы вторую вставку`).not.toContain("status: 'pending'");
    }
  });

  // Бот ходит сервисной ролью мимо RLS — там `auth.uid()` = NULL, а `created_by`
  // NOT NULL. Веб идёт под сессией, и там автора с org'ом ставят дефолт и триггер;
  // передать их с клиента значило бы дать браузеру назвать организацию самому.
  it('бот проставляет актора явно, веб — не проставляет вовсе', () => {
    expect(TELEGRAM).toContain('created_by: actor.profile_id');
    expect(TELEGRAM).toContain('org_id: actor.org_id');
    expect(WEB_HOOK).not.toContain('created_by:');
    expect(WEB_HOOK).not.toContain('org_id:');
  });

  // Лог одних успехов — тот же слепой лог с другой стороны.
  it('оба журналируют и отказы', () => {
    for (const [name, src] of [['telegram', TELEGRAM], ['web', WEB_HOOK]] as const) {
      expect(src, `${name}: отказ вызова не журналируется`).toContain('invoke|');
      expect(src, `${name}: несовпадение схемы не журналируется`).toContain('shape|');
    }
  });
});

describe('`ai-capture` осталась без доступа к БД', () => {
  // Инвариант функции: она не ходит в БД вовсе, поэтому обойти RLS ей нечем.
  // Журнал этого не изменил — из неё уезжает только телеметрия.
  it('не создаёт клиента Supabase и не просит сервисной роли', () => {
    expect(AI_CAPTURE).not.toContain('createClient');
    expect(AI_CAPTURE).not.toContain('SERVICE_ROLE');
    expect(AI_CAPTURE).not.toContain("from('ai_runs')");
  });

  it('отдаёт телеметрию прогона полем `run`', () => {
    expect(AI_CAPTURE).toContain('duration_ms: Date.now() - started');
    expect(AI_CAPTURE).toMatch(/run:\s*\{/);
  });
});

describe('captureRunSchema — телеметрия необязательна вся', () => {
  // Прежняя версия функции ключа `run` не вернёт вовсе (деплой отдельно от фронта),
  // а OpenRouter штатно не отдаёт числа поисков и иногда токены. Прогон при этом
  // СОСТОЯЛСЯ и обязан попасть в журнал — без токенов, но попасть.
  it('пустой объект разбирается в четыре null', () => {
    expect(captureRunSchema.parse({})).toEqual({
      model: null,
      input_tokens: null,
      output_tokens: null,
      duration_ms: null,
    });
  });

  it('полный объект проходит как есть', () => {
    expect(
      captureRunSchema.parse({
        model: 'claude-haiku-4-5',
        input_tokens: 1200,
        output_tokens: 180,
        duration_ms: 2400,
      }),
    ).toEqual({
      model: 'claude-haiku-4-5',
      input_tokens: 1200,
      output_tokens: 180,
      duration_ms: 2400,
    });
  });

  it('пустая строка модели — это отсутствие модели, а не модель с пустым именем', () => {
    expect(captureRunSchema.parse({ model: '' }).model).toBeNull();
  });
});
