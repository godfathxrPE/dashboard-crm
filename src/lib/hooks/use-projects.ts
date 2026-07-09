'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import type { DealStage } from '@/lib/validators/project';
import type { UnmetRequirement } from '@/types/database';
import { logActivity } from './use-activity-log';

// ═══════════════════════════════════════════════════════
// Sprint 27: разбор ошибки стадийного гейта
// ═══════════════════════════════════════════════════════

/**
 * Если мутация стадии упала на enforcement-триггере (миграция 027), достаём
 * список незакрытых требований из DETAIL. Возвращает null для любой другой
 * ошибки — вызывающий отличает «переход заблокирован» от прочих сбоев.
 * Rollback optimistic-обновления делает onError самого хука — не ломаем.
 */
export function parseStageGateError(err: unknown): UnmetRequirement[] | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { message?: string; details?: string | null };
  if (e.message !== 'stage_gate_failed') return null;
  try {
    const parsed = JSON.parse(e.details ?? '[]');
    return Array.isArray(parsed) ? (parsed as UnmetRequirement[]) : [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════
// Types — маппинг на таблицу `projects` из Supabase
// В идеале будет из `types/entities.ts`, но дублируем для автономности модуля
// ═══════════════════════════════════════════════════════

export interface Project {
  id: string;
  name: string;
  company_id: string | null;
  contact_id: string | null;
  stage: DealStage | null;
  budget: number | null;
  deadline: string | null;
  next_step: string | null;
  next_action_date: string | null;
  pinned_note: string | null;
  owner_id: string | null;
  loss_reason: string | null;
  loss_detail: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Sprint 1: pipelines & directions — PCT-1: nullable для internal-проектов
  direction: 'erp' | 'iiot' | null;
  pipeline_id: string | null;
  stage_id: string | null;
  probability: number | null;
  status: 'open' | 'won' | 'lost' | 'on_hold' | 'completed';
  // PCT-1: тип проекта
  type: 'client' | 'internal';
  lost_reason: string | null;
  actual_close_date: string | null;
  /** Миграция 019: когда сделка вошла в текущую стадию (ведёт триггер) */
  stage_entered_at: string | null;
  // Joined data (optional, from select with joins)
  company?: { id: string; name: string } | null;
  contact?: { id: string; first_name: string; last_name: string } | null;
}

export interface ProjectInsert {
  name: string;
  company_id?: string | null;
  contact_id?: string | null;
  stage?: DealStage | null;
  budget?: number | null;
  deadline?: string | null;
  next_step?: string | null;
  next_action_date?: string | null;
  pinned_note?: string | null;
  loss_reason?: string | null;
  loss_detail?: string | null;
  // Sprint 1 — PCT-1: nullable для internal
  direction?: 'erp' | 'iiot' | null;
  pipeline_id?: string | null;
  stage_id?: string | null;
  // PCT-1
  type?: 'client' | 'internal';
}

export interface ProjectUpdate extends Partial<ProjectInsert> {
  id: string;
}

const QUERY_KEY = ['projects'] as const;

// ═══════════════════════════════════════════════════════
// Queries
// ═══════════════════════════════════════════════════════

/** Загрузить все проекты с join на company и contact */
async function fetchProjects(): Promise<Project[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      company:companies(id, name),
      contact:contacts(id, first_name, last_name)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Project[];
}

/** Загрузить один проект по ID с полными связями */
async function fetchProject(id: string): Promise<Project> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      company:companies(id, name),
      contact:contacts(id, first_name, last_name)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Project;
}

// ═══════════════════════════════════════════════════════
// Mutations
// ═══════════════════════════════════════════════════════

async function createProject(project: ProjectInsert): Promise<Project> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .insert(project)
    .select(`
      *,
      company:companies(id, name),
      contact:contacts(id, first_name, last_name)
    `)
    .single();

  if (error) throw error;
  return data as Project;
}

