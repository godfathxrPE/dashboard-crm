/**
 * Полнота записи сделки (S-R3-TRUST-1, ось «Слой достоверности») — чистый домен:
 * без React, без Supabase, без сети.
 *
 * ЕДИНСТВЕННАЯ формула полноты в проекте. До этого спринта она жила внутри
 * `ProjectDetail.getProjectCompleteness` (8 полей, вес у всех одинаковый); SQL-аналога
 * (`entity_completeness()` / `v_deal_completeness`) намеренно НЕТ: сегменты считаются
 * на клиенте, значение обязано быть у клиента, а вторая формула в SQL дала бы дрейф.
 * Серверная версия появится тогда, когда появится серверный потребитель (дайджест,
 * аналитика вне сессии), и будет написана один раз под него.
 *
 * ⚠️ Полнота — НЕ «здоровье сделки». `calculateDealHealth` (0–8, deal-health.ts)
 * оценивает динамику работы, полнота — заполненность карточки. Сливать нельзя.
 *
 * ⚠️ Полнота ничего не блокирует: ни сохранение, ни переход стадии. Принуждение
 * живёт в `check_stage_requirements` (миграция 078) и остаётся только там.
 */

import type { DealStatus, ProjectType } from '@/types/database';

/** Правило полноты. `cost` — цена пустоты: что именно не работает без этого поля. */
export interface CompletenessRule {
  /** Имя колонки `projects` — оно же ключ переопределения в org settings. */
  key: string;
  label: string;
  /** Вклад в score. 0 — правило выключено (не попадает ни в total, ни в missing). */
  weight: number;
  /** Что ломается без этого поля — текст продукта, в настройки не выносится. */
  cost: string;
  /** Правило действует только в этих статусах; не задано — всегда. */
  appliesTo?: DealStatus[];
  /** Правило действует только для этих типов проекта; не задано — всегда. */
  appliesToType?: ProjectType[];
}

export type CompletenessRules = readonly CompletenessRule[];

/** Переопределения org: `organizations.settings.completeness_rules` (только вес). */
export type CompletenessOverrides = Record<string, { weight?: number } | undefined>;

export interface CompletenessResult {
  /** 0..100, округление вниз. */
  score: number;
  filled: number;
  /** Число ПРИМЕНИМЫХ правил, а не всех: у выигранной сделки причина проигрыша не в счёт. */
  total: number;
  /** Незаполненные применимые правила, по убыванию веса — дорогая пустота выше дешёвой. */
  missing: CompletenessRule[];
}

/** Подмножество полей `Project`, которого хватает для расчёта. */
export interface ProjectForCompleteness {
  type?: string | null;
  status?: string | null;
  company_id?: string | null;
  contact_id?: string | null;
  budget?: number | null;
  stage_id?: string | null;
  deadline?: string | null;
  next_step?: string | null;
  next_action_date?: string | null;
  owner_id?: string | null;
  loss_reason?: string | null;
  won_reason?: string | null;
}

export const COMPLETENESS_WEIGHT_MIN = 0;
export const COMPLETENESS_WEIGHT_MAX = 10;

/**
 * Состав по умолчанию. Перенесён из `getProjectCompleteness` с двумя правками:
 *
 *  • правила `name` здесь НЕТ: `projects.name` — NOT NULL, правило никогда не
 *    сработает и только разбавляет знаменатель;
 *  • добавлены `owner_id` и исходы (`loss_reason`/`won_reason`) — они статус-зависимые
 *    и до этого в полноту не входили вовсе.
 *
 * ⚠️ Причина проигрыша — `loss_reason`. В `projects` есть ещё legacy-колонка
 * `lost_reason` (пуста у всех проигранных): в правила её не включать.
 */
export const DEFAULT_RULES: CompletenessRules = [
  {
    key: 'company_id',
    label: 'Компания',
    weight: 3,
    cost: 'Сделка не попадёт в историю компании и в отчёты по клиентам',
  },
  {
    key: 'contact_id',
    label: 'Контакт',
    weight: 2,
    cost: 'Некому писать и звонить: сделка не появится в работе с контактом',
  },
  {
    key: 'budget',
    label: 'Бюджет',
    weight: 3,
    cost: 'Сделка не считается в прогнозе выручки',
  },
  {
    // PCT-1: стадия есть только у сделок — internal живёт вне воронки, там stage_id null
    // по контракту, и полнота не должна проседать за поле, которого у типа не бывает.
    key: 'stage_id',
    label: 'Стадия',
    weight: 3,
    cost: 'Сделка вне воронки: не видна на доске и в аналитике по стадиям',
    appliesToType: ['client'],
  },
  {
    key: 'deadline',
    label: 'Дедлайн',
    weight: 1,
    cost: 'Не считается срок и не работает предупреждение о просрочке',
  },
  {
    key: 'next_step',
    label: 'Следующий шаг',
    weight: 2,
    cost: 'Сделка помечается как гниющая и всплывает в напоминаниях',
    appliesTo: ['open'],
  },
  {
    key: 'next_action_date',
    label: 'Дата шага',
    weight: 2,
    cost: 'Без даты шаг не попадёт ни в один список дел',
    appliesTo: ['open'],
  },
  {
    key: 'owner_id',
    label: 'Ответственный',
    weight: 2,
    cost: 'Не видно, с кого спрашивать',
  },
  {
    key: 'loss_reason',
    label: 'Причина проигрыша',
    weight: 3,
    cost: 'Проигрыш не попадёт в анализ причин — считать нечего',
    appliesTo: ['lost'],
    appliesToType: ['client'],
  },
  {
    key: 'won_reason',
    label: 'Причина победы',
    weight: 2,
    cost: 'Не видно, что именно сработало, и это не повторить',
    appliesTo: ['won'],
    appliesToType: ['client'],
  },
];

