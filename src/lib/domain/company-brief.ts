import type { AiRunRow, CompanyBriefResult } from '@/types/database';
import { formatActionDate } from '@/lib/utils/action-date';
import { formatCalendarDate, formatDateNumeric } from '@/lib/utils/dates';
import { safeHref } from '@/lib/utils/safe-href';

// ═══════════════════════════════════════════════════════
// S-BRIEF-IN-DEAL-1.2: AI-бриф компании в шаге сделки — чистый домен.
//
// Кнопка «AI-бриф · дд.мм» и панель под футером `DealNextStep` решают одно и то
// же: какое из восьми состояний у брифа компании сейчас и что про него сказать.
// Всё это — здесь, «сейчас» аргументом: компонент только раскладывает тексты.
//
// Пороги — зеркала миграции 138 (`company_brief_candidates()`), менять парой.
// ═══════════════════════════════════════════════════════

export const BRIEF_NEW_DAYS = 14;
/** Зеркало порога `stale` в company_brief_candidates() (миграция 138) — менять парой. */
export const BRIEF_STALE_DAYS = 90;
/** «Мало данных» — источников ≤ 1. Прод 03.10: 2 из 24 брифов без источников, следующий минимум — 2. */
export const BRIEF_LOW_DATA_MAX_SOURCES = 1;
/** Зеркало «не больше 2 автопопыток на компанию в сутки» (138). */
export const BRIEF_AUTO_MAX_ATTEMPTS = 2;
/** Зеркало межсуточной паузы company_brief_candidates() (миграция 140) — менять парой. */
export const BRIEF_SHAPE_BACKOFF_STREAK = 2;
export const BRIEF_SHAPE_BACKOFF_DAYS = 7;

const DAY_MS = 86_400_000;
const BRIEF_PRESET_KEY = 'company_brief';

export type BriefAutoReason = 'no_brief' | 'stale' | 'stage';
/** Строка company_brief_auto_state(); null — RPC не ответил или компания вне org. */
export type BriefAutoState = {
  reason: BriefAutoReason | null;
  used_today: number;
  daily_limit: number;
  attempts_today: number;
};

export type BriefRuns = {
  latestDone: AiRunRow | null;
  active: AiRunRow | null;
  latest: AiRunRow | null;
  /** ISO-момент, до которого компания вне автоочереди (пауза после серии `shape`, 140); null — паузы нет. */
  backoffUntil: string | null;
};
export type BriefKind = 'new' | 'fresh' | 'stale' | 'lowData' | 'running' | 'queued' | 'failed' | 'none';

type BriefNews = CompanyBriefResult['recent_news'][number];

const AUTO_REASONS: readonly BriefAutoReason[] = ['no_brief', 'stale', 'stage'];

function isAutoReason(v: unknown): v is BriefAutoReason {
  return typeof v === 'string' && (AUTO_REASONS as readonly string[]).includes(v);
}

function finiteOrZero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Строка RPC → домен. Сгенерированный тип врёт про NULL: Postgres не передаёт
 * NULL-ность колонок `RETURNS TABLE`, и генератор ставит `reason: string`, хотя
 * там бывает NULL (реген 04.10, `b7a01f2`). Поэтому строку не кастуем, а сужаем.
 */
export function toBriefAutoState(row: unknown): BriefAutoState | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  return {
    reason: isAutoReason(r.reason) ? r.reason : null,
    used_today: finiteOrZero(r.used_today),
    daily_limit: finiteOrZero(r.daily_limit),
    attempts_today: finiteOrZero(r.attempts_today),
  };
}

/** Прогоны брифа: на порядок входа не полагаемся — сортируем сами, новые первыми. */
export function pickBriefRuns(runs: AiRunRow[]): BriefRuns {
  const briefs = runs
    .filter((r) => r.preset_key === BRIEF_PRESET_KEY)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return {
    latestDone: briefs.find((r) => r.status === 'done') ?? null,
    active: briefs.find((r) => r.status === 'pending' || r.status === 'running') ?? null,
    latest: briefs[0] ?? null,
    backoffUntil: shapeBackoffUntil(briefs),
  };
}

