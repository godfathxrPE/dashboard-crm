'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_RECONNECT_DAYS } from '@/lib/constants/reconnect';
import { parseOrgSettings } from '@/lib/validators/org-settings';
import type { Json, OrgSettings } from '@/types/database';

const QUERY_KEY = ['org-settings'] as const;

/**
 * Настройки текущей организации (`organizations.settings`, миграция 076).
 *
 * ⚠️ Права: UPDATE на organizations — owner-only (`org_update_owner`, baseline + 054).
 * Читают все члены org (`organizations` SELECT org-scoped), правит только владелец.
 * Расширение под admin — отдельное продуктовое решение, не в этом спринте.
 *
 * ⚠️ Типы: 076 ещё не в `supabase.gen.ts` (регенерация идёт на гейте после apply),
 * поэтому колонка `settings` берётся через каст. После регена касты уходят.
 */
export function useOrgSettings() {
  return useQuery({
    queryKey: QUERY_KEY,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<OrgSettings> => {
      const supabase = createClient();
      const { data: orgId, error: orgErr } = await supabase.rpc('current_org_id');
      if (orgErr) throw orgErr;
      if (!orgId) return {};

      const { data, error } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', orgId as string)
        .single();
      if (error) throw error;
      return parseOrgSettings((data as unknown as { settings?: unknown } | null)?.settings);
    },
  });
}

/**
 * Правка настроек — MERGE, не перезапись. Литерал целиком писать нельзя: параллельная
 * правка другого ключа (другая вкладка, другой owner) была бы затёрта. Текущее значение
 * берём из кеша, если он свежий, иначе перечитываем перед записью.
 */
export function useUpdateOrgSettings() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: OrgSettings): Promise<OrgSettings> => {
      const supabase = createClient();
      const { data: orgId, error: orgErr } = await supabase.rpc('current_org_id');
      if (orgErr) throw orgErr;
      if (!orgId) throw new Error('Нет активной организации');

      const { data: current, error: readErr } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', orgId as string)
        .single();
      if (readErr) throw readErr;

      const merged: OrgSettings = {
        ...parseOrgSettings((current as unknown as { settings?: unknown } | null)?.settings),
        ...patch,
      };

      const { data, error } = await supabase
        .from('organizations')
        .update({ settings: merged as unknown as Json } as never)
        .eq('id', orgId as string)
        .select('settings')
        .single();
      if (error) throw error;
      return parseOrgSettings((data as unknown as { settings?: unknown } | null)?.settings);
    },
    onSuccess: (settings) => qc.setQueryData(QUERY_KEY, settings),
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/**
 * Порог тишины организации с фолбэком на дефолт. Тонкая обёртка — чтобы потребители
 * (TodayView, ContactsTable, CompaniesTable) не знали ни про jsonb, ни про ключ.
 */
export function useReconnectDays(): number {
  const { data } = useOrgSettings();
  return data?.reconnect_days ?? DEFAULT_RECONNECT_DAYS;
}
