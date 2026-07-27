/**
 * TS-зеркало SQL-функции `public.wf_eval_conditions(jsonb, jsonb)` (миграция 050, §4).
 *
 * ЗАЧЕМ. Модалка перехода стадии (S-R2-TRANSITION-1b) должна показывать «какие
 * автоматизации сработают, если перевести сделку сюда» ДО того, как переход
 * отправлен. Спросить об этом БД нельзя: правила матчатся внутри AFTER-триггера
 * `trg_zz_run_automations`, то есть уже после записи. Значит предикат приходится
 * считать на клиенте — а раз так, появляются ДВЕ реализации одного правила.
 *
 * ⚠️ РАЗЪЕЗД ДВУХ РЕАЛИЗАЦИЙ — ЗАФИКСИРОВАННЫЙ РИСК (§13 архдока). Единственная
 * защита — golden-фикстуры в `tests/unit/wf-conditions.test.ts`: те же (предикат,
 * строка, ожидание) прогоняются здесь и через `select public.wf_eval_conditions(...)`.
 * Правка любой ветки ниже обязана сопровождаться прогоном фикстур ПРОТИВ SQL.
 *
 * Семантика воспроизводит SQL дословно, включая неочевидное:
 *   • не-массив предикат (в т.ч. null) → true («условий нет» = матчим всё);
 *   • `eq`/`neq` — это `IS DISTINCT FROM`, а не `=`: null-безопасны, два null равны;
 *   • сравнение идёт по ТЕКСТУ (`->>`), кроме gt/lt/gte/lte — там каст в numeric;
 *   • неизвестный оператор (и клауза-не-объект, у которой op === null) → false;
 *   • ЛЮБАЯ ошибка каста роняет ВЕСЬ предикат в false, а не только свою клаузу —
 *     в SQL блок `exception when others` стоит на уровне функции, не цикла;
 *   • `contains` при отсутствующем `value`: в SQL `position(NULL in rv)` даёт NULL,
 *     условие `rv is null or NULL = 0` → NULL → ветка `return false` НЕ берётся,
 *     и клауза ПРОХОДИТ. Выглядит как баг SQL-версии; зеркалим как есть — задача
 *     этого модуля совпадать с БД, а не быть правильнее её.
 *
 * ГРАНИЦА. В SQL строка — это `to_jsonb(NEW)`, то есть значения в PG-форматировании
 * (timestamptz → '2026-07-27 10:00:00+00'). Здесь строка — объект из API, где та же
 * колонка приходит ISO-строкой от PostgREST. Для `eq` по датам это РАЗНЫЕ тексты.
 * Поэтому предпросмотр на клиенте достоверен для скалярных полей (числа, enum-строки,
 * null-проверки) и приблизителен для датовых `eq`/`contains`.
 */

/** Оператор клаузы. Список синхронен `case op` в SQL-версии. */
export type WfConditionOp =
  | 'is_null'
  | 'not_null'
  | 'eq'
  | 'neq'
  | 'contains'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte';

export interface WfCondition {
  field?: string;
  op?: string;
  value?: unknown;
}

/** Строка сущности: вычислителю нужен только доступ по имени поля. */
export type WfRow = Record<string, unknown>;

/** Каст неудался — эквивалент RAISE в SQL, ловится на уровне всего предиката. */
class WfCastError extends Error {}

/**
 * Аналог `jsonb ->> key`: значение как текст, либо null.
 * Отсутствующий ключ и JSON null неразличимы — ровно как в SQL.
 */
function jsonText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(value);
}

/**
 * Аналог `text::numeric`. Postgres на непарсимом тексте бросает — здесь тоже.
 * Пустая строка и нечисловой текст в PG невалидны для numeric; NaN/Infinity в JS
 * получаются из Number('') === 0 и Number('abc') === NaN, поэтому проверяем явно.
 */
function toNumeric(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') throw new WfCastError('invalid input syntax for type numeric');
  const n = Number(trimmed);
  if (!Number.isFinite(n)) throw new WfCastError('invalid input syntax for type numeric');
  return n;
}

/**
 * AND-предикат против снапшота строки.
 * @param conds массив клауз; всё, что не массив (включая null), → true
 * @param row   снапшот строки сущности
 */
export function wfEvalConditions(conds: unknown, row: WfRow): boolean {
  if (!Array.isArray(conds)) return true;

  try {
    for (const raw of conds) {
      const c: WfCondition =
        raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as WfCondition) : {};

      const field = jsonText(c.field);
      const op = jsonText(c.op);
      const v = jsonText(c.value);
      // field === null → обращение по несуществующему ключу → rv === null, как в SQL.
      const rv = field === null ? null : jsonText(row[field]);

      switch (op) {
        case 'is_null':
          if (rv !== null) return false;
          break;
        case 'not_null':
          if (rv === null) return false;
          break;
        case 'eq':
          // IS DISTINCT FROM: null vs null считаются равными.
          if (rv !== v) return false;
          break;
        case 'neq':
          if (rv === v) return false;
          break;
        case 'contains':
          // SQL-квирк: v === null → условие NULL → клауза проходит (см. шапку).
          if (rv === null) return false;
          if (v !== null && !rv.includes(v)) return false;
          break;
        case 'gt':
        case 'lt':
        case 'gte':
        case 'lte': {
          // Порядок важен и повторяет OR-короткое замыкание SQL: сперва `rv is null`
          // (каст не выполняется), потом каст rv (может бросить → весь предикат false).
          if (rv === null) return false;
          const a = toNumeric(rv);
          // v === null → всё сравнение даёт NULL → в SQL ветка `return false` НЕ
          // берётся и клауза проходит. Тот же квирк, что у `contains`.
          if (v === null) break;
          const b = toNumeric(v);
          const fails =
            (op === 'gt' && a <= b) ||
            (op === 'lt' && a >= b) ||
            (op === 'gte' && a < b) ||
            (op === 'lte' && a > b);
          if (fails) return false;
          break;
        }
        default:
          // Неизвестный/отсутствующий оператор → не матчим (safe), как в SQL.
          return false;
      }
    }
    return true;
  } catch {
    // Битый предикат/каст → не матчим. Зеркало `exception when others then return false`:
    // уровень функции, а не клаузы — одна плохая клауза роняет весь предикат.
    return false;
  }
}
