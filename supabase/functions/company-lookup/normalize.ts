// supabase/functions/company-lookup/normalize.ts — S-INN-1
//
// Разбор ответа DaData `findById/party` в плоский результат для клиента.
//
// Файл вынесен из `index.ts` ровно по одной причине: он ЧИСТЫЙ (никаких `Deno.*`,
// никаких импортов) и потому проверяем юнит-тестами из vitest
// (`tests/unit/company-lookup-normalize.test.ts`) — а `index.ts` с `Deno.serve`
// из node-раннера не импортировать. Не добавлять сюда обращений к рантайму.
//
// Правило проекта: внешний payload — только `unknown` + сужение, `any` запрещён.

/** Плоский результат, который уходит клиенту. Зеркало — `CompanyLookupResult` в use-company-lookup.ts. */
export interface CompanyLookupResult {
  found: boolean;
  /** data.name.full_with_opf — «ООО "ОРИЕНТ-ПРО"». Идёт в companies.legal_name. */
  legal_name: string | null;
  /** data.name.short_with_opf — предлагается в `name`, ТОЛЬКО если поле пустое. */
  short_name: string | null;
  kpp: string | null;
  ogrn: string | null;
  /** data.address.unrestricted_value — юрадрес. Идёт в legal_address, не в address. */
  legal_address: string | null;
  /** data.state.status: ACTIVE | LIQUIDATING | LIQUIDATED | REORGANIZING | BANKRUPT | … */
  status: string | null;
  /** data.management.name — руководитель. Подсказка для контакта, в компанию не пишется. */
  management_name: string | null;
}

export const NOT_FOUND: CompanyLookupResult = {
  found: false,
  legal_name: null,
  short_name: null,
  kpp: null,
  ogrn: null,
  legal_address: null,
  status: null,
  management_name: null,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Строка или null. Пустая строка и пробелы — тоже null: пустое поле формы не отличается от отсутствующего. */
function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** Вложенное поле по пути; любой не-объект на пути гасит цепочку в null. */
function pick(root: Record<string, unknown>, ...path: string[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (!isRecord(cur)) return null;
    cur = cur[key];
  }
  return cur;
}

/**
 * Сужает ответ DaData до `CompanyLookupResult`.
 *
 * Пустой `suggestions` — это НЕ ошибка, а валидный ответ «в ЕГРЮЛ такого ИНН нет»:
 * отдаём `found: false`, клиент показывает тост и форму не трогает.
 *
 * У ИП блок `name` пустой, а название лежит в `fio`/`value` — поэтому и `legal_name`,
 * и `short_name` падают на `suggestion.value`, иначе автозаполнение по 12-значному
 * ИНН вернуло бы пустые поля с `found: true` (худший из исходов: «нашли и ничего»).
 */
export function normalizeDadataParty(payload: unknown): CompanyLookupResult {
  if (!isRecord(payload)) return NOT_FOUND;

  const suggestions = payload.suggestions;
  if (!Array.isArray(suggestions) || suggestions.length === 0) return NOT_FOUND;

  const first = suggestions[0];
  if (!isRecord(first)) return NOT_FOUND;

  const data = isRecord(first.data) ? first.data : null;
  const fallbackName = str(first.value);
  if (!data) {
    // Подсказка без `data` — реестр ответил, но полезной нагрузки нет.
    return fallbackName ? { ...NOT_FOUND, found: true, legal_name: fallbackName, short_name: fallbackName } : NOT_FOUND;
  }

  return {
    found: true,
    legal_name: str(pick(data, 'name', 'full_with_opf')) ?? str(pick(data, 'name', 'full')) ?? fallbackName,
    short_name: str(pick(data, 'name', 'short_with_opf')) ?? str(pick(data, 'name', 'short')) ?? fallbackName,
    kpp: str(data.kpp),
    ogrn: str(data.ogrn),
    legal_address:
      str(pick(data, 'address', 'unrestricted_value')) ?? str(pick(data, 'address', 'value')),
    status: str(pick(data, 'state', 'status')),
    management_name: str(pick(data, 'management', 'name')),
  };
}

/**
 * Формат ИНН: 10 цифр (юрлицо) или 12 (ИП). Контрольную сумму НЕ считаем —
 * проверка на существование и так делается запросом в реестр, а самодельный
 * чек-дайджест дал бы ложные отказы на редких валидных номерах.
 *
 * Копия этого регэкспа живёт на клиенте (`src/lib/utils/inn.ts`): Deno-функция и
 * next-бандл не делят модули, а сервер обязан валидировать вход сам, независимо
 * от того, что прислал клиент.
 */
export const INN_RE = /^\d{10}$|^\d{12}$/;
