import { z } from 'zod';
import type { OrgSettings } from '@/types/database';
import {
  DEFAULT_RULES,
  COMPLETENESS_WEIGHT_MAX,
  COMPLETENESS_WEIGHT_MIN,
  type CompletenessOverrides,
} from '@/lib/domain/deal-completeness';
import {
  DEFAULT_SIGNAL_THRESHOLDS,
  type DealSignalThresholds,
} from '@/lib/domain/deal-signals';

/**
 * Настройки организации (`organizations.settings`, миграция 076).
 *
 * Форвард-совместимость: неизвестные ключи НЕ валидируются и НЕ выбрасываются —
 * запись идёт merge'ом ({...current, ...patch}), поэтому ключ, добавленный будущей
 * версией клиента, переживёт правку порога тишины из этой. Поэтому здесь `.passthrough()`
 * и все известные поля optional — читаем то, что понимаем, остальное не трогаем.
 */

/** Порог тишины, дни. Clamp 3..90: меньше 3 — шум, больше 90 — сегмент вырождается. */
export const RECONNECT_DAYS_MIN = 3;
export const RECONNECT_DAYS_MAX = 90;

/** Норматив «дней в стадии», дни. */
export const STAGE_DWELL_MIN = 1;
export const STAGE_DWELL_MAX = 365;

const reconnectDaysSchema = z
  .number()
  .int('Дни — целое число')
  .min(RECONNECT_DAYS_MIN, `Минимум ${RECONNECT_DAYS_MIN} дня`)
  .max(RECONNECT_DAYS_MAX, `Максимум ${RECONNECT_DAYS_MAX} дней`);

const stageDwellDefaultsSchema = z.record(
  z.string(),
  z.number().int().min(STAGE_DWELL_MIN).max(STAGE_DWELL_MAX).optional(),
);

/**
 * Веса правил полноты сделки (S-R3-TRUST-1): ключ правила → вес.
 * Org переопределяет только вес; label и «цена пустоты» — тексты продукта.
 */
const completenessRulesSchema = z.record(
  z.string(),
  z
    .object({
      weight: z
        .number()
        .int()
        .min(COMPLETENESS_WEIGHT_MIN)
        .max(COMPLETENESS_WEIGHT_MAX)
        .optional(),
    })
    .optional(),
);

/**
 * Org-оверрайд нормы дней на КОНКРЕТНУЮ стадию: `{ [stage_id]: days }`
 * (S-PIPELINE-COCKPIT-1). Нет ключа/стадии — норма группы
 * (`stage_dwell_defaults` → фолбэки `STALE_BY_PHASE`).
 *
 * ⚠️ Почему не колонка `pipeline_stages.target_days`: `pipelines`/`pipeline_stages` —
 * глобальные словари вне тенант-модели (RLS `USING true`, у клиента только SELECT),
 * org-специфичной настройке в них не место. Развилка S-R2-DWELL-CFG закрыта
 * решением «четвёртая сущность не заводится».
 */
const stageTargetDaysSchema = z.record(
  z.string(),
  z.number().int().min(STAGE_DWELL_MIN).max(STAGE_DWELL_MAX).optional(),
);

/**
 * Пороги сигналов сделки (S-HEALTH-V2-1). Clamp — по смыслу каждого порога:
 * grace 0..30 (льгота дольше месяца — не льгота), тишина 3..90 (те же границы,
 * что у `reconnect_days` — величина одного рода), предупреждение о дедлайне
 * 1..60. Миграция не нужна: ключ живёт в `organizations.settings` (076) через
 * `.passthrough()`.
 */
const dealSignalThresholdsSchema = z
  .object({
    grace_days: z.number().int().min(0).max(30).optional(),
    silence_days: z.number().int().min(3).max(90).optional(),
    deadline_warn_days: z.number().int().min(1).max(60).optional(),
  })
  .optional();

export const orgSettingsSchema = z
  .object({
    reconnect_days: reconnectDaysSchema.optional(),
    stage_dwell_defaults: stageDwellDefaultsSchema.optional(),
    stage_target_days: stageTargetDaysSchema.optional(),
    completeness_rules: completenessRulesSchema.optional(),
    deal_signal_thresholds: dealSignalThresholdsSchema,
  })
  .passthrough();

export type OrgSettingsInput = z.input<typeof orgSettingsSchema>;

/**
 * phase_group воронки продаж — порядок и подписи как в `PipelineBoard`/`phase-labels.ts`.
 * Живёт рядом со схемой: ключи формы и ключи jsonb — один список, чтобы не разъехались.
 * Групп внедрения (initiated/planning/execution/completed) здесь нет намеренно —
 * бейдж «залипла» настраивается для сделок; внедрения падают на `default`/фолбэк.
 */
