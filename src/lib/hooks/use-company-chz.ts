'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

// ═══════════════════════════════════════════════════════
// S-DEAL-CHZ-1: маркировочный профиль КОМПАНИИ сделки.
//
// Отдельным запросом, а не расширением PROJECT_SELECT (`use-projects.ts`):
// джойн `companies(id, name)` тянется в КАЖДОМ списке сделок — воронка, канбан,
// очередь дня. Два поля на сотню строк ради одной открытой карточки не окупаются,
// поэтому запрос включается только когда компания у сделки есть.
//
// Хук НЕ резолвит профиль: `resolveChzProfile` — чистый домен, живёт в
// `lib/domain/chz-profile.ts` и покрыт юнит-тестами. Хук отдаёт сырые колонки.
// ═══════════════════════════════════════════════════════

export interface CompanyChzRow {
  id: string;
  /**
   * NULL = не выяснено; `[]` = выяснено, что групп маркировки нет.
   * Разница значимая и до UI обязана доехать неповреждённой: первое означает
   * «не спросили», второе — «спросили, ответ отрицательный». Схлопывание в одно
   * состояние стирает работу продавца. Различает их `resolveChzProfile`.
   */
  chz_groups: string[] | null;
  okved: string | null;
}

export function useCompanyChz(companyId: string | null | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['company-chz', companyId ?? null],
    enabled: !!companyId,
    // Профиль правится руками в CompanyModal и меняется раз в месяцы —
    // перезапрашивать его на каждом фокусе вкладки незачем.
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<CompanyChzRow | null> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, chz_groups, okved')
        .eq('id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}
