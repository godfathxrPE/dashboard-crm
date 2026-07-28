'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import type { AiEntityType } from '@/lib/constants/ai-presets';
import type { AiRunRow, TranscriptRow, TranscriptInsert } from '@/types/database';

// 085: 'project' — сущность read-only пресетов по сделке.
export type AiRunEntity = AiEntityType;

/** Разбор ошибки invoke: edge отдаёт человеческий текст в теле, а не в error.message. */
async function invokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    const body = await (error as { context?: Response }).context?.json();
    if (body?.error) return body.error as string;
  } catch { /* нейтральное сообщение по умолчанию */ }
  return fallback;
}

/** Последний транскрипт сущности (по created_at). */
export function useTranscript(entityType: AiRunEntity, entityId: string | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['transcript', entityType, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<TranscriptRow | null> => {
      const { data, error } = await supabase
        .from('transcripts')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as TranscriptRow | null;
    },
  });
}

/** Лента прогонов сущности (свежий сверху). Realtime + страховка-поллинг при активном прогоне. */
export function useEntityRuns(entityType: AiRunEntity, entityId: string | null) {
  const supabase = createClient();
  // Realtime по ai_runs: строка pending→running→done переедет сама (invalidate по префиксу ['ai_runs']).
  useRealtimeSync('ai_runs');

  return useQuery({
    queryKey: ['ai_runs', entityType, entityId],
    enabled: !!entityId,
    // Страховка: policy ai_runs_select содержит EXISTS-подзапрос — если walrus не осилит
    // его оценку и Realtime не доедет, при активном прогоне добираем поллингом + фокусом окна.
    refetchInterval: (query) => {
      const rows = query.state.data as AiRunRow[] | undefined;
      const hasActive = rows?.some((r) => r.status === 'pending' || r.status === 'running');
      // 3с, пока прогон активен: прогон идёт ~30с, на 60с ощущалось как «зависло»
      // (Realtime по ai_runs часто не доезжает — walrus не тянет EXISTS в SELECT-политике).
      return hasActive ? 3_000 : false;
    },
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AiRunRow[]> => {
      const { data, error } = await supabase
        .from('ai_runs')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiRunRow[];
    },
  });
}

/**
 * Запуск прогона.
 *
 * Два пути (085), выбор — по наличию текста транскрипта:
 *  • текст есть → upsert транскрипта (изменился текст → новый транскрипт, история
 *    прогонов остаётся) → invoke `{ preset_key, transcript_id }`;
 *  • текста нет → транскрипт НЕ создаётся, invoke `{ preset_key, entity_type, entity_id }`
 *    и прогон идёт по полям сущности. Пресет, которому транскрипт обязателен, edge
 *    отобьёт четырёхсоткой с внятным текстом.
 *
 * Ключ Anthropic на клиент не попадает ни в одном из путей.
 */
export function useStartRun(entityType: AiRunEntity, entityId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation<{ run_id: string }, Error, { preset_key: string; text?: string }>({
    mutationFn: async ({ preset_key, text }) => {
      // Путь «по сущности»: транскрипта нет и создавать его нечем.
      if (!text || text.trim() === '') {
        const { data, error } = await supabase.functions.invoke('ai-run', {
          body: { preset_key, entity_type: entityType, entity_id: entityId },
        });
        if (error) throw new Error(await invokeErrorMessage(error, 'Не удалось запустить прогон'));
        return data as { run_id: string };
      }

      // Транскрипт у сделки невозможен: `transcripts.entity_type` — только call|meeting
      // (политика transcripts_insert проверяет EXISTS по calls/meetings). Сюда можно
      // попасть только по ошибке вызывающего — падаем явно, а не пишем мусор.
      if (entityType === 'project') {
        throw new Error('К сделке нельзя привязать транскрипт — запускайте прогон без текста');
      }

      // 1. upsert транскрипта: переиспользуем последний, если текст совпал, иначе новый.
      const { data: last } = await supabase
        .from('transcripts')
        .select('id, content')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let transcriptId: string;
      if (last && last.content === text) {
        transcriptId = last.id as string;
      } else {
        const insert: TranscriptInsert = {
          entity_type: entityType,
          entity_id: entityId,
          content: text,
          char_count: text.length,
          source: 'paste',
        };
        const { data: created, error: insErr } = await supabase
          .from('transcripts')
          .insert(insert)
          .select('id')
          .single();
        if (insErr) throw insErr;
        transcriptId = created.id as string;
      }

      // 2. invoke edge-функции.
      const { data, error } = await supabase.functions.invoke('ai-run', {
        body: { preset_key, transcript_id: transcriptId },
      });
      if (error) throw new Error(await invokeErrorMessage(error, 'Не удалось запустить прогон'));
      return data as { run_id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai_runs', entityType, entityId] });
      qc.invalidateQueries({ queryKey: ['transcript', entityType, entityId] });
    },
  });
}

/** Оценка прогона: 👍/👎 (+ опциональная заметка «что не так» при 👎). */
export function useRunRating() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation<void, Error, { runId: string; rating: -1 | 1; note?: string | null }>({
    mutationFn: async ({ runId, rating, note }) => {
      const { error } = await supabase
        .from('ai_runs')
        .update({ rating, feedback_note: note ?? null })
        .eq('id', runId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai_runs'] });
    },
  });
}
