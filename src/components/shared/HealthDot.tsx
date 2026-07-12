'use client';

import { cn } from '@/lib/utils/cn';
import type { HealthLevel } from '@/lib/utils/deal-health';

// P1 §2.6: статус кодируется формой глифа + цветом (не только цветом) —
// при дейтеранопии красный↔жёлтый неразличимы. Глиф вместо круглого спана:
// ● здорова · ◐ внимание · ▲ критично. Цвет через text-* токены.
const LEVEL_STYLES: Record<HealthLevel, { text: string; label: string; glyph: string }> = {
  green:  { text: 'text-green',  label: 'Здорова',  glyph: '●' },
  yellow: { text: 'text-yellow', label: 'Внимание', glyph: '◐' },
  red:    { text: 'text-red',    label: 'Критично', glyph: '▲' },
};

interface HealthDotProps {
  level: HealthLevel;
  score?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function HealthDot({ level, score, showLabel = false, size = 'sm' }: HealthDotProps) {
  const config = LEVEL_STYLES[level];
  const label = `Здоровье: ${score ?? '?'}/8 — ${config.label}`;
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={label} title={label}>
      <span aria-hidden className={cn(
        'inline-block w-3 text-center leading-none',
        size === 'sm' ? 'text-[10px]' : 'text-xs',
        config.text,
      )}>
        {config.glyph}
      </span>
      {showLabel && <span className="text-xs text-text-mute">{config.label}</span>}
    </div>
  );
}
