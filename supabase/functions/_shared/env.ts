// supabase/functions/_shared/env.ts — FIX tg-capture-401
//
// Обязательные переменные окружения и разбор того, ЧТО в них лежит.
//
// Заведён после отказа, который два дня выглядел как «ИИ не работает»: в трёх
// функциях ключ читался как `Deno.env.get(...) ?? ''`, то есть ОТСУТСТВИЕ ключа
// притворялось значением. Отказ проявлялся за три перехода от места, где возник, —
// шлюзом 401 у соседней функции. Пустая строка вместо ключа — то же враньё, что
// «≈ 0 ₽» вместо неизвестной цены: неизвестное обязано называться неизвестным.
//
// ⚠️ Модуль ЧИСТЫЙ: слова `Deno` здесь нет, читалка приходит параметром
//    (`(n) => Deno.env.get(n)`). Иначе его не импортировать из vitest, а проверять
//    надо ровно поведение «нет переменной → бросок», ради которого он и заведён.
//    Читалку передавать СТРЕЛКОЙ, а не самим `Deno.env.get`: метод, оторванный от
//    объекта, теряет `this` (это уже стоило разбора в FIX S-TL-1-RPC-THIS).

/** Чем читаем окружение. В Deno — `(n) => Deno.env.get(n)`, в тестах — из объекта. */
export type EnvRead = (name: string) => string | undefined;

/**
 * Обязательная переменная. Нет или пуста — бросок с именем переменной.
 *
 * Бросок на верхнем уровне модуля роняет функцию при холодном старте, и это лучший
 * из возможных исходов: имя переменной названо в первой же строке лога, а не
 * выясняется по чужому 401 через два дня.
 */
export function requireEnv(name: string, read: EnvRead): string {
  const raw = read(name);
  if (raw === undefined) {
    throw new Error(`Переменная окружения ${name} не задана — функция не может работать`);
  }
  const value = raw.trim();
  if (value === '') {
    throw new Error(`Переменная окружения ${name} пуста — функция не может работать`);
  }
  return value;
}

/** Необязательная переменная: пусто и «нет» — одинаково `null`, без подмены строкой. */
export function optionalEnv(name: string, read: EnvRead): string | null {
  const value = read(name)?.trim();
  return value ? value : null;
}

/** Вид секрета. Ключ по нему не восстанавливается — это ровно то, что можно в лог. */
export type SecretShape = 'jwt' | 'sb_secret' | 'sb_publishable' | 'unknown';

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function secretShape(value: string): SecretShape {
  if (value.startsWith('sb_secret_')) return 'sb_secret';
  if (value.startsWith('sb_publishable_')) return 'sb_publishable';
  return JWT_RE.test(value) ? 'jwt' : 'unknown';
}

/** Строка для лога: вид и длина, НИКОГДА не значение. */
export function describeSecret(value: string | null | undefined): string {
  if (!value) return 'нет';
  return `${secretShape(value)}, ${value.length} знаков`;
}

/**
 * Имена и длины переменных с префиксом — для разбора «как сейчас называется секрет».
 * Значений не печатает ни одного, и это не украшение: логи проекта читают из дашборда.
 */
export function formatEnvNames(all: Record<string, string>, prefix: string): string {
  const names = Object.keys(all)
    .filter((name) => name.startsWith(prefix))
    .sort();
  if (names.length === 0) return `нет переменных с префиксом ${prefix}`;
  return names.map((name) => `${name}(${all[name]?.length ?? 0})`).join(', ');
}

// ═══ Ключ для вызова соседней edge-функции через шлюз ═══
//
// ⚠️ Шлюзовая проверка `verify_jwt` понимает ТОЛЬКО JWT — легаси-HS256 и подписанные
//    новыми асимметричными ключами. Ключи новой схемы (`sb_secret_…`, `sb_publishable_…`)
//    JWT не являются: в заголовке `Authorization` они дают 401 ещё до кода функции.
//    А `supabase-js` кладёт ключ клиента И в `apikey`, И в `Authorization`.
//
//    Именно это и случилось 18.08: платформа стала отдавать в `SUPABASE_SERVICE_ROLE_KEY`
//    минченный ключ новой схемы (`sb_secret_…`). Для данных он рабочий — база пишется,
//    журнал апдейтов ведётся, — а шлюз `ai-capture` его не принимает.
//
//    Поэтому на вызов соседа нужен ИМЕННО JWT, и берётся он отдельно от ключа данных.

/**
 * Кандидаты на роль JWT для шлюза, в порядке предпочтения. Годится ЛЮБОЙ из них:
 * шлюзу нужен валидный проектный JWT, а не конкретная роль — сами функции за этим
 * заголовком в БД не ходят и роль не читают.
 *
 * 1. `SUPABASE_SERVICE_ROLE_KEY` — исторический путь (S-TG-3). Если платформа снова
 *    отдаёт туда легаси-JWT, её правда свежее нашей.
 * 2. `EDGE_INVOKE_JWT` — заводится руками, когда JWT в окружении не осталось.
 *    ⚠️ Имя БЕЗ префикса `SUPABASE_`: этот префикс зарезервирован платформой, секрет
 *    с ним не завести вовсе.
 * 3. `SUPABASE_ANON_KEY` — последний рубеж и САМЫЙ БЕДНЫЙ по правам. Пока платформа
 *    отдаёт туда легаси-anon-JWT, калитка открывается без единого нового секрета.
 *
 * ⚠️ Порядок важен только среди НАЙДЕННЫХ: берётся первый, который действительно JWT.
 */
export const GATEWAY_JWT_ENV = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'EDGE_INVOKE_JWT',
  'SUPABASE_ANON_KEY',
] as const;

export interface GatewayAuth {
  /** JWT для заголовка `Authorization`, если он вообще нашёлся. */
  token: string | null;
  /** Имя переменной, из которой взят токен, или `null`. */
  source: string | null;
  /** Что лежит в каждой проверенной переменной — вид и длина, для лога. */
  checked: string[];
}

export function resolveGatewayAuth(read: EnvRead): GatewayAuth {
  const checked: string[] = [];
  let token: string | null = null;
  let source: string | null = null;

  for (const name of GATEWAY_JWT_ENV) {
    const value = optionalEnv(name, read);
    checked.push(`${name}: ${describeSecret(value)}`);
    if (token === null && value !== null && secretShape(value) === 'jwt') {
      token = value;
      source = name;
    }
  }

  return { token, source, checked };
}
