// supabase/functions/_shared/capture-resolve.ts — S-TG-TASK-1
//
// Сопоставление упоминаний из разобранного текста с записями CRM.
//
// ⚠️ МОДЕЛЬ НЕ РЕЗОЛВИТ СУЩНОСТИ. Она возвращает `assignee_hint` / `project_hint` /
//    `company_hint` — дословные подстроки текста. Связь с существующей записью
//    делает этот модуль, детерминированно и по данным БД. Тот же инвариант, что
//    «ИНН не парсит модель»: связь с записью — факт БД, а не догадка LLM.
//
// ⚠️ РЕЗОЛВ ТОЛЬКО ПРИ ЕДИНСТВЕННОМ СОВПАДЕНИИ. Два кандидата ⇒ пусто и причина.
//    В базе 273 компании и 17 сделок; 39 компаний носят имена, неотличимые друг от
//    друга после снятия ОПФ. «Выбрать первое» здесь означает «привязать не к тому»,
//    а у ошибочного `assigned_to` отката нет вовсе: `trg_notify_task_assigned`
//    уведомляет назначенного немедленно, AFTER INSERT.

import { normalizeNameTokens } from './capture-helpers.ts';

// ═══ Контракт ═══

/**
 * Почему поле осталось пустым. Причина доезжает до карточки в боте: молчаливый
 * пропуск даёт тихую деградацию — человек жмёт «Создать», считая, что исполнитель
 * проставлен.
 */
export type ResolveReason = 'ok' | 'empty' | 'not_found' | 'ambiguous' | 'error';

/**
 * ⚠️ `'error'` ЗАВЕДЁН ОТДЕЛЬНО ОТ `'not_found'` — S-TG-VOICE-TERMS, долг гейта
 *    S-TG-TASK-1. До правки упавший `select` возвращал `not_found`, и карточка
 *    говорила «не нашёл, назначьте в CRM» там, где справочник вообще не читался.
 *    Формулировка предлагала человеку исправить СВОЮ речь за сбой НА НАШЕЙ стороне —
 *    тот же класс склейки, что «Groq не смог распознать» на отказ по формату файла:
 *    диагностика уходит не туда, потому что два разных исхода носят один текст.
 */

export interface Resolved {
  id: string | null;
  reason: ResolveReason;
  /** Исходная подсказка — в карточке она показывается в кавычках как есть. */
  hint: string;
  /**
   * Имя найденной записи, `null` во всех исходах кроме `ok`.
   *
   * Карточка обязана показать ИМЕННО ЕГО, а не подсказку: человек подтверждает
   * привязку к «Андрею Молявину», а не к слову «Андрею», которое он же и написал.
   */
  label: string | null;
}

/** Кандидат грубого отбора: id и то имя, по которому идёт точное сравнение. */
export interface ResolveCandidate {
  id: string;
  name: string;
}

/**
 * Режим сравнения токенов.
 *
 * `person` — по основе: падеж иначе ломает всё («андрею» против «Андрей»).
 * `entity` — по снятому падежному окончанию, НЕ по обрезке до N символов:
 *            обрезка сливает «Тандер» с «Тандем», а это разные юрлица.
 */
export type MatchMode = 'person' | 'entity';

/** Длина основы для людей. Токен короче сравнивается целиком. */
const PERSON_STEM = 4;

/**
 * Служебные слова: в названии организации и в ФИО они не встречаются, а
 * требование найти их обнуляет матч целиком.
 *
 * ⚠️ ПОРОГ ПО ДЛИНЕ ЭТУ РАБОТУ НЕ ДЕЛАЕТ, И ЭТО НЕ ОЧЕВИДНО. `MIN_HINT_TOKEN = 3`
 *    отсекал «по» и «в» — то есть ровно те предлоги, на которых был написан тест, —
 *    но пропускал «для», «про», «под», «при», «над», «без». Замер до правки:
 *    «под Магнит» НЕ находило «Магнит», хотя падежа там нет вовсе, а «для Тандера»
 *    не находило «Тандер» дважды. Длина токена — не признак значимости; признак —
 *    принадлежность к закрытому списку служебных слов.
 */
const STOP_TOKENS = new Set([
  'по', 'в', 'во', 'у', 'с', 'со', 'к', 'ко', 'о', 'об', 'обо', 'на', 'за',
  'из', 'от', 'до', 'для', 'про', 'под', 'над', 'при', 'без', 'через',
  'перед', 'между', 'и', 'а', 'же', 'по-поводу', 'насчет',
]);

