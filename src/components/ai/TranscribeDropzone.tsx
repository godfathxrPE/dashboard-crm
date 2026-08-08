'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  AlertTriangle,
  FileAudio,
  Loader2,
  Mic,
  RotateCw,
  Square,
  Upload,
  X,
} from 'lucide-react';
import { useTranscribe } from '@/lib/hooks/use-transcribe';
import { probeDuration } from '@/lib/transcribe/audio';
import { estimateTranscribeCost, formatDuration, type WhisperModel } from '@/lib/transcribe/cost';

/**
 * S-R3-VOICE-1: вкладка «Аудио» в зоне транскрипта — файл, drag&drop или запись
 * с микрофона превращаются в текст и кладутся в поле вкладки «Вставить».
 *
 * Автозапуска прогона нет намеренно: расшифровка — машинная, человек читает её
 * глазами и правит, прежде чем тратить деньги на пресет.
 *
 * Аудио не сохраняется ни в Storage, ни в БД: оно живёт в памяти вкладки, уходит
 * чанками в edge `transcribe` и забывается.
 */

interface TranscribeDropzoneProps {
  /**
   * Готовый текст → в textarea вкладки «Вставить».
   *
   * S-AI-VIS-1: второй аргумент — вычитан ли текст целиком. Частичный результат
   * тоже уходит наверх и тоже сохраняется: за распознавание уже заплачено, и текст
   * с сырыми кусками лучше отсутствующего. Родителю это нужно, чтобы честно
   * подписать сохранение, а не выдать недовычитанный текст за готовый.
   */
  onResult: (text: string, complete: boolean) => void;
}

type Staged = { blob: Blob; name: string; durationSec: number | null };