/**
 * Зеркало условия 140: последние `BRIEF_SHAPE_BACKOFF_STREAK` попыток — все ошибки класса
 * `shape` ⇒ пауза до конца более поздней + `BRIEF_SHAPE_BACKOFF_DAYS` суток. От «сейчас»
 * не зависит — сравнение с `now` делает `briefNote`. `briefs` — уже новые первыми.
 */
function shapeBackoffUntil(briefs: AiRunRow[]): string | null {
  const streak = briefs.slice(0, BRIEF_SHAPE_BACKOFF_STREAK);
  if (streak.length < BRIEF_SHAPE_BACKOFF_STREAK) return null;
  if (!streak.every((r) => r.status === 'error' && (r.error ?? '').startsWith('shape|'))) return null;
  const endedAt = Math.max(...streak.map((r) => Date.parse(r.finished_at ?? r.created_at)));
  return new Date(endedAt + BRIEF_SHAPE_BACKOFF_DAYS * DAY_MS).toISOString();
}

/** Целые сутки — только для подписи «N дн. назад». Пороги сравниваются в мс (см. `olderThanDays`). */
export function briefAgeDays(createdAt: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(createdAt)) / DAY_MS);
}

/**
 * Строго «старше N суток» в миллисекундах — как `interval '90 days'` в 138.
 * Целые сутки тут не годятся: на границе UI показал бы «свежий», а тик крона
 * уже поставил бы обновление в очередь.
 */
function olderThanDays(createdAt: string, now: Date, days: number): boolean {
  return now.getTime() - Date.parse(createdAt) > days * DAY_MS;
}

/** Поля `sources` нет (старый прогон) — молчим, как `CompanyBriefRenderer`. */
export function isBriefLowData(result: CompanyBriefResult | null | undefined): boolean {
  if (!result) return false;
  return Array.isArray(result.sources) && result.sources.length <= BRIEF_LOW_DATA_MAX_SOURCES;
}

export function briefKind(i: {
  runs: BriefRuns;
  auto: BriefAutoState | null;
  seenRunId: string | null;
  now: Date;
}): BriefKind {
  const { runs, auto, seenRunId, now } = i;
  if (runs.active) return 'running';
  const done = runs.latestDone;
  if (done) {
    if (olderThanDays(done.created_at, now, BRIEF_STALE_DAYS)) return 'stale';
    if (isBriefLowData(done.result as CompanyBriefResult | null)) return 'lowData';
    // «Моложе 14 суток» строго: ровно 14 суток — уже `fresh`.
    const isYoung = now.getTime() - Date.parse(done.created_at) < BRIEF_NEW_DAYS * DAY_MS;
    return isYoung && seenRunId !== done.id ? 'new' : 'fresh';
  }
  if (runs.latest?.status === 'error') return 'failed';
  if (auto?.reason) return 'queued';
  return 'none';
}

const AUTO_REASON_TEXT: Record<BriefAutoReason, string> = {
  no_brief: 'у компании не было брифа',
  stale: 'бриф старше 90 дней',
  stage: 'сделка перешла в рабочую стадию, а бриф старше 30 дней',
};

const CAN_CLOSE = 'Можно закрыть страницу — бриф соберётся без неё.';

