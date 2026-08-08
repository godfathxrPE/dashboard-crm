'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, ThumbsUp, ThumbsDown, Copy, Check, AlertCircle, RotateCw } from 'lucide-react';
import { TaskModal } from '@/components/tasks/TaskModal';
import {
  useTranscript,
  useEntityRuns,
  useStartRun,
  useRunRating,
  useSaveTranscript,
  canHaveTranscript,
  type AiRunEntity,
  type TranscriptSource,
} from '@/lib/hooks/use-ai-run';
import {
  presetsForEntity,
  presetByKey,
  estimateRunCostRub,
  PROGRESSION_PRESET_KEY,
} from '@/lib/constants/ai-presets';
import { serializeRun } from '@/lib/utils/ai-run-serialize';
import type { AiRunRow } from '@/types/database';
import { AiResultRenderer } from './renderers/AiResultRenderer';
import { RunCostMeta } from './RunCostMeta';
import { AiProgressionPanel } from './AiProgressionPanel';
import { TranscribeDropzone } from './TranscribeDropzone';
import type { ActionItem } from './renderers/ProtocolRenderer';

interface AiRunPanelProps {
  entityType: AiRunEntity;
  entityId: string;
  defaultCompanyId?: string | null;
  defaultContactId?: string | null;
  defaultProjectId?: string | null;
  /**
   * R2-P0-C: модалку открыли из CTA «Обновить сделку» — подсвечиваем секцию,
   * чтобы пользователь не искал нужный пресет среди четырёх кнопок.
   */
  focusProgression?: boolean;
  /**
   * 085. У звонка/встречи есть заметки (`agreements` / `notes`) — значит пресетам
   * с `needsTranscript: false` есть по чему работать даже без транскрипта.
   * Ограничение «SDP только при транскрипте» переехало из схемы БД сюда: пусто и
   * там, и там → кнопка честно disabled с подсказкой, а не 400 после клика.
   */
  hasEntityNotes?: boolean;
}

const STALE_MIN = 10;

function StatusChip({ status }: { status: AiRunRow['status'] }) {
  if (status === 'pending') return <span className="text-xs text-text-mute">В очереди</span>;
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-accent">
        <Loader2 size={12} className="animate-spin" /> Анализ…
      </span>
    );
  }
  if (status === 'error') return <span className="text-xs text-red">Ошибка</span>;
  return <span className="text-xs text-green">Готово</span>;
}

/**
 * Sprint AI-1: секция «AI» карточки звонка/встречи — транскрипт, пресеты, лента прогонов.
 * Промпты и ключ Anthropic на клиент не попадают. Результат рендерится только как текст.
 */
