import { mskDateKey, mskEndOfDayIso, shiftDateKeyByBuckets } from '@/lib/utils/date-helpers';

// ═══════════════════════════════════════════════════════
// S-CHAT-TASK-1: разбор «задача из сообщения» — ДЕТЕРМИНИРОВАННЫЙ слой.
//
// LLM здесь нет и в этом спринте не будет (конвенция Deterministic First): свободную
// фразу разбирает слой 2 отдельным спринтом, и только если этот приживётся. Сюда
// поддержаны ровно те формы, которые люди реально пишут в чате.
//
// ⚠️ ФУНКЦИЯ НИЧЕГО НЕ РЕШАЕТ ЗА ЧЕЛОВЕКА. Её результат — черновик карточки
//    подтверждения, а не задача. Триггер-фраза («поставить задачу») ничего не создаёт:
//    она только подсказка парсеру. Создаёт задачу явное действие пользователя.
//    Поэтому парсер везде выбирает «лишнее слово в названии» вместо «задача без
//    названия» и «нет срока» вместо «наугад придуманный срок»: цена ложного
//    распознавания — одно движение в карточке, цена потери текста — потерянная задача.
//
// ⚠️ ВСЁ СЧИТАЕТСЯ В МСК, а не в таймзоне браузера. Человек, который пишет «в 15:00»,
//    имеет в виду 15:00 по Москве — у команды одна ось времени (та же, что у чипов дня
//    в ленте и у `deadline` задач). Оттого вся арифметика идёт через `mskDateKey` /
//    `mskEndOfDayIso` и суффикс `+03:00`, а не через локальные `getHours()`.
//
// ⚠️ `now` — ПАРАМЕТР. `new Date()` внутри чистой функции делает её нетестируемой:
//    «ближайшая будущая дата» без фиксированного «сейчас» не проверяется никак.
// ═══════════════════════════════════════════════════════

export interface TaskIntent {
  /** Очищенный текст задачи: без триггер-фразы и без распознанной даты. */
  text: string;
  /** ISO UTC, посчитан в МСК. `null` — срока в тексте нет либо дата невалидна. */
  deadline: string | null;
  /** Что именно распознали («3 августа в 15:00») — показывается в карточке. */
  matchedDatePhrase: string | null;
  /**
   * Вероятное имя сущности из текста — ПОДСКАЗКА ПОИСКУ, а не привязка.
   *
   * Ровно поэтому здесь нет ни морфологии, ни нормализации: «Ориенту» просто не
   * совпадёт, и это нормально — поле поиска предзаполнено, человек допечатает. Решение
   * о привязке принимает он, а не эта строка (FIX S-CHAT-TASK-1-BIND, решение 3).
   */
  nameHint: string | null;
}

/** Месяцы в родительном падеже — так их и пишут («3 августа»). Индекс = месяц − 1. */
const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

/**
 * Дни недели. Ключ — кусок регэкспа, чтобы одним списком накрыть падежи («в среду»,
 * «среда»). Значение — номер дня в JS-нумерации (0 = воскресенье).
 */
const WEEKDAYS: { re: string; day: number }[] = [
  { re: 'понедельник', day: 1 },
  { re: 'вторник', day: 2 },
  { re: 'сред[уа]', day: 3 },
  { re: 'четверг', day: 4 },
  { re: 'пятниц[уы]', day: 5 },
  { re: 'суббот[уы]', day: 6 },
  { re: 'воскресень[еяю]', day: 0 },
];

/**
 * Триггер-фразы. Вырезаются из текста задачи, но задачу НЕ создают (решение 2 спринта).
 * Список намеренно короткий: каждая лишняя форма — риск съесть кусок осмысленного
 * текста, а недоеденное слово человек уберёт в карточке одним движением.
 *
 * `\b` в этих регэкспах не используется: в JS он опирается на ASCII-`\w`, и после
 * кириллической буквы срабатывает ровно наоборот ожидаемому. Граница — `(?![\wа-яё])`.
 */
const TRIGGER_RES: RegExp[] = [
  // Слэш-команда: композер отдаёт остаток строки, но разбор обязан пережить и полную.
  /^\s*\/задач[аиу]?(?![\wа-яё])\s*/i,
  /(?:^|\s)(?:надо\s+|нужно\s+)?(?:по)?ставь?(?:ить|те)?\s+задачу\s*[:\-—–]?\s*/i,
  /(?:^|\s)(?:надо\s+|нужно\s+)?созда(?:й|ть|йте)\s+задачу\s*[:\-—–]?\s*/i,
  /(?:^|\s)задача\s*[:\-—–]\s*/i,
  /(?:^|\s)todo\s*[:\-—–]\s*/i,
];

