'use client';

import { cn } from '@/lib/utils/cn';
import type { HealthLevel } from '@/lib/utils/deal-health';

const LEVEL_STYLES: Record<HealthLevel, { dot: string; label: string }> = {
  green:  { dot: 'bg-green', label: 'Здорова' },
  yellow: { dot: 'bg-yellow', label: 'Внимание' },
  red:    { dot: 'bg-red', label: 'Критично' },
};

interface HealthDotProps {
  level: HealthLevel;
  score?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function HealthDot({ level, score, showLabel = false, size = 'sm' }: HealthDotProps) {
  const config = LEVEL_STYLES[level];
  return (
    <div className="flex items-center gap-1.5" title={`Здоровье: ${score ?? '?'}/8 — ${config.label}`}>
      <span className={cn(
        'rounded-full inline-block',
        config.dot,
        size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5',
      )} />
      {showLabel && <span className="text-xs text-text-mute">{config.label}</span>}
    </div>
  );
}
