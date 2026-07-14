'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import type { DealStage } from '@/lib/validators/project';
import type { UnmetRequirement } from '@/types/database';
import type { OpenMilestone } from './use-delivery-gate';
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

/**
 * Delivery P3: разбор отказа гейта завершения (триггер 038, тот же шаблон).
 * message === 'delivery_gate_failed' → DETAIL содержит jsonb-массив открытых
 * вех (shape open_milestones из check_delivery_completion). null — другая ошибка.
 */
export function parseDeliveryGateError(err: unknown): OpenMilestone[] | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { message?: string; details?: string | null };
  if (e.message !== 'delivery_gate_failed') return null;
  try {
    const parsed = JSON.parse(e.details ?? '[]');
    return Array.isArray(parsed) ? (parsed as OpenMilestone[]) : [];
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
  // PCT-1: тип проекта; delivery — проект внедрения (миграция 035)
  type: 'client' | 'internal' | 'delivery';
  lost_reason: string | null;
  actual_close_date: string | null;
  /** Миграция 019: когда сделка вошла в текущую стадию (ведёт триггер) */
  stage_entered_at: string | null;
  // Delivery P1 (миграция 035)
  parent_deal_id: string | null;
  delivery_kind: 'launch' | 'experiment' | null;
  do_url: string | null;
  progress_done: number;
  progress_total: number;
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
  type?: 'client' | 'internal' | 'delivery';
  // Delivery P1: статус меняет «Завершить проект»; delivery создаёт RPC
  status?: Project['status'];
  do_url?: string | null;
}

export interface ProjectUpdate extends Partial<ProjectInsert> {
  id: string;
}

const QUERY_KEY = ['projects'] as const;

/**
 * B7 (delivery P1): срез по типу на сервере, а не в каждом потребителе.
 *  - 'deals'    → только client (раздел «Сделки», /deals)
 *  - 'projects' → delivery + internal (раздел «Проекты», /projects)
 *  - undefined  → все (кросс-секционные потребители: Cmd+K, модалки связей)
 */
export type ProjectScope = 'deals' | 'projects';

const listKey = (scope?: ProjectScope) => [...QUERY_KEY, scope ?? 'all'] as const;

// QUERY STRATEGY: явные колонки вместо select *
const PROJECT_COLUMNS = `
  id, name, company_id, contact_id, stage, budget, deadline, next_step,
  next_action_date, pinned_note, owner_id, loss_reason, loss_detail,
  created_by, created_at, updated_at, direction, pipeline_id, stage_id,
  probability, status, type, lost_reason, actual_close_date, stage_entered_at,
  parent_deal_id, delivery_kind, do_url, progress_done, progress_total,
  company:companies(id, name),
  contact:contacts(id, first_name, last_name)
`;

// ═══════════════════════════════════════════════════════
// Queries
// ═══════════════════════════════════════════════════════

/** Загрузить проекты среза с join на company и contact */
async function fetchProjects(scope?: ProjectScope): Promise<Project[]> {
  const supabase = createClient();
  let query = supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .order('created_at', { ascending: false });

  if (scope === 'deals') query = query.eq('type', 'client');
  if (scope === 'projects') query = query.in('type', ['delivery', 'internal']);

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as unknown as Project[];
}

/** Загрузить один проект по ID с полными связями */
async function fetchProject(id: string): Promise<Project> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as unknown as Project;
}

// ═══════════════════════════════════════════════════════
// Mutations
// ═══════════════════════════════════════════════════════

async function createProject(project: ProjectInsert): Promise<Project> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .insert(project)
    .select(PROJECT_COLUMNS)
    .single();

  if (error) throw error;
  return data as unknown as Project;
}

async function updateProject({ id, ...updates }: ProjectUpdate): Promise<Project> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select(PROJECT_COLUMNS)
    .single();

  if (error) throw error;
  return data as unknown as Project;
}