/**
 * Токены короче этого в подсказке не значимы даже после снятия служебных слов:
 * инициалы и обрывки дают ложные совпадения.
 */
const MIN_HINT_TOKEN = 3;

/**
 * Минимальная длина остающейся основы при снятии падежного окончания.
 *
 * ⚠️ Пять, а не четыре: на четырёх «тандем» теряет «ем» и превращается в «танд»,
 *    сближаясь с чужими словами. На пяти «тандем» (6 букв) не режется вовсе, а
 *    «тандера» (7) режется до «тандер» — то есть падеж снимается там, где он есть,
 *    и не выдумывается там, где его нет.
 */
const ENTITY_MIN_STEM = 5;

/**
 * Падежные окончания, от длинных к коротким.
 *
 * Список закрытый: это не морфология, а ответ на один вопрос — «отличаются ли
 * подсказка и название только окончанием».
 *
 * ⚠️ ПРИЛАГАТЕЛЬНЫЕ ОБЯЗАТЕЛЬНЫ, И ЭТО ВЫЯСНИЛОСЬ ЗАМЕРОМ НА ЖИВЫХ НАЗВАНИЯХ.
 *    Одних существительных мало: из 17 сделок организации прилагательное несут
 *    «Хороший вкус», «Чусовская мельница», «Аграрная группа», «Дмитровские
 *    колбасы», «Продовольственный фонд» — почти треть. Без «ому»/«ая»/«ой»/«ий»
 *    «Хорошему вкусу» не находило «Хороший вкус».
 *
 * ⚠️ ПОРЯДОК ЗНАЧИМ: «ому» обязано проверяться раньше «у» и «ом», иначе от
 *    «хорошему» останется «хорошем» и совпадения не будет.
 */
const CASE_ENDINGS = [
  'ыми', 'ими', 'ому', 'ему', 'ого', 'его', 'ями', 'ами',
  'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ый', 'ий', 'ую', 'юю',
  'ов', 'ев', 'ей', 'ой', 'ом', 'ем', 'ах', 'ях', 'ам', 'ям',
  'а', 'я', 'у', 'ю', 'ы', 'и', 'е', 'й',
];

/**
 * Потолок грубого отбора.
 *
 * ⚠️ НЕ 5. Широкий `ilike` на 273 компаниях легко даёт больше пяти строк, и
 *    правильный кандидат отсёкся бы МОЛЧА: «не нашлось» стало бы означать
 *    «не влез».
 */
export const RESOLVE_FETCH_LIMIT = 20;

// ═══ Чистое сопоставление (тестируется без БД) ═══

/**
 * Токен без падежного окончания — если после снятия остаётся достаточная основа.
 *
 * Экспортируется ради теста: правило про «Тандер»/«Тандем» проверяется здесь, а
 * не через три слоя резолвера.
 */
export function stripCaseEnding(token: string): string {
  for (const ending of CASE_ENDINGS) {
    if (token.endsWith(ending) && token.length - ending.length >= ENTITY_MIN_STEM) {
      return token.slice(0, -ending.length);
    }
  }
  return token;
}

/**
 * Одно слово в разных падежах?
 *
 * ⚠️ ОКОНЧАНИЕ СНИМАЕТСЯ С ОБЕИХ СТОРОН, а не только с подсказки. Односторонняя
 *    проверка («кандидат — начало подсказки») ловит «Тандера» → «Тандер», но
 *    проваливает «Ромашку» → «Ромашка»: там оба слова в падежах, и общая часть —
 *    основа, а не одно из них целиком.
 */
function sameWordDifferentCase(hintToken: string, candidateToken: string): boolean {
  if (hintToken === candidateToken) return true;
  return stripCaseEnding(hintToken) === stripCaseEnding(candidateToken);
}

/** Совпадение двух токенов в заданном режиме. */
function tokensMatch(hintToken: string, candidateToken: string, mode: MatchMode): boolean {
  if (mode === 'entity') return sameWordDifferentCase(hintToken, candidateToken);
  if (hintToken.length < PERSON_STEM || candidateToken.length < PERSON_STEM) {
    return hintToken === candidateToken;
  }
  return hintToken.slice(0, PERSON_STEM) === candidateToken.slice(0, PERSON_STEM);
}

