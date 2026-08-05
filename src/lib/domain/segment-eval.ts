/**
 * Вычислитель сегментов (Smart Views, R2-P0-B) — чистый домен: без React, без Supabase.
 *
 * ГРАНИЦА v1: считаем НА КЛИЕНТЕ, поверх уже загруженного списка. Это осознанно —
 * список сделок и так целиком в кеше TanStack Query, серверный RPC добавил бы round-trip
 * ради фильтра по 200 строкам. Порог, после которого решение надо пересмотреть в пользу
 * SQL-RPC (`filter_segment(entity, predicate)`), — ~5 000 строк на сущность: примерно там
 * прокрутка списка перестаёт держать 60 fps на re-фильтрации. Записано, чтобы пересмотр
 * был воспроизводимым решением, а не «забыли».
 * С S-R3-TRUST-1 к тому же порогу относятся и ВЫЧИСЛЯЕМЫЕ поля (`VIRTUAL_FIELDS`):
 * `completeness_score` считается на каждую строку при каждой фильтрации, поэтому цена
 * одной строки выросла — пересмотр границы обязан смотреть и на них.
 *
 * СЕМАНТИКА null (задана здесь, архдок её не специфицировал; покрыта tests/unit/segment-eval):
 *   • `is_null` / `not_null` — единственные операторы, определённые на null;
 *   • любой другой оператор при null-значении поля → false (НЕ «истина по умолчанию»);
 *   • неизвестное поле (вне whitelist) или неизвестный оператор → клауза false + один
 *     console.warn: сегмент, созданный будущей версией, не должен ломать страницу;
 *   • пустой `and` → строка проходит (сегмент «все»).
 *
 * Дни считаются по КАЛЕНДАРНОМУ ДНЮ MSK (mskDateKey), не по UTC и не по браузерной TZ —
 * иначе на границе суток сегмент «просрочен next action» мигает.
 */

import type { SegmentClause, SegmentEntity, SegmentPredicate } from '@/types/database';
import { segmentFieldSet } from '@/lib/constants/segments';
import { diffDaysKey, mskDateKey } from '@/lib/utils/date-helpers';
import {
  DEFAULT_RULES,
  evaluateCompleteness,
  type CompletenessRules,
  type ProjectForCompleteness,
} from '@/lib/domain/deal-completeness';

/**
 * Строка любой сущности: вычислителю нужен только доступ по имени поля.
 * Публичные сигнатуры принимают `object`, а не этот тип: интерфейсы приложения
 * (`Project`, `Contact`, …) не имеют index signature и под `Record<string, unknown>`
 * не подходят. Сужение делается внутри, одним кастом на входе.
 */
export type SegmentRow = Record<string, unknown>;

const asRow = (row: object): SegmentRow => row as SegmentRow;

