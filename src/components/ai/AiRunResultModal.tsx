'use client';

import { useState } from 'react';
import { X, Sparkles, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import { presetTitle, PROGRESSION_PRESET_KEY } from '@/lib/constants/ai-presets';
import { serializeRun } from '@/lib/utils/ai-run-serialize';
import { AiResultRenderer } from './renderers/AiResultRenderer';
import type { AiRunRow } from '@/types/database';

/**
 * S-AI-VIS-1: просмотр результата прогона, открытого кликом по AI-событию ленты.
 *
 * Тонкая по замыслу: заголовок, тело через существующий диспетчер `AiResultRenderer`
 * и «Копировать». Новых рендереров не пишем — их семь и они покрывают все пресеты.
 * Редактирования, оценки и повтора здесь нет: за этим человек идёт в карточку
 * звонка/встречи, где живёт полная панель.
 */
export function AiRunResultModal({ run, onClose }: { run: AiRunRow | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  if (!run) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(serializeRun(run));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard недоступен — тихо игнорируем */ }
  };

  const when = new Date(run.created_at).toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const hasText = serializeRun(run).trim().length > 0;

  return (
    <div
      data-modal-overlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        data-modal
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 elevation-3 ring-1 ring-border"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-text-main">
              <Sparkles size={18} className="shrink-0 text-accent" />
              <span className="truncate">{presetTitle(run.preset_key)}</span>
            </h2>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-text-mute">
              <span>{when}</span>
              <StatusChip status={run.status} />
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="shrink-0 rounded-lg p-1 text-text-mute hover:bg-surface-hover"
          >
            <X size={18} />
          </button>
        </div>

        {/* Прогон в ошибке/очереди тоже открывается: молчащий клик — ровно то, что
            чинит этот спринт, и возвращать его через край было бы издевательством. */}
        {run.status === 'error' && (
          <div className="flex items-start gap-1.5 rounded-lg border border-red bg-red-l p-2.5 text-xs text-red">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>{run.error ?? 'Прогон завершился ошибкой без текста причины'}</span>
          </div>
        )}

        {(run.status === 'pending' || run.status === 'running') && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-hover/40 p-2.5 text-xs text-text-dim">
            <Loader2 size={13} className="shrink-0 animate-spin text-accent" />
            <span>Прогон ещё идёт — результат появится здесь, когда он закончится.</span>
          </div>
        )}

        {run.status === 'done' && (
          <>
            {run.result?.meta?.truncated && (
              <p className="mb-2 text-meta text-yellow">
                Транскрипт был обрезан по лимиту — результат по началу.
              </p>
            )}

            {run.preset_key === PROGRESSION_PRESET_KEY ? (
              // У SDP не рендерер результата, а диф-панель с записью в сделку —
              // применять черновик из ленты нельзя (нужен выбор сделки и мутации).
              <p className="text-sm text-text-dim">
                Черновик обновления сделки. Применяется из карточки звонка или встречи —
                там же виден и разбор по полям.
              </p>
            ) : (
              <AiResultRenderer run={run} />
            )}

            <div className="mt-3 flex items-center border-t border-border pt-2">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!hasText}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs
                           font-medium text-text-dim hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copied ? <Check size={13} className="text-green" /> : <Copy size={13} />}
                Копировать
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: AiRunRow['status'] }) {
  if (status === 'pending') return <span className="text-text-mute">В очереди</span>;
  if (status === 'running') return <span className="text-accent">Анализ…</span>;
  if (status === 'error') return <span className="text-red">Ошибка</span>;
  return <span className="text-green">Готово</span>;
}
