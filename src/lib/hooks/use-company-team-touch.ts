'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { aggregateTeamTouch, type CompanyTeamTouch } from '@/lib/domain/company-touch';

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

// Типы среза живут в домене (S-UI-CLARITY-1) — там же, где считающая их функция.
// Реэкспорт: потребители (CompanyDetail, виджеты) импортируют их отсюда.
export type {
  TouchKind,
  CompanyLastTouch,
  WhoKnowsEntry,
  CompanyTeamTouch,
} from '@/lib/domain/company-touch';

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

  // Вся арифметика (что считать касанием, окно 90 дней, тай-брейк «кто знает») —
  // в чистой `aggregateTeamTouch`, покрытой tests/unit/company-touch.test.ts.
  return aggregateTeamTouch(
    (calls.data ?? []) as CallRow[],
    (meetings.data ?? []) as MeetingRow[],
    new Date(),
  );
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