export const DWELL_PHASE_GROUPS = [
  { key: 'attraction', label: 'Привлечение' },
  { key: 'working', label: 'Проработка' },
  { key: 'approval', label: 'Согласование' },
  { key: 'closing', label: 'Закрытие' },
] as const;

export type DwellPhaseGroup = (typeof DWELL_PHASE_GROUPS)[number]['key'];

/**
 * Поле норматива в форме — СТРОКА, не число: пустое значение обязано остаться пустым,
 * а `valueAsNumber` превращает '' в NaN и ломает «не заполнено ⇒ как по умолчанию».
 * Пустая строка валидна и означает «ключ не писать».
 */
const dwellFieldSchema = z
  .string()
  .trim()
  .refine((s) => s === '' || /^\d+$/.test(s), 'Только целое число дней')
  .refine(
    (s) => s === '' || (Number(s) >= STAGE_DWELL_MIN && Number(s) <= STAGE_DWELL_MAX),
    `Допустимо ${STAGE_DWELL_MIN}–${STAGE_DWELL_MAX}`,
  );

/**
 * Поле веса правила полноты — тоже СТРОКА и по той же причине, что `dwellFieldSchema`.
 * Пустое поле = «вес по умолчанию», `'0'` = «правило не учитывать» (валидное значение,
 * не путать с пустым).
 */
const completenessFieldSchema = z
  .string()
  .trim()
  .refine((s) => s === '' || /^\d+$/.test(s), 'Только целое число')
  .refine(
    (s) =>
      s === '' ||
      (Number(s) >= COMPLETENESS_WEIGHT_MIN && Number(s) <= COMPLETENESS_WEIGHT_MAX),
    `Допустимо ${COMPLETENESS_WEIGHT_MIN}–${COMPLETENESS_WEIGHT_MAX}`,
  );

/** Форма секции настроек: порог тишины + нормативы дней в стадии + веса полноты. */
export const orgSettingsFormSchema = z.object({
  reconnect_days: reconnectDaysSchema,
  stage_dwell: z.object({
    attraction: dwellFieldSchema,
    working: dwellFieldSchema,
    approval: dwellFieldSchema,
    closing: dwellFieldSchema,
  }),
  // `.default({})` — секция полноты необязательна на входе: форма всегда её подаёт,
  // а вызовы схемы без неё (в т.ч. существующие тесты нормативов) остаются валидными.
  completeness: z.record(z.string(), completenessFieldSchema).default({}),
  // Нормы по стадиям (S-STAGE-NORMS-UI-3): ключ — stage_id, поле — та же строка
  // с теми же границами, что у нормативов группы (`dwellFieldSchema` переиспользован,
  // а не скопирован: диапазон у обеих настроек один и расходиться не должен).
  stage_targets: z.record(z.string(), dwellFieldSchema).default({}),
});
export type OrgSettingsFormValues = z.infer<typeof orgSettingsFormSchema>;

/** jsonb-настройки → строковые значения полей формы (отсутствие ключа ⇒ пустое поле). */
export function stageDwellToForm(
  thresholds: OrgSettings['stage_dwell_defaults'],
): OrgSettingsFormValues['stage_dwell'] {
  const read = (key: DwellPhaseGroup) => {
    const v = thresholds?.[key];
    return typeof v === 'number' ? String(v) : '';
  };
  return {
    attraction: read('attraction'),
    working: read('working'),
    approval: read('approval'),
    closing: read('closing'),
  };
}

/**
 * Значения формы → объект для `settings.stage_dwell_defaults`.
 *
 * ⚠️ Пустое поле НЕ пишется ключом со значением `null`/`undefined` — ключа просто нет.
 * Иначе `resolveDwellThreshold` получил бы `null`, `??` его не пропустил бы дальше,
 * и фолбэк `STALE_BY_PHASE` не сработал.
 *
 * Ключ `default` в форме не редактируется, но если он уже лежит в настройках (заведён
 * руками или будущей версией) — сохраняется: перезапись ключа целиком его бы стёрла.
 */
export function buildStageDwellDefaults(
  values: OrgSettingsFormValues['stage_dwell'],
  current?: OrgSettings['stage_dwell_defaults'],
): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof current?.default === 'number') out.default = current.default;

  for (const { key } of DWELL_PHASE_GROUPS) {
    const raw = values[key]?.trim() ?? '';
    if (raw === '') continue; // «как по умолчанию» — ключа нет
    const n = Number(raw);
    if (Number.isInteger(n) && n >= STAGE_DWELL_MIN && n <= STAGE_DWELL_MAX) out[key] = n;
  }
  return out;
}