/** Разделители, которые после вырезания остаются висеть по краям. */
const EDGE_JUNK_RE = /^[\s\-—–:;,]+|[\s\-—–:;,]+$/g;

interface Range {
  start: number;
  end: number;
}

interface Hit extends Range {
  /** Распознанная подстрока — вырезается из текста и показывается человеку. */
  phrase: string;
}

interface DateHit extends Hit {
  /** YYYY-MM-DD по МСК. */
  dateKey: string;
}

interface TimeHit extends Hit {
  hour: number;
  minute: number;
}

/**
 * Совпадение → Hit. Ведущая граница `(?:^|\s)` входит в `m[0]`, но принадлежит ТЕКСТУ,
 * а не дате: вырезав её, мы склеили бы соседние слова.
 */
function hitOf(m: RegExpMatchArray): Hit {
  const at = m.index ?? 0;
  const lead = m[0].length - m[0].trimStart().length;
  return { phrase: m[0].trim(), start: at + lead, end: at + m[0].trimEnd().length };
}

/** День недели ключа YYYY-MM-DD. Через UTC-полдень — как вся календарная ось проекта. */
function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

/** Существует ли такая календарная дата (31 февраля — нет). */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function keyOf(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

/**
 * Год для даты без года — ближайший будущий (решение спринта).
 *
 * Сравнение идёт по ДНЮ, а не по моменту: «3 августа», написанное третьего августа в
 * 16:00, — это сегодня, а не через год. Из-за этого «3 августа в 15:00» в тот же день
 * даст срок в прошлом — и это честнее, чем молча увезти человека на год вперёд.
 *
 * 29 февраля в невисокосный год — единственная дата, которой может не быть ни в этом,
 * ни в следующем: для неё ищем до четырёх лет вперёд.
 */
function resolveYear(month: number, day: number, todayKey: string): number | null {
  const thisYear = Number(todayKey.slice(0, 4));
  for (let year = thisYear; year <= thisYear + 4; year += 1) {
    if (isRealDate(year, month, day) && keyOf(year, month, day) >= todayKey) return year;
  }
  return null;
}

/**
 * Найти дату. Порядок проверок — от самых однозначных форм к самым рискованным;
 * побеждает ПЕРВОЕ сработавшее правило, а не самое левое совпадение: «завтра» надёжнее,
 * чем «03.08».
 *
 * `null` возвращается и когда даты нет, и когда она невалидна («31 февраля»): в обоих
 * случаях вырезать из текста нечего, а срок мы придумывать не имеем права.
 */
function findDate(body: string, todayKey: string): DateHit | null {
  // «сегодня» / «завтра» / «послезавтра»
  const rel = body.match(/(?:^|\s)(сегодня|завтра|послезавтра)(?![\wа-яё])/i);
  if (rel) {
    const word = rel[1].toLowerCase();
    const days = word === 'сегодня' ? 0 : word === 'завтра' ? 1 : 2;
    return { ...hitOf(rel), dateKey: shiftDateKeyByBuckets(todayKey, 'day', days) };
  }

  // «через 2 дня» / «через неделю» / «через 3 недели» / «через месяц»
  const through = body.match(
    /(?:^|\s)через\s+(\d{1,3}\s+)?(день|дня|дней|неделю|недели|недель|месяц|месяца|месяцев)(?![\wа-яё])/i,
  );
  if (through) {
    const n = through[1] ? Number(through[1].trim()) : 1;
    const unit = through[2].toLowerCase();
    if (Number.isFinite(n) && n > 0 && n <= 365) {
      const dateKey = unit.startsWith('мес')
        ? shiftDateKeyByBuckets(todayKey, 'month', n)
        : shiftDateKeyByBuckets(todayKey, 'day', unit.startsWith('нед') ? n * 7 : n);
      return { ...hitOf(through), dateKey };
    }
  }

  // «в понедельник» / «в пятницу» — ближайший такой день СТРОГО в будущем: сказанное
  // в понедельник «в понедельник» означает следующий, а не сегодняшний.
  for (const { re, day } of WEEKDAYS) {
    const m = body.match(new RegExp(String.raw`(?:^|\s)(?:в[оа]?\s+)?(?:${re})(?![\wа-яё])`, 'i'));
    if (!m) continue;
    const delta = ((day - weekdayOf(todayKey) + 6) % 7) + 1; // 1..7
    return { ...hitOf(m), dateKey: shiftDateKeyByBuckets(todayKey, 'day', delta) };
  }

  // «3 августа» / «3 августа 2027»
  const named = body.match(
    new RegExp(String.raw`(?:^|\s)(\d{1,2})\s+(${MONTHS.join('|')})(?:\s+(\d{4}))?(?![\wа-яё])`, 'i'),
  );
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS.indexOf(named[2].toLowerCase() as (typeof MONTHS)[number]) + 1;
    const year = named[3] ? Number(named[3]) : resolveYear(month, day, todayKey);
    if (year === null || !isRealDate(year, month, day)) return null;
    return { ...hitOf(named), dateKey: keyOf(year, month, day) };
  }

  // «03.08» / «3.8.2027» / «03/08». Проверяется последней и остаётся самой рискованной
  // формой: «версия 1.2» тоже похожа на дату. Ровно поэтому распознанное показывается
  // в карточке отдельной строкой — увидеть и стереть дешевле, чем не заметить.
  const numeric = body.match(/(?:^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?(?![\d.\wа-яё])/i);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year: number | null;
    if (numeric[3]) {
      const raw = Number(numeric[3]);
      year = raw < 100 ? 2000 + raw : raw;
    } else {
      year = resolveYear(month, day, todayKey);
    }
    if (year === null || !isRealDate(year, month, day)) return null;
    return { ...hitOf(numeric), dateKey: keyOf(year, month, day) };
  }

  return null;
}

