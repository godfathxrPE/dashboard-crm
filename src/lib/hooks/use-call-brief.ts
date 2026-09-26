'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

/**
 * S-DEAL-ACTIVITY-VIEW-1 (W5): длительность и собеседник ОДНОГО звонка — для меты
 * «Последнего события» («Звонок · 5 сентября, 10:42 · 12 мин · Наталья Н. · Олег»).
 *
 * Лента (`entity_timeline`) этих полей не несёт, и расширять RPC ради одного блока
 * не стали: запрос один и только на звонок-якорь.
 *
 * ⚠️ Ключ НЕ под префиксом `['calls']`: там живёт список звонков организации с
 * оптимистичным `setQueryData`, и чужая форма данных под тем же префиксом ломала бы
 * его. Инвалидация — рядом с `['timeline']` в мутациях `use-calls.ts`.
 *
 * `maybeSingle()`: удалённый или закрытый RLS звонок — `null` (сегменты не рисуются).
 */
export interface CallBrief {
  id: string;
  duration_s: number | null;
  contact: { first_name: string | null; last_name: string | null } | null;
}

export const CALL_BRIEF_KEY = 'call-brief';

async function fetchCallBrief(callId: string): Promise<CallBrief | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('calls')
    .select('id, duration_s, contact:contacts(first_name, last_name)')
    .eq('id', callId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // Embed по FK many-to-one — объект или null; массив не ожидается, но типы
  // PostgREST этого не гарантируют — берём первый элемент, если он пришёл.
  const raw: unknown = data.contact;
  const one = Array.isArray(raw) ? raw[0] : raw;
  const contact =
    one && typeof one === 'object'
      ? {
          first_name: (one as { first_name?: string | null }).first_name ?? null,
          last_name: (one as { last_name?: string | null }).last_name ?? null,
        }
      : null;
  return { id: data.id, duration_s: data.duration_s, contact };
}

export function useCallBrief(callId: string | null) {
  return useQuery({
    queryKey: [CALL_BRIEF_KEY, callId],
    queryFn: () => fetchCallBrief(callId as string),
    enabled: !!callId,
    staleTime: 5 * 60_000,
  });
}