async function updateProject({ id, ...updates }: ProjectUpdate): Promise<Project> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      company:companies(id, name),
      contact:contacts(id, first_name, last_name)
    `)
    .single();

  if (error) throw error;
  return data as Project;
}

async function deleteProject(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════
// Hooks
// ═══════════════════════════════════════════════════════

/** Все проекты + Realtime */
export function useProjects() {
  // Realtime: инвалидируем кеш при изменениях из другого устройства
  useRealtimeSync('projects', QUERY_KEY);

  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchProjects,
    staleTime: 1000 * 60, // 1 мин — Realtime подхватит изменения раньше
  });
}

/** Один проект по ID */
export function useProject(id: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => fetchProject(id),
    enabled: !!id,
  });
}

/** Создать проект — оптимистичный UI */
export function useCreateProject() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: createProject,
    onMutate: async (newProject) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Project[]>(QUERY_KEY);

      // Оптимистичная вставка с временным ID
      const optimistic: Project = {
        id: crypto.randomUUID(),
        name: newProject.name,
        company_id: newProject.company_id ?? null,
        contact_id: newProject.contact_id ?? null,
        stage: newProject.stage ?? null,
        budget: newProject.budget ?? null,
        deadline: newProject.deadline ?? null,
        next_step: newProject.next_step ?? null,
        next_action_date: newProject.next_action_date ?? null,
        pinned_note: newProject.pinned_note ?? null,
        owner_id: null,
        loss_reason: newProject.loss_reason ?? null,
        loss_detail: newProject.loss_detail ?? null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Sprint 1 — PCT-1
        direction: newProject.direction ?? null,
        pipeline_id: newProject.pipeline_id ?? null,
        stage_id: newProject.stage_id ?? null,
        type: newProject.type ?? 'client',
        probability: null,
        status: 'open',
        lost_reason: null,
        actual_close_date: null,
        stage_entered_at: new Date().toISOString(),
      };

      qc.setQueryData<Project[]>(QUERY_KEY, (old) => [optimistic, ...(old ?? [])]);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** Обновить проект — оптимистичный UI */
export function useUpdateProject() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: updateProject,
    onMutate: async (updated) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Project[]>(QUERY_KEY);

      qc.setQueryData<Project[]>(QUERY_KEY, (old) =>
        (old ?? []).map((p) =>
          p.id === updated.id
            ? { ...p, ...updated, updated_at: new Date().toISOString() }
            : p
        )
      );

      // Также обновляем кеш отдельного проекта
      qc.setQueryData<Project>([...QUERY_KEY, updated.id], (old) =>
        old ? { ...old, ...updated, updated_at: new Date().toISOString() } : old
      );

      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSuccess: (result, vars, ctx) => {
      // Находим предыдущее состояние из сохранённого кеша (до оптимистичного обновления)
      const oldProject = ctx?.prev?.find((p) => p.id === vars.id);

      if (vars.stage && oldProject && vars.stage !== oldProject.stage) {
        logActivity(vars.id, 'stage_change', { from: oldProject.stage, to: vars.stage });
      } else {
        const changed = Object.keys(vars).filter((k) => k !== 'id');
        if (changed.length > 0) {
          logActivity(vars.id, 'project_updated', { fields_changed: changed });
        }
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...QUERY_KEY, vars.id] });
    },
  });
}

/** Удалить проект — оптимистичный UI */
export function useDeleteProject() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: deleteProject,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Project[]>(QUERY_KEY);

      qc.setQueryData<Project[]>(QUERY_KEY, (old) =>
        (old ?? []).filter((p) => p.id !== id)
      );

      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** Быстрое перемещение проекта в другую стадию (drag & drop) */
export function useMoveProject() {
  const update = useUpdateProject();

  return {
    ...update,
    /** Legacy: move by DealStage enum (used by old StageBoard) */
    moveToStage: (id: string, stage: DealStage) => {
      const extra: Partial<ProjectInsert> =
        stage === 'lost'
          ? { stage, loss_reason: null, loss_detail: null }
          : stage === 'won'
            ? { stage, loss_reason: null, loss_detail: null }
            : { stage };

      update.mutate({ id, ...extra });
    },
    /**
     * Sprint 1.5: move by stage_id + optional legacy stage for backward compat.
     * Sprint 27: options пробрасываются в mutate — вызывающий ловит отказ гейта
     * (parseStageGateError) поверх встроенного optimistic-rollback хука.
     */
    moveToStageId: (
      id: string,
      stageId: string,
      legacyStage?: DealStage | null,
      options?: { onError?: (err: unknown) => void; onSuccess?: () => void },
    ) => {
      update.mutate(
        {
          id,
          stage_id: stageId,
          ...(legacyStage !== undefined ? { stage: legacyStage } : {}),
        },
        options,
      );
    },
  };
}
