'use client';

import type { PulseDay, PulseDayKind } from '@/lib/domain/deal-pulse';
import { mskDayCaption } from '@/lib/utils/date-helpers';
import { TOUCH_KIND_WORDS } from '@/lib/utils/today-text';

// ═══════════════════════════════════════════════════════
// S-TODAY-V3-SCREEN-1: полоса «Было» — 30 капсул, по одной на день (решение C-21).
// Общая для раскрытой строки «Сегодня» и «Пульса» карточки сделки: окно одно
// (`buildPulseDays` = окно `buildDealPulse`), картинка тоже должна быть одна.
//
// Смена стадии — `--info`, НЕ `--accent`: в `t-washi` акцент равен красному и
// капсула читалась бы как просрочка, в `t-aura` акцент не цветной. Касание —
// нейтральный `--text` 50%, пустой день — 8%: различие по светлоте, а не по цвету.
// ═══════════════════════════════════════════════════════

const FILL: Record<PulseDayKind, string> = {
  none: 'color-mix(in srgb, var(--text) 8%, transparent)',
  touch: 'color-mix(in srgb, var(--text) 50%, transparent)',
  stage: 'var(--info)',
};

function dayTitle(d: PulseDay): string {
  const date = mskDayCaption(d.day);
  const base =
    d.count === 0
      ? `${date} · событий нет`
      : `${date} · ${d.kind === 'stage' ? 'смена стадии' : TOUCH_KIND_WORDS[d.kinds[0]]}, событий: ${d.count}`;
  return d.isDue ? `${base} · срок шага` : base;
}

export function PulseDayStrip({ days, dueLabel }: { days: readonly PulseDay[]; dueLabel?: string }) {
  const touched = days.filter((d) => d.count > 0).length;

  return (
    <div>
      <div
        role="img"
        aria-label={`30 дней: дней с касаниями — ${touched}`}
        className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-1"
      >
        {days.map((d) => (
          <div key={d.day} className="flex flex-col items-center" title={dayTitle(d)}>
            {/* Место под засечку резервируется всегда: полоса не прыгает по высоте,
                когда срок шага входит в окно или выходит из него. */}
            <span className="flex h-2 items-end">
              {d.isDue && (
                <span
                  aria-hidden="true"
                  className="block h-0 w-0 border-x-[0.25rem] border-t-[0.3125rem] border-x-transparent"
                  style={{ borderTopColor: 'var(--text-dim)' }}
                />
              )}
            </span>
            <span className="mt-0.5 block h-[1.375rem] w-full rounded-full" style={{ background: FILL[d.kind] }} />
          </div>
        ))}
      </div>

      {days.length > 0 && (
        <div className="mt-1 flex justify-between text-meta text-text-mute">
          <span>{mskDayCaption(days[0].day)}</span>
          <span>сегодня</span>
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-text-dim">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-2.5 w-1.5 rounded-full" style={{ background: FILL.touch }} />
          касание
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-2.5 w-1.5 rounded-full" style={{ background: FILL.stage }} />
          смена стадии
        </span>
        {dueLabel && (
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block h-0 w-0 border-x-[0.25rem] border-t-[0.3125rem] border-x-transparent"
              style={{ borderTopColor: 'var(--text-dim)' }}
            />
            срок шага {dueLabel}
          </span>
        )}
      </div>
    </div>
  );
}
