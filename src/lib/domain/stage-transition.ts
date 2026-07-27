/**
 * Переход стадии — чистый домен (без React, без Supabase).
 *
 * Здесь живёт ОДНА вещь: как из намерения «перевести проект на стадию X, попутно
 * закрыв поля Y» получается payload для `projects.update`. Вся запись стадии в
 * приложении обязана проходить через `buildTransitionPatch` — иначе правила ниже
 * (whitelist полей, запрет на поля-БД) придётся помнить в шести местах, а помнить
 * их там уже не получалось.
 *
 * АТОМАРНОСТЬ. Патч ВСЕГДА один UPDATE: `{ stage_id, ...fieldPatches }`. Двухшаговая
 * запись («сначала поля, потом стадия») запрещена — до 078 она была вынужденной,
 * потому что BEFORE-гейт `aa_enforce_stage_gate` читал строку из таблицы, то есть
 * ДО-патчевые значения, и `update({stage_id, budget})` падал на требовании budget.
 * С 078 гейт проверяет `to_jsonb(NEW)` и видит поля того же запроса — поэтому
 * разбивать переход на два запроса больше не нужно и вредно (между ними проект
 * оказывался в промежуточном состоянии, а откат был невозможен).
 *
 * ⚠️ ПОЛЯ, КОТОРЫЕ ВЫСТАВЛЯЕТ БД, В ПАТЧ НЕ ПОПАДАЮТ НИКОГДА (см. STAGE_MANAGED_COLUMNS).
 * На `projects` висят два пересекающихся BEFORE-триггера:
 *   • `trg_sync_deal_stage_fields` (BEFORE UPDATE OF stage_id) — перезаписывает
 *     `probability` значением стадии, ставит `status` и `actual_close_date`;
 *   • `trg_sync_project_stage` (BEFORE INSERT OR UPDATE) — ставит `stage_entered_at`,
 *     `status` и БЕЗУСЛОВНО обнуляет `actual_close_date` для не-won/lost стадий.
 * Порядок срабатывания алфавитный, значит `sync_project_stage` выигрывает конфликты.
 * Любое клиентское значение этих колонок либо будет затёрто, либо затрёт логику
 * стадии — в обоих случаях это молчаливый баг. (Само расхождение двух триггеров —
 * отдельный хвост, в S-R2-TRANSITION-1a не чинится.)
 */

import type { Project, ProjectUpdate } from '@/lib/hooks/use-projects';
import type {
  AutomationCreateTaskConfig,
  AutomationNotifyConfig,
  AutomationActivityConfig,
  AutomationRule,
  AutomationSetFieldConfig,
  GateFieldColumn,
  StageEnteredConfig,
  StageRequirementFieldConfig,
  UnmetRequirement,
} from '@/types/database';
import { GATE_FIELD_COLUMNS, GATE_FIELD_LABEL } from '@/lib/constants/stage-gates';
import { wfEvalConditions, type WfRow } from './wf-conditions';

/**
 * Поля, которые разрешено писать ТЕМ ЖЕ запросом, что и стадию.
 *
 * Набор = (колонки, которые умеет требовать стадийный гейт `check_stage_requirements`)
 * ∪ (поля исхода сделки, которые исторически пишутся вместе с переходом).
 * Всё, чего здесь нет, редактируется обычной формой проекта, а не переходом.
 */
export const TRANSITION_FIELD_KEYS = [
  // требования гейта (078: список синхронен CASE в check_stage_requirements_row)
  'budget',
  'company_id',
  'contact_id',
  'next_step',
  'next_action_date',
  'deadline',
  'direction',
  // ⚠️ probability — ПОПРАВКА 1b к решению 1a. В 1a она была исключена как
  // «колонка БД»: sync_deal_stage_fields перезаписывает её значением стадии тем же
  // UPDATE. Но гейт умеет ТРЕБОВАТЬ probability, а срабатывает РАНЬШЕ sync (алфавит
  // trg_aa_ < trg_sync_) — значит без неё в патче стадия с таким требованием
  // становилась НЕЗАКРЫВАЕМОЙ из модалки: поле показали бы, а гейт всё равно бы
  // отказал. Шлём, чтобы гейт прошёл; сохранится всё равно значение стадии — так и
  // должно быть, вероятность здесь свойство стадии, а не ручное поле.
  'probability',
  // исход сделки — пишется вместе со стадией won/lost
  'won_reason',
  'won_detail',
  'loss_reason',
  'loss_detail',
  // рабочая заметка «что дальше» — редактируется в контексте перехода
  'pinned_note',
] as const;

