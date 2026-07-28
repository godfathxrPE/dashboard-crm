'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  ChecklistItem,
  ChecklistTemplate,
  ChecklistTemplateItem,
  ChecklistType,
  Json,
  ProjectChecklist,
  Tables,
} from '@/types/database';
import { parseChecklistItems, parseTemplateItems } from '@/lib/validators/checklist';

/**
 * Sign-off чеклисты внедрения (R2-P1-G, миграции 083/084 — applied 2026-07-28).
 *
 * ⚠️ org_id пишем ЯВНО: на обеих таблицах нет триггера set_org_id (паттерн segments /
 * stage_requirements / invitations — org-скоуп приходит из UI).
 *
 * ⚠️ Отметка пункта идёт ТОЛЬКО через RPC `toggle_checklist_item`: прямой UPDATE `items`
 * рядовому участнику закрыт политикой 083, а `checked_by`/`checked_at` штампует сервер.
 * Оптимистичного апдейта поэтому НЕТ — подставлять эти два поля на клиенте значило бы
 * рисовать ту самую ложь, от которой уходит sign-off.
 *
 * Ключи кеша без org_id — конвенция проекта (use-segments / use-stage-requirements):
 * смена организации в этом приложении означает перелогин, кеш поднимается заново.
 */

// ═══════════════════════════════════════════════════════
// Row → домен
// ═══════════════════════════════════════════════════════
// `checklist_type` и `delivery_kind` в БД — text + CHECK (не enum), поэтому
// автогенерация отдаёт `string`, а домен уточняет их до union. Касты нужны и
// после регена — не «упрощать».

function toTemplate(row: Tables<'checklist_templates'>): ChecklistTemplate {
  return {
    ...row,
    checklist_type: row.checklist_type as ChecklistType,
    delivery_kind: (row.delivery_kind as 'launch' | 'experiment' | null) ?? null,
    items: parseTemplateItems(row.items),
  };
}

function toChecklist(row: Tables<'project_checklists'>): ProjectChecklist {
  return {
    ...row,
    checklist_type: row.checklist_type as ChecklistType,
    items: parseChecklistItems(row.items),
  };
}

export const projectChecklistsKey = (projectId: string) =>
  ['project-checklists', projectId] as const;
export const checklistTemplatesKey = () => ['checklist-templates'] as const;

// ═══════════════════════════════════════════════════════
// Read
// ═══════════════════════════════════════════════════════

/** Чеклисты одного проекта. RLS отдаёт только свою org. */
export function useProjectChecklists(projectId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: projectChecklistsKey(projectId ?? ''),
    enabled: !!projectId && enabled,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<ProjectChecklist[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('project_checklists')
        .select('*')
        .eq('project_id', projectId!)
        .order('title', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toChecklist);
    },
  });
}

/** Шаблоны org. Читают все члены org, правят owner/admin (RLS 083). */
export function useChecklistTemplates() {
  return useQuery({
    queryKey: checklistTemplatesKey(),
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<ChecklistTemplate[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('checklist_templates')
        .select('*')
        .order('checklist_type', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toTemplate);
    },
  });
}

// ═══════════════════════════════════════════════════════
// Отметка пункта — RPC (единственный путь)
// ═══════════════════════════════════════════════════════

export interface ToggleChecklistItemInput {
  checklistId: string;
  itemKey: string;
  checked: boolean;
  /** Нужен только для инвалидации кешей проекта. */
  projectId: string;
}

export function useToggleChecklistItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleChecklistItemInput): Promise<ChecklistItem[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('toggle_checklist_item', {
        p_checklist_id: input.checklistId,
        p_item_key: input.itemKey,
        p_checked: input.checked,
      });
      if (error) throw error;
      return parseChecklistItems(data as unknown);
    },
    // Гейт завершения читает те же пункты — без второй инвалидации модалка завершения
    // покажет устаревший список (и кнопка «Завершить» останется disabled после отметки).
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: projectChecklistsKey(input.projectId) });
      qc.invalidateQueries({ queryKey: ['delivery-gate', input.projectId] });
    },
  });
}

// ═══════════════════════════════════════════════════════
// Чеклист на проекте: добавить / удалить (owner/admin по RLS)
// ═══════════════════════════════════════════════════════

