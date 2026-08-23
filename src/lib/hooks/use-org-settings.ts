'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_RECONNECT_DAYS } from '@/lib/constants/reconnect';
import {
  parseOrgSettings,
  readCompletenessOverrides,
  readDealSignalThresholds,
  readStageTargetDays,
} from '@/lib/validators/org-settings';
import type { DealSignalThresholds } from '@/lib/domain/deal-signals';
import { DEFAULT_RULES, resolveRules, type CompletenessRules } from '@/lib/domain/deal-completeness';
import type { DwellThresholds } from '@/lib/utils/deal-health';
import type { Json, OrgSettings } from '@/types/database';

const QUERY_KEY = ['org-settings'] as const;

// Стабильная ссылка на «настроек нет» — новый литерал на каждый рендер ломал бы
// мемоизацию у потребителей.
const EMPTY_THRESHOLDS: DwellThresholds = {};

/**
 * Настройки текущей организации (`organizations.settings`, миграция 076).
 *
 * ⚠️ Права: UPDATE на organizations — owner-only (`org_update_owner`, baseline + 054).
 * Читают все члены org (`organizations` SELECT org-scoped), правит только владелец.
 * Расширение под admin — отдельное продуктовое решение, не в этом спринте.
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
      return parseOrgSettings(data.settings);
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
        ...parseOrgSettings(current.settings),
        ...patch,
      };

      const { data, error } = await supabase
        .from('organizations')
        .update({ settings: merged as unknown as Json })
        .eq('id', orgId as string)
        .select('settings')
        .single();
      if (error) throw error;
      return parseOrgSettings(data.settings);
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

/**
 * Пороги «залипания в стадии» организации (S-R2-DWELL-CFG). Пустой объект — валидное
 * значение: `resolveDwellThreshold` падает на хардкод-фолбэк `STALE_BY_PHASE`, то есть
 * ненастроенная org видит ровно прежние бейджи.
 */
export function useDwellThresholds(): DwellThresholds {
  const { data } = useOrgSettings();
  return data?.stage_dwell_defaults ?? EMPTY_THRESHOLDS;
}

/**
 * Нормы дней по конкретным стадиям (S-PIPELINE-COCKPIT-1). `undefined` — валидное
 * значение: `resolveStageNorm` падает на порог phase_group, то есть ненастроенная
 * org видит ту же норму, что и бейдж «залипла». Пишущего UI пока нет.
 *
 * `useMemo` — не косметика: ридер строит новый объект на каждый вызов, и без
 * мемоизации значение нельзя было бы класть в зависимости потребителей.
 */
export function useStageTargetDays(): Record<string, number> | undefined {
  const { data } = useOrgSettings();
  return useMemo(() => readStageTargetDays(data), [data]);
}

/**
 * Правила полноты сделки с учётом весов организации (S-R3-TRUST-1).
 * Ненастроенная org получает ровно `DEFAULT_RULES` — и ту же ссылку, поэтому
 * значение можно класть в зависимости `useMemo` у потребителей.
 */
export function useCompletenessRules(): CompletenessRules {
  const { data } = useOrgSettings();
  return useMemo(() => resolveRules(DEFAULT_RULES, readCompletenessOverrides(data)), [data]);
}

/**
 * Пороги сигналов сделки (S-HEALTH-V2-1). Ненастроенная org получает
 * `DEFAULT_SIGNAL_THRESHOLDS` — и ТУ ЖЕ ссылку, поэтому значение можно класть в
 * зависимости `useMemo` у потребителей. Пишущего UI пока нет: ключ читается,
 * редактор появится отдельным спринтом (ровно как `stage_target_days`).
 */
export function useDealSignalThresholds(): DealSignalThresholds {
  const { data } = useOrgSettings();
  return useMemo(() => readDealSignalThresholds(data), [data]);
}
