// ═══════════════════════════════════════════════════════
// Delivery-состояния — ЕДИНСТВЕННЫЙ источник (спринт P1, §9 ФИНАЛ).
// Состояние проекта внедрения = phase_group стадии project-пайплайна
// (стадия = фаза СДР, живёт в stage_id). Слаги НЕ пересекаются с
// deal-константами (attraction/working/approval/closing) — те не трогаем.
// ═══════════════════════════════════════════════════════

export const DELIVERY_PHASE_ORDER = ['initiated', 'planning', 'execution', 'completed'] as const;

export type DeliveryPhase = (typeof DELIVERY_PHASE_ORDER)[number];

export const DELIVERY_PHASE_LABELS: Record<string, string> = {
  initiated: 'Инициирован',
  planning: 'Планируется',
  execution: 'Исполняется',
  completed: 'Завершён',
};

// Цвета — var(--…) по образцу PipelineBoard (PHASE_TINT/HEADER_COLOR)
export const DELIVERY_PHASE_COLOR: Record<string, string> = {
  initiated: 'var(--track-prep-current)',
  planning: 'var(--track-exp-current)',
  execution: 'var(--track-nego-current, var(--track-exp-current))',
  completed: 'var(--track-proj-current)',
};

export const DELIVERY_KIND_LABELS: Record<string, string> = {
  launch: 'Полный запуск',
  experiment: 'Эксперимент',
};
