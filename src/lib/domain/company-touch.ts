import { localDateKey, daysSince } from '@/lib/utils/date-helpers';
import { relationshipStrength, type Strength } from '@/lib/domain/relationship-strength';

// ═══════════════════════════════════════════════════════
// S-UI-CLARITY-1 — чистая часть агрегаций Company 360.
//
// Раньше «касание vs запланированное», окно 90 дней и приоритет последнего
// касания жили внутри queryFn двух хуков — то есть за запросом, где их нельзя
// проверить иначе как руками в браузере. Домен `relationship-strength` при этом
// покрыт 15 кейсами, а то, что его КОРМИТ, — нет; ломалось бы тихо.
//
// Правила модуля: ноль запросов, ноль `Date.now()` внутри — «сейчас» приходит
// параметром. Хуки остаются тонкими: выборка → эта функция.
//
// ⚠️ Два среза НЕ выводятся один из другого: `aggregateTeamTouch` считает
// касания по `company_id` (звонок без контакта, но с компанией — типичная
// строка), `aggregateContactStrength` — по `contact_id` (звонок с контактом,
// но без компании — тоже типичная).
// ═══════════════════════════════════════════════════════

export const WHO_KNOWS_LIMIT = 3;
export const TOUCH_WINDOW_DAYS = 90;

// ─── Касания компании ───

export type TouchKind = 'call' | 'meeting';

export interface CompanyLastTouch {
  /** ISO даты состоявшегося касания */
  date: string;
  kind: TouchKind;
  /** profile id из `created_by`; NULL бывает у импортированных строк */
  actorId: string | null;
}

export interface WhoKnowsEntry {
  actorId: string;
  /** Касаний за 90 дней */
  count: number;
  /** Дата последнего касания этого человека с компанией */
  lastAt: string;
}

export interface CompanyTeamTouch {
  lastTouch: CompanyLastTouch | null;
  /** Топ-3 по числу касаний за 90 дней, count desc. */
  whoKnows: WhoKnowsEntry[];
}

/** Строка `calls` в объёме, который нужен агрегации (не весь селект хука). */
export interface TeamTouchCall {
  date: string;
  created_by: string | null;
  status: string;
}

export interface TeamTouchMeeting {
  date: string;
  created_by: string | null;
}

/**
 * «Последнее касание организации» + «кто знает компанию».
 *
 * Касание = факт состоявшегося разговора. Запланированный звонок (`pending`) и
 * будущая встреча — НЕ касание: они кормят `hasUpcoming` силы отношений
 * (см. `aggregateContactStrength`), а не «последний контакт».
 */
export function aggregateTeamTouch(
  calls: TeamTouchCall[],
  meetings: TeamTouchMeeting[],
  now: Date,
): CompanyTeamTouch {
  const todayKey = localDateKey(now);
  const windowStart = new Date(now.getTime() - TOUCH_WINDOW_DAYS * 86400000).toISOString();

  const touches: CompanyLastTouch[] = [];
  for (const c of calls) {
    if (c.status !== 'done') continue;
    touches.push({ date: c.date, kind: 'call', actorId: c.created_by });
  }
  for (const m of meetings) {
    // Встреча сегодня — уже касание; граница по КАЛЕНДАРНОМУ дню, а не по времени:
    // встречу отмечают задним числом в тот же день, и «ещё не наступила» по часам
    // выкинуло бы её из последнего контакта.
    if (m.date.slice(0, 10) > todayKey) continue;
    touches.push({ date: m.date, kind: 'meeting', actorId: m.created_by });
  }

  let lastTouch: CompanyLastTouch | null = null;
  const byActor = new Map<string, WhoKnowsEntry>();

  for (const t of touches) {
    if (!lastTouch || t.date > lastTouch.date) lastTouch = t;

    // «Кто знает» считается по окну в 90 дней намеренно: человек, звонивший сюда
    // три года назад, компанию уже не «знает» — спрашивать у него бесполезно.
    // При этом такое касание остаётся кандидатом в `lastTouch` — это разные вопросы.
    if (!t.actorId || t.date < windowStart) continue;
    const prev = byActor.get(t.actorId);
    if (prev) {
      prev.count += 1;
      if (t.date > prev.lastAt) prev.lastAt = t.date;
    } else {
      byActor.set(t.actorId, { actorId: t.actorId, count: 1, lastAt: t.date });
    }
  }

  const whoKnows = [...byActor.values()]
    // Тай-брейк по свежести: при равном числе касаний выше тот, кто общался позже.
    .sort((a, b) => b.count - a.count || (a.lastAt < b.lastAt ? 1 : -1))
    .slice(0, WHO_KNOWS_LIMIT);

  return { lastTouch, whoKnows };
}