export function AiRunPanel({
  entityType, entityId, defaultCompanyId, defaultContactId, defaultProjectId, focusProgression,
  hasEntityNotes = false,
}: AiRunPanelProps) {
  const { data: transcript } = useTranscript(entityType, entityId);
  const { data: runs } = useEntityRuns(entityType, entityId);
  const start = useStartRun(entityType, entityId);
  const rating = useRunRating();
  const saveTranscript = useSaveTranscript();

  const [text, setText] = useState('');
  // S-R3-VOICE-1: откуда взялся текст в поле — прокидывается в `transcripts.source`.
  // Ручная правка расшифровки источник НЕ меняет: это по-прежнему машинный текст,
  // доведённый человеком, и знать это полезнее, чем «paste» после одной запятой.
  const [source, setSource] = useState<TranscriptSource>('paste');
  const [mode, setMode] = useState<'paste' | 'audio'>('paste');
  /**
   * S-AI-VIS-1: что именно уже сохранено в БД. Хранится вместе с текстом, а не
   * одним флагом: человек правит расшифровку прямо в поле, и «сохранено» про
   * прежнюю версию — вранье. Тоста мало по той же причине, по которой его не
   * хватило в S-FIX-VOICE-1: тост исчезает, а вопрос «сохранилось ли» остаётся.
   */
  const [saved, setSaved] = useState<{ text: string; complete: boolean } | null>(null);
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (transcript && seededRef.current !== transcript.id) {
      seededRef.current = transcript.id;
      setText(transcript.content ?? '');
      // Текст пришёл с сервера: пока он не изменён, `useStartRun` переиспользует ту же
      // строку и до `source` дело не дойдёт. Изменён — это уже правка руками.
      setSource('paste');
    }
  }, [transcript]);

  // Заметка при 👎
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  // Копирование
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // TaskModal (action item → задача)
  const [taskDraft, setTaskDraft] = useState<{ text: string; deadline: string | null } | null>(null);

  const presets = presetsForEntity(entityType);
  const hasText = text.trim().length > 0;
  // Транскрипт (а значит и расшифровка аудио) существует только у звонка и встречи.
  const canTranscribe = canHaveTranscript(entityType);
  const entityWhere = entityType === 'call' ? 'в звонке' : 'во встрече';

  /**
   * Расшифровка готова → она сразу уходит в БД, не дожидаясь пресета.
   * До S-AI-VIS-1 транскрипт писался только внутри запуска прогона: не нажал
   * пресет — расшифровка умирала вместе с состоянием компонента.
   *
   * Частичный результат сохраняем тоже: за распознавание уже заплачено, и текст
   * с сырыми кусками лучше отсутствующего — дочистить его можно прямо в поле.
   * Сохранение ≠ запуск: прогон по-прежнему стартует человек.
   */
  const handleTranscribed = (result: string, complete: boolean) => {
    setText(result);
    setSource('audio');
    // Текст готов — возвращаем человека к полю, где он его вычитает глазами
    // и сам запустит пресет. Автозапуска прогона нет намеренно.
    setMode('paste');
    if (!canHaveTranscript(entityType) || result.trim() === '') return;
    setSaved({ text: result, complete });
    saveTranscript.mutate(
      { entityType, entityId, text: result, source: 'audio' },
      {
        // Помечаем свежую строку как уже «посеянную»: иначе эффект ниже увидит
        // прилетевший с сервера транскрипт как новый, перезапишет поле тем же
        // текстом и сбросит `source` в 'paste' — пометка «расшифровка аудио»
        // исчезла бы через секунду после сохранения.
        onSuccess: ({ transcriptId }) => {
          if (transcriptId) seededRef.current = transcriptId;
        },
      },
    );
  };

  // 085: пресету с needsTranscript транскрипт обязателен; остальным хватает заметок
  // сущности — прогон уйдёт по пути { entity_type, entity_id } без транскрипта.
  const canRun = (preset: { needsTranscript: boolean }) =>
    preset.needsTranscript ? hasText : hasText || hasEntityNotes;

  const runHint = (preset: { needsTranscript: boolean; description: string }) => {
    if (canRun(preset)) {
      return preset.needsTranscript || hasText
        ? preset.description
        : `${preset.description}\n\nТранскрипта нет — анализ пойдёт по заметкам звонка/встречи.`;
    }
    return preset.needsTranscript
      ? 'Нужен транскрипт — вставьте текст разговора выше'
      : 'Нет ни транскрипта, ни заметок — анализировать нечего';
  };

  const handleRun = (presetKey: string) => {
    const preset = presetByKey(presetKey);
    if (!preset || !canRun(preset) || start.isPending) return;
    start.mutate({ preset_key: presetKey, text, source });
  };

  const handleCopy = async (run: AiRunRow) => {
    try {
      await navigator.clipboard.writeText(serializeRun(run));
      setCopiedId(run.id);
      window.setTimeout(() => setCopiedId((id) => (id === run.id ? null : id)), 1500);
    } catch { /* clipboard недоступен — тихо игнорируем */ }
  };

  const openTaskFromAction = (item: ActionItem) => {
    // ISO-дата (YYYY-MM-DD) → datetime-local; иначе как есть (обрежется формой)
    const deadline = item.due && /^\d{4}-\d{2}-\d{2}$/.test(item.due) ? `${item.due}T10:00` : item.due;
    setTaskDraft({ text: item.what, deadline: deadline ?? null });
  };

  const isStale = (run: AiRunRow) =>
    (run.status === 'pending' || run.status === 'running') &&
    (Date.now() - new Date(run.created_at).getTime()) / 60_000 > STALE_MIN;

  return (
    <div className="rounded-lg border border-border bg-surface-hover/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-dim">
        <Sparkles size={14} className="text-accent" />
        <span>AI-анализ по транскрипту</span>
      </div>

      {/* Откуда взять транскрипт: вставить руками или расшифровать аудио (S-R3-VOICE-1).
          Только у звонка и встречи: `transcripts.entity_type` — call|meeting, у сделки и
          компании транскрипта не бывает, и предлагать там расшифровку значило бы вести
          в тупик «К сделке нельзя привязать транскрипт». */}
      {canTranscribe && (
        <div className="mb-2 inline-flex rounded-lg border border-border bg-surface p-0.5">
          {(
            [
              ['paste', 'Вставить'],
              ['audio', 'Аудио'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                mode === value
                  ? 'bg-accent-l text-accent'
                  : 'text-text-dim hover:bg-surface-hover hover:text-text-main'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Режимы — альтернативы: поле показываем только во «Вставить», чтобы не было
          двух мест ввода одного текста одновременно. */}
      {canTranscribe && mode === 'audio' ? (
        <div className="mb-3">
          <TranscribeDropzone onResult={handleTranscribed} />
        </div>
      ) : (
        <>
          {/* Транскрипт */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Вставьте транскрипт разговора…"
            className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            style={{ resize: 'vertical', minHeight: '80px' }}
          />
          <div className="mt-1 flex items-center justify-end gap-2 text-meta text-text-mute">
            {source === 'audio' && <span className="text-accent">расшифровка аудио</span>}
            <span>{text.length.toLocaleString('ru')} симв.</span>
          </div>

          {/* Факт сохранения — строкой, а не только тостом: тост исчезает, а вопрос
              «сохранилось ли» остаётся (урок S-FIX-VOICE-1). */}
          {saved && (
            <p className="mt-1 flex items-start gap-1 text-meta">
              {saveTranscript.isPending ? (
                <span className="text-text-mute">Сохраняю расшифровку…</span>
              ) : saveTranscript.isError ? (
                <span className="text-red">
                  Не удалось сохранить расшифровку — текст остался в поле и уйдёт в
                  транскрипт при запуске пресета
                </span>
              ) : saved.text !== text ? (
                <span className="text-text-mute">
                  Правка не сохранена — она уйдёт в новый транскрипт при запуске пресета
                </span>
              ) : (
                <span className="text-green">
                  <Check size={11} className="mr-0.5 inline align-[-1px]" />
                  Расшифровка сохранена {entityWhere}
                  {!saved.complete && ' — вычитана не полностью'}
                </span>
              )}
            </p>
          )}
        </>
      )}

      {/* Кнопки пресетов */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const isProgression = preset.key === PROGRESSION_PRESET_KEY;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => handleRun(preset.key)}
              disabled={!canRun(preset) || start.isPending}
              title={runHint(preset)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 ${
                isProgression && focusProgression
                  ? 'border-accent bg-accent-l text-accent'
                  : 'border-border bg-surface text-text-main'
              }`}
            >
              {start.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {preset.title}
              {hasText && (
                <span className="text-text-mute">≈ {estimateRunCostRub(text.length, preset.model)} ₽</span>
              )}
            </button>
          );
        })}
      </div>
      {/* Во вкладке «Аудио» подсказку не показываем: технически она верна, но во время
          расшифровки читается как «ничего не происходит» — на боевом прогоне владелец
          по ней решил, что процесс закончился, хотя шёл блок 1 из 7. */}
      {!hasText && mode !== 'audio' && (
        <p className="mt-1 text-meta text-text-mute">
          {hasEntityNotes
            ? 'Транскрипта нет — доступны пресеты, работающие по заметкам. Протокол и SPIN-разбор требуют текста разговора.'
            : 'Анализ идёт по транскрипту — вставьте текст разговора, чтобы включить пресеты.'}
        </p>
      )}

      {start.isError && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-red">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{start.error?.message ?? 'Не удалось запустить прогон'}</span>
        </div>
      )}

      {/* Лента прогонов */}
      {runs && runs.length > 0 && (
        <div className="mt-3 space-y-2">
          {runs.map((run) => {
            const preset = presetByKey(run.preset_key);
            return (
              <div key={run.id} className="rounded-lg border border-border bg-surface p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-text-main">{preset?.title ?? run.preset_key}</span>
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <StatusChip status={run.status} />
                    <RunCostMeta run={run} />
                  </span>
                </div>

                {run.status === 'error' && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-text-mute">{run.error ?? 'Ошибка выполнения'}</span>
                    <button
                      type="button"
                      onClick={() => handleRun(run.preset_key)}
                      disabled={!preset || !canRun(preset) || start.isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-dim hover:bg-surface-hover disabled:opacity-50"
                    >
                      <RotateCw size={12} /> Повторить
                    </button>
                  </div>
                )}

                {isStale(run) && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-yellow">Прогон завис — можно повторить</span>
                    <button
                      type="button"
                      onClick={() => handleRun(run.preset_key)}
                      disabled={!preset || !canRun(preset) || start.isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-dim hover:bg-surface-hover disabled:opacity-50"
                    >
                      <RotateCw size={12} /> Повторить
                    </button>
                  </div>
                )}

                {run.status === 'done' && (
                  <>
                    {run.result?.meta?.truncated && (
                      <p className="mt-2 text-meta text-yellow">Транскрипт был обрезан по лимиту — результат по началу.</p>
                    )}
                    <div className="mt-2">
                      {/* R2-P0-C: у deal_progression не «рендерер результата», а диф-панель
                          с применением в сделку — отдельная ветка, а не case в диспетчере
                          (нужны мутации, выбор сделки и состояние выбора). */}
                      {run.preset_key === PROGRESSION_PRESET_KEY ? (
                        <AiProgressionPanel run={run} defaultProjectId={defaultProjectId} />
                      ) : (
                        <AiResultRenderer run={run} onCreateTask={openTaskFromAction} />
                      )}
                    </div>

                    {/* Действия над результатом */}
                    <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                      <button
                        type="button"
                        onClick={() => rating.mutate({ runId: run.id, rating: 1 })}
                        className={`rounded p-1 hover:bg-surface-hover ${run.rating === 1 ? 'text-green' : 'text-text-mute'}`}
                        aria-label="Полезно"
                      >
                        <ThumbsUp size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNoteFor(run.id); setNoteText(run.feedback_note ?? ''); }}
                        className={`rounded p-1 hover:bg-surface-hover ${run.rating === -1 ? 'text-red' : 'text-text-mute'}`}
                        aria-label="Не полезно"
                      >
                        <ThumbsDown size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(run)}
                        className="ml-auto inline-flex items-center gap-1 rounded p-1 text-text-mute hover:bg-surface-hover"
                        aria-label="Копировать"
                      >
                        {copiedId === run.id ? <Check size={13} className="text-green" /> : <Copy size={13} />}
                      </button>
                    </div>

                    {noteFor === run.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Что не так? (необязательно)"
                          className="flex-1 rounded-lg border border-input bg-surface px-2 py-1 text-xs text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            rating.mutate({ runId: run.id, rating: -1, note: noteText.trim() || null });
                            setNoteFor(null);
                          }}
                          className="rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          Отправить
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* action item → задача (AI предлагает — юзер подтверждает) */}
      <TaskModal
        isOpen={taskDraft !== null}
        onClose={() => setTaskDraft(null)}
        editTask={null}
        defaultText={taskDraft?.text ?? null}
        defaultDeadline={taskDraft?.deadline ?? null}
        defaultProjectId={defaultProjectId}
        defaultContactId={defaultContactId}
        defaultCompanyId={defaultCompanyId}
      />
    </div>
  );
}
