'use client';

import type { DealSummaryResult } from '@/types/database';

/**
 * S-R2-AI-HARDEN (085) — краткая сводка по сделке для руководителя. READ-ONLY:
 * `next_step` здесь ПОКАЗЫВАЕТСЯ, но не применяется — write-back остаётся
 * привилегией одного пресета deal_progression.
 */
export function DealSummaryRenderer({ result }: { result: DealSummaryResult }) {
  return (
    <div className="space-y-3 text-sm">
      {result.state && (
        <p className="whitespace-pre-wrap text-text-main">{result.state}</p>
      )}

      {result.highlights && result.highlights.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Что произошло</p>
          <ul className="list-disc space-y-0.5 pl-4 text-text-main">
            {result.highlights.map((h, i) => <li key={i} className="whitespace-pre-wrap">{h}</li>)}
          </ul>
        </div>
      )}

      {result.next_step && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Следующий шаг</p>
          <p className="whitespace-pre-wrap text-text-main">{result.next_step}</p>
        </div>
      )}

      {result.flags && result.flags.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Требует внимания</p>
          <ul className="space-y-0.5">
            {result.flags.map((f, i) => (
              <li key={i} className="whitespace-pre-wrap text-yellow">— {f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