export type TransitionField = (typeof TRANSITION_FIELD_KEYS)[number];

/**
 * Колонки, которые считает БД. Клиент их не пишет — ни здесь, ни в модалке 1b.
 *
 * `probability` тут БОЛЬШЕ НЕТ (поправка 1b, причина — в комментарии к
 * TRANSITION_FIELD_KEYS): её приходится слать, чтобы прошёл BEFORE-гейт, хотя
 * итоговое значение всё равно ставит стадия. Остальные три не пишем никогда:
 * `status` и `actual_close_date` выводятся из флагов стадии двумя триггерами
 * (045 сделан plain `AFTER UPDATE` именно поэтому), `stage_entered_at` ведёт
 * `sync_project_stage`. Клиентский дубль либо будет затёрт, либо затрёт логику.
 */
export const STAGE_MANAGED_COLUMNS = [
  'status',
  'actual_close_date',
  'stage_entered_at',
] as const;

const TRANSITION_FIELD_SET: ReadonlySet<string> = new Set(TRANSITION_FIELD_KEYS);

export type TransitionInput = {
  projectId: string;
  /** Стадия «откуда» — для лога и превью; в сам патч не входит. */
  fromStageId: string | null;
  toStageId: string;
  /** Поля, закрывающие требования гейта, — тем же UPDATE (см. АТОМАРНОСТЬ). */
  fieldPatches?: Partial<Pick<Project, TransitionField>>;
  /** Комментарий к переходу → отдельная запись в activity_log, не колонка. */
  comment?: string;
};

/**
 * Намерение → payload одного `projects.update`.
 *
 * Ключи вне whitelist молча отбрасываются: попасть сюда они могут только из кода,
 * а не от пользователя, и падать в рантайме из-за опечатки в вызывающем месте —
 * худший из вариантов. Отброшенное видно в дифе `Object.keys(patch)`.
 */
export function buildTransitionPatch(input: TransitionInput): ProjectUpdate {
  // Отсев по whitelist делается на записи ключей, а сужение типа — одним кастом:
  // Object.fromEntries отдаёт `{[k: string]: unknown}`, поштучная запись в
  // ProjectUpdate (интерфейс без index signature) не типизируется.
  const allowed = Object.fromEntries(
    Object.entries(input.fieldPatches ?? {}).filter(([key]) => TRANSITION_FIELD_SET.has(key)),
  ) as Partial<Pick<Project, TransitionField>>;

  // id/stage_id пишутся ПОСЛЕ спреда — переход не может быть перебит fieldPatches.
  return { ...allowed, id: input.projectId, stage_id: input.toStageId };
}

// ═══════════════════════════════════════════════════════════════════════════
// S-R2-TRANSITION-1b — превью перехода (данные для модалки «момент решения»)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Тип события-знаменателя метрики «% переходов через модалку».
 *
 * Пишется модалкой на КАЖДОЕ подтверждение, в том числе с пустым комментарием —
 * иначе метрика недосчитает (контракт задан в 1a). Числитель — эти события,
 * знаменатель — строки `stage_transitions` за период; сопоставление по
 * `project_id` + время в пределах ~5 с. Метрика приблизительная: атомарно
 * пометить сам UPDATE клиент не может (`set_config` отдельным round-trip'ом не
 * атомарен, RPC перехода — это P4).
 *
 * ⚠️ Событие ТЕХНИЧЕСКОЕ и скрыто из человеческих лент (`use-activity-log`,
 * `use-entity-timeline`): переход уже виден там как `stage_changed`, второй ряд
 * на то же действие — шум. Комментарий пользователя пишется отдельным
 * `comment_added` (это делает commitTransition из 1a) и остаётся видимым.
 */
export const TRANSITION_METRIC_EVENT = 'stage_transition_committed';

export interface AutomationPreviewItem {
  ruleId: string;
  name: string;
  actionSummary: string;
}

