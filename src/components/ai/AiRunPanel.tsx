'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, ThumbsUp, ThumbsDown, Copy, Check, AlertCircle, RotateCw } from 'lucide-react';
import { TaskModal } from '@/components/tasks/TaskModal';
import {
  useTranscript,
  useEntityRuns,
  useStartRun,
  useRunRating,
  type AiRunEntity,
} from '@/lib/hooks/use-ai-run';
import { presetsForEntity, presetByKey, estimateRunCostRub } from '@/lib/constants/ai-presets';
import type { AiRunRow, ProtocolResult, AnalyticNoteResult, SpinReviewResult } from '@/types/database';
import { AiResultRenderer } from './renderers/AiResultRenderer';
import type { ActionItem } from './renderers/ProtocolRenderer';

interface AiRunPanelProps {
  entityType: AiRunEntity;
  entityId: string;
  defaultCompanyId?: string | null;
  defaultContactId?: string | null;
  defaultProjectId?: string | null;
}

const STALE_MIN = 10;

/** Читаемый текст результата для «Копировать» (без markdown — plain text). */
function serializeRun(run: AiRunRow): string {
  const r = run.result;
  if (!r) return '';
  const out: string[] = [];
  const push = (title: string, lines: string[]) => {
    if (lines.length) out.push(`${title}:\n` + lines.map((l) => `— ${l}`).join('\n'));
  };
  if (run.preset_key === 'meeting_protocol') {
    const p = r as ProtocolResult;
    push('Участники', p.participants ?? []);
    push('Повестка', p.agenda ?? []);
    push('Обсуждалось', p.discussed ?? []);
    push('Решения', p.decisions ?? []);
    push('Поручения', (p.action_items ?? []).map((a) => `${a.what}${a.who ? ` (${a.who})` : ''}${a.due ? ` до ${a.due}` : ''}`));
    push('Открытые вопросы', p.open_questions ?? []);
  } else if (run.preset_key === 'analytic_note') {
    const n = r as AnalyticNoteResult;
    if (n.client_situation) out.push(`Ситуация клиента:\n${n.client_situation}`);
    push('Потребности и боли', (n.needs ?? []).map((x) => `${x.claim}${x.quote ? ` «${x.quote}»` : ''}`));
    push('Стейкхолдеры', (n.stakeholders ?? []).map((s) => `${s.name}${s.role ? ` — ${s.role}` : ''}`));
    push('Риски сделки', (n.deal_risks ?? []).map((x) => `${x.claim}${x.quote ? ` «${x.quote}»` : ''}`));
    push('Рекомендации', n.recommendations ?? []);
    push('Аргументы для КП', n.kp_arguments ?? []);
  } else if (run.preset_key === 'spin_review') {
    const s = r as SpinReviewResult;
    out.push(`Оценка: ${s.score.value}/10${s.score.rationale ? ` — ${s.score.rationale}` : ''}`);
    out.push(`Счёт S/P/I/N: ${s.counts.situation}/${s.counts.problem}/${s.counts.implication}/${s.counts.need_payoff}`);
    push('Что упущено', s.missed ?? []);
    push('Вопросы к следующему звонку', s.next_questions ?? []);
  }
  return out.join('\n\n');
}

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
export function AiRunPanel({ entityType, entityId, defaultCompanyId, defaultContactId, defaultProjectId }: AiRunPanelProps) {
  const { data: transcript } = useTranscript(entityType, entityId);
  const { data: runs } = useEntityRuns(entityType, entityId);
  const start = useStartRun(entityType, entityId);
  const rating = useRunRating();

  const [text, setText] = useState('');
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (transcript && seededRef.current !== transcript.id) {
      seededRef.current = transcript.id;
      setText(transcript.content ?? '');
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

  const handleRun = (presetKey: string) => {
    if (!hasText || start.isPending) return;
    start.mutate({ preset_key: presetKey, text });
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

      {/* Транскрипт */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Вставьте транскрипт разговора…"
        className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        style={{ resize: 'vertical', minHeight: '80px' }}
      />
      <div className="mt-1 text-right text-[11px] text-text-mute">{text.length.toLocaleString('ru')} симв.</div>

      {/* Кнопки пресетов */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => handleRun(preset.key)}
            disabled={!hasText || start.isPending}
            title={preset.description}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-main hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {start.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {preset.title}
            {hasText && (
              <span className="text-text-mute">≈ {estimateRunCostRub(text.length, preset.model)} ₽</span>
            )}
          </button>
        ))}
      </div>

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
                  <StatusChip status={run.status} />
                </div>

                {run.status === 'error' && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-text-mute">{run.error ?? 'Ошибка выполнения'}</span>
                    <button
                      type="button"
                      onClick={() => start.mutate({ preset_key: run.preset_key, text })}
                      disabled={!hasText || start.isPending}
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
                      onClick={() => start.mutate({ preset_key: run.preset_key, text })}
                      disabled={!hasText || start.isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-dim hover:bg-surface-hover disabled:opacity-50"
                    >
                      <RotateCw size={12} /> Повторить
                    </button>
                  </div>
                )}

                {run.status === 'done' && (
                  <>
                    {run.result?.meta?.truncated && (
                      <p className="mt-2 text-[11px] text-yellow">Транскрипт был обрезан по лимиту — результат по началу.</p>
                    )}
                    <div className="mt-2">
                      <AiResultRenderer run={run} onCreateTask={openTaskFromAction} />
                    </div>

                    {/* Действия над результатом */}
                    <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                      <button
                        type="button"
                        onClick={() => rating.mutate({ runId: run.id, rating: 1 })}
                        className={`rounded-md p-1 hover:bg-surface-hover ${run.rating === 1 ? 'text-green' : 'text-text-mute'}`}
                        aria-label="Полезно"
                      >
                        <ThumbsUp size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNoteFor(run.id); setNoteText(run.feedback_note ?? ''); }}
                        className={`rounded-md p-1 hover:bg-surface-hover ${run.rating === -1 ? 'text-red' : 'text-text-mute'}`}
                        aria-label="Не полезно"
                      >
                        <ThumbsDown size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(run)}
                        className="ml-auto inline-flex items-center gap-1 rounded-md p-1 text-text-mute hover:bg-surface-hover"
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
