'use client';

import { cn } from '@/lib/utils/cn';
import type { DeliveryHealth, DeliveryHealthStatus } from '@/lib/utils/delivery-health';

// ═══════════════════════════════════════════════════════
// S-DLV-HEALTH-1 — бейдж health внедрения (по образцу sales HealthDot).
// Статус кодируется формой глифа + цветом (не только цветом: при дейтеранопии
// red↔yellow неразличимы). Цвет — через text-* токены, ноль hex.
//   ● в норме · ◐ внимание · ▲ риск
// ═══════════════════════════════════════════════════════

const STATUS_STYLES: Record<DeliveryHealthStatus, { text: string; label: string; glyph: string }> = {
  healthy: { text: 'text-green', label: 'В норме', glyph: '●' },
  attention: { text: 'text-yellow', label: 'Внимание', glyph: '◐' },
  at_risk: { text: 'text-red', label: 'Риск', glyph: '▲' },
};

interface DeliveryHealthDotProps {
  health: DeliveryHealth;
  size?: 'sm' | 'md';
  /** Показать текстовый лейбл статуса рядом с глифом (шапка ProjectDetail). */
  showLabel?: boolean;
}

export function DeliveryHealthDot({ health, size = 'sm', showLabel = false }: DeliveryHealthDotProps) {
  const cfg = STATUS_STYLES[health.status];
  const reasonsText = health.reasons.length ? ` — ${health.reasons.join('; ')}` : '';
  const label = `Здоровье внедрения: ${cfg.label}${reasonsText}`;

  return (
    <div className="inline-flex items-center gap-1.5" role="img" aria-label={label} title={label}>
      <span
        aria-hidden
        className={cn(
          'inline-block w-3 text-center leading-none',
          size === 'sm' ? 'text-[10px]' : 'text-xs',
          cfg.text,
        )}
      >
        {cfg.glyph}
      </span>
      {showLabel && <span className="text-xs text-text-mute">{cfg.label}</span>}
    </div>
  );
}