/**
 * Нормы по стадиям (jsonb) → строковые поля формы: нет оверрайда ⇒ пустое поле
 * ⇒ действует порог группы. Поля заводятся на ВСЕ переданные стадии, а не только
 * на те, у кого оверрайд есть, — иначе RHF не знал бы про пустое поле стадии.
 */
export function stageTargetsToFormValues(
  current: Record<string, number> | undefined,
  stageIds: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of stageIds) {
    const v = current?.[id];
    out[id] = typeof v === 'number' ? String(v) : '';
  }
  return out;
}

/**
 * Значения формы → патч `settings.stage_target_days`.
 *
 * ⚠️ Пустое поле ключ НЕ пишет (то же правило, что у `buildStageDwellDefaults`):
 * ключ со значением `null` остановил бы `??`-цепочку `resolveStageNorm` до порога
 * группы, и «как по умолчанию» перестало бы работать.
 *
 * ⚠️ Оверрайды стадий, которых НЕТ в форме (стадия удалена из словаря, воронки ещё
 * не догрузились), сохраняются: перезапись объекта целиком их бы стёрла — тот же
 * приём, что у `buildCompletenessPatch` с чужими ключами.
 *
 * ⚠️ Пустой итог — `undefined`, а НЕ `{}` (здесь контракт отличается от dwell
 * намеренно): в merge-патче `{...current, ...patch}` значение `undefined` выпадает
 * при сериализации в jsonb, то есть очистка всех полей убирает ключ целиком,
 * а не оставляет мёртвый `{}` в настройках организации.
 */
