'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import {
  collectConversationAttachmentPaths,
  removeChatAttachmentObjects,
} from './use-message-attachments';
import type { OpenChecklistItem, UnmetRequirement } from '@/types/database';
import type { OpenMilestone } from './use-delivery-gate';

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
 * message === 'delivery_gate_failed' → DETAIL. null — другая ошибка.
 *
 * ⚠️ Формат DETAIL сменился в 084 и парсер обязан пережить ОБА:
 * - до 084 — голый jsonb-массив открытых вех;
 * - с 084 — весь результат `check_delivery_completion`
 *   (`{ready, open_milestones, open_checklist_items}`), потому что `ready` теперь может
 *   быть false из-за чеклиста, и один массив вех рисовал бы «заблокировано, но закрывать
 *   нечего».
 * Между apply миграции и деплоем фронта есть окно — старый формат не выкидывается.
 */
export interface DeliveryGateFailure {
  open_milestones: OpenMilestone[];
  open_checklist_items: OpenChecklistItem[];
}

export function parseDeliveryGateError(err: unknown): DeliveryGateFailure | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { message?: string; details?: string | null };
  if (e.message !== 'delivery_gate_failed') return null;

  const empty: DeliveryGateFailure = { open_milestones: [], open_checklist_items: [] };
  try {
    const parsed: unknown = JSON.parse(e.details ?? '[]');
    // Legacy-формат (до 084): DETAIL = массив вех.
    if (Array.isArray(parsed)) {
      return { open_milestones: parsed as OpenMilestone[], open_checklist_items: [] };
    }
    if (!parsed || typeof parsed !== 'object') return empty;
    const p = parsed as { open_milestones?: unknown; open_checklist_items?: unknown };
    return {
      open_milestones: Array.isArray(p.open_milestones) ? (p.open_milestones as OpenMilestone[]) : [],
      open_checklist_items: Array.isArray(p.open_checklist_items)
        ? (p.open_checklist_items as OpenChecklistItem[])
        : [],
    };
  } catch {
    return empty;
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
  budget: number | null;
  deadline: string | null;
  next_step: string | null;
  next_action_date: string | null;
  pinned_note: string | null;
  owner_id: string | null;
  loss_reason: string | null;
  loss_detail: string | null;
  // Причина выигрыша — симметрия loss (миграция 043)
  won_reason: string | null;
  won_detail: string | null;
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
  budget?: number | null;
  deadline?: string | null;
  next_step?: string | null;
  next_action_date?: string | null;
  pinned_note?: string | null;
  loss_reason?: string | null;
  loss_detail?: string | null;
  won_reason?: string | null;
  won_detail?: string | null;
  // Sprint 1 — PCT-1: nullable для internal
  direction?: 'erp' | 'iiot' | null;
  pipeline_id?: string | null;
  stage_id?: string | null;
  // PCT-1
  type?: 'client' | 'internal' | 'delivery';
  // Delivery P1: статус меняет «Завершить проект»; delivery создаёт RPC
  status?: Project['status'];
  do_url?: string | null;
  // S-IA-DELIVERY-1: owner_id всегда уходил в payload спредом ProjectFormValues
  // (спред обходит excess-property check) — декларируем честно.
  owner_id?: string | null;
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
  id, name, company_id, contact_id, budget, deadline, next_step,
  next_action_date, pinned_note, owner_id, loss_reason, loss_detail,
  won_reason, won_detail,
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
  // Батчинг `.in()` (S-DEBT-TRUTH-1) тут не нужен: список — два литерала, не данные.
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

/**
 * Hard delete проекта. Каскад уносит и канал проекта (`conversations.project_id`), и его
 * сообщения со строками вложений.
 *
 * S-CHAT-AUDIT-1: байты вложений каскад НЕ трогает — бакет про внешние ключи не знает
 * (097). Больше того, после исчезновения канала объекты становятся неудаляемыми из
 * приложения ВООБЩЕ: `can_access_chat_file` берёт первый сегмент пути как
 * `conversation_id` и не находит канала ⇒ false для всех, включая owner. Поэтому пути
 * собираются и объекты сносятся ДО удаления проекта — тот же приём, что в
 * `useDeleteMessage` и `useDeleteGroup`.
 */
async function deleteProject(id: string): Promise<void> {
  const supabase = createClient();

  // Канала может не быть (проект создан до бэкфилла 094) — тогда шаг просто пропускается.
  // Ошибку чтения глотаем: не повод блокировать удаление проекта, худший исход — сирота.
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('project_id', id)
    .maybeSingle();

  if (conversation) {
    const paths = await collectConversationAttachmentPaths(conversation.id);
    await removeChatAttachmentObjects(paths).catch(() => undefined);
  }

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
        budget: newProject.budget ?? null,
        deadline: newProject.deadline ?? null,
        next_step: newProject.next_step ?? null,
        next_action_date: newProject.next_action_date ?? null,
        pinned_note: newProject.pinned_note ?? null,
        owner_id: null,
        loss_reason: newProject.loss_reason ?? null,
        loss_detail: newProject.loss_detail ?? null,
        won_reason: newProject.won_reason ?? null,
        won_detail: newProject.won_detail ?? null,
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

/**
 * Обновить проект — оптимистичный UI.
 *
 * ⚠️ S-R2-FIELD-AUDIT: логирование `stage_changed` / `project_updated` отсюда
 * УДАЛЕНО и живёт в триггере `trg_zy_log_field_audit` (миграция 087). Клиент писал
 * только имена колонок из патча — без значений, без проверки, что значение реально
 * изменилось, и только для правок через UI. Не возвращать: два источника дадут
 * пары записей в ленте. Правило «производные от стадии поля не решают тип события»
 * (бывший `STAGE_DERIVED_FIELDS`) переехало в SQL целиком.
 */
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

/**
 * S-R2-TRANSITION-1a: `useMoveProject` переехал в `./use-stage-transition`.
 * Единственный вход смены стадии — `useStageTransition().commitTransition`;
 * держать здесь второй способ собрать payload стадии значило бы вернуть ту самую
 * рассинхронизацию, ради устранения которой сервис и заводился. Импорт из этого
 * модуля был бы циклом (use-stage-transition зависит от useUpdateProject выше).
 */