export function TranscribeDropzone({ onResult }: TranscribeDropzoneProps) {
  const { phase, raw, clean, busy, run, retryCleanup, reset } = useTranscribe();

  const [staged, setStaged] = useState<Staged | null>(null);
  const [terms, setTerms] = useState('');
  const [context, setContext] = useState('');
  const [cleanup, setCleanup] = useState(true);
  const [fast, setFast] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Секундомер записи — запасной источник длительности: MediaRecorder в webm часто
  // пишет `duration: Infinity`, и метаданные её не отдают.
  const recordSecondsRef = useRef(0);

  const stageBlob = useCallback(async (blob: Blob, name: string) => {
    const probed = await probeDuration(blob);
    setStaged({ blob, name, durationSec: probed ?? (recordSecondsRef.current || null) });
  }, []);

  const onFilePicked = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      recordSecondsRef.current = 0;
      void stageBlob(file, file.name);
    },
    [stageBlob],
  );

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // iOS Safari пишет только в audio/mp4
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const parts: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) parts.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(parts, { type: recorder.mimeType });
        if (blob.size > 0) void stageBlob(blob, 'Запись с микрофона');
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
      recordSecondsRef.current = 0;
      recordTimerRef.current = setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
      }, 1000);
    } catch {
      toast.error('Нет доступа к микрофону — разрешите его в настройках браузера');
    }
  }, [stageBlob]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recorderRef.current?.stop();
    };
  }, []);

  // Ошибка — и тостом, и полосой в панели. Тост исчезает через несколько секунд:
  // на боевом прогоне 2026-08-07 владелец его пропустил и решил, что интерфейс
  // «сбросился». Сообщение обязано остаться на экране до следующего действия.
  useEffect(() => {
    if (phase.name === 'error') toast.error(phase.message);
  }, [phase]);

  const model: WhisperModel = fast ? 'whisper-large-v3-turbo' : 'whisper-large-v3';
  const cost =
    staged?.durationSec != null
      ? estimateTranscribeCost(staged.durationSec, { model, cleanup })
      : null;

  const options = { language: 'ru', model, cleanup, terms, context };

  /** Текст принят человеком — уходит в поле «Вставить», панель очищается. */
  const accept = (text: string, complete: boolean) => {
    onResult(text, complete);
    setStaged(null);
    reset();
    toast.success(
      complete
        ? 'Расшифровка готова — проверьте текст и запускайте пресет'
        : 'Текст перенесён в поле — он вычитан не полностью',
    );
  };

  const handleRun = async () => {
    if (!staged || busy) return;
    const outcome = await run(staged.blob, options);
    // Неполный результат НЕ переносим сам: человек решает — повторить вычитку или
    // взять как есть. Молча подсунуть недоделанный текст значило бы скрыть сбой.
    if (outcome?.complete) accept(outcome.text, true);
  };

  const handleRetryCleanup = async () => {
    if (busy) return;
    const outcome = await retryCleanup(options);
    if (outcome?.complete) accept(outcome.text, true);
  };

  const drop = (files: FileList | null) => {
    if (busy || recording) return;
    onFilePicked(files);
  };

  const progress =
    phase.name === 'transcribing' || phase.name === 'cleaning'
      ? Math.round(((phase.done + 0.5) / Math.max(1, phase.total)) * 100)
      : null;

  const preview = clean || raw;
  // Лучшее, что есть на руках: вычитанные блоки, а где вычитка не удалась — сырой текст.
  const bestText = (clean || raw).trim();

  return (
    <div className="space-y-3">
      {/* Зона загрузки */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          drop(e.dataTransfer.files);
        }}
        className={`rounded-lg border border-dashed p-3 text-center ${
          dragOver ? 'border-accent bg-accent-l' : 'border-border bg-surface'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/mp4,video/webm,.m4a,.ogg,.opus"
          className="hidden"
          onChange={(e) => {
            onFilePicked(e.target.files);
            e.target.value = '';
          }}
        />

        {staged ? (
          <div className="flex items-center gap-2 text-left">
            <FileAudio size={16} className="shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-text-main">{staged.name}</p>
              <p className="text-meta text-text-mute">
                {staged.durationSec != null
                  ? `${formatDuration(staged.durationSec)} · ${Math.round(staged.blob.size / 1e5) / 10} МБ`
                  : `${Math.round(staged.blob.size / 1e5) / 10} МБ · длительность неизвестна`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStaged(null);
                reset();
              }}
              disabled={busy}
              aria-label="Убрать файл"
              className="rounded p-1 text-text-mute hover:bg-surface-hover disabled:opacity-40"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              disabled={busy || recording}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-main hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <Upload size={13} /> Выбрать файл
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={recording ? stopRecording : startRecording}
              className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${
                recording
                  ? 'border-red bg-red-l text-red'
                  : 'border-border bg-surface text-text-main hover:bg-surface-hover'
              }`}
            >
              {recording ? (
                <>
                  <Square size={13} /> Стоп · {formatDuration(recordSeconds)}
                </>
              ) : (
                <>
                  <Mic size={13} /> Записать
                </>
              )}
            </button>
          </div>
        )}

        {!staged && !recording && (
          <p className="mt-2 text-meta text-text-mute">
            или перетащите файл сюда · mp3, m4a, wav, ogg, голосовые
          </p>
        )}
      </div>

      {/* Имена и термины — видимое поле: заметно поднимает точность на именах собственных */}
      <input
        type="text"
        value={terms}
        disabled={busy}
        onChange={(e) => setTerms(e.target.value)}
        placeholder="Имена и термины через запятую — Сертолово, Дарья, аппликатор"
        className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
      />
      <input
        type="text"
        value={context}
        disabled={busy}
        onChange={(e) => setContext(e.target.value)}
        placeholder="Кто участвует — я звоню на завод, отвечают Дарья и технолог"
        className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-dim">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={cleanup}
            disabled={busy}
            onChange={(e) => setCleanup(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          Вычитка Claude
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={fast}
            disabled={busy}
            onChange={(e) => setFast(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          Быстрый режим — быстрее, на русском заметно хуже
        </label>
      </div>
      {!cleanup && (
        <p className="text-meta text-text-mute">
          Без вычитки текст придёт сплошным потоком, без пунктуации и говорящих.
        </p>
      )}

      {/* Запуск + оценка */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={!staged || busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <FileAudio size={13} />}
          Расшифровать
        </button>
        {cost && (
          <span
            className="text-meta text-text-mute"
            title={`Распознавание Groq ≈ ${cost.groq} ₽${cleanup ? ` · вычитка Claude ≈ ${cost.cleanup} ₽` : ''}`}
          >
            ≈ {cost.total} ₽
          </span>
        )}
        {staged && staged.durationSec == null && (
          <span className="text-meta text-text-mute">
            длительность неизвестна — оценку покажем после расшифровки
          </span>
        )}
      </div>

      {/* Частичный успех: текст распознан, но вычитан не весь. Оба выхода — рядом с
          сообщением, чтобы не надо было гадать, что делать дальше. */}
      {phase.name === 'partial' && (
        <div className="space-y-2 rounded-lg border border-yellow bg-yellow-l p-2.5">
          <div className="flex items-start gap-1.5 text-xs text-text-main">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-yellow" />
            <span>{phase.message}</span>
          </div>
          <p className="text-meta text-text-dim">
            Текст распознан, но не вычитан — можно вставить как есть. Распознавание уже
            оплачено: повтор вычитки к Groq не обращается.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRetryCleanup}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <RotateCw size={13} /> Повторить вычитку
            </button>
            <button
              type="button"
              onClick={() => accept(bestText, false)}
              disabled={busy || !bestText}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-main hover:bg-surface-hover disabled:opacity-50"
            >
              Взять текст как есть
            </button>
          </div>
        </div>
      )}

      {/* Ошибка — в панели, а не только тостом: тост исчезает, а решение принимать надо */}
      {phase.name === 'error' && (
        <div className="flex items-start gap-1.5 rounded-lg border border-red bg-red-l p-2.5 text-xs text-red">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{phase.message}</span>
        </div>
      )}

      {/* Прогресс по этапам: часовая запись идёт минуты — человек обязан видеть, на чём стоит */}
      {busy && (
        <div role="status" className="space-y-1">
          <p className="text-xs text-text-dim">
            {phase.name === 'preparing' && phase.detail}
            {phase.name === 'transcribing' &&
              `Распознаю${phase.total > 1 ? ` · фрагмент ${phase.done + 1} из ${phase.total}` : '…'}`}
            {phase.name === 'cleaning' &&
              `Вычитываю${phase.total > 1 ? ` · блок ${phase.done + 1} из ${phase.total}` : '…'}`}
          </p>
          {progress !== null && (
            <div className="h-1 w-full overflow-hidden rounded bg-surface-hover">
              <div
                className="h-full bg-accent transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Превью подписано явно: без подписи растущий текст выглядит готовым результатом,
          и на боевом прогоне владелец решил, что процесс закончился на блоке 1 из 7. */}
      {(busy || phase.name === 'partial') && preview && (
        <div className="space-y-1">
          <p className="text-meta text-text-mute">
            {phase.name === 'cleaning'
              ? 'Черновик — идёт вычитка, текст ещё меняется'
              : phase.name === 'partial'
                ? 'Текст на руках — вычитан не полностью'
                : 'Черновик — распознавание идёт'}
          </p>
          <div className="max-h-24 overflow-y-auto rounded-lg border border-border bg-surface p-2 text-xs whitespace-pre-wrap text-text-dim">
            {preview}
          </div>
        </div>
      )}
    </div>
  );
}
