'use client';

import { AlertCircle, ChevronDown, Clock, Loader2, WandSparkles } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatBriefChipDate, type BriefKind, type BriefRuns } from '@/lib/domain/company-brief';

// ═══════════════════════════════════════════════════════
// S-BRIEF-IN-DEAL-1.2: кнопка «AI-бриф · дд.мм ⌄» в футере «Следующего шага».
// Классы — те же, что у «Шаг сделан»: кнопка из той же левой группы «что делаем
// с шагом» и не должна спорить с ней весом. Точка «новое» на стекле красится
// правилом `.glass-sheet .bg-accent` (метка темы), theme-if здесь не нужен.
// ═══════════════════════════════════════════════════════

const TAIL: Partial<Record<BriefKind, string>> = {
  running: 'собираем…',
  queued: 'в очереди',
  lowData: 'мало данных',
  failed: 'не собран',
  none: 'нет брифа',
};

function BriefIcon({ kind }: { kind: BriefKind }) {
  if (kind === 'running') return <Loader2 size={14} className="motion-safe:animate-spin" />;
  if (kind === 'queued') return <Clock size={14} />;
  if (kind === 'failed') return <AlertCircle size={14} />;
  return <WandSparkles size={14} />;
}

export function DealBriefButton({
  kind,
  runs,
  open,
  onToggle,
}: {
  kind: BriefKind;
  runs: BriefRuns;
  open: boolean;
  onToggle: () => void;
}) {
  const date = runs.latestDone ? formatBriefChipDate(runs.latestDone.created_at) : null;
  const tail =
    (kind === 'new' || kind === 'fresh' || kind === 'stale') && date ? (
      <span className={cn('tabular-nums', kind === 'stale' && 'text-warning-text')}>{date}</span>
    ) : TAIL[kind] ? (
      <span>{TAIL[kind]}</span>
    ) : null;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="deal-brief-panel"
      aria-label={kind === 'new' ? 'AI-бриф компании, новый' : undefined}
      className={cn(
        'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-0.5',
        'text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-text-main',
        open && 'bg-surface2 text-text-main',
      )}
    >
      {kind === 'new' && <span aria-hidden="true" className="size-[0.4375rem] rounded-full bg-accent" />}
      <BriefIcon kind={kind} />
      <span>AI-бриф</span>
      {tail && (
        <>
          <span aria-hidden="true" className="opacity-70">·</span>
          {tail}
        </>
      )}
      <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
    </button>
  );
}
