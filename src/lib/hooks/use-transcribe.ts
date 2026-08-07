'use client';

import { useCallback, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { prepareChunks, type PrepareProgress } from '@/lib/transcribe/audio';
import { splitIntoBlocks } from '@/lib/transcribe/cleanup-prompt';
import type { WhisperModel } from '@/lib/transcribe/cost';

/**
 * S-R3-VOICE-1: пайплайн «аудио → текст» целиком на клиенте.
 *
 * Аудио НИКУДА не сохраняется: файл декодируется в браузере, чанк за чанком уходит
 * в edge `transcribe` и забывается. `transcripts.storage_path` остаётся null.
 *
 * Состояние держим в `useState`, а не в TanStack Query: это не данные сервера, а
 * ход одноразовой операции, кэшировать и инвалидировать тут нечего.
 */

/** Хвост предыдущего чанка как контекст следующего: держит термины и не даёт начать фразу с нуля. */
const TAIL_CHARS = 300;
/** Хвост вычитанного текста для следующего блока — иначе сбивается нумерация говорящих. */
const CLEAN_TAIL_CHARS = 600;
/** Больше — почти наверняка не разговор, а концерт: отбиваем до декодирования. */
const MAX_FILE_MB = 300;

export type TranscribePhase =
  | { name: 'idle' }
  | { name: 'preparing'; detail: string }
  | { name: 'transcribing'; done: number; total: number }
  | { name: 'cleaning'; done: number; total: number }
  | { name: 'done' }
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

/** Ошибка edge-функции: человеческий текст лежит в теле, а не в `error.message`. */
async function invokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    const body = await (error as { context?: Response }).context?.json();
    if (body?.error) return body.error as string;
  } catch {
    /* нейтральное сообщение по умолчанию */
  }
  return fallback;
}

export function useTranscribe() {
  const [phase, setPhase] = useState<TranscribePhase>({ name: 'idle' });
  const [raw, setRaw] = useState('');
  const [clean, setClean] = useState('');
  // Отменённый прогон не должен дописывать текст в поле после ухода пользователя.
  const cancelledRef = useRef(false);

  const busy =
    phase.name === 'preparing' || phase.name === 'transcribing' || phase.name === 'cleaning';

  const reset = useCallback(() => {
    cancelledRef.current = true;
    setPhase({ name: 'idle' });
    setRaw('');
    setClean('');
  }, []);

  const run = useCallback(async (file: Blob, opts: TranscribeOptions): Promise<string | null> => {
    const supabase = createClient();
    cancelledRef.current = false;
    setRaw('');
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

      // 1. Распознавание. Хвост предыдущего чанка уходит в prompt следующего.
      const parts: string[] = [];
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
        const tail = parts.join(' ').slice(-TAIL_CHARS);
        if (tail) form.append('previousTail', tail);

        const { data, error } = await supabase.functions.invoke('transcribe', { body: form });
        if (error) throw new Error(await invokeErrorMessage(error, 'Не удалось распознать аудио'));

        parts.push(String((data as { text?: string } | null)?.text ?? '').trim());
        setRaw(parts.join(' '));
      }

      const rawText = parts.join(' ').trim();
      if (!rawText) throw new Error('Распознавание вернуло пустой текст.');
      if (!opts.cleanup) {
        setPhase({ name: 'done' });
        return rawText;
      }

      // 2. Вычитка Claude — пунктуация, реплики, термины. Блоки режет клиент по
      // границам предложений, хвост предыдущего результата уходит в следующий запрос.
      const blocks = splitIntoBlocks(rawText);
      const cleanedParts: string[] = [];
      for (let i = 0; i < blocks.length; i++) {
        if (cancelledRef.current) return null;
        setPhase({ name: 'cleaning', done: i, total: blocks.length });

        const { data, error } = await supabase.functions.invoke('transcribe', {
          body: {
            action: 'cleanup',
            text: blocks[i],
            terms: opts.terms.trim() || undefined,
            context: opts.context.trim() || undefined,
            previousTail: cleanedParts.join('\n').slice(-CLEAN_TAIL_CHARS) || undefined,
          },
        });
        if (error) throw new Error(await invokeErrorMessage(error, 'Не удалось вычитать текст'));

        cleanedParts.push(String((data as { text?: string } | null)?.text ?? '').trim());
        setClean(cleanedParts.join('\n'));
      }

      setPhase({ name: 'done' });
      return cleanedParts.join('\n').trim() || rawText;
    } catch (e) {
      if (cancelledRef.current) return null;
      setPhase({ name: 'error', message: e instanceof Error ? e.message : 'Неизвестная ошибка' });
      return null;
    }
  }, []);

  return { phase, raw, clean, busy, run, reset };
}
