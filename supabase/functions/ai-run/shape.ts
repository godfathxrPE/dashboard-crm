// supabase/functions/ai-run/shape.ts — fix-S-R2-AI-SHAPE
//
// Проверка ФОРМЫ ответа модели (не содержания). По итогам инъекционного смоука
// 28.07: безопасность держится, ломается доступность — модель срывается со
// структурированного вывода и упаковывает правильные данные неправильно.
//
// Модуль ЧИСТЫЙ: ни Deno, ни supabase-js, ни сети. Это не эстетика — иначе логику
// нельзя прогнать тестом (Deno-модуль с `Deno.env` на верхнем уровне из vitest не
// импортируется), а требование «показать вердикт на живых фикстурах» без теста
// превращается в обещание. Импортируется в index.ts относительным путём, поэтому
// `supabase functions deploy` собирает его в тот же бандл.

/**
 * Претензия к форме ответа. Два класса — они по-разному бьют по пользователю:
 *
 *  • hard — объявленный тип не совпал (`tasks` строкой вместо массива, случай
 *    28.07). Клиент такой ответ не распарсит: `parseProposal` вернёт null, панель
 *    покажет «модель вернула некорректный ответ». Записывать нечего.
 *
 *  • soft — в строковом значении разметка контракта (`</client_situation>`,
 *    `<parameter name=`, случаи 11.07 и 13.07). Данные читаемы, просто грязные.
 *    Отказать из-за такой претензии значит сделать ХУЖЕ, чем сегодня, — и ровно
 *    этим выстрелило бы ложное срабатывание широкого маркера `</`.
 */
export type ShapeClaim = { kind: 'hard' | 'soft'; message: string };

/**
 * Маркеры разметки контракта внутри строкового значения.
 *
 * `</` намеренно широкий и потому может ложно сработать на легитимной цитате из
 * транскрипта — это осознанный размен. Он безопасен ровно потому, что маркерная
 * претензия мягкая: одна она к отказу не приводит, максимум даёт лишний ретрай
 * и пометку в meta.
 */
export const SHAPE_MARKERS = [
  '<parameter name=', // синтаксис tool-use, случай 28.07
  '</', // закрывающий тег — контракт наружу, случаи 11.07 и 13.07
];

/** Добавка ко ВТОРОМУ user-ходу. Про форму, и только про форму: назови модели
 *  конкретные претензии — начнёт «чинить» данные вместо упаковки. */
export const SHAPE_RETRY_HINT =
  'Предыдущий ответ не соответствовал схеме инструмента. Верни результат строго ' +
  'через вызов инструмента, каждое поле — того типа, который объявлен в схеме. ' +
  'Не вставляй в значения полей теги и служебную разметку.';

/** JSON-тип значения в терминах JSON Schema (не `typeof`: массив и null — отдельно). */
function jsonTypeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Совпадает ли фактический тип с объявленным. `declared` может быть:
 *   строкой   — 'array' | 'object' | 'string' | 'integer' | …
 *   массивом  — ['string','null'] (так объявлен deal_summary.next_step)
 *   отсутствовать — тогда сверять не с чем.
 * Возвращает null, когда проверка неприменима.
 */
function typeMatches(declared: unknown, actual: string): boolean | null {
  if (typeof declared === 'string') {
    // JSON Schema различает integer и number, JS — нет. Целочисленность
    // проверяет клиентский Zod (probability 0..100 int), здесь она не наша забота.
    if (declared === 'integer' || declared === 'number') return actual === 'number';
    return declared === actual;
  }
  if (Array.isArray(declared)) {
    if (declared.length === 0) return null;
    return declared.some((d) => typeMatches(d, actual) === true);
  }
  return null; // type не объявлен — пропускаем, а не считаем несовпадением
}

/** Рекурсивный обход всех СТРОКОВЫХ значений с путём до них. */
function forEachString(
  value: unknown,
  path: string,
  visit: (s: string, path: string) => void,
): void {
  if (typeof value === 'string') {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => forEachString(v, `${path}[${i}]`, visit));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      forEachString(v, path ? `${path}.${k}` : k, visit);
    }
  }
}

/**
 * Форма ответа модели по `input_schema` инструмента + маркеры разметки в строках.
 * Пустой список = ответ годен.
 *
 * Проверок ТРИ, потому что ломается тремя способами:
 *  • тип верхнего уровня (tasks строкой вместо массива — 28.07);
 *  • пропущенные обязательные поля (3d5e6e70, 13.07: один ключ из шести);
 *  • разметка контракта внутри строки (`</client_situation>` — 13.07). Типовая
 *    проверка её не поймает: `client_situation` строка и должна быть строкой.
 *
 * ⚠️ Утверждение «`required` держит сама модель» опровергнуто фактом и убрано
 * отсюда: прогон 3d5e6e70 схлопнул весь payload в `client_situation`, и ретрай
 * случился бы СЛУЧАЙНО — только из-за маркера `</`. Без маркера огрызок вместо
 * записки прошёл бы с вердиктом «форма годна».
 */
export function checkResultShape(
  inputSchema: Record<string, unknown>,
  input: Record<string, unknown>,
): ShapeClaim[] {
  const claims: ShapeClaim[] = [];

  // ── Типовая (жёсткая) ──
  const properties = inputSchema?.properties as Record<string, unknown> | undefined;
  if (properties && typeof properties === 'object') {
    for (const [key, rawSpec] of Object.entries(properties)) {
      if (!(key in input)) continue; // ключа нет — не претензия
      const spec = rawSpec as { type?: unknown } | null;
      const actual = jsonTypeOf(input[key]);
      if (typeMatches(spec?.type, actual) === false) {
        claims.push({
          kind: 'hard',
          message: `${key}: ожидался ${JSON.stringify(spec?.type)}, пришёл ${actual}`,
        });
      }
    }
  }

  // ── Пропущенные обязательные поля (мягкая) ──
  // `required` модель НЕ держит: прогон 3d5e6e70 (13.07) вернул 1 ключ из 6.
  // Класс мягкий намеренно: претензия обязана вызвать ретрай, но не отказ —
  // частичный ответ пользователю полезнее пустого экрана, а второй попытки
  // обычно хватает. Проверка на живых данных: 5 из 7 прогонов дают 0 претензий,
  // пропуски только у двух уже известных испорченных.
  //
  // Только верхний уровень. Вложенные `required` (внутри `items` массивов —
  // ['claim','quote'], ['what','who','due'], ['text']) не проверяем: обход
  // элементов удваивает сложность модуля, а поштучно битые элементы уже
  // отсеивает клиентский Zod (`taskSchema.nullable().catch(null)` + filter).
  const required = inputSchema?.required;
  if (Array.isArray(required)) {
    for (const key of required) {
      if (typeof key === 'string' && !(key in input)) {
        claims.push({ kind: 'soft', message: `${key}: обязательное поле отсутствует` });
      }
    }
  }

  // ── Маркерная (мягкая) ──
  // Один маркер на путь: строка с десятью `</` — одна претензия, не десять.
  forEachString(input, '', (s, path) => {
    const hit = SHAPE_MARKERS.find((m) => s.includes(m));
    if (hit) {
      claims.push({ kind: 'soft', message: `${path || '(корень)'}: разметка «${hit}» в значении` });
    }
  });

  return claims;
}

export function hardClaims(claims: ShapeClaim[]): ShapeClaim[] {
  return claims.filter((c) => c.kind === 'hard');
}

export function softClaims(claims: ShapeClaim[]): ShapeClaim[] {
  return claims.filter((c) => c.kind === 'soft');
}
