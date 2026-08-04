'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { fetchInBatches } from '@/lib/utils/query-batching';
import { localDateKey } from '@/lib/utils/date-helpers';
import { daysSince } from './use-last-touch';
import { relationshipStrength, type Strength } from '@/lib/domain/relationship-strength';

// ═══════════════════════════════════════════════════════
// S-R2-CO360-1 (D1, инфраструктура) — сила отношений по списку контактов.
//
// ПОЧЕМУ НЕ `useLastTouchMap()`. Тот хук выводит последнее касание из кешей
// `useCalls()`/`useMeetings()` — а это ДВЕ ПОЛНЫЕ выборки таблиц организации
// с join'ами компаний/контактов/проектов. На карточке компании нужны 4–8
// контактов, и тянуть ради них всю историю звонков org — плата не по товару.
// Здесь три узких запроса с серверным фильтром `contact_id in (…)` и без join'ов.
// `daysSince()` при этом переиспользуется оттуда — календарная арифметика одна.
//
// ⚠️ Пересечения с `use-company-team-touch` нет: тот считает касания по
// `company_id` (звонок без контакта, но с компанией — типичная строка), этот —
// по `contact_id` (звонок с контактом, но без компании — тоже типичная).
// Ни один срез не выводится из другого.
//
// ⚠️ `org_id` не пишем — накладывает RLS. Ownership — `created_by`, не `user_id`.
// ═══════════════════════════════════════════════════════

export interface ContactStrength {
  strength: Strength;
  lastTouch: { kind: 'call' | 'meeting'; date: string } | null;
}

export type ContactStrengthMap = Map<string, ContactStrength>;

const WINDOW_DAYS = 90;

interface CallRow { contact_id: string | null; date: string; status: string }
interface MeetingRow { contact_id: string | null; date: string }
interface TaskRow { contact_id: string | null }

async function fetchContactStrength(contactIds: string[]): Promise<ContactStrengthMap> {
  const supabase = createClient();
  const nowIso = new Date().toISOString();
  const todayKey = localDateKey();
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();

  // `fetchInBatches` — защита с обеих сторон: пустой `.in()` роняет PostgREST так же,
  // как слишком длинный (S-DEBT-TRUTH-1). Порядок строк между батчами не сохраняется,
  // но здесь он и не нужен — всё сводится в Map агрегатами.
  const [calls, meetings, tasks] = await Promise.all([
    fetchInBatches(contactIds, async (batch) => {
      const { data, error } = await supabase
        .from('calls')
        .select('contact_id, date, status')
        .in('contact_id', batch);
      if (error) throw error;
      return (data ?? []) as CallRow[];
    }),
    fetchInBatches(contactIds, async (batch) => {
      const { data, error } = await supabase
        .from('meetings')
        .select('contact_id, date')
        .in('contact_id', batch);
      if (error) throw error;
      return (data ?? []) as MeetingRow[];
    }),
    // Задачи нужны ТОЛЬКО как признак «есть будущий шаг» — ни текст, ни дедлайн
    // дальше не читаются, поэтому и не селектятся. Незакрытые: выполненная задача
    // с датой в будущем следующим шагом уже не является.
    fetchInBatches(contactIds, async (batch) => {
      const { data, error } = await supabase
        .from('tasks')
        .select('contact_id')
        .in('contact_id', batch)
        .is('completed_at', null)
        .gt('deadline', nowIso);
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    }),
  ]);

  interface Agg {
    lastTouch: { kind: 'call' | 'meeting'; date: string } | null;
    touches90d: number;
    hasUpcoming: boolean;
  }
  const agg = new Map<string, Agg>();
  for (const id of contactIds) agg.set(id, { lastTouch: null, touches90d: 0, hasUpcoming: false });

  const touch = (id: string | null, date: string, kind: 'call' | 'meeting') => {
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
        daysSinceLastTouch: a.lastTouch ? daysSince(a.lastTouch.date) : null,
        touches90d: a.touches90d,
        hasUpcoming: a.hasUpcoming,
      }),
      lastTouch: a.lastTouch,
    });
  }
  return out;
}

/**
 * `contactIds` → Map<contactId, { strength, lastTouch }>.
 *
 * ⚠️ Ключ кэша включает ПРОИЗВОДНУЮ ОТ СПИСКА id, а не только его длину: два разных
 * набора контактов одного размера иначе делили бы один кеш и молча показывали чужие
 * цифры (та же грабля, что с `messageIds` в S-DEBT-TRUTH-1). Список сортируется —
 * порядок приходит из выборки контактов и меняться не должен ключом кеша.
 */
export function useContactStrengthMap(contactIds: string[]) {
  const sorted = [...contactIds].sort();
  return useQuery({
    queryKey: ['contact-strength', sorted.join(',')],
    queryFn: () => fetchContactStrength(sorted),
    enabled: sorted.length > 0,
    staleTime: 60_000,
  });
}
