'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { localDateKey } from '@/lib/utils/date-helpers';
import {
  activeSnoozeKeys,
  type QueueSnooze,
  type SnoozeEntityType,
} from '@/lib/domain/queue-snooze';
import type { Database } from '@/types/database';

/**
 * S-QUEUE-1: личный snooze строки очереди дня (`queue_snoozes`, миграция 129).
 *
 * Миграция 129 применена гейтом (ledger `20260823182046`), типы сгенерированы —
 * форма строки берётся из `supabase.gen.ts`, приведений имени таблицы и результата нет.
 *
 * Realtime не вешается намеренно: таблица в публикацию не добавляется (см. шапку 129) —
 * чужие snooze по построению не видны, свои приходят оптимистичной мутацией.
 */

/**
 * Ровно те колонки, которые читает очередь, — `Pick` по сгенерированной `Row`
 * (весь `Row` тянул бы `org_id`/`created_by`/таймстемпы, которые тут не нужны, и
 * заставлял бы `select('*')`). Расхождение со списком в `.select()` поймает tsc.
 */
type QueueSnoozeRow = Pick<
  Database['public']['Tables']['queue_snoozes']['Row'],
  'id' | 'entity_type' | 'entity_id' | 'until'
>;

/** Список колонок один и тот же для типа выше и для запроса — держать синхронно. */
const SNOOZE_COLUMNS = 'id, entity_type, entity_id, until';

const QUEUE_SNOOZES_KEY = ['queue_snoozes'] as const;

/**
 * Сужение к union на границе хука — тот же приём, что у `ProjectMember.role` и
 * `DealStakeholder.role`. В БД `entity_type` это `text` + CHECK
 * `queue_snoozes_entity_type_chk`, а не enum-тип, поэтому автогенерация честно
 * отдаёт `string`: сузить его может только код, знающий про CHECK.
 */
function toQueueSnooze(row: QueueSnoozeRow): QueueSnooze {
  return {
    id: row.id,
    entity_type: row.entity_type as SnoozeEntityType,
    entity_id: row.entity_id,
    until: row.until,
  };
}

/** Дружелюбный текст ошибки (сырой PG-код пользователю не показываем). */
export function parseQueueSnoozeError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  // 42P01 — таблицы нет. В проде это уже не случится (129 применена `20260823182046`),
  // ветка остаётся защитой от локальной/ветковой БД, где миграцию не накатывали:
  // человеческий текст вместо `relation "queue_snoozes" does not exist`.
  if (e?.code === '42P01') return 'Отложить пока нельзя: обновление базы не применено';
  if (e?.code === '42501') return 'Недостаточно прав, чтобы отложить строку';
  return e?.message ?? 'Не удалось отложить строку';
}

// ═══ Запрос ═══

export interface UseQueueSnoozesResult {
  /** Активные на сегодня snooze — для блока «Отложено · показать». */
  snoozes: QueueSnooze[];
  /** Ключи `type:id` тех же строк — для дешёвой проверки в фильтрах секций. */
  keys: Set<string>;
}

/**
 * Только АКТИВНЫЕ snooze: срез по `until >= сегодня` делается на сервере, чтобы
 * вчерашние строки не приезжали в клиент вовсе. Клиентский `activeSnoozeKeys`
 * поверх — не дубль: между загрузкой и полуночью день может смениться.
 */
export function useQueueSnoozes(): UseQueueSnoozesResult {
  const supabase = createClient();

  const { data = [] } = useQuery({
    queryKey: QUEUE_SNOOZES_KEY,
    queryFn: async (): Promise<QueueSnooze[]> => {
      const { data: rows, error } = await supabase
        .from('queue_snoozes')
        .select(SNOOZE_COLUMNS)
        .gte('until', localDateKey());

      if (error) throw error;
      return (rows ?? []).map(toQueueSnooze);
    },
    // 42P01 в среде без миграции ретраить бессмысленно (см. parseQueueSnoozeError).
    retry: false,
  });

  const keys = useMemo(() => activeSnoozeKeys(data, localDateKey()), [data]);
  return { snoozes: data, keys };
}

// ═══ Мутации ═══

export interface SnoozeInput {
  entity_type: SnoozeEntityType;
  entity_id: string;
}

/** Ключ дня «завтра» — то же выражение, что уже считает TodayView. */
export function tomorrowKey(now: Date = new Date()): string {
  return localDateKey(new Date(now.getTime() + 86400000));
}

/**
 * Отложить строку до завтра. UPSERT по `(created_by, entity_type, entity_id)`:
 * повторный клик ПРОДЛЕВАЕТ срок, а не плодит вторую строку.
 *
 * ⚠️ `org_id` не передаём — его ставит `trg_set_org_id` (конвенция проекта).
 * `created_by` тоже не передаём: колонка `default auth.uid()`, а конфликт-таргет
 * PostgREST разрешает по уникальному индексу, а не по составу payload.
 */
export function useSnooze() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: SnoozeInput) => {
      const { error } = await supabase.from('queue_snoozes').upsert(
        {
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          until: tomorrowKey(),
        },
        { onConflict: 'created_by,entity_type,entity_id' },
      );
      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: QUEUE_SNOOZES_KEY });
      const previous = qc.getQueryData<QueueSnooze[]>(QUEUE_SNOOZES_KEY);
      const optimistic: QueueSnooze = {
        // temp-id включает сущность: два быстрых клика по разным строкам не схлопнутся.
        id: `temp-${input.entity_type}-${input.entity_id}`,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        until: tomorrowKey(),
      };
      qc.setQueryData<QueueSnooze[]>(QUEUE_SNOOZES_KEY, (old) => [
        // upsert по своей сути — замена: старую строку той же сущности выкидываем.
        ...(old ?? []).filter(
          (s) => !(s.entity_type === input.entity_type && s.entity_id === input.entity_id),
        ),
        optimistic,
      ]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(QUEUE_SNOOZES_KEY, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUEUE_SNOOZES_KEY }),
  });
}

/** Вернуть строку в очередь: физическое удаление snooze (hard delete — конвенция). */
export function useUnsnooze() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('queue_snoozes').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QUEUE_SNOOZES_KEY });
      const previous = qc.getQueryData<QueueSnooze[]>(QUEUE_SNOOZES_KEY);
      qc.setQueryData<QueueSnooze[]>(QUEUE_SNOOZES_KEY, (old) =>
        (old ?? []).filter((s) => s.id !== id),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(QUEUE_SNOOZES_KEY, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUEUE_SNOOZES_KEY }),
  });
}