export function briefNote(i: {
  kind: BriefKind;
  runs: BriefRuns;
  auto: BriefAutoState | null;
  now: Date;
}): string | null {
  const { kind, runs, auto, now } = i;
  switch (kind) {
    case 'running': {
      if (runs.latestDone) return 'Обновляем бриф, около минуты. Пока показана прежняя версия.';
      const reason = runs.active?.auto_reason;
      if (reason && isAutoReason(reason)) {
        return `Запущено автоматически: ${AUTO_REASON_TEXT[reason]}. ${CAN_CLOSE}`;
      }
      return `Собираем бриф, около минуты. ${CAN_CLOSE}`;
    }
    case 'stale': {
      const base = 'Бриф старше 90 дней: руководство и новости могли смениться.';
      // Кандидаты лимит не фильтруют: при `daily_limit = 0` RPC отдаёт `reason = 'stale'`,
      // а тик ничего не соберёт. Исчерпанный за сутки лимит — очередь есть, соберём завтра.
      const inQueue = auto?.reason === 'stale' && auto.daily_limit > 0;
      return inQueue ? `${base} Обновление стоит в очереди автосбора.` : base;
    }
    case 'lowData':
      return 'В открытых источниках о компании почти ничего нет. Контекст соберите на встрече.';
    case 'queued': {
      if (!auto || auto.daily_limit === 0) {
        return 'Брифа ещё нет. Автосбор выключен в настройках организации.';
      }
      if (auto.used_today >= auto.daily_limit) {
        return `Брифа ещё нет. Лимит автосбора на сегодня исчерпан (${auto.used_today} из ${auto.daily_limit}) — соберём завтра.`;
      }
      return 'Брифа ещё нет. Соберём автоматически в рабочее время, обычно в течение часа.';
    }
    case 'failed': {
      if (runs.backoffUntil && Date.parse(runs.backoffUntil) > now.getTime()) {
        return `Две попытки подряд не дали брифа. Автосбор вернётся к компании ${formatBriefChipDate(runs.backoffUntil)}.`;
      }
      const retrySoon =
        !!auto &&
        auto.daily_limit > 0 &&
        auto.used_today < auto.daily_limit &&
        (auto.reason !== null || auto.attempts_today < BRIEF_AUTO_MAX_ATTEMPTS);
      return retrySoon
        ? 'Не удалось собрать бриф. Повторим автоматически примерно через час.'
        : 'Не удалось собрать бриф. Автоповтор — завтра.';
    }
    case 'none':
      return 'Брифа нет.';
    case 'new':
    case 'fresh':
      return null;
  }
}

export function briefAction(kind: BriefKind): { label: string; lead?: string } | null {
  switch (kind) {
    case 'new':
    case 'fresh':
    case 'lowData':
      return { label: 'Обновить' };
    case 'stale':
      return { label: 'Обновить сейчас' };
    case 'queued':
      return { label: 'Собрать сейчас', lead: 'Нужно до звонка?' };
    case 'none':
      return { label: 'Собрать сейчас' };
    case 'failed':
      return { label: 'Повторить сейчас' };
    case 'running':
      return null;
  }
}

/** Самая свежая по дате; без даты и с непарсящейся — после датированных, в исходном порядке. */
export function pickHeadlineNews(news: CompanyBriefResult['recent_news'] | undefined): BriefNews | null {
  if (!Array.isArray(news) || news.length === 0) return null;
  let best: BriefNews | null = null;
  let bestTs = -Infinity;
  for (const n of news) {
    const ts = n.date ? Date.parse(n.date) : NaN;
    if (Number.isFinite(ts) && ts > bestTs) {
      best = n;
      bestTs = ts;
    }
  }
  return best ?? news[0];
}

export function newsHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Ссылка новости: только схемы safeHref; host — для подписи. Нет безопасного адреса — null. */
export function newsLink(url: string | null | undefined): { href: string; host: string | null } | null {
  const href = safeHref(url);
  return href ? { href, host: newsHost(href) } : null;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** «20.09.2026». YYYY-MM-DD — календарная дата; иная разбираемая строка — момент времени. */
export function formatBriefNewsDate(date: string | null | undefined): string {
  if (!date) return 'без даты';
  if (CALENDAR_DATE.test(date)) return formatCalendarDate(date);
  return Number.isFinite(Date.parse(date)) ? formatDateNumeric(date) : 'без даты';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** «04.09» — локальная дата прогона. */
export function formatBriefChipDate(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
}

/** «4 сентября · 29 дн. назад»; «сегодня»/«вчера» — без хвоста (возраст < 2). */
export function formatBriefMetaDate(iso: string, now: Date): string {
  const d = new Date(iso);
  const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const label = formatActionDate(key, now);
  const age = briefAgeDays(iso, now);
  return age >= 2 ? `${label} · ${age} дн. назад` : label;
}
