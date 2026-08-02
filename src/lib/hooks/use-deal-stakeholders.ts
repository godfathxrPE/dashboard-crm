'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import { STAKEHOLDER_ROLE_ORDER } from '@/lib/constants/stakeholders';
import type { StakeholderRole } from '@/types/database';

/**
 * S-R2-D3: карта стейкхолдеров сделки (deal_stakeholders, миграция 092).
 *
 * Форма скопирована с use-project-members.ts: ключ-префикс = имя таблицы, поэтому
 * useRealtimeSync('deal_stakeholders') инвалидирует его сам (таблица добавлена в
 * публикацию supabase_realtime миграцией 092); все мутации оптимистичны с rollback;
 * ошибки переводятся в человеческий текст.
 *
 * Основной контакт сделки (`projects.contact_id`) в этой таблице НЕ помечен флагом —
 * primary вычисляется в sortStakeholders по совпадению contact_id. Второго источника
 * истины нет намеренно (см. шапку 092).
 */

/** Контакт в карте. `phones` (jsonb) не запрашиваем — карта его не рендерит. */
export interface StakeholderContact {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
}

export interface DealStakeholder {
  id: string;
  org_id: string;
  project_id: string;
  contact_id: string;
  /** В БД `text` + CHECK deal_stakeholders_role_chk; NULL — роль ещё не понята. */
  role: StakeholderRole | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  contact: StakeholderContact | null;
}

const CONTACT_EMBED = 'contact:contacts(id, first_name, last_name, position, email, phone)';

const listKey = (projectId: string) => ['deal_stakeholders', projectId] as const;

// ═══ Чистый хелпер (без React — юнит-тестируется напрямую) ═══

/** Минимум полей, нужный сортировке. Компоненты передают полную строку. */
export interface StakeholderRow {
  id: string;
  contact_id: string;
  role: StakeholderRole | null;
  created_at: string;
}

/** Роли без места в словаре (легаси/ручной SQL) идут туда же, куда NULL, — в конец. */
function roleRank(role: StakeholderRole | null): number {
  if (!role) return Number.MAX_SAFE_INTEGER;
  const idx = STAKEHOLDER_ROLE_ORDER.indexOf(role);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

/**
 * Карта для отображения: сначала основной контакт сделки (primary — тот, чей
 * `contact_id` совпадает с `projects.contact_id`), затем остальные по
 * STAKEHOLDER_ROLE_ORDER, внутри роли — по `created_at`. Строки без роли — в конец.
 *
 * Primary сильнее роли: блокер, оказавшийся основным контактом, всё равно первый —
 * иначе строка, которую нельзя удалить, пряталась бы в хвосте списка.
 */
export function sortStakeholders<T extends StakeholderRow>(
  rows: readonly T[],
  primaryContactId: string | null,
): Array<T & { isPrimary: boolean }> {
  return rows
    .map((r) => ({ ...r, isPrimary: !!primaryContactId && r.contact_id === primaryContactId }))
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      const byRole = roleRank(a.role) - roleRank(b.role);
      if (byRole !== 0) return byRole;
      return a.created_at.localeCompare(b.created_at);
    });
}

/** Дружелюбный текст ошибок карты (сырой PG-код пользователю не показываем). */
export function parseStakeholderError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23505') return 'Контакт уже в карте сделки';
  if (e?.code === '42501') return 'Недостаточно прав: карту меняют владелец, админ или менеджер';
  if (e?.code === '23514') return 'Недопустимая роль или слишком длинная заметка';
  return e?.message ?? 'Не удалось изменить карту стейкхолдеров';
}

// ═══ Запрос ═══

export function useDealStakeholders(projectId: string) {
  const supabase = createClient();
  useRealtimeSync('deal_stakeholders');

  return useQuery({
    queryKey: listKey(projectId),
    queryFn: async (): Promise<DealStakeholder[]> => {
      const { data, error } = await supabase
        .from('deal_stakeholders')
        .select(`*, ${CONTACT_EMBED}`)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      // role в БД — text + CHECK; сужаем к union на границе хука (как ProjectMember.role).
      return (data ?? []) as unknown as DealStakeholder[];
    },
    enabled: !!projectId,
  });
}

// ═══ Мутации ═══

export interface AddStakeholderInput {
  contact_id: string;
  role: StakeholderRole | null;
  note?: string | null;
  /**
   * Снимок контакта для оптимистичной строки. В мутацию НЕ уходит — нужен только чтобы
   * строка сразу показывала имя, а не «…» до прихода invalidate.
   */
  contact?: StakeholderContact | null;
}

export function useAddStakeholder(projectId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddStakeholderInput) => {
      // `contact` — снимок для оптимистичной строки, в БД он не едет: колонки нет.
      const { data, error } = await supabase
        .from('deal_stakeholders')
        .insert({
          project_id: projectId,
          contact_id: input.contact_id,
          role: input.role,
          note: input.note ?? null,
        })
        .select(`*, ${CONTACT_EMBED}`)
        .single();

      if (error) throw error;
      return data as unknown as DealStakeholder;
    },
    onMutate: async (input) => {
      const key = listKey(projectId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<DealStakeholder[]>(key);
      const now = new Date().toISOString();
      const optimistic: DealStakeholder = {
        id: `temp-${input.contact_id}`,
        org_id: '',
        project_id: projectId,
        contact_id: input.contact_id,
        role: input.role,
        note: input.note ?? null,
        created_by: null,
        created_at: now,
        updated_at: now,
        contact: input.contact ?? null,
      };
      qc.setQueryData<DealStakeholder[]>(key, (old) => [...(old ?? []), optimistic]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(listKey(projectId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: listKey(projectId) }),
  });
}

export interface UpdateStakeholderInput {
  id: string;
  role?: StakeholderRole | null;
  note?: string | null;
}

export function useUpdateStakeholder(projectId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateStakeholderInput) => {
      const { error } = await supabase.from('deal_stakeholders').update(patch).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...patch }) => {
      const key = listKey(projectId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<DealStakeholder[]>(key);
      qc.setQueryData<DealStakeholder[]>(key, (old) =>
        (old ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(listKey(projectId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: listKey(projectId) }),
  });
}

export function useRemoveStakeholder(projectId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('deal_stakeholders').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      const key = listKey(projectId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<DealStakeholder[]>(key);
      qc.setQueryData<DealStakeholder[]>(key, (old) => (old ?? []).filter((s) => s.id !== id));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(listKey(projectId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: listKey(projectId) }),
  });
}