export function buildStageTargetDays(
  values: Record<string, string>,
  current: Record<string, number> | undefined,
): Record<string, number> | undefined {
  const out: Record<string, number> = {};

  for (const [stageId, value] of Object.entries(current ?? {})) {
    if (!(stageId in values) && typeof value === 'number') out[stageId] = value;
  }

  for (const [stageId, raw] of Object.entries(values)) {
    const trimmed = raw?.trim() ?? '';
    if (trimmed === '') continue; // «как порог группы» — ключа нет
    const n = Number(trimmed);
    if (Number.isInteger(n) && n >= STAGE_DWELL_MIN && n <= STAGE_DWELL_MAX) out[stageId] = n;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Веса правил полноты из настроек org (`settings.completeness_rules`).
 *
 * Ключ живёт в jsonb через `.passthrough()`, а НЕ в интерфейсе `OrgSettings`:
 * `src/types/database.ts` руками не правится (правило 2 контракта), поэтому чтение
 * идёт одним кастом здесь, а наружу отдаётся уже провалидированный объект.
 * Мусор, чужие ключи и веса вне 0..10 просто отбрасываются — читатель не падает.
 */
export function readCompletenessOverrides(
  settings: OrgSettings | null | undefined,
): CompletenessOverrides | undefined {
  const raw = (settings as Record<string, unknown> | null | undefined)?.completeness_rules;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;

  const out: CompletenessOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const weight = (value as { weight?: unknown } | null)?.weight;
    if (
      typeof weight === 'number' &&
      Number.isInteger(weight) &&
      weight >= COMPLETENESS_WEIGHT_MIN &&
      weight <= COMPLETENESS_WEIGHT_MAX
    ) {
      out[key] = { weight };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Нормы дней по стадиям из настроек org (`settings.stage_target_days`).
 *
 * Читается кастом по той же причине, что `completeness_rules`: ключ живёт в jsonb
 * через `.passthrough()`, а `src/types/database.ts` руками не правится (правило 2
 * контракта). Мусор, нецелые и значения вне 1..365 отбрасываются поштучно —
 * одна кривая стадия не роняет нормы остальных.
 *
 * Возвращает `undefined`, если валидных ключей нет: `resolveStageNorm` тогда
 * падает на порог группы, а не на пустой объект-оверрайд.
 */
export function readStageTargetDays(
  settings: OrgSettings | null | undefined,
): Record<string, number> | undefined {
  const raw = (settings as Record<string, unknown> | null | undefined)?.stage_target_days;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;

  const out: Record<string, number> = {};
  for (const [stageId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= STAGE_DWELL_MIN &&
      value <= STAGE_DWELL_MAX
    ) {
      out[stageId] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Пороги сигналов сделки из настроек org (`settings.deal_signal_thresholds`).
 *
 * Читается кастом по той же причине, что `completeness_rules` и
 * `stage_target_days`: ключ живёт в jsonb через `.passthrough()`, а
 * `src/types/database.ts` руками не правится (правило 2 контракта).
 *
 * ⚠️ Поле за полем и независимо: невалидное значение ИГНОРИРУЕТСЯ и подменяется
 * дефолтом, а не роняет разбор остальных. Это форвард-совместимость — настройка,
 * записанная будущей версией клиента, не должна ломать текущую.
 *
 * ⚠️ Возвращает ВСЕГДА полный объект (в отличие от `readStageTargetDays`):
 * у сигналов нет «фолбэка ниже по цепочке», дефолт и есть конечное значение.
 * При полностью пустых настройках отдаётся ТА ЖЕ ссылка
 * `DEFAULT_SIGNAL_THRESHOLDS` — новый литерал на каждый вызов ломал бы
 * мемоизацию потребителей (грабля `useDwellThresholds`).
 */
export function readDealSignalThresholds(
  settings: OrgSettings | null | undefined,
): DealSignalThresholds {
  const raw = (settings as Record<string, unknown> | null | undefined)?.deal_signal_thresholds;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_SIGNAL_THRESHOLDS;

  const obj = raw as Record<string, unknown>;
  const read = (key: string, min: number, max: number, fallback: number): number => {
    const v = obj[key];
    return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
  };

  const out: DealSignalThresholds = {
    graceDays: read('grace_days', 0, 30, DEFAULT_SIGNAL_THRESHOLDS.graceDays),
    silenceDays: read('silence_days', 3, 90, DEFAULT_SIGNAL_THRESHOLDS.silenceDays),
    deadlineWarnDays: read('deadline_warn_days', 1, 60, DEFAULT_SIGNAL_THRESHOLDS.deadlineWarnDays),
  };

  // Ни одно поле не переопределено ⇒ отдаём ту же ссылку, а не эквивалентный литерал.
  return out.graceDays === DEFAULT_SIGNAL_THRESHOLDS.graceDays &&
    out.silenceDays === DEFAULT_SIGNAL_THRESHOLDS.silenceDays &&
    out.deadlineWarnDays === DEFAULT_SIGNAL_THRESHOLDS.deadlineWarnDays
    ? DEFAULT_SIGNAL_THRESHOLDS
    : out;
}

/** jsonb-настройки → строковые поля формы (нет ключа ⇒ пустое поле ⇒ вес по умолчанию). */
export function completenessToForm(
  overrides: CompletenessOverrides | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of DEFAULT_RULES) {
    const w = overrides?.[rule.key]?.weight;
    out[rule.key] = typeof w === 'number' ? String(w) : '';
  }
  return out;
}

/**
 * Значения формы → патч `settings.completeness_rules`.
 *
 * ⚠️ Пустое поле не пишется ключом со значением `null` — ключа просто нет, иначе
 * `resolveRules` увидел бы невалидный вес вместо «как по умолчанию». `'0'` — валидный
 * вес и ключ пишется: это «правило выключено», а не «не задано».
 *
 * Ключи, которых нет в `DEFAULT_RULES` (правило будущей версии), сохраняются из
 * текущих настроек: перезапись объекта целиком их бы стёрла.
 *
 * Возвращает патч уже как `OrgSettings` — единственный каст, чтобы потребители
 * (`useUpdateOrgSettings`) не знали про passthrough-ключ.
 */
export function buildCompletenessPatch(
  values: Record<string, string>,
  current?: CompletenessOverrides,
): OrgSettings {
  const known = new Set(DEFAULT_RULES.map((r) => r.key));
  const out: Record<string, { weight: number }> = {};

  for (const [key, value] of Object.entries(current ?? {})) {
    const w = value?.weight;
    if (!known.has(key) && typeof w === 'number') out[key] = { weight: w };
  }

  for (const rule of DEFAULT_RULES) {
    const raw = values[rule.key]?.trim() ?? '';
    if (raw === '') continue; // «как по умолчанию» — ключа нет
    const n = Number(raw);
    if (Number.isInteger(n) && n >= COMPLETENESS_WEIGHT_MIN && n <= COMPLETENESS_WEIGHT_MAX) {
      out[rule.key] = { weight: n };
    }
  }

  return { completeness_rules: out } as unknown as OrgSettings;
}

/**
 * Разбор значения из БД (`unknown` — jsonb): невалидные/чужие ключи не роняют чтение.
 * Возвращает пустой объект, если значение вообще не объект.
 */
export function parseOrgSettings(raw: unknown): OrgSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const parsed = orgSettingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data as OrgSettings;
  // Одно поле сломано (напр. reconnect_days пришёл строкой) — не теряем остальные:
  // отдаём объект как есть, потребители читают через `??` с дефолтом.
  const obj = raw as Record<string, unknown>;
  return {
    ...obj,
    reconnect_days:
      typeof obj.reconnect_days === 'number' && Number.isInteger(obj.reconnect_days)
        ? obj.reconnect_days
        : undefined,
  } as OrgSettings;
}