// ─── Сила отношений по контактам ───

export interface ContactStrength {
  strength: Strength;
  lastTouch: { kind: TouchKind; date: string } | null;
}

export type ContactStrengthMap = Map<string, ContactStrength>;

export interface StrengthCall {
  contact_id: string | null;
  date: string;
  status: string;
}

export interface StrengthMeeting {
  contact_id: string | null;
  date: string;
}

/** Незакрытая задача с дедлайном в будущем. Фильтрация — на стороне запроса
 *  (`completed_at is null` + `deadline > now`), сюда приходят уже только они:
 *  каждая строка = признак «есть следующий шаг». */
export interface StrengthTask {
  contact_id: string | null;
}

/**
 * `contactIds` → Map<contactId, { strength, lastTouch }>.
 *
 * Контакты без единого касания в карте ПРИСУТСТВУЮТ (score 0 / cold) — иначе UI
 * не отличил бы «связи нет» от «данные не пришли».
 */
export function aggregateContactStrength(
  contactIds: string[],
  calls: StrengthCall[],
  meetings: StrengthMeeting[],
  tasks: StrengthTask[],
  now: Date,
): ContactStrengthMap {
  const nowIso = now.toISOString();
  const todayKey = localDateKey(now);
  const windowStart = new Date(now.getTime() - TOUCH_WINDOW_DAYS * 86400000).toISOString();

  interface Agg {
    lastTouch: { kind: TouchKind; date: string } | null;
    touches90d: number;
    hasUpcoming: boolean;
  }
  const agg = new Map<string, Agg>();
  for (const id of contactIds) agg.set(id, { lastTouch: null, touches90d: 0, hasUpcoming: false });

  const touch = (id: string | null, date: string, kind: TouchKind) => {
    if (!id) return;
    const a = agg.get(id);
    if (!a) return;
    if (!a.lastTouch || date > a.lastTouch.date) a.lastTouch = { kind, date };
    if (date >= windowStart) a.touches90d += 1;
  };
  const upcoming = (id: string | null) => {
    if (!id) return;
    const a = agg.get(id);
    if (a) a.hasUpcoming = true;
  };

  for (const c of calls) {
    // Звонок `done` — состоявшееся касание; `pending` с датой в будущем —
    // запланированный следующий шаг. Прошедший `pending` (забыли отметить) —
    // ни то ни другое: касанием он не был, и шагом уже не является.
    if (c.status === 'done') touch(c.contact_id, c.date, 'call');
    else if (c.date > nowIso) upcoming(c.contact_id);
  }
  for (const m of meetings) {
    if (m.date.slice(0, 10) > todayKey) upcoming(m.contact_id);
    else touch(m.contact_id, m.date, 'meeting');
  }
  for (const t of tasks) upcoming(t.contact_id);

  const out: ContactStrengthMap = new Map();
  for (const [id, a] of agg) {
    out.set(id, {
      strength: relationshipStrength({
        daysSinceLastTouch: a.lastTouch ? daysSince(a.lastTouch.date, now) : null,
        touches90d: a.touches90d,
        hasUpcoming: a.hasUpcoming,
      }),
      lastTouch: a.lastTouch,
    });
  }
  return out;
}
