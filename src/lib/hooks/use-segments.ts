'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Database, Segment, SegmentEntity, SegmentPredicate } from '@/types/database';

/**
 * Сегменты (Smart Views, R2-P0-B, миграция 077).
 *
 * ⚠️ Типы: 077 ещё не в `supabase.gen.ts` — регенерация идёт на гейте ПОСЛЕ apply,
 * а код пишется до. Таблица объявлена локальным стабом `DatabaseWithSegments`; после
 * регенерации стаб и `segmentsClient()` удаляются, `createClient()` используется напрямую.
 *
 * ⚠️ org_id пишем ЯВНО: на `segments` нет триггера set_org_id (паттерн stage_requirements /
 * invitations — org-скоуп приходит из UI, а не проставляется в БД).
 *
 * Ключ кеша без org_id — конвенция проекта (см. use-stage-requirements): смена организации
 * в этом приложении означает перелогин, кеш поднимается заново.
 */

interface SegmentRowDb {
  id: string;
  org_id: string;
  name: string;
  entity: string;
  predicate: unknown;
  is_shared: boolean;
  owner_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

type SegmentInsertDb = Omit<SegmentRowDb, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

type DatabaseWithSegments = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables'> & {
    Tables: Database['public']['Tables'] & {
      segments: {
        Row: SegmentRowDb;
        Insert: SegmentInsertDb;
        Update: Partial<SegmentInsertDb>;
        Relationships: [];
      };
    };
  };
};

function segmentsClient(): SupabaseClient<DatabaseWithSegments> {
  return createClient() as unknown as SupabaseClient<DatabaseWithSegments>;
}

const EMPTY_PREDICATE: SegmentPredicate = { version: 1, and: [] };

/** jsonb → SegmentPredicate. Мусор из БД не роняет список: пустой предикат пропускает всё. */
function toPredicate(raw: unknown): SegmentPredicate {
  if (!raw || typeof raw !== 'object') return EMPTY_PREDICATE;
  const obj = raw as { version?: unknown; and?: unknown };
  if (!Array.isArray(obj.and)) return EMPTY_PREDICATE;
  return { version: 1, and: obj.and as SegmentPredicate['and'] };
}

function toSegment(row: SegmentRowDb): Segment {
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    entity: row.entity as SegmentEntity,
    predicate: toPredicate(row.predicate),
    is_shared: row.is_shared,
    owner_id: row.owner_id,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const segmentsKey = (entity: SegmentEntity) => ['segments', entity] as const;

// ═══════════════════════════════════════════════════════
// Read — RLS отдаёт общие сегменты org + личные текущего пользователя
// ═══════════════════════════════════════════════════════

export function useSegments(entity: SegmentEntity) {
  return useQuery({
    queryKey: segmentsKey(entity),
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<Segment[]> => {
      const supabase = segmentsClient();
      const { data, error } = await supabase
        .from('segments')
        .select('*')
        .eq('entity', entity)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toSegment);
    },
  });
}

// ═══════════════════════════════════════════════════════
// Mutations — права держит RLS (077), UI лишь не показывает заведомо запрещённое
// ═══════════════════════════════════════════════════════

export interface SegmentInput {
  name: string;
  entity: SegmentEntity;
  predicate: SegmentPredicate;
  is_shared: boolean;
  sort_order?: number;
}

export function useCreateSegment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: SegmentInput): Promise<Segment> => {
      const supabase = segmentsClient();

      const [{ data: orgId, error: orgErr }, { data: auth, error: authErr }] = await Promise.all([
        supabase.rpc('current_org_id'),
        supabase.auth.getUser(),
      ]);
      if (orgErr) throw orgErr;
      if (authErr) throw authErr;
      if (!orgId) throw new Error('Нет активной организации');

      const uid = auth.user?.id ?? null;
      if (!input.is_shared && !uid) throw new Error('Не удалось определить пользователя');

      const { data, error } = await supabase
        .from('segments')
        .insert({
          org_id: orgId as string,
          name: input.name,
          entity: input.entity,
          predicate: input.predicate,
          is_shared: input.is_shared,
          // Инвариант segments_owner_shape (077): у общего сегмента владельца нет —
          // право правки даёт роль owner/admin, а не авторство.
          owner_id: input.is_shared ? null : uid,
          sort_order: input.sort_order ?? 0,
          // `as never` — идиома репозитория (use-contacts/use-companies): postgrest-js@2.100
          // не выводит Insert через SupabaseClient-generic; строка проверена типом выше.
        } satisfies SegmentInsertDb as never)
        .select('*')
        .single();
      if (error) throw error;
      return toSegment(data as SegmentRowDb);
    },
    onSettled: (_data, _err, input) =>
      qc.invalidateQueries({ queryKey: segmentsKey(input.entity) }),
  });
}

export function useUpdateSegment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<SegmentInput> & { id: string; entity: SegmentEntity }): Promise<Segment> => {
      const supabase = segmentsClient();

      // Перевод личного сегмента в общий обязан обнулить owner_id в том же патче —
      // иначе WITH CHECK политики segments_update / CHECK segments_owner_shape откажут.
      let ownerPatch: { owner_id?: string | null } = {};
      if (patch.is_shared === true) {
        ownerPatch = { owner_id: null };
      } else if (patch.is_shared === false) {
        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!auth.user?.id) throw new Error('Не удалось определить пользователя');
        ownerPatch = { owner_id: auth.user.id };
      }

      const { data, error } = await supabase
        .from('segments')
        .update({ ...patch, ...ownerPatch } satisfies Partial<SegmentInsertDb> as never)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return toSegment(data as SegmentRowDb);
    },
    onSettled: (_data, _err, vars) => qc.invalidateQueries({ queryKey: segmentsKey(vars.entity) }),
  });
}

export function useDeleteSegment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; entity: SegmentEntity }): Promise<void> => {
      const supabase = segmentsClient();
      // RLS-deny на DELETE возвращает 0 строк БЕЗ ошибки (грабля S-GANTT-BASELINE-1):
      // просим строку назад и по пустому ответу отличаем «нет прав» от успеха.
      const { data, error } = await supabase.from('segments').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Недостаточно прав, чтобы удалить сегмент');
    },
    onSettled: (_data, _err, vars) => qc.invalidateQueries({ queryKey: segmentsKey(vars.entity) }),
  });
}

/**
 * Может ли текущий пользователь править сегмент. Зеркало RLS (077) на клиенте —
 * второй слой, не замена: отказ всё равно придёт из БД.
 */
export function canEditSegment(
  segment: Segment,
  role: string | null | undefined,
  uid: string | null | undefined,
): boolean {
  if (segment.is_shared) return role === 'owner' || role === 'admin';
  return !!uid && segment.owner_id === uid;
}
