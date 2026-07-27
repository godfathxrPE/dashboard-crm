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
 * `probability` в этом списке намеренно, хотя гейт формально умеет её требовать:
 * `sync_deal_stage_fields` перезаписывает вероятность значением стадии на том же
 * UPDATE, так что клиентское значение живёт микросекунды и не наблюдаемо.
 */
export const STAGE_MANAGED_COLUMNS = [
  'status',
  'probability',
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
