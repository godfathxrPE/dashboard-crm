import { z } from 'zod';

// ═══════════════════════════════════════════════════════
// Deal Stages — 14 стадий из Supabase enum `deal_stage`
// Паттерн: Pipedrive (Deals Pipeline) + Salesforce (Opportunity Stages)
// ═══════════════════════════════════════════════════════

export const dealStages = [
  'new_lead', 'qualification', 'waiting_materials', 'preparing_kp',
  'kp_sent', 'kp_review', 'preparing_docs', 'cz_approval',
  'trilateral_meeting', 'experiment_setup', 'contract_review',
  'contract_signing', 'won', 'lost',
] as const;

export type DealStage = (typeof dealStages)[number];

// ═══════════════════════════════════════════════════════
// Stage Config — метаданные каждой стадии
// ═══════════════════════════════════════════════════════

export interface StageConfig {
  label: string;
  shortLabel: string;
  phase: Phase;
  order: number;
  probability: number; // 0-100, win probability at this stage
}

export const STAGE_CONFIG: Record<DealStage, StageConfig> = {
  new_lead:           { label: 'Новый лид',              shortLabel: 'Лид',        phase: 'attract',    order: 0,  probability: 5 },
  qualification:      { label: 'Квалификация',           shortLabel: 'Квалиф.',    phase: 'attract',    order: 1,  probability: 10 },
  waiting_materials:  { label: 'Ожидание материалов',    shortLabel: 'Материалы',  phase: 'attract',    order: 2,  probability: 15 },
  preparing_kp:       { label: 'Подготовка КП',          shortLabel: 'Подг. КП',   phase: 'develop',    order: 3,  probability: 25 },
  kp_sent:            { label: 'КП отправлено',          shortLabel: 'КП отпр.',   phase: 'develop',    order: 4,  probability: 35 },
  kp_review:          { label: 'Рассмотрение КП',        shortLabel: 'Рассм. КП',  phase: 'develop',    order: 5,  probability: 45 },
  preparing_docs:     { label: 'Подготовка документов',   shortLabel: 'Док-ты',     phase: 'negotiate',  order: 6,  probability: 55 },
  cz_approval:        { label: 'Согласование с ЧЗ',      shortLabel: 'Согл. ЧЗ',   phase: 'negotiate',  order: 7,  probability: 60 },
  trilateral_meeting: { label: 'Трёхсторонняя встреча',  shortLabel: '3-стор.',    phase: 'negotiate',  order: 8,  probability: 70 },
  experiment_setup:   { label: 'Оформление эксперимента',shortLabel: 'Экспер.',    phase: 'negotiate',  order: 9,  probability: 75 },
  contract_review:    { label: 'Согласование договора',   shortLabel: 'Согл. дог.', phase: 'close',      order: 10, probability: 85 },
  contract_signing:   { label: 'Подписание договора',     shortLabel: 'Подпис.',    phase: 'close',      order: 11, probability: 95 },
  won:                { label: 'Сделка выиграна',         shortLabel: 'Выигр.',     phase: 'close',      order: 12, probability: 100 },
  lost:               { label: 'Сделка проиграна',        shortLabel: 'Проигр.',    phase: 'close',      order: 13, probability: 0 },
};

// ═══════════════════════════════════════════════════════
// Phases — группировка стадий для Kanban-колонок
// Архитектурное решение: 14 стадий — слишком много для горизонтального Kanban.
// Решение по опыту Salesforce Opportunity Board:
// группируем в 4 фазы, внутри каждой — детальный прогресс на карточке.
// ═══════════════════════════════════════════════════════

export const phases = ['attract', 'develop', 'negotiate', 'close'] as const;
export type Phase = (typeof phases)[number];

export interface PhaseConfig {
  label: string;
  color: string;
  bgColor: string;
  dotColor: string;
  stages: DealStage[];
}

