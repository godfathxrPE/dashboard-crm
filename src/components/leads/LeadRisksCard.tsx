'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { pluralRu } from '@/lib/utils/plural';
import { STATE_STROKE } from '@/lib/domain/health-ring';
import { SignalRow, VERDICT_STYLES } from '@/components/projects/DealSignals';
import type { LeadSignalKey, LeadSignalsResult, LeadVerdict } from '@/lib/domain/lead-signals';

// ═══════════════════════════════════════════════════════
// S-LEAD-V2-HEALTH-1 (спека §7, W5): зона «Риски» лида — вердикт, посигнальная
// полоса и список помех. Единственное словесное место риска лида (F-01).
//
// Кольца нет (R-06): у лида уровни, а не баллы — три сигнала на дуге читались бы
// оценкой. Разметка полосы и строк — сделки (`DealHealthRing`, `DealSignals`),
// классы вердикта и строка сигнала импортируются, а не копируются.
// ═══════════════════════════════════════════════════════

/** Подписи вердикта лида: «Киснет» у сделки — про деньги, у лида — «Остывает». */
const LEAD_VERDICT_CONFIG: Record<LeadVerdict, { label: string; glyph: string }> = {
  ok: { label: 'В порядке', glyph: '●' },
  attention: { label: 'Внимание', glyph: '◐' },
  rotting: { label: 'Остывает', glyph: '▲' },
};

/** Якоря CTA: `step` — стекло шага, `regulatory` — карточка квалификации. */
const LEAD_SIGNAL_ANCHORS: Record<LeadSignalKey, string | null> = {
  step: 'lead-next-step',
  regulatory: 'lead-qualification',
  first_touch: null,
};

export function scrollToLeadSignalAnchor(key: LeadSignalKey): void {
  const id = LEAD_SIGNAL_ANCHORS[key];
  if (!id) return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function countsCaption(counts: { bad: number; warn: number; ok: number }): string {
  if (counts.bad + counts.warn + counts.ok === 0) return 'сигналов нет — лид в норме';
  const parts: string[] = [];
  if (counts.bad > 0) parts.push(`${counts.bad} ${pluralRu(counts.bad, 'критичный', 'критичных', 'критичных')}`);
  if (counts.warn > 0) parts.push(`${counts.warn} внимание`);
  if (counts.ok > 0) parts.push(`${counts.ok} в норме`);
  return parts.join(' · ');
}

export function LeadRisksCard({
  result,
  onAction = scrollToLeadSignalAnchor,
}: {
  result: LeadSignalsResult;
  onAction?: (key: LeadSignalKey) => void;
}) {
  // Раскрытие свёрнутой нормы — состояние экрана, не данных: не персистим.
  const [normalOpen, setNormalOpen] = useState(false);
  const { verdict, signals } = result;
  const config = LEAD_VERDICT_CONFIG[verdict];
  const styles = VERDICT_STYLES[verdict];

  const problems = signals.filter((s) => s.state !== 'ok');
  const normal = signals.filter((s) => s.state === 'ok');
  const counts = {
    bad: signals.filter((s) => s.state === 'bad').length,
    warn: signals.filter((s) => s.state === 'warn').length,
    ok: normal.length,
  };
  const caption = countsCaption(counts);

  return (
    <div data-card className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body text-text-dim">Здоровье лида</p>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
            styles.chip,
          )}
        >
          <span aria-hidden className={cn('leading-none', styles.glyph)}>{config.glyph}</span>
          {config.label}
        </span>
      </div>

      {/* Порядок сегментов = порядок строк ниже (bad → warn → ok): полоса — легенда к списку. */}
      {signals.length > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5" role="img" aria-label={`Сигналы лида: ${caption}`}>
          {signals.map((s) => (
            <span
              key={s.key}
              className="h-1.5 min-w-0 flex-1 rounded-full"
              style={{ background: STATE_STROKE[s.state] }}
            />
          ))}
        </div>
      )}
      <p className="mt-2 text-meta leading-snug text-text-dim">{caption}</p>

      {/* Список — ветка `showVerdict={false}` из DealSignals: помехи открыты, норма свёрнута. */}
      <div className="mt-3 min-w-0">
        {problems.length > 0 ? (
          <ul className="-mx-2 space-y-0.5">
            {problems.map((s) => (
              <SignalRow key={s.key} signal={s} onAction={onAction} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-dim">Всё в норме</p>
        )}

        {normal.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setNormalOpen((v) => !v)}
              aria-expanded={normalOpen}
              className={cn(
                'flex items-center gap-1 rounded-lg px-1 py-0.5 text-meta text-text-mute',
                'transition-colors hover:text-text-dim',
                problems.length > 0 && 'mt-1.5',
              )}
            >
              {normal.length} в норме
              <ChevronDown
                size={12}
                aria-hidden
                className={cn('transition-transform', normalOpen && 'rotate-180')}
              />
            </button>
            {normalOpen && (
              <ul className="-mx-2 mt-0.5 space-y-0.5">
                {normal.map((s) => (
                  <SignalRow key={s.key} signal={s} onAction={onAction} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
