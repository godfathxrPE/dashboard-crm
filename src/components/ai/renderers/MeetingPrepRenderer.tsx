'use client';

import type { MeetingPrepResult } from '@/types/database';

/**
 * S-R2-AI-HARDEN (085) — бриф к встрече по сделке. READ-ONLY: ни чекбоксов, ни
 * «применить». Весь текст модели рендерится КАК ТЕКСТ (никакого HTML/markdown) —
 * тот же контур, что у остальных рендереров.
 */
export function MeetingPrepRenderer({ result }: { result: MeetingPrepResult }) {
  return (
    <div className="space-y-3 text-sm">
      {result.context && (
        <p className="whitespace-pre-wrap text-text-main">{result.context}</p>
      )}

      {result.participants && result.participants.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">С кем говорим</p>
          <ul className="space-y-0.5">
            {result.participants.map((p, i) => (
              <li key={i} className="text-text-main">
                <span className="font-medium">{p.name}</span>
                {p.note && <span className="text-text-mute"> — {p.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.open_items && result.open_items.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Что открыто</p>
          <ul className="list-disc space-y-0.5 pl-4 text-text-main">
            {result.open_items.map((x, i) => <li key={i} className="whitespace-pre-wrap">{x}</li>)}
          </ul>
        </div>
      )}

      {result.questions && result.questions.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">О чём спросить</p>
          <ol className="list-decimal space-y-0.5 pl-4 text-text-main">
            {result.questions.map((q, i) => <li key={i} className="whitespace-pre-wrap">{q}</li>)}
          </ol>
        </div>
      )}

      {result.watch_outs && result.watch_outs.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">На что обратить внимание</p>
          <ul className="space-y-0.5">
            {result.watch_outs.map((w, i) => (
              <li key={i} className="whitespace-pre-wrap text-text-dim">— {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
