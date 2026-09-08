'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

// ═══════════════════════════════════════════════════════
// S-DEAL-HEADER-1: реквизиты компании для подстроки шапки сделки.
//
// Отдельным запросом, а не расширением `PROJECT_SELECT` (`use-projects.ts`):
// джойн `companies(id, name)` тянется в КАЖДОМ списке сделок — воронка, канбан,
// очередь дня, портфель. Три поля на сотню строк ради одной открытой карточки не
// окупаются. Тот же приём и та же причина, что у `useCompanyChz` (S-DEAL-CHZ-1).
//
// Не `useCompany` (`use-companies.ts`) намеренно: тот делает `select('*')` и тянет
// телефоны, адреса и заметки, которых шапке не нужно ни одного.
// ═══════════════════════════════════════════════════════

export interface CompanyLegalRow {
  id: string;
  name: string;
  /** Юрназвание из ЕГРЮЛ. NULL — реквизиты не подтягивали, показываем `name`. */
  legal_name: string | null;
  inn: string | null;
  /** TEXT без enum: словарь принадлежит реестру (`lib/utils/inn.ts`). */
  inn_status: string | null;
}

export function useCompanyLegal(companyId: string | null | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['company-legal', companyId ?? null],
    enabled: !!companyId,
    // Реквизиты меняет «Обновить из ЕГРЮЛ» руками и меняются они раз в месяцы —
    // перезапрашивать их на каждом фокусе вкладки незачем.
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<CompanyLegalRow | null> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, legal_name, inn, inn_status')
        .eq('id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}
