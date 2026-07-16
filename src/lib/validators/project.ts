import { z } from 'zod';

// ═══════════════════════════════════════════════════════
// Легаси-лейблы стадий (enum `deal_stage` снят в миграции 047).
// Оставлены ТОЛЬКО для форматирования исторических событий
// activity_log.stage_change — их payload.from/to держат старые enum-строки
// (напр. 'contract_review'). Живая стадия сделки берётся из stage_id →
// pipeline_stages (usePipelineStages / useStagesMap), а не отсюда.
// ═══════════════════════════════════════════════════════

export const LEGACY_STAGE_LABELS: Record<string, string> = {
  new_lead: 'Лид', qualification: 'Квалиф.', waiting_materials: 'Материалы',
  preparing_kp: 'Подг. КП', kp_sent: 'КП отпр.', kp_review: 'Рассм. КП',
  preparing_docs: 'Док-ты', cz_approval: 'Согл. ЧЗ', trilateral_meeting: '3-стор.',
  experiment_setup: 'Экспер.', contract_review: 'Согл. дог.', contract_signing: 'Подпис.',
  won: 'Выигр.', lost: 'Проигр.',
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
}

export const PHASE_CONFIG: Record<Phase, PhaseConfig> = {
  attract: {
    label: 'Привлечение',
    color: 'text-blue',
    bgColor: 'bg-blue-l',
    dotColor: 'bg-blue',
  },
  develop: {
    label: 'Проработка',
    color: 'text-accent',
    bgColor: 'bg-accent-l',
    dotColor: 'bg-accent',
  },
  negotiate: {
    label: 'Согласование',
    color: 'text-yellow',
    bgColor: 'bg-yellow-l',
    dotColor: 'bg-yellow',
  },
  close: {
    label: 'Закрытие',
    color: 'text-green',
    bgColor: 'bg-green-l',
    dotColor: 'bg-green',
  },
};

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
// Won Reasons — причины выигрыша (симметрия loss, миграция 043)
// Стартовый набор под IT-интеграцию/маркировку
// ═══════════════════════════════════════════════════════

export const wonReasons = [
  'price',
  'features',
  'deadline',
  'trust',
  'referral',
  'compliance',
  'no_alternative',
] as const;

export type WonReason = (typeof wonReasons)[number];

export const WON_REASON_CONFIG: Record<WonReason, { label: string }> = {
  price:          { label: 'Цена / бюджет' },
  features:       { label: 'Функционал / закрыли требования' },
  deadline:       { label: 'Сроки' },
  trust:          { label: 'Отношения / доверие' },
  referral:       { label: 'Рекомендация' },
  compliance:     { label: 'Требование ЧЗ / регуляторика' },
  no_alternative: { label: 'Безальтернативность' },
};

// ═══════════════════════════════════════════════════════
// Sort options
// ═══════════════════════════════════════════════════════

export const sortOptions = [
  { value: 'next_action', label: 'Требуют внимания' }, // S-AGING-1: дефолт
  { value: 'created_at',  label: 'По добавлению' },
  { value: 'deadline',    label: 'По дедлайну' },
  { value: 'budget',      label: 'По бюджету' },
  { value: 'stage',       label: 'По стадии' },
] as const;

export type SortOption = (typeof sortOptions)[number]['value'];

// ═══════════════════════════════════════════════════════
// Zod Form Schema
// ═══════════════════════════════════════════════════════

// PCT-1: client — сделка в воронке (direction/pipeline_id/stage_id обязательны);
// internal — внутренний проект вне воронки (стадийные поля = null).
// Delivery P1: delivery — проект внедрения; создаётся ТОЛЬКО RPC
// spawn_delivery_project (форма не предлагает), ветка в superRefine зеркалит
// CHECK projects_type_pipeline_chk (миграция 035).
//
// Примечание: промпт просил z.discriminatedUnion('type', …). Union делает
// ProjectFormValues union-типом и ломает плоский RHF-контракт формы
// (register/watch/setValue('stage_id', …) по всем полям сразу). Эквивалентная
// проверка сделана через superRefine поверх плоской схемы — тип остаётся плоским,
// а инвариант «client требует стадийные поля» проверяется на submit.
export const projectFormSchema = z
  .object({
    type: z.enum(['client', 'internal', 'delivery']).default('client'),
    name: z.string().min(1, 'Введи название'),
    direction: z.enum(['erp', 'iiot']).nullable().default('iiot'),
    pipeline_id: z.string().uuid().nullable().default(null),
    stage_id: z.string().uuid().nullable().default(null),
    company_id: z.string().uuid().nullable().default(null),
    contact_id: z.string().uuid().nullable().default(null),
    budget: z.number().int().nonnegative().nullable().default(null),
    deadline: z.string().nullable().default(null),
    next_step: z.string().nullable().default(null),
    next_action_date: z.string().nullable().default(null),
    loss_reason: z.string().nullable().default(null),
    loss_detail: z.string().nullable().default(null),
    // Причина выигрыша — симметрия loss (миграция 043)
    won_reason: z.string().nullable().default(null),
    won_detail: z.string().nullable().default(null),
    owner_id: z.string().uuid().nullable().optional(),
    // Delivery P1 (форма их не редактирует, кроме do_url на карточке)
    parent_deal_id: z.string().uuid().nullable().default(null),
    delivery_kind: z.enum(['launch', 'experiment']).nullable().default(null),
    do_url: z.string().url('Некорректная ссылка').nullable().or(z.literal('').transform(() => null)).default(null),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'client' || val.type === 'delivery') {
      if (!val.direction)
        ctx.addIssue({ path: ['direction'], code: z.ZodIssueCode.custom, message: 'Укажи направление' });
      if (!val.pipeline_id)
        ctx.addIssue({ path: ['pipeline_id'], code: z.ZodIssueCode.custom, message: 'Укажи воронку' });
      if (!val.stage_id)
        ctx.addIssue({ path: ['stage_id'], code: z.ZodIssueCode.custom, message: 'Укажи стадию' });
    }
    if (val.type === 'delivery') {
      if (!val.parent_deal_id)
        ctx.addIssue({ path: ['parent_deal_id'], code: z.ZodIssueCode.custom, message: 'Нет родительской сделки' });
      if (!val.delivery_kind)
        ctx.addIssue({ path: ['delivery_kind'], code: z.ZodIssueCode.custom, message: 'Укажи шаблон внедрения' });
    }
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