/**
 * Подсказка описывает кандидата, если КАЖДЫЙ её значимый токен нашёл себе токен
 * в имени кандидата.
 *
 * Направление важно: подсказка — подмножество имени, а не наоборот. «Молявину»
 * обязано находить «Андрей Молявин», а «Андрей» — обязано находить и его, и
 * любого другого Андрея (и это как раз `ambiguous`, а не повод ослабить правило).
 */
export function hintMatchesName(hint: string, name: string, mode: MatchMode): boolean {
  const hintTokens = significantHintTokens(hint);
  if (hintTokens.length === 0) return false;
  const nameTokens = normalizeNameTokens(name);
  if (nameTokens.length === 0) return false;
  return hintTokens.every((h) => nameTokens.some((n) => tokensMatch(h, n, mode)));
}

/** Токены подсказки, по которым вообще имеет смысл искать. */
export function significantHintTokens(hint: string): string[] {
  return normalizeNameTokens(hint).filter(
    (t) => !STOP_TOKENS.has(t) && t.length >= MIN_HINT_TOKEN,
  );
}

/**
 * Самый длинный значимый токен, УРЕЗАННЫЙ ДО ОСНОВЫ, — им идёт грубый отбор в SQL.
 *
 * ⚠️ ОСНОВА, А НЕ ТОКЕН ЦЕЛИКОМ — ИНАЧЕ ТОЧНЫЙ МАТЧ НИКОГДА НЕ ПОЛУЧИТ КАНДИДАТА.
 *    `ilike '%молявину%'` не находит «Андрей Молявин», `ilike '%тандера%'` не
 *    находит «Тандер». До правки грубый отбор возвращал ноль строк на любом
 *    косвенном падеже, и разбор падежей в `tokensMatch` не мог сработать в принципе:
 *    он получал пустой список кандидатов.
 *
 *    Дефект не имел симптома и не ловился тестами по построению — они звали
 *    `hintMatchesName` напрямую, минуя SQL-шаг, то есть проверяли вторую половину
 *    механизма на данных, которые первая половина никогда бы не отдала.
 */
export function coarseNeedle(hint: string, mode: MatchMode = 'entity'): string | null {
  const tokens = significantHintTokens(hint);
  if (tokens.length === 0) return null;
  const longest = tokens.reduce((a, b) => (b.length > a.length ? b : a));
  return mode === 'person' ? longest.slice(0, PERSON_STEM) : stripCaseEnding(longest);
}

/**
 * Единственный кандидат или причина, по которой его нет.
 *
 * ⚠️ `truncated` — НЕ ФОРМАЛЬНОСТЬ. Если грубый отбор упёрся в лимит, мы не знаем,
 *    что осталось за ним: выбирать из усечённой выборки значит выдавать «нашёл
 *    ровно одного» там, где их могло быть двадцать один.
 */
export function pickSingleMatch(
  hint: string,
  candidates: ResolveCandidate[],
  mode: MatchMode,
  truncated = false,
): Resolved {
  const raw = (hint ?? '').trim();
  if (significantHintTokens(raw).length === 0) {
    return { id: null, reason: 'empty', hint: raw, label: null };
  }

  // ⚠️ УСЕЧЁННАЯ ВЫБОРКА ОБЕСЦЕНИВАЕТ ЛЮБОЙ ИСХОД, В ТОМ ЧИСЛЕ ЕДИНСТВЕННЫЙ.
  //    Соблазн «один хит из двадцати — значит он и есть» ложен: за лимитом мог
  //    остаться второй такой же, и тогда «нашёл ровно одного» — это выдуманная
  //    точность, а не факт. Проверка стоит ДО подсчёта совпадений именно поэтому.
  if (truncated) return { id: null, reason: 'ambiguous', hint: raw, label: null };

  const hits = candidates.filter((c) => hintMatchesName(raw, c.name, mode));
  if (hits.length === 1) return { id: hits[0].id, reason: 'ok', hint: raw, label: hits[0].name };
  if (hits.length > 1) return { id: null, reason: 'ambiguous', hint: raw, label: null };
  return { id: null, reason: 'not_found', hint: raw, label: null };
}

// ═══ Грубый отбор в БД ═══
//
// Клиент описан структурно, а не через `any`: `any` запрещён правилом проекта, а
// тащить сюда типы supabase-js нельзя — модуль читается и Deno, и tsc.

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

