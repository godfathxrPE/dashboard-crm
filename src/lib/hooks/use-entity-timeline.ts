'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import {
  callToEvent,
  meetingToEvent,
  taskToEvent,
  projectToEvent,
  type CallEventRow,
  type MeetingEventRow,
  type TaskEventRow,
  type ProjectEventRow,
} from '@/lib/timeline/adapters';
import type { TimelineEvent } from '@/types/timeline';
import { describeEvent } from '@/lib/utils/activity-events';
import type { ActivityLog } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// useEntityTimeline — единая лента активности сущности.
//
// Ключевое отличие от старого паттерна ContactDetailHub:
// СЕРВЕРНЫЙ фильтр по entity-колонке (contact_id / company_id / project_id),
// а не «тянем весь org и фильтруем в useMemo». Каждый источник — свой
// queryKey и своя выборка, staleTime 60s (как у остальных хуков).
// ═══════════════════════════════════════════════════════

export type TimelineEntityType = 'contact' | 'company' | 'project';

/** entity → колонка серверного фильтра */
const FILTER_COLUMN: Record<TimelineEntityType, string> = {
  contact: 'contact_id',
  company: 'company_id',
  project: 'project_id',
};

const STALE_TIME = 60_000;
const PER_SOURCE_LIMIT = 50;

export interface UseEntityTimelineOptions {
  /**
   * activity_log + ai_runs в ленте. Эти источники привязаны к контакту НЕ
   * напрямую (activity_log → project_id, ai_runs → call|meeting_id), поэтому
   * собираются транзитивно. Структура заложена, но в Sprint A выключена
   * (default false) — активируется в Sprint B вместе с AI-роллапами.
   */
  includeSystem?: boolean;
}

// ─── Прямые источники (серверный фильтр .eq(col, id)) ───

async function fetchCalls(col: string, id: string): Promise<TimelineEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('calls')
    .select('id, date, status, next_step, agreements')
    .eq(col, id)
    .order('date', { ascending: false })
    .limit(PER_SOURCE_LIMIT);
  if (error) throw error;
  return (data as CallEventRow[]).map(callToEvent);
}

async function fetchMeetings(col: string, id: string): Promise<TimelineEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('meetings')
    .select('id, date, title, next_step, notes')
    .eq(col, id)
    .order('date', { ascending: false })
    .limit(PER_SOURCE_LIMIT);
  if (error) throw error;
  return (data as MeetingEventRow[]).map(meetingToEvent);
}

async function fetchTasks(col: string, id: string): Promise<TimelineEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('id, text, lane, deadline, created_at')
    .eq(col, id)
    .order('created_at', { ascending: false })
    .limit(PER_SOURCE_LIMIT);
  if (error) throw error;
  const now = Date.now();
  return (data as TaskEventRow[]).map((t) => taskToEvent(t, now));
}

async function fetchProjects(col: string, id: string): Promise<TimelineEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, type, stage, created_at')
    .eq(col, id)
    .order('created_at', { ascending: false })
    .limit(PER_SOURCE_LIMIT);
  if (error) throw error;
  return (data as ProjectEventRow[]).map(projectToEvent);
}

// ─── Системные источники (транзитивная привязка) — Sprint B, gated off ───

/** project_id набор сущности: для project — сам id, иначе проекты по entity-колонке */
async function resolveProjectIds(
  entityType: TimelineEntityType,
  col: string,
  id: string,
): Promise<string[]> {
  if (entityType === 'project') return [id];
  const supabase = createClient();
  const { data, error } = await supabase.from('projects').select('id').eq(col, id);
  if (error) throw error;
  return (data ?? []).map((p) => p.id as string);
}

interface ActivityRow {
  id: string;
  event_type: string;
  payload: unknown;
  created_at: string;
}

function activityToEvent(a: ActivityRow): TimelineEvent {
  return {
    id: `activity:${a.id}`,
    sourceId: a.id,
    kind: 'activity' as const,
    // Человекочитаемый текст (стадия/комментарий/…) через общий describeEvent
    title: describeEvent(a as unknown as ActivityLog),
    date: a.created_at,
    icon: 'activity' as const,
  };
}

/**
 * activity_log сущности = UNION прямых и транзитивных записей (S-NOTES-TIMELINE-1):
 *  - прямые: заметки, положенные на саму сущность (contact_id/company_id = id;
 *    для project — project_id = id);
 *  - транзитивные (только contact/company): записи по связанным проектам
 *    (project_id ∈ проекты сущности) — как было до спринта.
 * Дедуп по id: прямая заметка не имеет project_id и в оба набора не попадёт,
 * но защищаемся на случай пересечения.
 */
