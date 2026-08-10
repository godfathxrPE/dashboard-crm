'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import type { ActivityLog } from '@/types/entities';
import type { Json } from '@/types/database';
import { TRANSITION_METRIC_EVENT } from '@/lib/domain/stage-transition';

const QUERY_KEY = ['activity_log'] as const;

export function useActivityLog(projectId: string) {
  useRealtimeSync('activity_log', QUERY_KEY);

  return useQuery({
    queryKey: [...QUERY_KEY, projectId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        // Техническое событие метрики переходов в человеческую ленту не пускаем:
        // сам переход уже виден как stage_changed (см. TRANSITION_METRIC_EVENT).
        .neq('event_type', TRANSITION_METRIC_EVENT)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as ActivityLog[];
    },
    enabled: !!projectId,
  });
}

/**
 * Лог активности с гибкой привязкой к сущности (S-NOTES-TIMELINE-1).
 * Передавай ровно один из project_id/contact_id/company_id/lead_id (заметка на
 * контакте/компании не имеет project_id). org_id НЕ шлём — ставит триггер.
 *
 * S-LEAD-HUB-2a: `lead_id` (118) — без него заметка с карточки лида уходила бы
 * вообще без привязки и в его ленту не возвращалась.
 */
export function useLogActivity() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      project_id?: string;
      contact_id?: string;
      company_id?: string;
      lead_id?: string;
      event_type: string;
      payload?: Json;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Вставляем только переданные FK — undefined в объект insert не кладём.
      const row: {
        user_id: string;
        event_type: string;
        payload: Json;
        project_id?: string;
        contact_id?: string;
        company_id?: string;
        lead_id?: string;
      } = {
        user_id: user.id,
        event_type: input.event_type,
        payload: input.payload ?? {},
      };
      if (input.project_id) row.project_id = input.project_id;
      if (input.contact_id) row.contact_id = input.contact_id;
      if (input.company_id) row.company_id = input.company_id;
      if (input.lead_id) row.lead_id = input.lead_id;

      const { error } = await supabase.from('activity_log').insert(row);
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      // Лента сущности (useEntityTimeline) слушает ['timeline'] — подтягиваем заметку.
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

/**
 * Fire-and-forget helper для логирования из onSuccess других мутаций.
 * Не блокирует основную мутацию, ошибки тихо логируются в консоль.
 */
export async function logActivity(
  projectId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('activity_log').insert({
      project_id: projectId,
      user_id: user.id,
      event_type: eventType,
      payload: payload as Json,
    });
  } catch (err) {
    console.error('Activity log error:', err);
  }
}