/** Пункты шаблона → пункты экземпляра. Зеркало instantiate_project_checklists (084). */
export function instantiateItems(templateItems: ChecklistTemplateItem[]): ChecklistItem[] {
  return templateItems.map((it) => ({ ...it, checked: false, checked_by: null, checked_at: null }));
}

/**
 * Развернуть шаблон на проекте. Это же покрывает три существующих внедрения, которым
 * бэкфилл сознательно не делался (обязательные пункты сделали бы их незавершаемыми
 * без действия РП — см. Открытое решение 2 спринта).
 *
 * Серверная `instantiate_project_checklists` здесь не используется намеренно: у неё
 * снят EXECUTE у authenticated (служебная, зовётся из spawn_delivery_project), и она
 * разворачивает ВСЕ подходящие шаблоны сразу, а кнопка добавляет один выбранный.
 * Дубликат ловит `unique (project_id, checklist_type)`.
 */
export function useAddProjectChecklist() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      template: ChecklistTemplate;
    }): Promise<ProjectChecklist> => {
      const supabase = createClient();

      const { data: orgId, error: orgErr } = await supabase.rpc('current_org_id');
      if (orgErr) throw orgErr;
      if (!orgId) throw new Error('Нет активной организации');

      const { data, error } = await supabase
        .from('project_checklists')
        .insert({
          org_id: orgId as string,
          project_id: input.projectId,
          checklist_type: input.template.checklist_type,
          title: input.template.title,
          // jsonb в БД — `Json`; доменный массив пунктов отсюда кастуется.
          items: instantiateItems(input.template.items) as unknown as Json,
        })
        .select('*')
        .single();
      if (error) throw error;
      return toChecklist(data);
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: projectChecklistsKey(input.projectId) });
      qc.invalidateQueries({ queryKey: ['delivery-gate', input.projectId] });
    },
  });
}

export function useDeleteProjectChecklist() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; projectId: string }): Promise<void> => {
      const supabase = createClient();
      // RLS-deny на DELETE возвращает 0 строк БЕЗ ошибки (грабля S-GANTT-BASELINE-1):
      // просим строку назад и по пустому ответу отличаем «нет прав» от успеха.
      const { data, error } = await supabase
        .from('project_checklists')
        .delete()
        .eq('id', input.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Недостаточно прав, чтобы удалить чеклист');
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: projectChecklistsKey(input.projectId) });
      qc.invalidateQueries({ queryKey: ['delivery-gate', input.projectId] });
    },
  });
}

// ═══════════════════════════════════════════════════════
// Шаблоны: CRUD (owner/admin по RLS 083)
// ═══════════════════════════════════════════════════════

export interface ChecklistTemplateInput {
  checklist_type: ChecklistType;
  title: string;
  /** null — любое направление. */
  direction: 'erp' | 'iiot' | null;
  /** null — любой вид внедрения. */
  delivery_kind: 'launch' | 'experiment' | null;
  is_active: boolean;
  items: ChecklistTemplateItem[];
}

export function useCreateChecklistTemplate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ChecklistTemplateInput): Promise<ChecklistTemplate> => {
      const supabase = createClient();

      const { data: orgId, error: orgErr } = await supabase.rpc('current_org_id');
      if (orgErr) throw orgErr;
      if (!orgId) throw new Error('Нет активной организации');

      const { data, error } = await supabase
        .from('checklist_templates')
        .insert({
          org_id: orgId as string,
          checklist_type: input.checklist_type,
          title: input.title,
          direction: input.direction,
          delivery_kind: input.delivery_kind,
          is_active: input.is_active,
          items: input.items as unknown as Json,
        })
        .select('*')
        .single();
      if (error) throw error;
      return toTemplate(data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: checklistTemplatesKey() }),
  });
}

export function useUpdateChecklistTemplate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<ChecklistTemplateInput> & { id: string }): Promise<ChecklistTemplate> => {
      const supabase = createClient();
      const { items, ...rest } = patch;

      const { data, error } = await supabase
        .from('checklist_templates')
        .update({
          ...rest,
          ...(items ? { items: items as unknown as Json } : {}),
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return toTemplate(data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: checklistTemplatesKey() }),
  });
}

export function useDeleteChecklistTemplate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('checklist_templates')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Недостаточно прав, чтобы удалить шаблон');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: checklistTemplatesKey() }),
  });
}
