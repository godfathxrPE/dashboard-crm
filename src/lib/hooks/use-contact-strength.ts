'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { fetchInBatches } from '@/lib/utils/query-batching';
import {
  aggregateContactStrength,
  type ContactStrengthMap,
} from '@/lib/domain/company-touch';

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

// Типы среза — в домене (S-UI-CLARITY-1), рядом с агрегацией. Реэкспорт для UI.
export type { ContactStrength, ContactStrengthMap } from '@/lib/domain/company-touch';

interface CallRow { contact_id: string | null; date: string; status: string }
interface MeetingRow { contact_id: string | null; date: string }
interface TaskRow { contact_id: string | null }

async function fetchContactStrength(contactIds: string[]): Promise<ContactStrengthMap> {
  const supabase = createClient();
  // Одно «сейчас» на весь проход: серверный фильтр задач и агрегация обязаны
  // смотреть на одну и ту же границу, иначе задача с дедлайном на стыке видна
  // запросу и невидима агрегации (или наоборот).
  const now = new Date();
  const nowIso = now.toISOString();

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

  // Арифметика («done» vs «pending», окно 90 дней, приоритет последнего касания) —
  // в чистой `aggregateContactStrength`, покрытой tests/unit/company-touch.test.ts.
  return aggregateContactStrength(contactIds, calls, meetings, tasks, now);
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