async function deleteProject(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════
// Hooks
// ═══════════════════════════════════════════════════════

/**
 * Проекты среза + Realtime. Без аргумента — все типы (Cmd+K, модалки связей);
 * 'deals' — только client; 'projects' — delivery+internal (см. ProjectScope).
 */
export function useProjects(scope?: ProjectScope) {
  // Realtime: инвалидируем кеш при изменениях из другого устройства
  // (invalidateQueries по префиксу ['projects'] задевает все срезы)
  useRealtimeSync('projects', QUERY_KEY);

  return useQuery({
    queryKey: listKey(scope),
    queryFn: () => fetchProjects(scope),
    staleTime: 1000 * 60, // 1 мин — Realtime подхватит изменения раньше
  });
}

/** Раздел «Сделки» (/deals): только client */
export function useDeals() {
  return useProjects('deals');
}

/** Раздел «Проекты» (/projects): delivery + internal */
export function useDeliveryProjects() {
  return useProjects('projects');
}

// ── Optimistic-хелперы: list-кешей теперь несколько (all/deals/projects) ──

type ListSnapshot = [readonly unknown[], Project[] | undefined][];

/** Снимок всех list-кешей проектов (single-кеши [projects, <uuid>] не трогаем) */
function snapshotLists(qc: ReturnType<typeof useQueryClient>): ListSnapshot {
  return qc
    .getQueriesData<Project[]>({ queryKey: QUERY_KEY })
    .filter(([, data]) => Array.isArray(data)) as ListSnapshot;
}

function restoreLists(qc: ReturnType<typeof useQueryClient>, snapshot: ListSnapshot) {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

/** Применить преобразование ко всем list-кешам */
function patchLists(qc: ReturnType<typeof useQueryClient>, fn: (old: Project[]) => Project[]) {
  qc.setQueriesData<Project[]>({ queryKey: QUERY_KEY }, (old) =>
    Array.isArray(old) ? fn(old) : old,
  );
}

/** Срез кеша по его ключу совместим с типом проекта? */
function scopeMatches(key: readonly unknown[], type: Project['type']): boolean {
  const scope = key[1];
  if (scope === 'deals') return type === 'client';
  if (scope === 'projects') return type !== 'client';
  return true; // 'all'
}

/** Один проект по ID */
export function useProject(id: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => fetchProject(id),
    enabled: !!id,
  });
}

// ═══════════════════════════════════════════════════════
// S-DEAL-HUB-1: дочерние внедрения выигранной сделки
// ═══════════════════════════════════════════════════════

/**
 * Проекция строки `projects` (type='delivery') для секции «Внедрения по сделке»
 * на карточке won-сделки. Только поля, нужные хабу — не тянем весь Project.
 */
export interface ChildDelivery {
  id: string;
  name: string;
  status: string;
  stage_id: string | null;
  delivery_kind: 'launch' | 'experiment' | null;
  direction: 'erp' | 'iiot' | null;
  progress_done: number;
  progress_total: number;
  // S-DLV-HEALTH-1: сигналы health (аддитивно, всё ещё один запрос)
  stage_entered_at: string | null;
  deadline: string | null;
  do_url: string | null;
  do_synced_at: string | null;
  updated_at: string | null;
}

const CHILD_DELIVERY_COLUMNS =
  'id, name, status, stage_id, delivery_kind, direction, progress_done, progress_total, stage_entered_at, deadline, do_url, do_synced_at, updated_at';

async function fetchChildDeliveries(dealId: string): Promise<ChildDelivery[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select(CHILD_DELIVERY_COLUMNS)
    .eq('parent_deal_id', dealId)
    .eq('type', 'delivery')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as ChildDelivery[];
}

/**
 * Дочерние проекты внедрения (`type='delivery'`, `parent_deal_id = dealId`).
 * Ключ под префиксом ['projects'] — realtime-инвалидация useProjects и
 * spawn-инвалидация (`invalidateQueries(['projects'])`) подхватывают список.
 * org-scope наследуется из RLS на projects, как у остальных project-хуков.
 */
export function useChildDeliveries(dealId: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, 'children', dealId],
    queryFn: () => fetchChildDeliveries(dealId),
    enabled: !!dealId,
    staleTime: 1000 * 60,
  });
}

/** Создать проект — оптимистичный UI */
export function useCreateProject() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: createProject,
    onMutate: async (newProject) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = snapshotLists(qc);

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
        status: newProject.status ?? 'open',
        lost_reason: null,
        actual_close_date: null,
        stage_entered_at: new Date().toISOString(),
        parent_deal_id: null,
        delivery_kind: null,
        do_url: newProject.do_url ?? null,
        progress_done: 0,
        progress_total: 0,
      };

      // Вставляем только в совместимые по типу срезы (all + deals ИЛИ projects)
      for (const [key, data] of prev) {
        if (!scopeMatches(key, optimistic.type)) continue;
        qc.setQueryData<Project[]>(key, [optimistic, ...(data ?? [])]);
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) restoreLists(qc, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      // AUDIT 2.9: активные сделки — KPI дашборда (создание/удаление сдвигает счётчик)
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
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
      const prev = snapshotLists(qc);

      patchLists(qc, (old) =>
        old.map((p) =>
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
      if (ctx?.prev) restoreLists(qc, ctx.prev);
    },
    onSuccess: (result, vars, ctx) => {
      // Находим предыдущее состояние из сохранённого кеша (до оптимистичного обновления)
      const oldProject = ctx?.prev
        ?.flatMap(([, data]) => data ?? [])
        .find((p) => p.id === vars.id);

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
      // AUDIT 2.9: смена стадии (won/lost) меняет счётчик активных сделок на дашборде
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
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
      const prev = snapshotLists(qc);

      patchLists(qc, (old) => old.filter((p) => p.id !== id));

      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) restoreLists(qc, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      // AUDIT 2.9: активные сделки — KPI дашборда (создание/удаление сдвигает счётчик)
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
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
