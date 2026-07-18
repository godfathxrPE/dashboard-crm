import type { Direction, ProjectMemberRole, ProjectType } from '@/types/database';

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

// Цвета — var(--…) по образцу PipelineBoard (PHASE_TINT/HEADER_COLOR).
// ТОЛЬКО для маркеров/заливок (точка, тинт-градиент), НЕ для текста.
export const DELIVERY_PHASE_COLOR: Record<string, string> = {
  initiated: 'var(--track-prep-current)',
  planning: 'var(--track-exp-current)',
  execution: 'var(--track-nego-current, var(--track-exp-current))',
  completed: 'var(--track-proj-current)',
};

// Цвет ТЕКСТА заголовка фазы — семантические *-text токены (visual-audit P1 §2.1).
// Fallback на базовый семантический токен (--accent/--purple/…), а НЕ на
// track-current: в светлых темах (paper/sand) track-current — яркая пастель,
// нечитаемая как текст. Базовые семантические токены text-совместимы во всех темах.
export const DELIVERY_PHASE_TEXT: Record<string, string> = {
  initiated: 'var(--accent-text, var(--accent))',
  planning: 'var(--purple-text, var(--purple))',
  execution: 'var(--yellow-text, var(--yellow))',
  completed: 'var(--blue-text, var(--blue))',
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

// ═══════════════════════════════════════════════════════
// P2b: команда проекта (project_members, миграция 037) + прогресс задач
// ═══════════════════════════════════════════════════════

// S-TEAM-ROLES-1 (063): 8 ролей — DB-суперсет; Record<ProjectMemberRole,…>
// заставляет tsc ловить пропущенный ключ при следующем расширении.
export const PROJECT_MEMBER_ROLE_LABELS: Record<ProjectMemberRole, string> = {
  pm: 'Руководитель проекта',
  manager: 'Менеджер проекта',
  analyst: 'Аналитик',
  architect: 'Архитектор',
  developer: 'Программист',
  implementer: 'Внедренец',
  installer: 'Монтажник',
  launch_lead: 'Руководитель запуска',
};

// тип роли — ProjectMemberRole в types/database.ts (единый источник);
// полный порядок отображения — группировка показывает любую присутствующую
// роль (включая легаси вне категории проекта)
export const PROJECT_MEMBER_ROLE_ORDER = [
  'pm', 'manager', 'analyst', 'architect', 'developer',
  'implementer', 'installer', 'launch_lead',
] as const;

// Селектируемые роли по категории проекта (UI-фильтр; БД хранит один суперсет).
export const PROJECT_ROLES_BY_CATEGORY: Record<'erp' | 'iiot' | 'internal', ProjectMemberRole[]> = {
  erp:      ['pm', 'manager', 'analyst', 'architect', 'developer'],
  iiot:     ['pm', 'manager', 'analyst', 'implementer', 'installer', 'launch_lead'],
  internal: ['pm', 'manager', 'analyst'],
};

export function rolesForProject(
  direction: Direction | null,
  type: ProjectType,
): ProjectMemberRole[] {
  if (type === 'internal') return PROJECT_ROLES_BY_CATEGORY.internal;
  if (direction === 'iiot') return PROJECT_ROLES_BY_CATEGORY.iiot;
  return PROJECT_ROLES_BY_CATEGORY.erp; // delivery/client с erp — дефолт
}

/** Показывать «N/M задач»: только когда у проекта вообще есть задачи */
export function hasTaskProgress(progressTotal: number | null | undefined): boolean {
  return (progressTotal ?? 0) > 0;
}