async function fetchActivity(
  entityType: TimelineEntityType,
  col: string,
  id: string,
): Promise<TimelineEvent[]> {
  const supabase = createClient();

  // Прямая привязка: col уже = contact_id | company_id | project_id.
  const direct = await supabase
    .from('activity_log')
    .select('id, event_type, payload, created_at')
    .eq(col, id)
    .order('created_at', { ascending: false })
    .limit(PER_SOURCE_LIMIT);
  if (direct.error) throw direct.error;

  // Транзитивная — только для contact/company (у project «прямая» уже по project_id).
  let transitive: ActivityRow[] = [];
  if (entityType !== 'project') {
    const projectIds = await resolveProjectIds(entityType, col, id);
    if (projectIds.length > 0) {
      const t = await supabase
        .from('activity_log')
        .select('id, event_type, payload, created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT);
      if (t.error) throw t.error;
      transitive = (t.data ?? []) as ActivityRow[];
    }
  }

  const byId = new Map<string, ActivityRow>();
  for (const a of [...((direct.data ?? []) as ActivityRow[]), ...transitive]) {
    byId.set(a.id, a);
  }
  return [...byId.values()].map(activityToEvent);
}

async function fetchAiRuns(col: string, id: string): Promise<TimelineEvent[]> {
  const supabase = createClient();
  // call|meeting id набор сущности → ai_runs.entity_id ∈ (…). UUID уникальны
  // между таблицами, поэтому единый .in по entity_id безопасен.
  const [calls, meetings] = await Promise.all([
    supabase.from('calls').select('id').eq(col, id),
    supabase.from('meetings').select('id').eq(col, id),
  ]);
  if (calls.error) throw calls.error;
  if (meetings.error) throw meetings.error;
  const entityIds = [
    ...(calls.data ?? []).map((c) => c.id as string),
    ...(meetings.data ?? []).map((m) => m.id as string),
  ];
  if (entityIds.length === 0) return [];
  const { data, error } = await supabase
    .from('ai_runs')
    .select('id, preset_key, entity_type, created_at')
    .in('entity_id', entityIds)
    .order('created_at', { ascending: false })
    .limit(PER_SOURCE_LIMIT);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: `ai_run:${r.id}`,
    sourceId: r.id as string,
    kind: 'ai_run' as const,
    title: `AI: ${r.preset_key}`,
    date: r.created_at as string,
    icon: 'ai_run' as const,
  }));
}

// ─── Хук ───

export function useEntityTimeline(
  entityType: TimelineEntityType,
  entityId: string | null | undefined,
  opts: UseEntityTimelineOptions = {},
) {
  const col = FILTER_COLUMN[entityType];
  const enabled = Boolean(entityId);
  const includeSystem = opts.includeSystem ?? false;
  // projects=сама сущность для project-хаба — источник пропускаем
  const projectsEnabled = enabled && entityType !== 'project';

  const calls = useQuery({
    queryKey: ['timeline', 'call', entityType, entityId],
    queryFn: () => fetchCalls(col, entityId!),
    enabled,
    staleTime: STALE_TIME,
  });

  const meetings = useQuery({
    queryKey: ['timeline', 'meeting', entityType, entityId],
    queryFn: () => fetchMeetings(col, entityId!),
    enabled,
    staleTime: STALE_TIME,
  });

  const tasks = useQuery({
    queryKey: ['timeline', 'task', entityType, entityId],
    queryFn: () => fetchTasks(col, entityId!),
    enabled,
    staleTime: STALE_TIME,
  });

  const projects = useQuery({
    queryKey: ['timeline', 'project', entityType, entityId],
    queryFn: () => fetchProjects(col, entityId!),
    enabled: projectsEnabled,
    staleTime: STALE_TIME,
  });

  const activity = useQuery({
    queryKey: ['timeline', 'activity', entityType, entityId],
    queryFn: () => fetchActivity(entityType, col, entityId!),
    enabled: enabled && includeSystem,
    staleTime: STALE_TIME,
  });

  const aiRuns = useQuery({
    queryKey: ['timeline', 'ai_run', entityType, entityId],
    queryFn: () => fetchAiRuns(col, entityId!),
    enabled: enabled && includeSystem,
    staleTime: STALE_TIME,
  });

  const events = useMemo(() => {
    const all: TimelineEvent[] = [
      ...(calls.data ?? []),
      ...(meetings.data ?? []),
      ...(tasks.data ?? []),
      ...(projects.data ?? []),
      ...(activity.data ?? []),
      ...(aiRuns.data ?? []),
    ];
    return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [calls.data, meetings.data, tasks.data, projects.data, activity.data, aiRuns.data]);

  // isLoading для disabled-запросов в React Query v5 = false (fetchStatus idle),
  // поэтому пропущенные источники (projects на project-хабе, system off) не «висят».
  const isLoading =
    calls.isLoading || meetings.isLoading || tasks.isLoading || projects.isLoading ||
    activity.isLoading || aiRuns.isLoading;

  return { events, isLoading };
}
