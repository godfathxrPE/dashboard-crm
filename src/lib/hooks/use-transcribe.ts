'use client';

import { useCallback, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { prepareChunks, type PrepareProgress } from '@/lib/transcribe/audio';
import { splitIntoBlocks } from '@/lib/transcribe/cleanup-prompt';
import {
  buildTail,
  segmentsToText,
  stripHallucinations,
  type WhisperSegment,
} from '@/lib/transcribe/hallucinations';
import type { WhisperModel } from '@/lib/transcribe/cost';
import type { Database } from '@/types/database';

/**
 * S-R3-VOICE-1: пайплайн «аудио → текст» целиком на клиенте.
 *
 * Аудио НИКУДА не сохраняется: файл декодируется в браузере, чанк за чанком уходит
 * в edge `transcribe` и забывается. `transcripts.storage_path` остаётся null.
 *
 * Состояние держим в `useState`, а не в TanStack Query: это не данные сервера, а
 * ход одноразовой операции, кэшировать и инвалидировать тут нечего.
 *
 * S-FIX-VOICE-1 — ГЛАВНЫЙ ИНВАРИАНТ: **ни один сбой после того, как получен хоть
 * какой-то распознанный текст, не приводит к пустому результату.** Распознавание
 * стоит денег и минут; вычитка — необязательная надстройка над ним. Отсюда три
 * правила ниже, и ни одно из них не «на всякий случай»:
 *  • упал блок вычитки → в результат идёт его СЫРОЙ текст, цикл продолжается;
 *  • упало распознавание на середине → сохраняем распознанное, дальше не идём;
 *  • любой из этих исходов — фаза `partial`, а не `error`: текст на руках есть.
 */

/** Хвост предыдущего чанка как контекст следующего: держит термины и не даёт начать фразу с нуля. */
const TAIL_CHARS = 300;
/** Хвост вычитанного текста для следующего блока — иначе сбивается нумерация говорящих. */
const CLEAN_TAIL_CHARS = 600;
/** Больше — почти наверняка не разговор, а концерт: отбиваем до декодирования. */
const MAX_FILE_MB = 300;
/** Пауза перед единственным повтором блока вычитки. */
const RETRY_DELAY_MS = 2_000;

export type TranscribePhase =
  | { name: 'idle' }
  | { name: 'preparing'; detail: string }
  | { name: 'transcribing'; done: number; total: number }
  | { name: 'cleaning'; done: number; total: number }
  | { name: 'done' }
  /** Текст распознан, но вычитан не полностью (или распознан не до конца). `raw` на руках. */
  | { name: 'partial'; message: string }
  /** Текста нет вовсе — спасать нечего. */
  | { name: 'error'; message: string };

export type TranscribeOptions = {
  /** ISO 639-1; пусто — автоопределение Whisper. */
  language: string;
  model: WhisperModel;
  /** Вычитка Claude. Без неё текст — сплошной поток без говорящих. */
  cleanup: boolean;
  /** Имена и термины: уходят и в Whisper (initial prompt), и в Claude (эталон написания). */
  terms: string;
  /** Кто участвует — якорь для разметки говорящих при вычитке. */
  context: string;
};

export type TranscribeOutcome = {
  /** Лучший текст, который есть: вычитанный, а где вычитка не удалась — сырой. */
  text: string;
  /** false — часть работы не доделана; текст годен, но человека надо предупредить. */
  complete: boolean;
};

/** Разбор ошибки `functions.invoke`: код нужен, чтобы отличать обрыв от нашей валидации. */
async function describeInvokeError(
  error: unknown,
  fallback: string,
): Promise<{ status: number | null; message: string }> {
  const response = (error as { context?: Response }).context;
  const status = typeof response?.status === 'number' ? response.status : null;
  try {
    const body = await response?.json();
    if (body?.error) return { status, message: body.error as string };
  } catch {
    /* тела нет или оно не JSON — так отвечает шлюз, а не наша функция */
  }
  // 502/504 от шлюза приходят без нашего тела: объясняем сами, иначе человек увидит
  // голый номер и решит, что сломался интерфейс.
  if (status === 502 || status === 503 || status === 504) {
    return { status, message: 'Сервис оборвал соединение, не дождавшись ответа модели' };
  }
  return { status, message: fallback };
}

/** Обрыв связи, а не отказ по существу: повторять имеет смысл только это. */
function isRetryable(status: number | null): boolean {
  return status === null || status === 502 || status === 503 || status === 504;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Один блок вычитки, один повтор на обрыве.
 *
 * Повтор нужен именно КЛИЕНТСКИЙ: 502 приходит от шлюза Supabase, до кода функции
 * запрос не доходит, и серверный retry (как у Groq внутри edge) тут не сработал бы.
 * На 400/422 — нашей валидации — повтор бессмыслен: ответ не изменится.
 */
async function cleanupBlock(
  supabase: SupabaseClient<Database>,
  text: string,
  previousTail: string,
  opts: TranscribeOptions,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.functions.invoke('transcribe', {
      body: {
        action: 'cleanup',
        text,
        terms: opts.terms.trim() || undefined,
        context: opts.context.trim() || undefined,
        previousTail: previousTail || undefined,
      },
    });

    if (!error) {
      const cleaned = String((data as { text?: string } | null)?.text ?? '').trim();
      return cleaned
        ? { ok: true, text: cleaned }
        : { ok: false, message: 'Вычитка вернула пустой ответ' };
    }

    const described = await describeInvokeError(error, 'Не удалось вычитать текст');
    if (isRetryable(described.status) && attempt === 0) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    return { ok: false, message: described.message };
  }
  return { ok: false, message: 'Не удалось вычитать текст' };
}

export function useTranscribe() {
  const [phase, setPhase] = useState<TranscribePhase>({ name: 'idle' });
  const [raw, setRaw] = useState('');
  const [clean, setClean] = useState('');

  // Отменённый прогон не должен дописывать текст в поле после ухода пользователя.
  const cancelledRef = useRef(false);
  // Сырой текст нужен обработчикам вне рендера (повтор вычитки) — состояние там протухает.
  const rawRef = useRef('');
  // Тот же файл или уже другой: определяет, можно ли переиспользовать распознанное.
  const fileRef = useRef<Blob | null>(null);

  const busy =
    phase.name === 'preparing' || phase.name === 'transcribing' || phase.name === 'cleaning';

  const storeRaw = useCallback((value: string) => {
    rawRef.current = value;
    setRaw(value);
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    setPhase({ name: 'idle' });
    storeRaw('');
    setClean('');
    fileRef.current = null;
  }, [storeRaw]);

  /**
   * Этап 2 по готовому сырому тексту. Groq не трогает вовсе — это и есть смысл
   * «Повторить вычитку»: распознавание уже оплачено, платить за него дважды незачем.
   *
   * Упавший блок НЕ прерывает цикл: в результат идёт его сырой текст. Кусок без
   * пунктуации читается плохо, дыра в разговоре — не читается никак.
   */
  const cleanupText = useCallback(
    async (
      rawText: string,
      opts: TranscribeOptions,
      carryOver: string,
    ): Promise<TranscribeOutcome | null> => {
      const supabase = createClient();
      const blocks = splitIntoBlocks(rawText);
      const parts: string[] = [];
      let failed = 0;
      let lastMessage = '';

      for (let i = 0; i < blocks.length; i++) {
        if (cancelledRef.current) return null;
        setPhase({ name: 'cleaning', done: i, total: blocks.length });

        const result = await cleanupBlock(
          supabase,
          blocks[i],
          parts.join('\n').slice(-CLEAN_TAIL_CHARS),
          opts,
        );
        if (result.ok) {
          parts.push(result.text);
        } else {
          failed++;
          lastMessage = result.message;
          parts.push(blocks[i]);
        }
        setClean(parts.join('\n'));
      }

      if (cancelledRef.current) return null;

      const text = parts.join('\n').trim() || rawText;
      if (failed > 0) {
        const tail = carryOver ? ` ${carryOver}` : '';
        setPhase({
          name: 'partial',
          message:
            `Вычитано ${blocks.length - failed} из ${blocks.length} блоков — ` +
            `остальные вставлены как есть. ${lastMessage}.${tail}`,
        });
        return { text, complete: false };
      }
      if (carryOver) {
        setPhase({ name: 'partial', message: carryOver });
        return { text, complete: false };
      }
      setPhase({ name: 'done' });
      return { text, complete: true };
    },
    [],
  );

  /** Повтор ТОЛЬКО вычитки по уже распознанному тексту. */
  const retryCleanup = useCallback(
    async (opts: TranscribeOptions): Promise<TranscribeOutcome | null> => {
      const rawText = rawRef.current.trim();
      if (!rawText) return null;
      cancelledRef.current = false;
      setClean('');
      return cleanupText(rawText, opts, '');
    },
    [cleanupText],
  );

  const run = useCallback(
    async (file: Blob, opts: TranscribeOptions): Promise<TranscribeOutcome | null> => {
      const supabase = createClient();
      cancelledRef.current = false;

      // Тот же файл уже распознан (прошлый прогон закончился `partial`) — гнать Groq
      // заново незачем: это те же минуты и те же деньги за тот же результат.
      if (fileRef.current === file && rawRef.current.trim() && opts.cleanup) {
        setClean('');
        return cleanupText(rawRef.current.trim(), opts, '');
      }

      fileRef.current = file;
      storeRaw('');
      setClean('');

      try {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          throw new Error(`Файл больше ${MAX_FILE_MB} МБ — разделите его на части.`);
        }

        setPhase({ name: 'preparing', detail: 'Читаю файл…' });
        const chunks = await prepareChunks(file, (p: PrepareProgress) => {
          if (p.stage === 'decoding') setPhase({ name: 'preparing', detail: 'Декодирую аудио…' });
          if (p.stage === 'resampling')
            setPhase({ name: 'preparing', detail: 'Ищу паузы для нарезки…' });
          if (p.stage === 'chunking')
            setPhase({ name: 'preparing', detail: `Нарезаю: ${p.done + 1} из ${p.total}` });
        });
        if (chunks.length === 0) {
          throw new Error('В записи только тишина — распознавать нечего.');
        }

        // 1. Распознавание. Хвост предыдущего чанка уходит в prompt следующего.
        const parts: string[] = [];
        // Непустая строка = распознавание оборвалось, но что-то уже есть.
        let interrupted = '';

        for (let i = 0; i < chunks.length; i++) {
          if (cancelledRef.current) return null;
          setPhase({ name: 'transcribing', done: i, total: chunks.length });

          // FormData, а не base64 в JSON: `functions.invoke` отдаёт FormData как есть
          // и сам ставит boundary (Content-Type не трогает), а base64 раздул бы тело
          // на треть и добавил перекодировку на обеих сторонах.
          const form = new FormData();
          form.append('action', 'transcribe');
          form.append('file', chunks[i].blob, chunks[i].filename);
          if (opts.language) form.append('language', opts.language);
          form.append('model', opts.model);
          if (opts.terms.trim()) form.append('terms', opts.terms.trim());
          // Хвост берём из УЖЕ ОЧИЩЕННОГО текста: иначе субтитровый штамп уедет в
          // prompt следующего фрагмента, и Whisper продолжит его сам — петля.
          const tail = buildTail(parts, TAIL_CHARS);
          if (tail) form.append('previousTail', tail);

          const { data, error } = await supabase.functions.invoke('transcribe', { body: form });
          if (error) {
            const described = await describeInvokeError(error, 'Не удалось распознать аудио');
            // Первый же фрагмент — спасать нечего, это обычная ошибка.
            if (parts.length === 0) throw new Error(described.message);
            // Иначе останавливаемся и сохраняем распознанное: выбросить 30 успешных
            // фрагментов из-за 31-го — ровно та потеря, ради которой затеян фикс.
            interrupted = `Распознано ${i} фрагментов из ${chunks.length}: ${described.message}.`;
            break;
          }

          // S-FIX-VOICE-2. Порядок обязателен: сегменты → фильтр по МЕТРИКАМ
          // (структурный признак) → `stripHallucinations` (список известных штампов,
          // вторая линия) → `buildTail` выше. Хвост собирается из уже очищенного —
          // петля самоусиления рвётся там же, где и раньше.
          const payload = data as { text?: string; segments?: WhisperSegment[] } | null;
          const text = stripHallucinations(
            segmentsToText(payload?.segments, String(payload?.text ?? '')),
          );
          // Фрагмент, от которого после чистки ничего не осталось, — это была пауза.
          if (text) parts.push(text);
          storeRaw(parts.join(' '));
        }

        const rawText = parts.join(' ').trim();
        if (!rawText) throw new Error('Распознавание вернуло пустой текст.');
        storeRaw(rawText);

        // 2. Вычитка Claude — пунктуация, реплики, термины. Блоки режет клиент по
        // границам предложений, хвост предыдущего результата уходит в следующий запрос.
        if (!opts.cleanup) {
          if (interrupted) {
            setPhase({ name: 'partial', message: interrupted });
            return { text: rawText, complete: false };
          }
          setPhase({ name: 'done' });
          return { text: rawText, complete: true };
        }

        return cleanupText(rawText, opts, interrupted);
      } catch (e) {
        if (cancelledRef.current) return null;
        const message = e instanceof Error ? e.message : 'Неизвестная ошибка';

        // Страховка инвариантa: даже неожиданное исключение не отменяет распознанное.
        const rescued = rawRef.current.trim();
        if (rescued) {
          setPhase({ name: 'partial', message });
          return { text: rescued, complete: false };
        }
        setPhase({ name: 'error', message });
        return null;
      }
    },
    [cleanupText, storeRaw],
  );

  return { phase, raw, clean, busy, run, retryCleanup, reset };
}
