'use client';

import type { SpinReviewResult } from '@/types/database';

const SPIN_KEYS = ['situation', 'problem', 'implication', 'need_payoff'] as const;
const SPIN_SHORT: Record<(typeof SPIN_KEYS)[number], string> = {
  situation: 'S', problem: 'P', implication: 'I', need_payoff: 'N',
};
const TYPE_LABEL: Record<'S' | 'P' | 'I' | 'N', string> = {
  S: 'Ситуационные', P: 'Проблемные', I: 'Извлекающие', N: 'Направляющие',
};

export function SpinReviewRenderer({ result }: { result: SpinReviewResult }) {
  const c = result.counts;
  return (
    <div className="space-y-3 text-sm">
      {/* Общая оценка */}
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold text-text-main">{result.score.value}/10</span>
        {result.score.rationale && <span className="text-xs text-text-mute">{result.score.rationale}</span>}
      </div>

      {/* Счёт S/P/I/N */}
      <div className="grid grid-cols-4 gap-2">
        {SPIN_KEYS.map((k) => (
          <div key={k} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-center">
            <p className="text-base font-semibold text-text-main">{c[k] ?? 0}</p>
            <p className="text-[10px] uppercase text-text-mute">{SPIN_SHORT[k]}</p>
          </div>
        ))}
      </div>

      {/* Примеры-цитаты */}
      {result.examples && result.examples.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Примеры вопросов</p>
          <ul className="space-y-1">
            {result.examples.map((ex, i) => (
              <li key={i} className="text-text-main">
                <span className="mr-1.5 rounded bg-surface-hover px-1 text-[10px] font-medium text-text-dim">
                  {TYPE_LABEL[ex.type] ?? ex.type}
                </span>
                <span className="italic text-text-mute">«{ex.quote}»</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Что упущено */}
      {result.missed && result.missed.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Что упущено</p>
          <ul className="list-disc space-y-0.5 pl-4 text-text-main">
            {result.missed.map((m, i) => <li key={i} className="whitespace-pre-wrap">{m}</li>)}
          </ul>
        </div>
      )}

      {/* Вопросы к следующему звонку */}
      {result.next_questions && result.next_questions.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Вопросы к следующему звонку</p>
          <ol className="list-decimal space-y-0.5 pl-4 text-text-main">
            {result.next_questions.map((q, i) => <li key={i} className="whitespace-pre-wrap">{q}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}
