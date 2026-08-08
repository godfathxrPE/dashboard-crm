'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { chunkForIn } from '@/lib/utils/query-batching';
import {
  isSavableTranscriptText,
  shouldCreateNewTranscript,
} from '@/lib/domain/transcript';
import { useRealtimeSync } from './use-realtime';
import type { AiEntityType } from '@/lib/constants/ai-presets';
import type { AiRunRow, TranscriptRow, TranscriptInsert } from '@/types/database';

// 085: 'project' — сущность read-only пресетов по сделке.
export type AiRunEntity = AiEntityType;

/**
 * Сущность, к которой транскрипт вообще можно привязать. Не сужение «на всякий
 * случай»: политика `transcripts_insert` проверяет EXISTS по `calls`/`meetings`,
 * поэтому для сделки и компании запись невозможна по построению.
 */
export type TranscriptEntity = Extract<AiRunEntity, 'call' | 'meeting'>;

export function canHaveTranscript(entityType: AiRunEntity): entityType is TranscriptEntity {
  return entityType === 'call' || entityType === 'meeting';
}

/**
 * Откуда взялся текст транскрипта. 106 расширил CHECK `transcripts.source` до
 * {paste, file, audio}; 'file' в проекте не пишет никто — это задел 030 под VTT.
 *
 * Домен живёт здесь, а не в `TranscriptRow['source']`, потому что `database.ts`
 * руками не правится (правило 2 контракта). На вставке типы сходятся: клиент
 * Supabase типизирован автогенерацией, где `source?: string`.
 */
export type TranscriptSource = 'paste' | 'audio';

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

type Db = ReturnType<typeof createClient>;

/**
 * Ключи кэша, которые обязан сбросить любой, кто записал транскрипт: сама
 * расшифровка сущности и признак «есть расшифровка» для списков (бейдж).
 * Один список на всех, чтобы новый вызывающий не забыл половину.
 */
function invalidateTranscriptKeys(
  qc: ReturnType<typeof useQueryClient>,
  entityType: AiRunEntity,
  entityId: string,
) {
  qc.invalidateQueries({ queryKey: ['transcript', entityType, entityId] });
  // Префиксом: ключ витрины включает производную от списка id, и точного ключа
  // тут не знает никто — звонок может лежать сразу в нескольких открытых списках.
  qc.invalidateQueries({ queryKey: ['transcripts-presence'] });
}

/**
 * upsert транскрипта: переиспользуем последнюю строку, если текст совпал, иначе
 * заводим новую (история версий сохраняется — см. `shouldCreateNewTranscript`).
 *
 * S-AI-VIS-1: вынесено из `useStartRun`, потому что вызывающих теперь двое —
 * запуск пресета и сохранение расшифровки по факту готовности. Пустой текст сюда
 * не приходит: оба вызывающих отсекают его раньше, а молчаливый `null` из общей
 * точки записи было бы легко не заметить.
 */
export async function upsertTranscript(
  supabase: Db,
  params: {
    entityType: TranscriptEntity;
    entityId: string;
    text: string;
    source: TranscriptSource;
  },
): Promise<string> {
  const { entityType, entityId, text, source } = params;

  const { data: last } = await supabase
    .from('transcripts')
    .select('id, content')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last && !shouldCreateNewTranscript(last.content, text)) return last.id as string;

  // `org_id` не пишем — его проставляет БД (конвенция проекта).
  const insert: Omit<TranscriptInsert, 'source'> & { source: TranscriptSource } = {
    entity_type: entityType,
    entity_id: entityId,
    content: text,
    char_count: text.length,
    source,
  };
  const { data: created, error } = await supabase
    .from('transcripts')
    .insert(insert)
    .select('id')
    .single();
  if (error) throw error;
  return created.id as string;
}

/**
 * Сохранить расшифровку саму по себе, без запуска пресета.
 *
 * S-AI-VIS-1: раньше транскрипт попадал в БД только внутри `useStartRun`, то есть
 * в момент запуска пресета. Расшифровка — самостоятельная ценность (за неё уже
 * заплачено), и терять её из-за ненажатой кнопки нельзя.
 *
 * Сохранение ≠ запуск: прогон по-прежнему стартует только человек.
 */