/**
 * Найти время: «в 15:00», «15:00», «15.30», «в 15 часов», «15 часов», «в 15».
 *
 * Голое число временем НЕ считается («купить 15 лицензий»), а «в 15» берётся только
 * когда после него ничего нет или стоит знак препинания: «в 15 экземплярах» — не срок.
 */
function findTime(body: string): TimeHit | null {
  // HH:MM / HH.MM. `25:00` — не время: час > 23 отбрасываем, а не подгоняем.
  const hm = body.match(/(?:^|\s)(?:в\s+)?(\d{1,2})[:.](\d{2})(?![\d.\wа-яё])/i);
  if (hm) {
    const hour = Number(hm[1]);
    const minute = Number(hm[2]);
    if (hour <= 23 && minute <= 59) return { ...hitOf(hm), hour, minute };
  }

  // «в 15 часов» / «15 часов» / «в 15 ч»
  const withUnit = body.match(
    /(?:^|\s)(?:в\s+)?(\d{1,2})\s*(?:часов|часа|час|ч)(?![\wа-яё])/i,
  );
  if (withUnit) {
    const hour = Number(withUnit[1]);
    if (hour <= 23) return { ...hitOf(withUnit), hour, minute: 0 };
  }

  // «в 15» — только в конце строки или перед знаком препинания.
  const bare = body.match(/(?:^|\s)в\s+(\d{1,2})(?=$|\s*[,.;!?)])/i);
  if (bare) {
    const hour = Number(bare[1]);
    if (hour <= 23) return { ...hitOf(bare), hour, minute: 0 };
  }

  return null;
}

/** Кавычки, в которые берут название: «ёлочки», “лапки”, обычные двойные. */
const QUOTED_RE = /[«"“]([^«»"“”]{2,60})[»"”]/;

/** Слово начинается с прописной (кириллица или латиница). */
function isCapitalized(word: string): boolean {
  const first = word[0];
  return !!first && first === first.toUpperCase() && first !== first.toLowerCase();
}

/**
 * Вероятное имя сущности из текста задачи.
 *
 * Две эвристики, обе намеренно тупые:
 *  1. кавычки — «позвонить в ООО "Мукомол"» → `Мукомол`. Кавычки человек ставит именно
 *     для того, чтобы отделить название, и спорить с ним не о чем;
 *  2. подряд идущие слова с прописной буквы — «звонок Аграрная Группа» → вся
 *     последовательность.
 *
 * ⚠️ ПЕРВОЕ СЛОВО В СЧЁТ НЕ ИДЁТ: предложение начинают с прописной по правилам языка,
 *    и «Позвонить в офис» дало бы подсказку «Позвонить». ИСКЛЮЧЕНИЕ — первое слово,
 *    за которым стоит тире или двоеточие: «Ориент — звонок» это не начало
 *    предложения, а подпись «про что речь», и ровно так выглядит пример из ТЗ.
 */
function findNameHint(text: string): string | null {
  const quoted = text.match(QUOTED_RE);
  if (quoted) {
    const inner = quoted[1].trim();
    if (inner) return inner;
  }

  // Разбор по словам с сохранением исходных разделителей: нужно знать, что стоит
  // ПОСЛЕ первого слова (тире/двоеточие), а `split(/\s+/)` эту информацию теряет.
  const words = [...text.matchAll(/\S+/g)];
  if (words.length === 0) return null;

  const firstEnd = (words[0].index ?? 0) + words[0][0].length;
  const afterFirst = text.slice(firstEnd, firstEnd + 3);
  const firstIsLabel = /^\s*[-—–:]/.test(afterFirst);
  const startAt = firstIsLabel ? 0 : 1;

  const run: string[] = [];
  for (let i = startAt; i < words.length; i += 1) {
    // Знаки препинания на краях слова не мешают ему быть названием («Ориент,»).
    const word = words[i][0].replace(/^[«"“(]+|[»"”),.;:!?]+$/g, '');
    if (word && isCapitalized(word)) {
      run.push(word);
      continue;
    }
    if (run.length) break; // первая же найденная последовательность и есть ответ
  }

  return run.length ? run.join(' ') : null;
}

