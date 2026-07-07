'use client';

import type { AnalyticNoteResult } from '@/types/database';

function StringList({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-text-dim">{title}</p>
      <ul className="list-disc space-y-0.5 pl-4 text-text-main">
        {items.map((it, i) => <li key={i} className="whitespace-pre-wrap">{it}</li>)}
      </ul>
    </div>
  );
}

/** Пункты с цитатой-основанием (needs / deal_risks) — анти-галлюцинация. */
function ClaimList({ title, items }: { title: string; items: { claim: string; quote: string }[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-text-dim">{title}</p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i}>
            <p className="whitespace-pre-wrap text-text-main">{it.claim}</p>
            {it.quote && (
              <p className="mt-0.5 whitespace-pre-wrap border-l-2 border-border pl-2 text-xs italic text-text-mute">
                «{it.quote}»
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnalyticNoteRenderer({ result }: { result: AnalyticNoteResult }) {
  return (
    <div className="space-y-3 text-sm">
      {result.client_situation && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Ситуация клиента</p>
          <p className="whitespace-pre-wrap text-text-main">{result.client_situation}</p>
        </div>
      )}
      <ClaimList title="Потребности и боли" items={result.needs} />
      {result.stakeholders && result.stakeholders.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Стейкхолдеры</p>
          <ul className="list-disc space-y-0.5 pl-4 text-text-main">
            {result.stakeholders.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.name}</span>{s.role ? ` — ${s.role}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ClaimList title="Риски сделки" items={result.deal_risks} />
      <StringList title="Рекомендации" items={result.recommendations} />
      <StringList title="Аргументы для КП" items={result.kp_arguments} />
    </div>
  );
}
