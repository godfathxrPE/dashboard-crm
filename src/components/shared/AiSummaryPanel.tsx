'use client';

import { Sparkles, Loader2, RefreshCw, AlertCircle, Check } from 'lucide-react';
import { useAiSummary, type AiSummaryEntity } from '@/lib/hooks/use-ai-summary';
import type { AiSummary } from '@/types/database';

interface AiSummaryPanelProps {
  entityType: AiSummaryEntity;
  entityId: string;
  aiSummary: AiSummary | null;
  aiSummaryAt: string | null;
  /** Есть ли заметки для анализа (agreements/notes непустые) */
  hasNotes: boolean;
  /** Подставить предложенный шаг в поле «Следующий шаг» формы */
  onApplyNextStep: (step: string) => void;
}

/**
 * Sprint 28: кнопка «AI-резюме» + блок результата для карточки звонка/встречи.
 * Весь вывод рендерится ТОЛЬКО как текст (security №1: без markdown/HTML-инъекций).
 */
export function AiSummaryPanel({
  entityType, entityId, aiSummary, aiSummaryAt, hasNotes, onApplyNextStep,
}: AiSummaryPanelProps) {
  const generate = useAiSummary();
  const isPending = generate.isPending;

  const handleGenerate = () => {
    if (isPending) return;
    generate.mutate({ entity_type: entityType, entity_id: entityId });
  };

  // Кнопка активна только когда есть что суммировать.
  const buttonDisabled = isPending || (!aiSummary && !hasNotes);

  return (
    <div className="rounded-lg border border-border bg-surface-hover/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-dim">
          <Sparkles size={14} className="text-accent" />
          <span>AI-резюме</span>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={buttonDisabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-main hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <><Loader2 size={13} className="animate-spin" /> Генерирую…</>
          ) : aiSummaryAt ? (
            <><RefreshCw size={13} /> Обновить резюме</>
          ) : (
            <><Sparkles size={13} /> Сгенерировать</>
          )}
        </button>
      </div>

      {!aiSummary && !hasNotes && !isPending && (
        <p className="mt-2 text-xs text-text-mute">
          Заполните заметки — и AI составит резюме с ключевыми пунктами и следующим шагом.
        </p>
      )}

      {generate.isError && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-red">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{generate.error?.message ?? 'Не удалось сгенерировать резюме'}</span>
        </div>
      )}

      {aiSummary && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="whitespace-pre-wrap text-text-main">{aiSummary.summary}</p>

          {aiSummary.key_points.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-text-dim">Ключевые пункты</p>
              <ul className="list-disc space-y-0.5 pl-4 text-text-main">
                {aiSummary.key_points.map((point, i) => (
                  <li key={i} className="whitespace-pre-wrap">{point}</li>
                ))}
              </ul>
            </div>
          )}

          {aiSummary.risks.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-text-dim">Риски</p>
              <ul className="list-disc space-y-0.5 pl-4 text-text-main">
                {aiSummary.risks.map((risk, i) => (
                  <li key={i} className="whitespace-pre-wrap">{risk}</li>
                ))}
              </ul>
            </div>
          )}

          {aiSummary.suggested_next_step && (
            <div>
              <p className="mb-1 text-xs font-medium text-text-dim">Предлагаемый следующий шаг</p>
              <div className="flex items-start gap-2">
                <p className="flex-1 whitespace-pre-wrap text-text-main">{aiSummary.suggested_next_step}</p>
                <button
                  type="button"
                  onClick={() => onApplyNextStep(aiSummary.suggested_next_step)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-accent hover:bg-surface-hover"
                >
                  <Check size={12} /> Применить
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
