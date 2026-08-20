// supabase/functions/_shared/voice-terms.ts — S-TG-VOICE-TERMS
//
// Имена клиентов и коллег → строка `terms` для подсказки Whisper.
//
// ⚠️ ЗАЧЕМ ЭТО ВООБЩЕ СУЩЕСТВУЕТ. Whisper не знает слова «Мукомол»: имя собственное
//    вне словаря он собирает из знакомых кусков фонетически, и боем это дало «Мука
//    Мол», «Мукамол» и дважды латиницу — четыре попытки подряд на одном слове.
//    Последствие шире кривого текста: искажённое название ЛОМАЕТ ПРИВЯЗКУ, задача
//    «позвонить в Мука Мол» остаётся без сделки, хотя сделка в базе есть.
//    Механизм лечения был построен и не задействован: `transcribe` принимает `terms`
//    и кладёт их в prompt ПЕРЕД доменным глоссарием — именно потому, что имена
//    собственные ломаются чаще всего. Веб его передавал, бот — нет.
//
// ⚠️ МОДУЛЬ ЧИСТЫЙ И БЕЗ `Deno` — его читают edge-функция, tsc и тесты (паттерн
//    `transcribe-limits.ts`). Данные приносит вызывающий: откуда брать имена — вопрос
//    к БД и правам, а не к укладке в бюджет.

import { companyNameWords, normalizeCompanyName } from './capture-helpers.ts';

/**
 * Имена для подсказки. ПОРЯДОК ВНУТРИ КАЖДОГО СПИСКА ЗНАЧИМ — это приоритет:
 * вызывающий отдаёт сделки по `updated_at desc`, и при нехватке места выживают
 * свежие, а не случайные.
 */
export interface TermsInput {
  /** Названия сделок. */
  deals: string[];
  /** Имена коллег. */
  people: string[];
}

/**
 * Имя короче этого подсказкой не работает, а место занимает: односложный огрызок
 * («ОМК» — граница, «МП» — уже нет) Whisper не за что зацепить.
 */
const MIN_TERM_CHARS = 3;

/** Разделитель списка. Учитывается в бюджете — иначе бюджет считался бы неправдой. */
const SEPARATOR = ', ';

/** Схлопывание пробелов и обрезка краёв. `'Ориент Продактс '` — реальная строка из базы. */
function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Пара «что показать Whisper» и «по чему считать дублем». */
interface Term {
  text: string;
  key: string;
}

/**
 * Название сделки в форме, пригодной для подсказки.
 *
 * ⚠️ РЕГИСТР СОХРАНЯЕТСЯ, ОПФ И КАВЫЧКИ СНИМАЮТСЯ. Prompt задаёт Whisper не только
 *    словарь, но и СТИЛЬ: список в нижнем регистре тянет расшифровку в нижний
 *    регистр. «ООО» же модель знает и без нас, а место в 200 знаках дорогое.
 *    Дедуп-ключ при этом канонический — `normalizeCompanyName`, единственное
 *    определение дубля в проекте.
 */
function dealTerm(raw: string): Term | null {
  const text = collapse(companyNameWords(raw).join(' '));
  if (text.length < MIN_TERM_CHARS) return null;
  const key = normalizeCompanyName(raw);
  return key === '' ? null : { text, key };
}

/**
 * Имя человека.
 *
 * ОПФ здесь НЕ снимается: у людей её не бывает, а «Ип» в отчестве — не тот риск,
 * ради которого стоит прогонять ФИО через нормализатор названий компаний.
 */
function personTerm(raw: string): Term | null {
  const text = collapse(raw);
  if (text.length < MIN_TERM_CHARS) return null;
  return { text, key: text.toLowerCase() };
}

/**
 * Строка `terms` в пределах бюджета.
 *
 * Правила, каждое существует ради конкретного отказа:
 *
 * ⚠️ НАБОР ИДЁТ ЦЕЛЫМИ ЭЛЕМЕНТАМИ, И ЭТО ГЛАВНОЕ. `buildPrompt` внутри режет
 *    `terms` по живому (`slice`), а обрубок имени собственного в подсказке ХУЖЕ
 *    его отсутствия: Whisper подхватит огрызок и выдаст его за слово — то есть
 *    подсказка начнёт производить ровно тот дефект, который чинит.
 *
 * ⚠️ НЕ ВЛЕЗЛО — ПРОПУСКАЕМ И ПРОБУЕМ СЛЕДУЮЩЕЕ, а не останавливаемся. Короткое
 *    имя влезает после длинного, и обрывать перебор на первом промахе значит терять
 *    место просто так.
 *
 * ⚠️ СДЕЛКИ ПЕРЕД ЛЮДЬМИ. При нехватке места жертвуем людьми осознанно: обычные
 *    русские имена Whisper берёт почти всегда, названия организаций — почти никогда.
 */
export function buildVoiceTerms(input: TermsInput, budget: number): string {
  if (!Number.isFinite(budget) || budget < MIN_TERM_CHARS) return '';

  const terms: Term[] = [];
  for (const raw of input.deals) {
    const t = dealTerm(raw);
    if (t) terms.push(t);
  }
  for (const raw of input.people) {
    const t = personTerm(raw);
    if (t) terms.push(t);
  }

  const seen = new Set<string>();
  const picked: string[] = [];
  let used = 0;
  for (const term of terms) {
    if (seen.has(term.key)) continue;
    // Ключ отмечается ДО проверки бюджета: дубль остаётся дублем и тогда, когда
    // оригинал не влез — иначе за не влезшим «Ромашка» подсказка получила бы
    // «ООО Ромашка» как якобы другое имя.
    seen.add(term.key);
    const cost = (picked.length === 0 ? 0 : SEPARATOR.length) + term.text.length;
    if (used + cost > budget) continue;
    picked.push(term.text);
    used += cost;
  }

  return picked.join(SEPARATOR);
}