export interface ResolveBuilder extends PromiseLike<QueryResult> {
  select(columns: string): ResolveBuilder;
  eq(column: string, value: string): ResolveBuilder;
  neq(column: string, value: string): ResolveBuilder;
  ilike(column: string, pattern: string): ResolveBuilder;
  limit(count: number): ResolveBuilder;
}

export interface ResolveDb {
  from(table: string): ResolveBuilder;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** `%` и `_` в подсказку не попадают (их снимает токенизация) — обёртка честная. */
function contains(needle: string): string {
  return `%${needle}%`;
}

/**
 * Общий ход всех трёх резолверов: пустая подсказка → грубый отбор → точный матч.
 */
async function resolveVia(
  hint: string,
  mode: MatchMode,
  fetchCandidates: (needle: string) => Promise<ResolveCandidate[] | null>,
): Promise<Resolved> {
  const raw = (hint ?? '').trim();
  const needle = coarseNeedle(raw, mode);
  if (needle === null) return { id: null, reason: 'empty', hint: raw, label: null };

  const rows = await fetchCandidates(needle);
  // Сбой запроса — не «не нашли». Бросок здесь по-прежнему запрещён: потерять из-за
  // него весь разбор хуже, чем показать строкой, что справочник не прочитался.
  if (rows === null) return { id: null, reason: 'error', hint: raw, label: null };

  return pickSingleMatch(raw, rows, mode, rows.length >= RESOLVE_FETCH_LIMIT);
}

/**
 * Исполнитель среди членов организации.
 *
 * Роль `viewer` исключена: создавать за неё задачу можно, а назначать ей — нет,
 * она всё равно не сможет её вести. В базе такой роли сейчас нет (owner, manager),
 * фильтр стоит на будущее.
 */
export async function resolveAssignee(
  db: ResolveDb,
  orgId: string,
  hint: string,
): Promise<Resolved> {
  return resolveVia(hint, 'person', async (needle) => {
    const { data, error } = await db
      .from('memberships')
      .select('profile_id, profiles!inner(id, full_name)')
      .eq('org_id', orgId)
      .neq('role', 'viewer')
      .ilike('profiles.full_name', contains(needle))
      .limit(RESOLVE_FETCH_LIMIT);
    if (error) {
      console.error('capture-resolve: отбор исполнителей упал:', error.message);
      return null;
    }
    if (!Array.isArray(data)) return [];
    const out: ResolveCandidate[] = [];
    for (const row of data) {
      if (!isRecord(row)) continue;
      // PostgREST отдаёт embedded many-to-one объектом, но на некоторых версиях —
      // массивом из одного элемента. Оба вида читаем, гадать незачем.
      const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (!isRecord(p)) continue;
      const id = str(p.id) || str(row.profile_id);
      const name = str(p.full_name);
      if (id && name) out.push({ id, name });
    }
    return out;
  });
}

/** Сделка организации. Только `type='client'` — внутренние проекты не сделки. */
export async function resolveProject(db: ResolveDb, orgId: string, hint: string): Promise<Resolved> {
  return resolveVia(hint, 'entity', async (needle) => {
    const { data, error } = await db
      .from('projects')
      .select('id, name')
      .eq('org_id', orgId)
      .eq('type', 'client')
      .ilike('name', contains(needle))
      .limit(RESOLVE_FETCH_LIMIT);
    if (error) {
      console.error('capture-resolve: отбор сделок упал:', error.message);
      return null;
    }
    return toCandidates(data);
  });
}

/** Компания организации. */
export async function resolveCompany(db: ResolveDb, orgId: string, hint: string): Promise<Resolved> {
  return resolveVia(hint, 'entity', async (needle) => {
    const { data, error } = await db
      .from('companies')
      .select('id, name')
      .eq('org_id', orgId)
      .ilike('name', contains(needle))
      .limit(RESOLVE_FETCH_LIMIT);
    if (error) {
      console.error('capture-resolve: отбор компаний упал:', error.message);
      return null;
    }
    return toCandidates(data);
  });
}

function toCandidates(data: unknown): ResolveCandidate[] {
  if (!Array.isArray(data)) return [];
  const out: ResolveCandidate[] = [];
  for (const row of data) {
    if (!isRecord(row)) continue;
    const id = str(row.id);
    const name = str(row.name);
    if (id && name) out.push({ id, name });
  }
  return out;
}