/**
 * Правила организации поверх дефолтных (зеркало `resolveDwellThreshold`).
 *
 * Org переопределяет ТОЛЬКО вес: label и `cost` — тексты продукта, не конфигурация.
 * Вес `0` = «не учитывать»: правило исчезает и из `total`, и из `missing`.
 * Ключ, которого нет в `DEFAULT_RULES`, игнорируется — сегмент/настройка из будущей
 * версии не должны ронять разбор (тот же принцип, что у `parseOrgSettings`).
 *
 * Пустые настройки ⇒ возвращается РОВНО `defaults` (та же ссылка): у потребителей
 * это значение уходит в `useMemo`, новый массив на каждый рендер ломал бы мемоизацию.
 */
export function resolveRules(
  defaults: CompletenessRules = DEFAULT_RULES,
  overrides?: CompletenessOverrides | null,
): CompletenessRules {
  if (!overrides || typeof overrides !== 'object') return defaults;

  let changed = false;
  const out: CompletenessRule[] = [];

  for (const rule of defaults) {
    const raw = overrides[rule.key]?.weight;
    const valid =
      typeof raw === 'number' &&
      Number.isInteger(raw) &&
      raw >= COMPLETENESS_WEIGHT_MIN &&
      raw <= COMPLETENESS_WEIGHT_MAX;

    if (!valid || raw === rule.weight) {
      out.push(rule);
      continue;
    }
    changed = true;
    if (raw === 0) continue; // правило выключено — не попадает в список вовсе
    out.push({ ...rule, weight: raw });
  }

  return changed ? out : defaults;
}

/** Заполнено ли поле. `null`/`undefined`/пустая строка после trim — нет. */
function isFilled(rule: CompletenessRule, value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  // Нулевой бюджет = «не указан» (так же считала прежняя формула).
  if (rule.key === 'budget') return typeof value === 'number' && value > 0;
  return true;
}

/** Применимо ли правило к этой строке: статус и тип проекта. */
function isApplicable(rule: CompletenessRule, project: ProjectForCompleteness): boolean {
  if (rule.weight <= 0) return false;
  if (rule.appliesToType && !rule.appliesToType.includes((project.type ?? 'client') as ProjectType)) {
    return false;
  }
  if (rule.appliesTo && !rule.appliesTo.includes((project.status ?? 'open') as DealStatus)) {
    return false;
  }
  return true;
}

/**
 * Полнота записи. `rules` — уже разрешённые правила (`resolveRules`); не переданы ⇒
 * дефолтные.
 *
 * `score = floor(100 * вес заполненных / вес применимых)`. Применимых правил нет вовсе
 * ⇒ `score = 100`, `missing = []` — деления на ноль не бывает.
 */
export function evaluateCompleteness(
  project: ProjectForCompleteness,
  rules: CompletenessRules = DEFAULT_RULES,
): CompletenessResult {
  // Один каст на входе: `Project` и прочие интерфейсы приложения не имеют index
  // signature, а читать надо по имени правила (тот же приём, что в segment-eval).
  const row = project as unknown as Record<string, unknown>;

  const applicable = rules.filter((r) => isApplicable(r, project));
  if (applicable.length === 0) return { score: 100, filled: 0, total: 0, missing: [] };

  let weightTotal = 0;
  let weightFilled = 0;
  let filled = 0;
  const missing: CompletenessRule[] = [];

  for (const rule of applicable) {
    weightTotal += rule.weight;
    if (isFilled(rule, row[rule.key])) {
      weightFilled += rule.weight;
      filled += 1;
    } else {
      missing.push(rule);
    }
  }

  missing.sort((a, b) => b.weight - a.weight);

  return {
    score: weightTotal === 0 ? 100 : Math.floor((100 * weightFilled) / weightTotal),
    filled,
    total: applicable.length,
    missing,
  };
}