// Один warn на уникальную причину за жизнь вкладки — иначе фильтрация списка
// (вызов на каждую строку) зальёт консоль тысячей одинаковых строк.
const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[segment-eval] ${message}`);
}

/** Только для тестов: сбросить дедуп warn'ов между кейсами. */
export function __resetSegmentWarnings(): void {
  warned.clear();
}

function isPrimitive(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

/** Календарных дней MSK прошло с даты (>= 0 в прошлом, < 0 для будущего). null — не дата. */
function daysSinceMsk(raw: unknown, todayKey: string): number | null {
  if (typeof raw !== 'string' && !(raw instanceof Date)) return null;
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  return diffDaysKey(mskDateKey(raw instanceof Date ? raw : new Date(ms)), todayKey);
}

/**
 * Контекст вычисления: то, чего нет в самой строке. Необязателен везде — сегмент,
 * посчитанный без контекста, обязан остаться рабочим (правила падают на дефолтные).
 */
export interface SegmentEvalContext {
  /** Правила полноты организации (`useCompletenessRules()`); нет ⇒ `DEFAULT_RULES`. */
  completenessRules?: CompletenessRules;
}

/**
 * ВЫЧИСЛЯЕМЫЕ поля (S-R3-TRUST-1): колонки в БД нет, значение считается здесь.
 * Читаются раньше `row[field]` — реальная колонка с таким именем их не перекроет.
 */
const VIRTUAL_FIELDS: Record<string, (row: SegmentRow, ctx: SegmentEvalContext) => unknown> = {
  completeness_score: (row, ctx) =>
    evaluateCompleteness(row as ProjectForCompleteness, ctx.completenessRules ?? DEFAULT_RULES)
      .score,
};

function evalClause(
  row: SegmentRow,
  clause: SegmentClause,
  allowed: Set<string>,
  todayKey: string,
  ctx: SegmentEvalContext,
): boolean {
  if (!allowed.has(clause.field)) {
    warnOnce(`field:${clause.field}`, `поле «${clause.field}» вне whitelist — клауза считается ложной`);
    return false;
  }

  const virtual = VIRTUAL_FIELDS[clause.field];
  const raw = virtual ? virtual(row, ctx) : row[clause.field];
  // Пустая строка = «не заполнено»: в CRM `next_step: ''` и `next_step: null` — одно и то же
  // состояние для пользователя, и сегмент «Без next_step» обязан ловить оба.
  const isNull = raw === null || raw === undefined || raw === '';

  // Единственные операторы, определённые на null
  if (clause.op === 'is_null') return isNull;
  if (clause.op === 'not_null') return !isNull;
  // Все прочие на пустом значении — ложь, а не «истина по умолчанию»
  if (isNull) return false;

  const { op, value } = clause;

  switch (op) {
    case 'eq':
      return isPrimitive(value) && raw === value;
    case 'neq':
      return isPrimitive(value) && raw !== value;

    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      // Только числа: сравнение строк/дат этими операторами не определено (для дат есть days_since_*)
      if (typeof raw !== 'number' || typeof value !== 'number') return false;
      if (op === 'gt') return raw > value;
      if (op === 'gte') return raw >= value;
      if (op === 'lt') return raw < value;
      return raw <= value;
    }

    case 'in':
      // Несовпадение типов — false, не исключение
      return Array.isArray(value) && value.some((v) => v === raw);

    case 'contains':
      if (typeof raw !== 'string' || typeof value !== 'string') return false;
      return raw.toLocaleLowerCase().includes(value.toLocaleLowerCase());

    case 'days_since_gt':
    case 'days_since_lt': {
      if (typeof value !== 'number') return false;
      const days = daysSinceMsk(raw, todayKey);
      if (days === null) return false;
      return op === 'days_since_gt' ? days > value : days < value;
    }

    default: {
      const unknownOp: string = op;
      warnOnce(`op:${unknownOp}`, `оператор «${unknownOp}» неизвестен — клауза считается ложной`);
      return false;
    }
  }
}

/**
 * Проходит ли строка предикат сегмента. v1 — конъюнкция (AND) всех клауз.
 * `now` инжектируется тестами; в проде — текущий момент.
 * `ctx` — необязателен: без него вычисляемые поля считаются по дефолтным правилам.
 */
export function matchSegment(
  row: object,
  predicate: SegmentPredicate | null | undefined,
  entity: SegmentEntity = 'deals',
  now: Date = new Date(),
  ctx: SegmentEvalContext = {},
): boolean {
  const clauses = predicate?.and;
  if (!Array.isArray(clauses) || clauses.length === 0) return true;
  const allowed = segmentFieldSet(entity);
  const todayKey = mskDateKey(now);
  return clauses.every((c) => evalClause(asRow(row), c, allowed, todayKey, ctx));
}

/**
 * Отфильтровать список по сегменту. `predicate == null` → список как есть
 * (сегмент не выбран — не путать с сегментом без клауз, который тоже пропускает всё).
 * todayKey вычисляется один раз на весь прогон, а не на строку.
 */
export function applySegment<T extends object>(
  list: T[],
  predicate: SegmentPredicate | null | undefined,
  entity: SegmentEntity = 'deals',
  now: Date = new Date(),
  ctx: SegmentEvalContext = {},
): T[] {
  if (!predicate) return list;
  const clauses = predicate.and;
  if (!Array.isArray(clauses) || clauses.length === 0) return list;
  const allowed = segmentFieldSet(entity);
  const todayKey = mskDateKey(now);
  return list.filter((row) =>
    clauses.every((c) => evalClause(asRow(row), c, allowed, todayKey, ctx)),
  );
}
