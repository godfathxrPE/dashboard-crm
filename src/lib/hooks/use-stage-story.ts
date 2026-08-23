'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { usePipelineStagesMap } from './use-pipelines';
import { useTeamMembers } from './use-team-members';
import { buildStageStory, type StageStory, type StageTransitionRow } from '@/lib/domain/stage-story';

// ═══════════════════════════════════════════════════════
// S-STAGE-STORY-1: чтение траектории сделки.
//
// ⚠️ `useRealtimeSync` здесь НЕ вешается. В публикации `supabase_realtime` лежат
// `activity_log`, `deal_stakeholders`, `projects` — `stage_transitions` там НЕТ.
// Подписка на таблицу вне публикации молчит, и молчит тихо (learnings:
// «useRealtimeSync без таблицы в publication молчит») — то есть выглядела бы как
// работающая свежесть, которой нет.
//
// ⚠️ Свежесть держит инвалидация, и живёт она в ОДНОМ месте — в `onSettled`
// самого `useUpdateProject` (`src/lib/hooks/use-projects.ts`), через который идёт
// любой переход стадии (`useStageTransition.commitTransition` → `update.mutate`).
// Не в вызывающих: тогда новый путь перехода смог бы забыть половину, и вкладка
// показала бы вчерашнюю траекторию без единого признака ошибки (грабля
// «вторая витрина тех же строк без инвалидации»).
//
// ⚠️ Клиент эту таблицу только ЧИТАЕТ: INSERT-политики нет и заводить её незачем —
// строки ставит триггер `trg_zy_log_stage_transition`.
// ═══════════════════════════════════════════════════════

export const STAGE_TRANSITIONS_KEY = ['stage_transitions'] as const;

/** С этой даты работает триггер журнала — раньше переходы просто не писались. */
export const STAGE_JOURNAL_SINCE = '27 июля 2026';

/** Сырые строки журнала переходов проекта. Колонка времени — `changed_at`. */
export function useStageTransitions(projectId: string | null | undefined) {
  return useQuery({
    queryKey: [...STAGE_TRANSITIONS_KEY, projectId],
    enabled: !!projectId,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<StageTransitionRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('stage_transitions')
        .select('id, from_stage_id, to_stage_id, changed_by, changed_at')
        .eq('project_id', projectId!)
        .order('changed_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as StageTransitionRow[];
    },
  });
}

export interface DeadlineMoves {
  count: number;
  /** Дата последнего переноса (ISO) или null. */
  lastAt: string | null;
}

/**
 * Переносы дедлайна из аудита полей (087, `trg_zy_log_field_audit` → `activity_log`).
 *
 * ⚠️ Фильтр по наличию `changes.deadline` — на КЛИЕНТЕ: jsonb-оператор `?` через
 * PostgREST не выражается, а выборка мелкая (десятки строк на проект).
 *
 * ⚠️ `useActivityLog` для этого не годится: у него `limit(50)` и `select('*')` —
 * счётчик переносов на длинной сделке молча обрезался бы.
 */
export function useDeadlineMoves(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['deadline-moves', projectId],
    enabled: !!projectId,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<DeadlineMoves> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('activity_log')
        .select('created_at, payload')
        .eq('project_id', projectId!)
        .in('event_type', ['project_updated', 'stage_changed'])
        .order('created_at', { ascending: false });
      if (error) throw error;

      let count = 0;
      let lastAt: string | null = null;
      for (const row of data ?? []) {
        const payload = row.payload as Record<string, unknown> | null;
        const changes = payload?.changes;
        if (!changes || typeof changes !== 'object' || Array.isArray(changes)) continue;
        if (!('deadline' in (changes as Record<string, unknown>))) continue;
        count += 1;
        // Строки идут по убыванию — первая подходящая и есть последний перенос.
        if (lastAt === null) lastAt = row.created_at;
      }
      return { count, lastAt };
    },
  });
}

export interface StageStoryResult {
  story: StageStory | null;
  deadlineMoves: DeadlineMoves;
  /** Имя человека по id или null — акторов без профиля не выдумываем. */
  actorName: (id: string | null) => string | null;
  isLoading: boolean;
  /** Журнал пуст: у сделки нет ни одного записанного перехода. */
  isEmptyJournal: boolean;
}

/**
 * Траектория сделки: сегменты стадий, суммарное время, возвраты, переносы дедлайна.
 *
 * `story` — `null`, пока грузятся строки или словарь стадий: домен требует
 * `stageName`, и до готовности словаря все стадии назвались бы «—».
 */
export function useStageStory(
  project: { id: string; created_at: string; stage_id: string | null } | null | undefined,
): StageStoryResult {
  const projectId = project?.id ?? null;
  const { data: rows, isLoading: rowsLoading } = useStageTransitions(projectId);
  const { data: moves } = useDeadlineMoves(projectId);
  const stagesMap = usePipelineStagesMap();
  const { data: members } = useTeamMembers();

  const namesById = useMemo(
    () => new Map((members ?? []).map((m) => [m.id, m.full_name])),
    [members],
  );

  const story = useMemo(() => {
    if (!project || rows === undefined || stagesMap.size === 0) return null;
    return buildStageStory(rows, {
      createdAt: project.created_at,
      currentStageId: project.stage_id,
      // Стадия могла быть удалена из глобального словаря — тогда «—», а не пусто.
      stageName: (id) => stagesMap.get(id)?.name ?? '—',
    });
  }, [project, rows, stagesMap]);

  return {
    story,
    deadlineMoves: moves ?? { count: 0, lastAt: null },
    actorName: (id) => (id ? namesById.get(id) ?? null : null),
    isLoading: rowsLoading || stagesMap.size === 0,
    isEmptyJournal: (rows?.length ?? 0) === 0,
  };
}