export interface TransitionPreview {
  /** Незакрытые требования гейта — как их отдал `check_stage_requirements`. */
  unmet: UnmetRequirement[];
  /** Колонки, которые модалка может закрыть формой (During-поля). */
  requiredDuringFields: GateFieldColumn[];
  /**
   * Незакрытое, что формой закрыть НЕЛЬЗЯ: `file`-требования и field-требования
   * на колонку вне whitelist гейта. Рендерятся строкой чек-листа с хинтом —
   * пустое поле, которое пользователь физически не может заполнить, хуже.
   */
  blockingChecklist: UnmetRequirement[];
  targetIsWon: boolean;
  targetIsLost: boolean;
  automationPreview: AutomationPreviewItem[];
}

const GATE_FIELD_SET: ReadonlySet<string> = new Set(GATE_FIELD_COLUMNS.map((c) => c.value));

/** Колонка field-требования, если она из whitelist гейта; иначе null. */
function gateColumnOf(req: UnmetRequirement): GateFieldColumn | null {
  if (req.type !== 'field') return null;
  const column = (req.config as StageRequirementFieldConfig).column;
  return typeof column === 'string' && GATE_FIELD_SET.has(column) ? column : null;
}

/**
 * Краткое человеческое описание действия правила — для read-only списка превью.
 * `action_config` приходит из jsonb, поэтому сужается по `action_type`.
 */
export function describeAutomationAction(rule: AutomationRule): string {
  switch (rule.action_type) {
    case 'create_task': {
      const c = rule.action_config as AutomationCreateTaskConfig;
      return `Создать задачу: «${c.task_text}»`;
    }
    case 'notify': {
      const c = rule.action_config as AutomationNotifyConfig;
      return `Уведомление: «${c.text}»`;
    }
    case 'create_activity': {
      const c = rule.action_config as AutomationActivityConfig;
      return `Запись в историю: «${c.title}»`;
    }
    case 'set_field': {
      const c = rule.action_config as AutomationSetFieldConfig;
      const label = GATE_FIELD_LABEL[c.field as GateFieldColumn] ?? c.field;
      return `Заполнить «${label}» → ${c.value}`;
    }
    default:
      return 'Действие правила';
  }
}

/**
 * Всё, что модалка показывает до подтверждения: чем переход заблокирован, какие
 * поля можно закрыть здесь же и что сработает после.
 *
 * ⚠️ Превью автоматизаций — КЛИЕНТСКОЕ и приблизительное. Dry-run RPC нет: правила
 * матчатся внутри AFTER-триггера, то есть уже после записи. Условия считаются
 * TS-портом `wfEvalConditions` (зеркало SQL, golden-фикстуры в
 * tests/unit/wf-conditions) поверх снапшота строки С УЧЁТОМ вводимых полей.
 * Расхождение возможно — подпись в UI обязана это признавать.
 */
export function previewTransition(args: {
  unmet: UnmetRequirement[];
  targetStage: { is_won: boolean | null; is_lost: boolean | null } | null;
  rules: AutomationRule[];
  /** Строка проекта + уже введённые в модалке поля. */
  snapshot: WfRow;
  toStageId: string;
}): TransitionPreview {
  const { unmet, targetStage, rules, snapshot, toStageId } = args;

  const requiredDuringFields: GateFieldColumn[] = [];
  const blockingChecklist: UnmetRequirement[] = [];

  for (const req of unmet) {
    const column = gateColumnOf(req);
    if (column === null) {
      blockingChecklist.push(req);
      continue;
    }
    if (!requiredDuringFields.includes(column)) requiredDuringFields.push(column);
  }

  const automationPreview = rules
    .filter((r) => {
      if (!r.is_active || r.trigger_type !== 'stage_entered') return false;
      if ((r.trigger_config as StageEnteredConfig).stage_id !== toStageId) return false;
      return wfEvalConditions(r.conditions, snapshot);
    })
    .map((r) => ({ ruleId: r.id, name: r.name, actionSummary: describeAutomationAction(r) }));

  return {
    unmet,
    requiredDuringFields,
    blockingChecklist,
    targetIsWon: targetStage?.is_won === true,
    targetIsLost: targetStage?.is_lost === true,
    automationPreview,
  };
}
