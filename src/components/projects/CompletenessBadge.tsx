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
export function CompletenessBadge({ project }: { project: Project }) {
  const rules = useCompletenessRules();
  const { score, filled, total, missing } = useMemo(
    () => evaluateCompleteness(project, rules),
    [project, rules],
  );
  const [open, setOpen] = useState(false);

  const colorClass = score === 100
    ? 'bg-green-l text-green'
    : score >= 60
    ? 'bg-yellow-l text-yellow'
    : 'bg-red-l text-red';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        // S-UI-CLARITY-1: «6/8» само по себе не отличимо от процента стадии рядом
        title={`Заполнено ${filled} из ${total} ключевых полей сделки — полнота ${score}%`}
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
      >
        {filled}/{total}
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
