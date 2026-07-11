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

/** Лейбл вида внедрения с учётом направления: у ERP нет «запусков» и экспериментов */
export function deliveryKindLabel(kind: string, direction?: string | null): string {
  if (direction === 'erp') return kind === 'launch' ? 'Внедрение' : 'Эксперимент';
  return DELIVERY_KIND_LABELS[kind] ?? kind;
}

// ═══════════════════════════════════════════════════════
// P2a: фазовая доска — колонка = фаза СДР (category='phase'),
// статус задачи живёт в lane (истина; БД-резолвер lane не деривит).
// ═══════════════════════════════════════════════════════

export const DELIVERY_TASK_STATUS_LABELS: Record<string, string> = {
  next: 'Не начата',
  now: 'В работе',
  wait: 'Ожидание',
  done: 'Готово',
};

/** Цикл смены статуса кликом по badge; 'wait' вне цикла (ставится только вручную) */
export const DELIVERY_TASK_STATUS_ORDER = ['next', 'now', 'done'] as const;

export type DeliveryTaskStatus = (typeof DELIVERY_TASK_STATUS_ORDER)[number];

export const DELIVERY_TASK_OVERDUE_LABEL = 'Просрочена';

/** Следующий статус в цикле next → now → done → next; из 'wait' — в начало цикла */
export function cycleDeliveryTaskStatus(lane: string): DeliveryTaskStatus {
  const i = DELIVERY_TASK_STATUS_ORDER.indexOf(lane as DeliveryTaskStatus);
  return DELIVERY_TASK_STATUS_ORDER[(i + 1) % DELIVERY_TASK_STATUS_ORDER.length];
}

/** Просрочена: дедлайн в прошлом и задача не завершена */
export function isDeliveryTaskOverdue(
  deadline: string | null | undefined,
  lane: string,
  now: Date = new Date(),
): boolean {
  if (!deadline || lane === 'done') return false;
  return new Date(deadline).getTime() < now.getTime();
}

/** Фазовый режим доски — деривация от данных (все колонки category='phase'), не от project.type */
export function isPhaseBoard(columns: ReadonlyArray<{ category: string }>): boolean {
  return columns.length > 0 && columns.every((c) => c.category === 'phase');
}
