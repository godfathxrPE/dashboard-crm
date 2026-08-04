'use client';

import { ExternalLink } from 'lucide-react';
import type { CompanyBriefResult } from '@/types/database';
import { safeHref } from '@/lib/utils/safe-href';

/**
 * S-COMPANY-AI-1 (104) — бриф по компании из открытых источников. READ-ONLY.
 *
 * Весь текст модели рендерится КАК ТЕКСТ (никакого HTML/markdown) — тот же контур,
 * что у остальных рендереров ai_runs. Отличие одно: у брифа есть ссылки на источники,
 * и они кликабельны. URL приходит от модели, то есть недоверен, поэтому:
 *   • схема фильтруется `safeHref` (javascript:/data: не станут href),
 *   • `rel="noopener noreferrer"` + `target="_blank"`,
 *   • не прошёл фильтр — рендерим URL текстом, а не молча выкидываем утверждение.
 *
 * Предложение подставить найденный сайт живёт НЕ здесь, а в AiCompanyPanel: писать
 * в компанию может только тот, кто знает компанию, и делает это по явному клику.
 */
export function CompanyBriefRenderer({ result }: { result: CompanyBriefResult }) {
  return (
    <div className="space-y-3 text-sm">
      {result.summary && (
        <p className="whitespace-pre-wrap text-text-main">{result.summary}</p>
      )}

      {result.activity && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Чем занимается</p>
          <p className="whitespace-pre-wrap text-text-main">{result.activity}</p>
        </div>
      )}

      {result.scale && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Масштаб</p>
          <p className="whitespace-pre-wrap text-text-main">{result.scale}</p>
        </div>
      )}

      {result.chz_signals && result.chz_signals.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Признаки работы с маркировкой</p>
          <ul className="space-y-1">
            {result.chz_signals.map((s, i) => (
              <li key={i} className="text-text-main">
                <span className="whitespace-pre-wrap">{s.claim}</span>{' '}
                <SourceLink url={s.source_url} label="источник" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.recent_news && result.recent_news.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Свежие события</p>
          <ul className="space-y-1">
            {result.recent_news.map((n, i) => (
              <li key={i} className="text-text-main">
                {n.date && <span className="mr-1 text-xs tabular-nums text-text-mute">{n.date}</span>}
                <span className="whitespace-pre-wrap">{n.title}</span>{' '}
                <SourceLink url={n.url} label="ссылка" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.talk_hooks && result.talk_hooks.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Зацепки для разговора</p>
          <ol className="list-decimal space-y-0.5 pl-4 text-text-main">
            {result.talk_hooks.map((h, i) => <li key={i} className="whitespace-pre-wrap">{h}</li>)}
          </ol>
        </div>
      )}

      {result.sources && result.sources.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Источники</p>
          <ul className="space-y-0.5">
            {result.sources.map((u, i) => (
              <li key={i} className="truncate text-xs">
                <SourceLink url={u} label={u} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Ссылка на источник. Схема не прошла фильтр — показываем URL текстом. */
function SourceLink({ url, label }: { url: string; label: string }) {
  const href = safeHref(url);
  if (!href) return <span className="text-xs text-text-mute">{url}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="inline-flex items-center gap-0.5 text-xs text-accent hover:underline"
    >
      {label}
      <ExternalLink size={10} className="shrink-0" />
    </a>
  );
}