export function useSaveTranscript() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation<
    { transcriptId: string | null },
    Error,
    { entityType: TranscriptEntity; entityId: string; text: string; source: TranscriptSource }
  >({
    mutationFn: async ({ entityType, entityId, text, source }) => {
      // Пустой/пробельный текст не сохраняется вовсе — не ошибка, просто нечего писать.
      if (!isSavableTranscriptText(text)) return { transcriptId: null };
      const transcriptId = await upsertTranscript(supabase, { entityType, entityId, text, source });
      return { transcriptId };
    },
    onSuccess: (_res, vars) => {
      invalidateTranscriptKeys(qc, vars.entityType, vars.entityId);
    },
  });
}

/**
 * Признак «у этой строки есть расшифровка» для СПИСКА звонков/встреч — один запрос
 * на весь список, а не `useTranscript` в цикле.
 *
 * Возвращает Map id → объём в знаках (последняя версия транскрипта). Содержимое не
 * тянем: списку нужен факт наличия и порядок величины, а не текст на сотню килобайт.
 */
export function useTranscriptPresence(entityType: TranscriptEntity, ids: string[]) {
  const supabase = createClient();
  // Ключ обязан включать производную от списка id (урок S-DEBT-TRUTH-1): иначе
  // ответ по одному списку переиспользуется для другого. Сортировка — чтобы
  // перестановка тех же id не считалась новым ключом.
  const idsKey = [...ids].sort().join(',');

  return useQuery({
    queryKey: ['transcripts-presence', entityType, idsKey],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const byId = new Map<string, number>();
      // `.in()` роняется и на пустом, и на слишком длинном списке — обе границы
      // держит `chunkForIn`. Пустой вход сюда не доходит (`enabled`), длинный —
      // режется; порядок между батчами не гарантирован, поэтому «последнюю версию»
      // выбираем по created_at внутри батча, а не по позиции в ответе.
      for (const batch of chunkForIn(ids)) {
        const { data, error } = await supabase
          .from('transcripts')
          .select('entity_id, char_count, created_at')
          .eq('entity_type', entityType)
          .in('entity_id', batch)
          .order('created_at', { ascending: false });
        if (error) throw error;
        for (const row of data ?? []) {
          // Первая встреченная строка id — самая свежая (сортировка по created_at desc).
          if (!byId.has(row.entity_id as string)) {
            byId.set(row.entity_id as string, (row.char_count as number) ?? 0);
          }
        }
      }
      return byId;
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
 *
 * S-R3-VOICE-1: `source` — откуда текст. 'paste' по умолчанию (человек вставил),
 * 'audio' — когда текст пришёл из `TranscribeDropzone`. Правило «изменился текст →
 * новый транскрипт» не тронуто: человек правит машинную расшифровку руками, и
 * правка не должна затирать исходную версию.
 */
export function useStartRun(entityType: AiRunEntity, entityId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation<
    { run_id: string },
    Error,
    { preset_key: string; text?: string; source?: TranscriptSource }
  >({
    mutationFn: async ({ preset_key, text, source = 'paste' }) => {
      // Путь «по сущности»: транскрипта нет и создавать его нечем.
      if (!text || text.trim() === '') {
        const { data, error } = await supabase.functions.invoke('ai-run', {
          body: { preset_key, entity_type: entityType, entity_id: entityId },
        });
        if (error) throw new Error(await invokeErrorMessage(error, 'Не удалось запустить прогон'));
        return data as { run_id: string };
      }

      // Транскрипт у сделки и у компании невозможен: `transcripts.entity_type` —
      // только call|meeting (политика transcripts_insert проверяет EXISTS по
      // calls/meetings). Сюда можно попасть только по ошибке вызывающего — падаем
      // явно, а не пишем мусор. 104: 'company' добавлена в тот же безтранскриптный путь.
      if (!canHaveTranscript(entityType)) {
        throw new Error(
          entityType === 'project'
            ? 'К сделке нельзя привязать транскрипт — запускайте прогон без текста'
            : 'К компании нельзя привязать транскрипт — запускайте прогон без текста',
        );
      }

      // 1. upsert транскрипта — общая точка записи с `useSaveTranscript`
      //    (S-AI-VIS-1): правило «изменился текст → новый транскрипт» одно на двоих.
      const transcriptId = await upsertTranscript(supabase, { entityType, entityId, text, source });

      // 2. invoke edge-функции.
      const { data, error } = await supabase.functions.invoke('ai-run', {
        body: { preset_key, transcript_id: transcriptId },
      });
      if (error) throw new Error(await invokeErrorMessage(error, 'Не удалось запустить прогон'));
      return data as { run_id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai_runs', entityType, entityId] });
      invalidateTranscriptKeys(qc, entityType, entityId);
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
