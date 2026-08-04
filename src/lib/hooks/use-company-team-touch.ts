'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { localDateKey } from '@/lib/utils/date-helpers';

// ═══════════════════════════════════════════════════════
// S-R2-CO360-1 (D2) — «последнее касание ОРГАНИЗАЦИИ» и «кто знает компанию».
//
// Зачем отдельный хук, а не `useLastTouchMap()`: тот считает касания ПО КОНТАКТАМ
// и кормится полными выборками `useCalls()`/`useMeetings()` (вся org + join'ы).
// Здесь нужен другой срез — касания, привязанные к КОМПАНИИ (у половины звонков
// контакт не проставлен вовсе, а компания — почти всегда), и нужен он на карточке
// одной компании. Поэтому два узких запроса с серверным фильтром, без join'ов,
// без `ai_summary` и текстов: на карточке это дешевле полной таблицы звонков.
//
// ⚠️ `org_id` в запрос НЕ пишем — его накладывает RLS (так же делают use-calls.ts
// и use-meetings.ts). Ownership — `created_by`, не `user_id`.
// ═══════════════════════════════════════════════════════

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

const WHO_KNOWS_LIMIT = 3;
const WINDOW_DAYS = 90;

interface CallRow {
  id: string;
  date: string;
  created_by: string | null;
  status: string;
}

interface MeetingRow {
  id: string;
  date: string;
  time: string | null;
  created_by: string | null;
}

async function fetchCompanyTeamTouch(companyId: string): Promise<CompanyTeamTouch> {
  const supabase = createClient();

  const [calls, meetings] = await Promise.all([
    supabase
      .from('calls')
      .select('id, date, created_by, status')
      .eq('company_id', companyId),
    supabase
      .from('meetings')
      .select('id, date, time, created_by')
      .eq('company_id', companyId),
  ]);
  if (calls.error) throw calls.error;
  if (meetings.error) throw meetings.error;

  const todayKey = localDateKey();
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();

  // Касание = факт состоявшегося разговора. Запланированный звонок (`pending`) и
  // будущая встреча — это НЕ касание: они кормят `hasUpcoming` силы отношений
  // (см. use-contact-strength), а не «последний контакт».
  const touches: CompanyLastTouch[] = [];
  for (const c of (calls.data ?? []) as CallRow[]) {
    if (c.status !== 'done') continue;
    touches.push({ date: c.date, kind: 'call', actorId: c.created_by });
  }
  for (const m of (meetings.data ?? []) as MeetingRow[]) {
    if (m.date.slice(0, 10) > todayKey) continue;
    touches.push({ date: m.date, kind: 'meeting', actorId: m.created_by });
  }

  let lastTouch: CompanyLastTouch | null = null;
  const byActor = new Map<string, WhoKnowsEntry>();

  for (const t of touches) {
    if (!lastTouch || t.date > lastTouch.date) lastTouch = t;

    // «Кто знает» считается по окну в 90 дней намеренно: человек, звонивший сюда
    // три года назад, компанию уже не «знает» — спрашивать у него бесполезно.
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

/**
 * Последнее касание компании глазами ВСЕЙ организации + кто её знает.
 * Имена и аватары акторов хук не резолвит — это делает UI через
 * `useTeamMembers()` (одна Map на страницу, не N запросов).
 */
export function useCompanyTeamTouch(companyId: string) {
  return useQuery({
    queryKey: ['company-team-touch', companyId],
    queryFn: () => fetchCompanyTeamTouch(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
  });
}
