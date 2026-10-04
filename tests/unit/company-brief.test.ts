import { describe, test, expect } from 'vitest';
import {
  toBriefAutoState,
  pickBriefRuns,
  isBriefLowData,
  briefKind,
  briefNote,
  pickHeadlineNews,
  newsHost,
  newsLink,
  formatBriefMetaDate,
  formatBriefNewsDate,
  type BriefAutoState,
  type BriefRuns,
} from '@/lib/domain/company-brief';
import type { AiRunRow, CompanyBriefResult } from '@/types/database';

const DAY = 86_400_000;
const NOW = new Date('2026-10-03T12:00:00Z');

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

function brief(sources: string[] = ['a', 'b', 'c']): CompanyBriefResult {
  return {
    summary: 's',
    activity: 'a',
    scale: null,
    website: null,
    chz_signals: [],
    recent_news: [],
    talk_hooks: [],
    sources,
  };
}

let seq = 0;
function run(p: Partial<AiRunRow> = {}): AiRunRow {
  seq += 1;
  return {
    id: `r${seq}`,
    org_id: 'o',
    preset_key: 'company_brief',
    entity_type: 'company',
    entity_id: 'c1',
    transcript_id: null,
    status: 'done',
    result: brief(),
    error: null,
    model: null,
    prompt_version: null,
    input_tokens: null,
    output_tokens: null,
    duration_ms: null,
    rating: null,
    feedback_note: null,
    auto_reason: null,
    created_by: 'u',
    created_at: ago(DAY),
    finished_at: null,
    ...p,
  } as AiRunRow;
}

const auto = (p: Partial<BriefAutoState> = {}): BriefAutoState => ({
  reason: null,
  used_today: 0,
  daily_limit: 10,
  attempts_today: 0,
  ...p,
});

const runsOf = (p: Partial<BriefRuns>): BriefRuns => ({ latestDone: null, active: null, latest: null, ...p });

describe('toBriefAutoState', () => {
  test('reason NULL сохраняется как null, числа — как есть', () => {
    expect(toBriefAutoState({ reason: null, used_today: 3, daily_limit: 10, attempts_today: 0 })).toEqual({
      reason: null,
      used_today: 3,
      daily_limit: 10,
      attempts_today: 0,
    });
  });
  test('известная причина сохраняется, неизвестная — null', () => {
    expect(toBriefAutoState({ reason: 'stage' })?.reason).toBe('stage');
    expect(toBriefAutoState({ reason: 'другое' })?.reason).toBeNull();
  });
  test('нечисло и NaN → 0', () => {
    expect(toBriefAutoState({ used_today: '3' })?.used_today).toBe(0);
    expect(toBriefAutoState({ used_today: NaN })?.used_today).toBe(0);
  });
  test('не объект → null', () => {
    expect(toBriefAutoState(null)).toBeNull();
    expect(toBriefAutoState('row')).toBeNull();
  });
});

describe('pickBriefRuns', () => {
  test('чужие пресеты отброшены, несортированный вход разобран верно', () => {
    const oldDone = run({ created_at: ago(5 * DAY) });
    const newDone = run({ created_at: ago(2 * DAY) });
    const active = run({ status: 'running', created_at: ago(1000) });
    const foreign = run({ preset_key: 'deal_summary', status: 'done', created_at: ago(10) });
    const r = pickBriefRuns([oldDone, active, foreign, newDone]);
    expect(r.latestDone?.id).toBe(newDone.id);
    expect(r.active?.id).toBe(active.id);
    expect(r.latest?.id).toBe(active.id);
  });
  test('пусто → все null', () => {
    expect(pickBriefRuns([])).toEqual({ latestDone: null, active: null, latest: null });
  });
});

describe('isBriefLowData', () => {
  test('0 и 1 источник → true, 2 → false', () => {
    expect(isBriefLowData(brief([]))).toBe(true);
    expect(isBriefLowData(brief(['a']))).toBe(true);
    expect(isBriefLowData(brief(['a', 'b']))).toBe(false);
  });
  test('нет поля sources и null → false', () => {
    const { sources: _omit, ...rest } = brief();
    void _omit;
    expect(isBriefLowData(rest as CompanyBriefResult)).toBe(false);
    expect(isBriefLowData(null)).toBe(false);
  });
});

describe('briefKind', () => {
  const kind = (runs: BriefRuns, a: BriefAutoState | null = null, seen: string | null = null) =>
    briefKind({ runs, auto: a, seenRunId: seen, now: NOW });

  test('активный прогон при свежем готовом → running', () => {
    const done = run({ created_at: ago(DAY) });
    expect(kind(runsOf({ latestDone: done, active: run({ status: 'pending' }) }))).toBe('running');
  });
  test('ровно 90 суток — не stale, 90 суток + 1 ч — stale', () => {
    expect(kind(runsOf({ latestDone: run({ created_at: ago(90 * DAY) }) }))).not.toBe('stale');
    expect(kind(runsOf({ latestDone: run({ created_at: ago(90 * DAY + 3_600_000) }) }))).toBe('stale');
  });
  test('1 источник и 30 суток → lowData', () => {
    expect(kind(runsOf({ latestDone: run({ created_at: ago(30 * DAY), result: brief(['a']) }) }))).toBe('lowData');
  });
  test('13 суток: не видел → new, видел → fresh', () => {
    const done = run({ created_at: ago(13 * DAY) });
    expect(kind(runsOf({ latestDone: done }))).toBe('new');
    expect(kind(runsOf({ latestDone: done }), null, done.id)).toBe('fresh');
  });
  test('ровно 14 суток → fresh', () => {
    expect(kind(runsOf({ latestDone: run({ created_at: ago(14 * DAY) }) }))).toBe('fresh');
  });
  test('нет готового, последний error → failed', () => {
    expect(kind(runsOf({ latest: run({ status: 'error', result: null }) }))).toBe('failed');
  });
  test('нет готового, auto.reason no_brief → queued', () => {
    expect(kind(runsOf({}), auto({ reason: 'no_brief' }))).toBe('queued');
  });
  test('нет ничего и auto null → none', () => {
    expect(kind(runsOf({}))).toBe('none');
  });
});

