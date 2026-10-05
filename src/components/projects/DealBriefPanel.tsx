'use client';

import { useState } from 'react';
import { ExternalLink, FileText, RefreshCw, SearchX } from 'lucide-react';
import { AiRunResultModal } from '@/components/ai/AiRunResultModal';
import { cn } from '@/lib/utils/cn';
import { pluralRu } from '@/lib/utils/plural';
import {
  briefAction,
  briefNote,
  formatBriefMetaDate,
  formatBriefNewsDate,
  newsLink,
  pickHeadlineNews,
  type BriefAutoState,
  type BriefKind,
  type BriefRuns,
} from '@/lib/domain/company-brief';
import type { CompanyBriefResult } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-BRIEF-IN-DEAL-1.2: панель AI-брифа внутри стекла «Следующий шаг», под футером.
//
// Короткая выжимка к звонку: сводка, две зацепки, свежая новость. Полный бриф —
// модалка прогона (`AiRunResultModal`), со сделки не уводим. Боковых кантов и
// полос нет ни у панели, ни у зацепок (preferences владельца): маркер — точка.
// Разделитель сверху — класс `glass-divider` в CSS материала, а не утилита рамки:
// safety-net тёмных тем перебивает border-утилиты (см. globals.css).
// ═══════════════════════════════════════════════════════

const HOOKS_SHOWN = 2;

const PILL =
  'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-0.5 ' +
  'text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-text-main ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

function pendingMeta(kind: BriefKind): string {
  if (kind === 'running') return 'собираем, около минуты';
  if (kind === 'failed') return 'не собран';
  return 'брифа ещё нет';
}

export function DealBriefPanel({
  companyName,
  kind,
  runs,
  auto,
  canRun,
  starting,
  onRun,
}: {
  companyName: string | null;
  kind: BriefKind;
  runs: BriefRuns;
  auto: BriefAutoState | null;
  canRun: boolean;
  starting: boolean;
  onRun: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const done = runs.latestDone;
  const result = (done?.result ?? null) as CompanyBriefResult | null;
  const now = new Date();
  const note = briefNote({ kind, runs, auto, now });
  const action = briefAction(kind);

  const sourcesCount = Array.isArray(result?.sources) ? result.sources.length : null;
  const hooks = Array.isArray(result?.talk_hooks) ? result.talk_hooks : [];
  const news = pickHeadlineNews(result?.recent_news);
  const link = news ? newsLink(news.url) : null;

  return (
    <div
      id="deal-brief-panel"
      role="region"
      aria-label="AI-бриф компании"
      className="glass-divider mt-3.5 flex flex-col gap-3 pt-3.5"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <p className="flex-1 basis-72 text-meta text-text-dim">
          Бриф компании{companyName && <> <b className="font-semibold text-text-main">{companyName}</b></>}
          {' · '}
          {done ? (
            <>
              {formatBriefMetaDate(done.created_at, now)}
              {sourcesCount !== null && (
                <>
                  {' · '}
                  {sourcesCount} {pluralRu(sourcesCount, 'источник', 'источника', 'источников')}
                </>
              )}
            </>
          ) : (
            pendingMeta(kind)
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {done && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              <FileText size={12} />
              Весь бриф
            </button>
          )}
          {action && canRun && (
            <span className="flex items-center gap-2">
              {action.lead && <span className="text-xs text-text-dim">{action.lead}</span>}
              <button type="button" onClick={onRun} disabled={starting} className={PILL}>
                <RefreshCw size={12} className={cn(starting && 'motion-safe:animate-spin')} />
                {action.label}
              </button>
            </span>
          )}
        </div>
      </div>

      {note && (
        <p
          className={cn(
            'flex max-w-[72ch] items-start gap-1.5 text-body text-text-dim',
            kind === 'stale' && 'text-warning-text',
          )}
        >
          {kind === 'lowData' && <SearchX size={13} className="mt-[0.2em] shrink-0" />}
          <span>{note}</span>
        </p>
      )}

      {done && result && (
        <>
          {result.summary && (
            <p className="line-clamp-3 max-w-[72ch] text-sm leading-normal">{result.summary}</p>
          )}
          {hooks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-meta font-semibold text-text-dim">
                Зацепки для разговора
                {hooks.length > HOOKS_SHOWN && ` · ${HOOKS_SHOWN} из ${hooks.length}`}
              </div>
              <ul className="flex flex-col gap-1.5">
                {hooks.slice(0, HOOKS_SHOWN).map((hook, i) => (
                  <li key={i} className="flex max-w-[72ch] items-baseline gap-2 text-sm">
                    <span aria-hidden="true" className="size-[0.3125rem] shrink-0 -translate-y-[0.1em] rounded-full bg-text-dim" />
                    <span className="line-clamp-2">{hook}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {news && (
            <div className="flex min-w-0 max-w-[72ch] items-baseline gap-2 text-sm">
              <span className="shrink-0 text-meta font-semibold text-text-dim">Новость</span>
              <span className="shrink-0 text-meta tabular-nums text-text-dim">{formatBriefNewsDate(news.date)}</span>
              {link ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-baseline gap-1.5 hover:underline"
                >
                  <span className="truncate">{news.title}</span>
                  {link.host && <span className="shrink-0 text-meta text-text-dim">{link.host}</span>}
                  <ExternalLink size={11} className="shrink-0 self-center text-text-dim" />
                </a>
              ) : (
                // Адрес не прошёл safeHref — заголовок без ссылки, хоста и иконки.
                <span className="min-w-0 truncate">{news.title}</span>
              )}
            </div>
          )}
        </>
      )}

      {kind === 'running' && !done && (
        // Каркас повторяет раскладку готового брифа: по завершении ничего не прыгает.
        <div aria-hidden="true" className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <div className="glass-skeleton w-[96%]" />
            <div className="glass-skeleton w-[90%]" />
            <div className="glass-skeleton w-[58%]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[0, 1].map((col) => (
              <div key={col} className="flex flex-col gap-2">
                <div className="glass-skeleton w-full" />
                <div className="glass-skeleton w-[80%]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && <AiRunResultModal run={done} onClose={() => setModalOpen(false)} />}
    </div>
  );
}
