'use client';

import { useMemo, useState } from 'react';
import { useCompletenessRules } from '@/lib/hooks/use-org-settings';
import { evaluateCompleteness } from '@/lib/domain/deal-completeness';
import type { Project } from '@/lib/hooks/use-projects';

// ═══════════════════════════════════════════════════════
// Data Completeness
// ═══════════════════════════════════════════════════════

/**
 * S-R3-TRUST-1: формула полноты уехала в домен (`lib/domain/deal-completeness.ts`),
 * состав правил и веса настраиваются организацией. Здесь остался только показ.
 *
 * Порог цвета теперь на `score`, а не на `filled`: прежний `filled >= 4` был завязан
 * на фиксированные 8 правил и при настраиваемом составе врал бы.
 */
/** Радиус и длина окружности доната (спека W9: 22×22, r 8, stroke 4). */
const RING_R = 8;
const RING_C = 2 * Math.PI * RING_R;

export function CompletenessBadge({ project }: { project: Project }) {
  const rules = useCompletenessRules();
  const { score, filled, total, missing } = useMemo(
    () => evaluateCompleteness(project, rules),
    [project, rules],
  );
  const [open, setOpen] = useState(false);

  // Пороги прежние (S-R3-TRUST-1). Дуга — палитровый оттенок, подпись — его
  // `-text`-вариант: 11px на `--surface` без подложки бейджа базовый оттенок
  // держит контраст не во всех темах. `--success`/`--warning`/`--danger` — алиасы
  // тех же `--green`/`--yellow`/`--red`, что красили бейдж.
  const tone = score === 100
    ? { arc: 'text-success', label: 'text-success-text' }
    : score >= 60
    ? { arc: 'text-warning', label: 'text-warning-text' }
    : { arc: 'text-danger', label: 'text-danger-text' };

  const title = `Заполнено ${filled} из ${total} ключевых полей сделки — полнота ${score}%`;
  // S-DEAL-SUMMARY-1 (W9): донат вместо бейджа. Доля — от filled/total, а не от
  // `score`: подпись рядом печатает именно «filled/total», дуга обязана с ней
  // совпадать (score взвешен и с долей расходится при неравных весах).
  const frac = total > 0 ? filled / total : 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        // S-UI-CLARITY-1: «6/8» само по себе не отличимо от процента стадии рядом
        title={title}
        aria-label={title}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          aria-hidden="true"
          className="-rotate-90 shrink-0"
        >
          <circle cx="11" cy="11" r={RING_R} fill="none" stroke="var(--surface2)" strokeWidth="4" />
          {frac > 0 && (
            <circle
              cx="11"
              cy="11"
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${frac * RING_C} ${RING_C}`}
              className={tone.arc}
            />
          )}
        </svg>
        <span className={`text-[0.6875rem] font-semibold tabular-nums ${tone.label}`}>
          {filled}/{total} полнота
        </span>
      </button>
      {open && missing.length > 0 && (
        <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-lg border border-border bg-popover p-2 elevation-2">
          <p className="mb-1 text-xs font-medium text-text-mute">Не заполнено:</p>
          {missing.map((rule) => (
            <div key={rule.key} className="py-0.5">
              <div className="text-xs text-text-dim">{rule.label}</div>
              {/* Суть оси достоверности: не «поле пустое», а что из-за этого не работает */}
              <div className="text-[0.6875rem] leading-snug text-text-mute">{rule.cost}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