/** Момент «дата + время» по МСК → ISO UTC. Суффикс +03:00, не арифметика над UTC. */
function mskMomentIso(dateKey: string, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${dateKey}T${hh}:${mm}:00.000+03:00`).toISOString();
}

/** Схлопнуть пробелы и снять разделители, повисшие по краям после вырезания. */
function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([),.!?;:])/g, '$1')
    .replace(EDGE_JUNK_RE, '')
    .trim();
}

/**
 * Вырезать диапазоны. Пересечения сливаются заранее: триггер-фразы ищутся независимыми
 * регэкспами по одной строке и могут перекрыться, а резать перекрывающиеся куски
 * «с конца» значит съесть лишний символ.
 */
function cutRanges(body: string, ranges: Range[]): string {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  let out = body;
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    out = out.slice(0, merged[i].start) + out.slice(merged[i].end);
  }
  return tidy(out);
}

/**
 * Разобрать тело сообщения в черновик задачи.
 *
 * Возвращается ЧЕРНОВИК: и текст, и срок человек правит в карточке подтверждения до
 * создания задачи.
 */
export function parseTaskIntent(body: string, now: Date = new Date()): TaskIntent {
  const source = body ?? '';
  if (!source.trim()) return { text: '', deadline: null, matchedDatePhrase: null, nameHint: null };

  const todayKey = mskDateKey(now);

  // 1. Триггер-фразы — ищем в исходной строке, чтобы индексы совпадали с ней.
  const triggerRanges: Range[] = [];
  for (const re of TRIGGER_RES) {
    const m = source.match(re);
    if (!m || m.index === undefined) continue;
    const lead = m[0].length - m[0].trimStart().length;
    triggerRanges.push({ start: m.index + lead, end: m.index + m[0].length });
  }

  // 2. Дата — в исходной строке; время — в остатке БЕЗ даты, иначе «03.08 15:00» отдаст
  //    «08» часом. Дата заменяется пробелами той же длины: индексы времени обязаны
  //    остаться индексами исходной строки.
  const dateHit = findDate(source, todayKey);
  const withoutDate = dateHit
    ? source.slice(0, dateHit.start) +
      ' '.repeat(dateHit.end - dateHit.start) +
      source.slice(dateHit.end)
    : source;
  const timeHit = findTime(withoutDate);

  let deadline: string | null = null;
  let matchedDatePhrase: string | null = null;

  if (dateHit && timeHit) {
    deadline = mskMomentIso(dateHit.dateKey, timeHit.hour, timeHit.minute);
    matchedDatePhrase = `${dateHit.phrase} ${timeHit.phrase}`;
  } else if (dateHit) {
    // Без времени — конец дня по МСК: дедлайн «сегодня» с моментом клика был бы
    // просрочен через секунду после создания (конвенция проекта, D2 S-R2-AI-HARDEN).
    deadline = mskEndOfDayIso(dateHit.dateKey);
    matchedDatePhrase = dateHit.phrase;
  } else if (timeHit) {
    // Только время — ближайшее будущее: «в 9:00», написанное в десять утра, про завтра.
    const todayIso = mskMomentIso(todayKey, timeHit.hour, timeHit.minute);
    deadline =
      Date.parse(todayIso) > now.getTime()
        ? todayIso
        : mskMomentIso(shiftDateKeyByBuckets(todayKey, 'day', 1), timeHit.hour, timeHit.minute);
    matchedDatePhrase = timeHit.phrase;
  }

  const cuts: Range[] = [...triggerRanges];
  if (dateHit) cuts.push(dateHit);
  if (timeHit) cuts.push(timeHit);

  const cleaned = cutRanges(source, cuts);
  // Вырезали всё — значит вырезать было нечего: лучше лишнее слово в названии, чем
  // задача без названия.
  const text = cleaned || tidy(source);

  // Имя ищем в УЖЕ очищенном тексте: в исходном «3 августа» дало бы «Августа»
  // подсказкой, а триггер-фраза «Создать задачу» — «Создать».
  return { text, deadline, matchedDatePhrase, nameHint: findNameHint(text) };
}