export const PHASE_CONFIG: Record<Phase, PhaseConfig> = {
  attract: {
    label: 'Привлечение',
    color: 'text-blue',
    bgColor: 'bg-blue-l',
    dotColor: 'bg-blue',
    stages: ['new_lead', 'qualification', 'waiting_materials'],
  },
  develop: {
    label: 'Проработка',
    color: 'text-accent',
    bgColor: 'bg-accent-l',
    dotColor: 'bg-accent',
    stages: ['preparing_kp', 'kp_sent', 'kp_review'],
  },
  negotiate: {
    label: 'Согласование',
    color: 'text-yellow',
    bgColor: 'bg-yellow-l',
    dotColor: 'bg-yellow',
    stages: ['preparing_docs', 'cz_approval', 'trilateral_meeting', 'experiment_setup'],
  },
  close: {
    label: 'Закрытие',
    color: 'text-green',
    bgColor: 'bg-green-l',
    dotColor: 'bg-green',
    stages: ['contract_review', 'contract_signing', 'won'],
  },
};

/** Получить фазу по стадии */
export function getPhaseForStage(stage: DealStage): Phase {
  return STAGE_CONFIG[stage].phase;
}

/** Получить активные (не won/lost) стадии */
export function getActiveStages(): DealStage[] {
  return dealStages.filter((s) => s !== 'won' && s !== 'lost');
}

/** Следующая стадия в pipeline (или null если won/lost) */
export function getNextStage(current: DealStage): DealStage | null {
  const idx = STAGE_CONFIG[current].order;
  const next = dealStages.find((s) => STAGE_CONFIG[s].order === idx + 1);
  return next ?? null;
}

/** Предыдущая стадия (или null если new_lead) */
export function getPrevStage(current: DealStage): DealStage | null {
  const idx = STAGE_CONFIG[current].order;
  const prev = dealStages.find((s) => STAGE_CONFIG[s].order === idx - 1);
  return prev ?? null;
}

// ═══════════════════════════════════════════════════════
// Loss Reasons — предустановленные причины проигрыша
// Паттерн из HubSpot: выбираем категорию + свободный комментарий
// ═══════════════════════════════════════════════════════

export const lossReasons = [
  'budget',
  'competitor',
  'timing',
  'no_decision',
  'no_need',
  'relationship',
  'other',
] as const;

export type LossReason = (typeof lossReasons)[number];

export const LOSS_REASON_CONFIG: Record<LossReason, { label: string }> = {
  budget:       { label: 'Бюджет / Цена' },
  competitor:   { label: 'Выбрали конкурента' },
  timing:       { label: 'Неподходящее время' },
  no_decision:  { label: 'Не принято решение' },
  no_need:      { label: 'Нет потребности' },
  relationship: { label: 'Проблемы с коммуникацией' },
  other:        { label: 'Другое' },
};

// ═══════════════════════════════════════════════════════
// Sort options
// ═══════════════════════════════════════════════════════

export const sortOptions = [
  { value: 'created_at',  label: 'По добавлению' },
  { value: 'deadline',    label: 'По дедлайну' },
  { value: 'budget',      label: 'По бюджету' },
  { value: 'stage',       label: 'По стадии' },
] as const;

export type SortOption = (typeof sortOptions)[number]['value'];

// ═══════════════════════════════════════════════════════
// Zod Form Schema
// ═══════════════════════════════════════════════════════

export const projectFormSchema = z.object({
  name: z.string().min(1, 'Введи название проекта'),
  company_id: z.string().uuid().nullable().default(null),
  contact_id: z.string().uuid().nullable().default(null),
  stage: z.enum(dealStages).default('new_lead'),
  budget: z.number().int().nonnegative().nullable().default(null),
  deadline: z.string().nullable().default(null),
  next_step: z.string().nullable().default(null),
  loss_reason: z.string().nullable().default(null),
  loss_detail: z.string().nullable().default(null),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

// ═══════════════════════════════════════════════════════
// Budget formatting helpers
// ═══════════════════════════════════════════════════════

/** Форматировать бюджет из копеек в рубли */
export function formatBudget(kopecks: number | null): string {
  if (kopecks == null) return '—';
  const rub = kopecks / 100;
  if (rub >= 1_000_000) return `${(rub / 1_000_000).toFixed(1)}M ₽`;
  if (rub >= 1_000) return `${(rub / 1_000).toFixed(0)}K ₽`;
  return `${rub.toFixed(0)} ₽`;
}

/** Парсить ввод пользователя в копейки */
export function parseBudgetInput(input: string): number | null {
  const cleaned = input.replace(/[\s₽руб.rub]/gi, '').trim();
  if (!cleaned) return null;
  const num = parseFloat(cleaned.replace(',', '.'));
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}
