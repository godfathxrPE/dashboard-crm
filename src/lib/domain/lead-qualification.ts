import type { LeadBudgetStatus, StakeholderRole } from '@/types/database';
import { LEAD_BUDGET_STATUS_CONFIG } from '@/lib/validators/lead';
import { STAKEHOLDER_ROLE_CONFIG } from '@/lib/constants/stakeholders';
import { formatBudget } from '@/lib/validators/project';

// ═══════════════════════════════════════════════════════
// S-LEAD-CARD-VISUAL-1: квалификация лида — шесть пунктов, два обязательных.
//
// Чистый домен: без React, без Supabase, без сети. Единственная формула
// квалификации лида в проекте — разведка спринта показала, что второй нет
// (`deal-completeness.ts` считает ПОЛНОТУ СДЕЛКИ и к лиду неприменима: другие
// поля, другие веса, другой смысл — там «дорогая пустота», здесь «что держит
// конверсию»). Заводить веса/score тут не надо: у лида шесть пунктов и бинарный
// замок, процент был бы украшением.
//
// ⚠️ Обязательность — КОНСТАНТА продукта, не настройка организации: правило одно,
// а настройка добавила бы экран ради двух галок (решение §7 leads-entity-design).
// Пересмотреть, если появится направление с другой квалификацией.
//
// ⚠️ Пункта «Конкуренты» нет: такой колонки в `leads` не существует. В макете
// он был ошибкой, шестой пункт — `estimated_value`.
// ═══════════════════════════════════════════════════════

export type LeadQualKey = 'pain' | 'budget' | 'role' | 'chz' | 'deadline' | 'value';

export interface LeadQualItem {
  key: LeadQualKey;
  /** Заголовок пункта — одинаковый в обеих зонах. */
  label: string;
  /** Держит конверсию. */
  required: boolean;
  filled: boolean;
  /** Значение для зоны «Известно» (null у незакрытых). */
  value: string | null;
  /** Следствие незаполненности для зоны «Осталось выяснить». */
  hint: string;
}

export interface LeadQualification {
  items: LeadQualItem[];
  /** !filled, обязательные первыми. */
  missing: LeadQualItem[];
  /** filled, в порядке объявления. */
  known: LeadQualItem[];
  /** Для «4 из 6». */
  filledCount: number;
  total: number;
  /** Держат конверсию. */
  requiredMissing: LeadQualItem[];
  /** Для «готовность 1/2». */
  requiredMet: number;
  requiredTotal: number;
  /** requiredMissing.length === 0 */
  canConvert: boolean;
}

/** Подмножество полей `Lead`, которого хватает для расчёта. */
export interface LeadForQualification {
  pain?: string | null;
  budget_status?: LeadBudgetStatus | null;
  decision_role?: string | null;
  chz_groups?: string[] | null;
  regulatory_deadline?: string | null;
  estimated_value?: number | null;
}

/** Обрезка боли для зоны «Известно»: строка справки, а не абзац. */
const PAIN_MAX = 60;

function truncate(text: string, max = PAIN_MAX): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * `regulatory_deadline` — колонка типа `date` («YYYY-MM-DD»), а не timestamptz.
 * Разбираем ключ руками и печатаем в UTC: `new Date('2026-08-31')` даёт UTC-полночь,
 * и в любой зоне западнее Гринвича `toLocaleDateString` без `timeZone` показал бы
 * 30 августа. Тот же приём, что у бакетов Ганта.
 */
export function formatDateKeyRu(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  if (!m) return dateKey;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('ru-RU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function qualifyLead(lead: LeadForQualification): LeadQualification {
  const pain = lead.pain?.trim() ?? '';
  // ⚠️ `unknown` — это «не выяснен», а `none` — ВЫЯСНЕННЫЙ факт «бюджета нет».
  // Отсутствие бюджета закрывает пункт: менеджер сходил и узнал.
  const budgetKnown = lead.budget_status != null && lead.budget_status !== 'unknown';
  const role = lead.decision_role?.trim() ?? '';
  const chz = lead.chz_groups ?? [];
  const deadline = lead.regulatory_deadline ?? null;
  const value = lead.estimated_value;

  const items: LeadQualItem[] = [
    {
      key: 'pain',
      label: 'Боль / задача',
      required: true,
      filled: pain.length > 0,
      value: pain.length > 0 ? truncate(pain) : null,
      hint: 'Боль не выяснена — квалификация неполная',
    },
    {
      key: 'budget',
      label: 'Бюджет',
      required: true,
      filled: budgetKnown,
      value: budgetKnown
        ? LEAD_BUDGET_STATUS_CONFIG[lead.budget_status as LeadBudgetStatus]?.label
            ?? String(lead.budget_status)
        : null,
      hint: 'Бюджет не выяснен',
    },
    {
      key: 'role',
      label: 'Роль контакта',
      required: false,
      filled: role.length > 0,
      value:
        role.length > 0
          ? STAKEHOLDER_ROLE_CONFIG[role as StakeholderRole]?.full ?? role
          : null,
      hint: 'ЛПР не подтверждён',
    },
    {
      key: 'chz',
      label: 'Группы ЧЗ',
      required: false,
      filled: chz.length > 0,
      value: chz.length > 0 ? chz.join(', ') : null,
      hint: 'Группы «Честного Знака» не указаны',
    },
    {
      key: 'deadline',
      label: 'Дедлайн ЧЗ',
      required: false,
      filled: deadline != null,
      value: deadline != null ? formatDateKeyRu(deadline) : null,
      hint: 'Дедлайн маркировки неизвестен',
    },
    {
      key: 'value',
      label: 'Оценка',
      required: false,
      filled: value != null,
      value: value != null ? formatBudget(value) : null,
      hint: 'Сумма не оценена',
    },
  ];

  const known = items.filter((i) => i.filled);
  // Обязательные первыми, внутри группы — порядок объявления (сортировка стабильная).
  const missing = items
    .filter((i) => !i.filled)
    .sort((a, b) => Number(b.required) - Number(a.required));
  const requiredItems = items.filter((i) => i.required);
  const requiredMissing = requiredItems.filter((i) => !i.filled);

  return {
    items,
    missing,
    known,
    filledCount: known.length,
    total: items.length,
    requiredMissing,
    requiredMet: requiredItems.length - requiredMissing.length,
    requiredTotal: requiredItems.length,
    canConvert: requiredMissing.length === 0,
  };
}
