import { z } from 'zod';
import type { GateFieldColumn } from '@/types/database';
import { lossReasons, parseBudgetInput, wonReasons } from './project';

/**
 * Форма модалки перехода стадии (S-R2-TRANSITION-1b).
 *
 * ПОЧЕМУ СХЕМА СТРОИТСЯ ФУНКЦИЕЙ, А НЕ ОБЪЯВЛЕНА КОНСТАНТОЙ. Набор обязательных
 * полей известен только в рантайме: он приходит из `check_stage_requirements` для
 * конкретной целевой стадии (у одной стадии обязателен бюджет, у другой — контакт
 * и дедлайн). Статическая схема заставила бы либо требовать всё, либо не требовать
 * ничего; и то и другое расходится с БД, которая всё равно проверит своё.
 *
 * ТИП ЗНАЧЕНИЙ СТАТИЧЕН (`TransitionFormValues`) при динамических правилах — так RHF
 * получает один стабильный дженерик, а меняется только `superRefine`.
 *
 * ⚠️ Клиентская валидация здесь — УДОБСТВО, а не контроль. Источник истины — гейт в
 * БД (`aa_enforce_stage_gate`); модалка обязана корректно показать его отказ, даже
 * если Zod всё пропустил (см. обработку `parseStageGateError` в модалке).
 */

/**
 * Все поля формы объявлены всегда — обязательность накидывается `superRefine`.
 * Числовые поля держим строками: пустой `<input type="number">` даёт `NaN` при
 * `valueAsNumber`, а нам нужно отличать «не ввёл» от «ввёл 0».
 */
export interface TransitionFormValues {
  /** Сырой ввод рублей; в копейки переводит parseBudgetInput на сабмите. */
  budget: string;
  company_id: string | null;
  contact_id: string | null;
  next_step: string;
  /** date-инпуты: '' → null (`''::date` невалиден в Postgres — известные грабли). */
  deadline: string | null;
  next_action_date: string | null;
  probability: string;
  direction: 'erp' | 'iiot' | null;
  won_reason: string | null;
  won_detail: string;
  loss_reason: string | null;
  loss_detail: string;
  comment: string;
}

export const TRANSITION_FORM_DEFAULTS: TransitionFormValues = {
  budget: '',
  company_id: null,
  contact_id: null,
  next_step: '',
  deadline: null,
  next_action_date: null,
  probability: '',
  direction: null,
  won_reason: null,
  won_detail: '',
  loss_reason: null,
  loss_detail: '',
  comment: '',
};

const baseSchema = z.object({
  budget: z.string(),
  company_id: z.string().uuid().nullable(),
  contact_id: z.string().uuid().nullable(),
  next_step: z.string(),
  deadline: z.string().nullable(),
  next_action_date: z.string().nullable(),
  probability: z.string(),
  direction: z.enum(['erp', 'iiot']).nullable(),
  won_reason: z.string().nullable(),
  won_detail: z.string(),
  loss_reason: z.string().nullable(),
  loss_detail: z.string(),
  comment: z.string().max(2000, 'Комментарий длиннее 2000 символов'),
});

/** Сообщение «поле обязательно» одной формулировкой на все ветки. */
const REQUIRED = 'Обязательно для перехода на эту стадию';

/**
 * Проверка одного During-поля. Возвращает текст ошибки или null.
 * Семантика «заполнено» СОВПАДАЕТ с CASE в `check_stage_requirements_row` (078):
 * везде «не null», и только у `next_step` дополнительно «не пробелы».
 */
function fieldError(column: GateFieldColumn, v: TransitionFormValues): string | null {
  switch (column) {
    case 'budget':
      return parseBudgetInput(v.budget) === null ? 'Введите сумму' : null;
    case 'company_id':
      return v.company_id ? null : REQUIRED;
    case 'contact_id':
      return v.contact_id ? null : REQUIRED;
    case 'next_step':
      return v.next_step.trim() === '' ? REQUIRED : null;
    case 'deadline':
      return v.deadline ? null : REQUIRED;
    case 'next_action_date':
      return v.next_action_date ? null : REQUIRED;
    case 'direction':
      return v.direction ? null : REQUIRED;
    case 'probability': {
      if (v.probability.trim() === '') return REQUIRED;
      const n = Number(v.probability);
      if (!Number.isFinite(n) || n < 0 || n > 100) return 'Вероятность — целое от 0 до 100';
      return null;
    }
    default:
      return null;
  }
}

export function buildTransitionSchema(opts: {
  /** Незакрытые field-требования целевой стадии. */
  requiredFields: GateFieldColumn[];
  requireWonReason: boolean;
  requireLossReason: boolean;
}) {
  return baseSchema.superRefine((v, ctx) => {
    for (const column of opts.requiredFields) {
      const message = fieldError(column, v);
      if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [column], message });
    }

    // Причина исхода — обязательна ровно на won/lost стадии (симметрия 043).
    if (opts.requireWonReason && !v.won_reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['won_reason'], message: 'Выберите причину выигрыша' });
    }
    if (opts.requireWonReason && v.won_reason && !wonReasons.includes(v.won_reason as never)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['won_reason'], message: 'Неизвестная причина' });
    }
    if (opts.requireLossReason && !v.loss_reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['loss_reason'], message: 'Выберите причину проигрыша' });
    }
    if (opts.requireLossReason && v.loss_reason && !lossReasons.includes(v.loss_reason as never)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['loss_reason'], message: 'Неизвестная причина' });
    }
  });
}
