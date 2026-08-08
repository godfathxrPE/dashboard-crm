'use client';

import { useState } from 'react';
import { X, FileText, Copy, Check, Download, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { useTranscriptContent, type TranscriptListRow } from '@/lib/hooks/use-transcripts';
import { formatCharCount } from '@/lib/domain/transcript';
import { downloadTranscript, entityLabel, sourceLabel, type TranscriptExportMeta } from '@/lib/utils/transcript-export';

/**
 * S-AI-VIS-2: просмотр расшифровки — из раздела /transcripts и из блока компании.
 *
 * Полный текст грузится точечно при открытии, а не едет в выборке списка.
 * Отсюда же — «Скачать» (markdown-файл) и вход в AI-анализ звонка/встречи, чтобы
 * из витрины можно было сразу перейти к пресетам, а не искать строку в списке.
 */
export function TranscriptViewModal({
  row,
  onClose,
  onOpenEntity,
}: {
  row: TranscriptListRow | null;
  onClose: () => void;
  onOpenEntity?: (row: TranscriptListRow) => void;
}) {
  const [copied, setCopied] = useState(false);
  const { data: content, isLoading, isError } = useTranscriptContent(row?.id ?? null);

  if (!row) return null;

  const meta: TranscriptExportMeta = {
    createdAt: row.createdAt,
    entityType: row.entityType,
    company: row.company,
    contact: row.contact,
    subject: row.subject,
    source: row.source,
    charCount: row.charCount,
  };

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard недоступен — тихо игнорируем */ }
  };

  const when = new Date(row.createdAt).toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const title = row.company ?? row.subject ?? entityLabel(row.entityType);

  return (
    <div
      data-modal-overlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        data-modal
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface p-6 elevation-3 ring-1 ring-border"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-text-main">
              <FileText size={18} className="shrink-0 text-accent" />
              <span className="truncate">Расшифровка · {title}</span>
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-mute">
              <span>{when}</span>
              <span>·</span>
              <span>{entityLabel(row.entityType)}</span>
              <span>·</span>
              <span>{formatCharCount(row.charCount)}</span>
              <span>·</span>
              <span>{sourceLabel(row.source)}</span>
              {row.contact && (<><span>·</span><span className="truncate">{row.contact}</span></>)}
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

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface-hover/40 p-3">
          {isLoading ? (
            <p className="flex items-center gap-1.5 text-xs text-text-dim">
              <Loader2 size={13} className="animate-spin text-accent" /> Загружаю текст…
            </p>
          ) : isError ? (
            <p className="flex items-start gap-1.5 text-xs text-red">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              Не удалось загрузить текст расшифровки
            </p>
          ) : content && content.trim() ? (
            <p className="whitespace-pre-wrap text-sm text-text-main">{content}</p>
          ) : (
            <p className="text-xs text-text-mute">Текст расшифровки пуст.</p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {onOpenEntity && (
            <button
              type="button"
              onClick={() => onOpenEntity(row)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs
                         font-medium text-text-dim hover:bg-surface-hover"
            >
              <Sparkles size={13} className="text-accent" />
              {row.entityType === 'call' ? 'Открыть звонок' : 'Открыть встречу'}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!content}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs
                       font-medium text-text-dim hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? <Check size={13} className="text-green" /> : <Copy size={13} />}
            Копировать
          </button>
          <button
            type="button"
            onClick={() => downloadTranscript(meta, content ?? null)}
            disabled={!content}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium
                       text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={13} /> Скачать
          </button>
        </div>
      </div>
    </div>
  );
}