describe('briefNote', () => {
  test('queued: лимит исчерпан → «завтра» и «10 из 10»', () => {
    const t = briefNote({ kind: 'queued', runs: runsOf({}), auto: auto({ reason: 'no_brief', used_today: 10 }) });
    expect(t).toContain('завтра');
    expect(t).toContain('10 из 10');
  });
  test('queued: лимит не исчерпан → «в течение часа»', () => {
    const t = briefNote({ kind: 'queued', runs: runsOf({}), auto: auto({ reason: 'no_brief', used_today: 3 }) });
    expect(t).toContain('в течение часа');
  });
  test('queued: лимит 0 → «выключен»', () => {
    const t = briefNote({ kind: 'queued', runs: runsOf({}), auto: auto({ reason: 'no_brief', daily_limit: 0 }) });
    expect(t).toContain('выключен');
  });
  test('failed: 2 попытки и reason null → «завтра»; 1 попытка → «примерно через час»', () => {
    expect(briefNote({ kind: 'failed', runs: runsOf({}), auto: auto({ attempts_today: 2 }) })).toContain('завтра');
    expect(briefNote({ kind: 'failed', runs: runsOf({}), auto: auto({ attempts_today: 1 }) })).toContain(
      'примерно через час',
    );
  });
  test('running автозапуском по стадии → текст про рабочую стадию', () => {
    const t = briefNote({
      kind: 'running',
      runs: runsOf({ active: run({ status: 'running', auto_reason: 'stage' }) }),
      auto: null,
    });
    expect(t).toContain('рабочую стадию');
  });
  test('stale в очереди, но лимит 0 → без фразы про очередь', () => {
    const t = briefNote({ kind: 'stale', runs: runsOf({}), auto: auto({ reason: 'stale', daily_limit: 0 }) });
    expect(t).not.toContain('очереди');
  });
  test('stale в очереди, лимит 10 → с фразой про очередь', () => {
    const t = briefNote({ kind: 'stale', runs: runsOf({}), auto: auto({ reason: 'stale', daily_limit: 10 }) });
    expect(t).toContain('стоит в очереди автосбора');
  });
  test('new → null', () => {
    expect(briefNote({ kind: 'new', runs: runsOf({}), auto: null })).toBeNull();
  });
});

describe('pickHeadlineNews', () => {
  const n = (title: string, date: string | null) => ({ title, url: `https://x.ru/${title}`, date });
  test('из трёх датированных — самая свежая', () => {
    expect(pickHeadlineNews([n('a', '2026-08-01'), n('b', '2026-09-20'), n('c', '2026-09-01')])?.title).toBe('b');
  });
  test('датированная раньше недатированной', () => {
    expect(pickHeadlineNews([n('a', null), n('b', '2026-01-01')])?.title).toBe('b');
  });
  test('все без дат — первая', () => {
    expect(pickHeadlineNews([n('a', null), n('b', 'мусор')])?.title).toBe('a');
  });
  test('пусто → null', () => {
    expect(pickHeadlineNews([])).toBeNull();
    expect(pickHeadlineNews(undefined)).toBeNull();
  });
});

describe('newsHost', () => {
  test('хост без www', () => {
    expect(newsHost('https://www.forbes.ru/x')).toBe('forbes.ru');
  });
  test('мусор → null', () => {
    expect(newsHost('не url')).toBeNull();
  });
});

describe('newsLink', () => {
  test('https — адрес тот же, хост без www', () => {
    expect(newsLink('https://www.forbes.ru/x')).toEqual({ href: 'https://www.forbes.ru/x', host: 'forbes.ru' });
  });
  test('javascript:, data:, ftp: → null', () => {
    expect(newsLink('javascript:alert(1)')).toBeNull();
    expect(newsLink('data:text/html,x')).toBeNull();
    expect(newsLink('ftp://files.example/x')).toBeNull();
  });
  test('голый домен → https', () => {
    expect(newsLink('example.com/n')?.href).toBe('https://example.com/n');
  });
  test('пусто и null → null', () => {
    expect(newsLink('')).toBeNull();
    expect(newsLink(null)).toBeNull();
  });
});

describe('formatBriefNewsDate', () => {
  test('YYYY-MM-DD — календарная дата', () => {
    expect(formatBriefNewsDate('2026-09-20')).toBe('20.09.2026');
  });
  test('день не уезжает назад в зоне с отрицательным смещением', () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(formatBriefNewsDate('2026-09-20')).toBe('20.09.2026');
    } finally {
      process.env.TZ = tz;
    }
  });
  test('null и мусор → «без даты»', () => {
    expect(formatBriefNewsDate(null)).toBe('без даты');
    expect(formatBriefNewsDate('вчера')).toBe('без даты');
  });
});

describe('formatBriefMetaDate', () => {
  test('возраст 29 дней → «… · 29 дн. назад»', () => {
    expect(formatBriefMetaDate(ago(29 * DAY), NOW)).toMatch(/ · 29 дн\. назад$/);
  });
  test('сегодня → «сегодня» без хвоста', () => {
    expect(formatBriefMetaDate(ago(60_000), NOW)).toBe('сегодня');
  });
});
